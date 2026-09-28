const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const crypto = require("crypto");

const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const TOKEN_SECRET = process.env.MEDFLOW_AUTH_SECRET || "change-this-secret-in-production";

function hashSenha(senhaPlana, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(senhaPlana), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function senhaConfere(senhaPlana, senhaSalva) {
  if (!senhaSalva || !String(senhaSalva).includes(":")) return false;
  const [salt, hash] = String(senhaSalva).split(":");
  const hashTentativa = crypto.scryptSync(String(senhaPlana), salt, 64).toString("hex");
  const bufA = Buffer.from(hash, "hex");
  const bufB = Buffer.from(hashTentativa, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function base64url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized + "=".repeat((4 - normalized.length % 4) % 4), "base64").toString("utf8");
}

function criarToken(usuario) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "MF" }));
  const payload = base64url(JSON.stringify({
    sub: String(usuario.usuario),
    usuario: String(usuario.usuario),
    tipo: String(usuario.tipo),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  }));
  const assinatura = base64url(crypto.createHmac("sha256", TOKEN_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${assinatura}`;
}

function verificarToken(token) {
  if (!token || token.split(".").length !== 3) return null;
  const [header, payload, assinatura] = token.split(".");
  const esperada = crypto.createHmac("sha256", TOKEN_SECRET).update(`${header}.${payload}`).digest();
  const recebida = Buffer.from(String(assinatura).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - assinatura.length % 4) % 4), "base64");
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;
  try {
    const dados = JSON.parse(fromBase64url(payload));
    if (!dados.exp || dados.exp < Math.floor(Date.now() / 1000)) return null;
    return dados;
  } catch {
    return null;
  }
}

function normalizar(valor) {
  return String(valor ?? "").trim().toLowerCase();
}

function cpfValido(cpf) {
  const value = String(cpf ?? "").replace(/\D/g, "");
  if (!value) return true;
  if (value.length !== 11 || /^([0-9])\1{10}$/.test(value)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(value[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(value[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(value[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(value[10]);
}

function createApp({ dbFile, staticDir } = {}) {
  if (!dbFile) throw new Error("createApp: dbFile é obrigatório");

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  const allowedOrigin = process.env.MEDFLOW_CORS_ORIGIN || "";
  app.use(cors({
    origin: allowedOrigin || true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));

  if (staticDir) app.use(express.static(staticDir));

  function createEmptyDB() {
    return {
      usuarios: [],
      pacientes: [],
      triagens: [],
      consultas: [],
      altas: [],
      internacoes: [],
      tv_chamada: null,
      tv_historico: [],
      auditoria: []
    };
  }

  function readDB() {
    let db = createEmptyDB();
    if (fs.existsSync(dbFile)) {
      const raw = fs.readFileSync(dbFile, "utf-8");
      db = { ...db, ...(raw ? JSON.parse(raw) : {}) };
    }
    if (!Array.isArray(db.usuarios)) db.usuarios = [];
    if (!Array.isArray(db.pacientes)) db.pacientes = [];
    if (!Array.isArray(db.triagens)) db.triagens = [];
    if (!Array.isArray(db.consultas)) db.consultas = [];
    if (!Array.isArray(db.altas)) db.altas = [];
    if (!Array.isArray(db.internacoes)) db.internacoes = [];
    if (!Array.isArray(db.tv_historico)) db.tv_historico = [];
    if (!Array.isArray(db.auditoria)) db.auditoria = [];
    if (!Object.prototype.hasOwnProperty.call(db, "tv_chamada")) db.tv_chamada = null;

    let precisaSalvar = false;
    db.usuarios.forEach(u => {
      if (u.senha && !String(u.senha).includes(":")) {
        u.senha = hashSenha(u.senha);
        precisaSalvar = true;
      }
    });
    if (precisaSalvar) writeDB(db);
    return db;
  }

  function writeDB(data) {
    const dir = path.dirname(dbFile);
    fs.mkdirSync(dir, { recursive: true });
    const tempFile = `${dbFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tempFile, dbFile);
  }

  function erro(res, status, mensagem) {
    return res.status(status).json({ erro: mensagem });
  }

  function registrarAuditoria(db, req, acao, entidade, entidadeId, detalhes = {}) {
    db.auditoria.unshift({
      id: crypto.randomUUID(),
      usuario: req.auth?.usuario || "sistema",
      perfil: req.auth?.tipo || "sistema",
      acao,
      entidade,
      entidadeId: entidadeId ?? null,
      detalhes,
      createdAt: new Date().toISOString()
    });
    if (db.auditoria.length > 500) db.auditoria.length = 500;
  }

  // LOGIN é a única rota protegida pela própria credencial.
  app.post("/login", (req, res) => {
    const { usuario, senha } = req.body || {};
    if (!usuario || !senha) return erro(res, 400, "Informe usuário e senha.");

    const db = readDB();
    const user = db.usuarios.find(u => normalizar(u.usuario) === normalizar(usuario));
    if (!user || !senhaConfere(senha, user.senha)) return erro(res, 401, "Login inválido");

    const token = criarToken(user);
    const { senha: _senha, ...userSemSenha } = user;
    res.json({ ...userSemSenha, token, expiresIn: TOKEN_TTL_SECONDS });
  });

  // Rotas públicas necessárias à infraestrutura e à tela de TV.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "medflow", timestamp: new Date().toISOString() });
  });

  app.get("/tv/chamada", (req, res) => {
    const db = readDB();
    res.json({ chamada: db.tv_chamada, historico: db.tv_historico });
  });

  app.get("/lista-medicacoes", (_req, res) => {
    res.json(["Dipirona", "Paracetamol", "Ibuprofeno", "Amoxicilina", "Azitromicina", "Loratadina", "Omeprazol", "Buscopan", "Dramin", "Soro fisiológico"]);
  });

  // Todas as demais rotas de API exigem token assinado.
  app.use((req, res, next) => {
    if (!req.path.startsWith("/")) return next();
    const auth = String(req.headers.authorization || "");
    if (!auth.startsWith("Bearer ")) return erro(res, 401, "Autenticação necessária.");
    const tokenData = verificarToken(auth.slice(7));
    if (!tokenData) return erro(res, 401, "Sessão inválida ou expirada.");
    req.auth = tokenData;
    next();
  });

  function exigirPerfis(...perfis) {
    return (req, res, next) => {
      if (!perfis.includes(req.auth.tipo)) return erro(res, 403, "Seu perfil não possui permissão para esta operação.");
      next();
    };
  }

  // ATENDIMENTO
  app.post("/atendimento", exigirPerfis("atendimento"), (req, res) => {
    const { nome, cpf, tipo } = req.body || {};
    if (!nome || !String(nome).trim()) return erro(res, 400, "Nome do paciente é obrigatório.");
    if (cpf && !cpfValido(cpf)) return erro(res, 400, "CPF inválido.");

    const db = readDB();
    const cpfNormalizado = String(cpf || "").replace(/\D/g, "");
    if (cpfNormalizado && db.pacientes.some(p => String(p.cpf || "").replace(/\D/g, "") === cpfNormalizado)) {
      return erro(res, 409, "Já existe um paciente cadastrado com este CPF.");
    }

    const paciente = {
      id: crypto.randomUUID(),
      nome: String(nome).trim(),
      cpf: cpfNormalizado,
      tipo: tipo || "",
      status: "triagem",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.pacientes.push(paciente);
    registrarAuditoria(db, req, "CRIAR", "paciente", paciente.id, { nome: paciente.nome });
    writeDB(db);
    res.status(201).json(paciente);
  });

  app.get("/pacientes", exigirPerfis("atendimento", "triagem", "medico"), (_req, res) => {
    res.json(readDB().pacientes);
  });

  // TRIAGEM
  app.post("/triagem", exigirPerfis("triagem"), (req, res) => {
    const { patientId, nome, sintoma, temperatura, alergia, observacao } = req.body || {};
    if (!patientId && (!nome || !String(nome).trim())) return erro(res, 400, "Paciente é obrigatório.");

    const db = readDB();
    const paciente = patientId
      ? db.pacientes.find(p => String(p.id) === String(patientId))
      : db.pacientes.find(p => normalizar(p.nome) === normalizar(nome));
    if (!paciente) return erro(res, 404, "Paciente não encontrado.");

    const temp = temperatura !== undefined && temperatura !== "" ? Number(temperatura) : null;
    if (temp !== null && (!Number.isFinite(temp) || temp < 30 || temp > 45)) return erro(res, 400, "Temperatura fora de uma faixa válida.");

    // Regra simples apenas como apoio de protótipo; não substitui protocolo clínico institucional.
    let risco = req.body.risco || "verde";
    if (temp !== null) {
      if (temp >= 39) risco = "vermelho";
      else if (temp >= 38) risco = "amarelo";
    }

    const triagem = {
      id: crypto.randomUUID(),
      patientId: paciente.id,
      nome: paciente.nome,
      sintoma: sintoma || "",
      temperatura: temp,
      alergia: alergia || "",
      observacao: observacao || "",
      risco,
      status: "aguardando_medico",
      createdAt: new Date().toISOString()
    };
    db.triagens.push(triagem);
    paciente.status = "aguardando_medico";
    paciente.updatedAt = new Date().toISOString();
    registrarAuditoria(db, req, "CRIAR", "triagem", triagem.id, { patientId: paciente.id, risco });
    writeDB(db);
    res.status(201).json(triagem);
  });

  app.get("/triagens", exigirPerfis("triagem", "medico"), (_req, res) => res.json(readDB().triagens));

  // TV
  app.post("/tv/chamar", exigirPerfis("triagem", "medico"), (req, res) => {
    const { localTipo, localNumero, paciente, patientId } = req.body || {};
    if (!paciente || !String(paciente).trim()) return erro(res, 400, "Nome do paciente é obrigatório para a chamada.");
    const db = readDB();
    const chamada = {
      id: crypto.randomUUID(),
      patientId: patientId || null,
      localTipo: localTipo || "",
      localNumero: localNumero || "",
      paciente: String(paciente).trim(),
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      createdAt: new Date().toISOString()
    };
    db.tv_chamada = chamada;
    db.tv_historico.unshift(chamada);
    if (db.tv_historico.length > 5) db.tv_historico.pop();
    registrarAuditoria(db, req, "CHAMAR", "tv", chamada.id, { paciente: chamada.paciente, localTipo, localNumero });
    writeDB(db);
    res.status(201).json(chamada);
  });

  // CONSULTA
  app.post("/consulta", exigirPerfis("medico"), (req, res) => {
    const { patientId, paciente, diagnostico, medicacao, obs } = req.body || {};
    if (!patientId && (!paciente || !String(paciente).trim())) return erro(res, 400, "Paciente é obrigatório.");
    const db = readDB();
    const pacienteDB = patientId
      ? db.pacientes.find(p => String(p.id) === String(patientId))
      : db.pacientes.find(p => normalizar(p.nome) === normalizar(paciente));
    if (!pacienteDB) return erro(res, 404, "Paciente não encontrado.");

    const consulta = {
      id: crypto.randomUUID(),
      patientId: pacienteDB.id,
      paciente: pacienteDB.nome,
      diagnostico: diagnostico || "",
      medicacao: medicacao || "",
      obs: obs || "",
      createdAt: new Date().toISOString(),
      medicoResponsavel: req.auth.usuario
    };
    db.consultas.push(consulta);
    pacienteDB.status = "em_atendimento";
    pacienteDB.updatedAt = new Date().toISOString();
    registrarAuditoria(db, req, "CRIAR", "consulta", consulta.id, { patientId: pacienteDB.id });
    writeDB(db);
    res.status(201).json(consulta);
  });

  app.get("/medicacoes", exigirPerfis("medico"), (_req, res) => res.json(readDB().consultas));

  // INTERNAÇÃO
  app.post("/internacao", exigirPerfis("medico"), (req, res) => {
    const { patientId, paciente, leito, setor, motivo, diagnostico, medicoResponsavel, observacoes, dataInternacao } = req.body || {};
    if (!leito || !String(leito).trim()) return erro(res, 400, "Leito é obrigatório.");
    if (!setor || !String(setor).trim()) return erro(res, 400, "Setor é obrigatório.");

    const db = readDB();
    const pacienteDB = patientId
      ? db.pacientes.find(p => String(p.id) === String(patientId))
      : db.pacientes.find(p => normalizar(p.nome) === normalizar(paciente));
    if (!pacienteDB) return erro(res, 404, "Paciente não encontrado.");

    const ativa = db.internacoes.find(i => i.status === "internado" && String(i.patientId) === String(pacienteDB.id));
    if (ativa) return erro(res, 409, "Este paciente já possui uma internação ativa.");

    const leitoNormalizado = normalizar(leito);
    const leitoOcupado = db.internacoes.find(i => i.status === "internado" && normalizar(i.leito) === leitoNormalizado);
    if (leitoOcupado) return erro(res, 409, `O leito ${String(leito).trim()} já está ocupado.`);

    const dataFinal = dataInternacao && !Number.isNaN(new Date(dataInternacao).getTime()) ? new Date(dataInternacao).toISOString() : new Date().toISOString();
    const internacao = {
      id: crypto.randomUUID(),
      patientId: pacienteDB.id,
      paciente: pacienteDB.nome,
      leito: String(leito).trim(),
      setor: String(setor).trim(),
      motivo: motivo || "",
      diagnostico: diagnostico || "",
      medicoResponsavel: medicoResponsavel || req.auth.usuario,
      observacoes: observacoes || "",
      dataInternacao: dataFinal,
      dataAlta: null,
      status: "internado",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.internacoes.unshift(internacao);
    pacienteDB.status = "internado";
    pacienteDB.internacaoId = internacao.id;
    pacienteDB.leito = internacao.leito;
    pacienteDB.setor = internacao.setor;
    pacienteDB.updatedAt = new Date().toISOString();
    registrarAuditoria(db, req, "CRIAR", "internacao", internacao.id, { patientId: pacienteDB.id, leito: internacao.leito });
    writeDB(db);
    res.status(201).json(internacao);
  });

  app.get("/internacoes", exigirPerfis("medico"), (req, res) => {
    const db = readDB();
    const status = String(req.query.status || "").trim();
    res.json(status ? db.internacoes.filter(i => i.status === status) : db.internacoes);
  });

  app.patch("/internacao/:id", exigirPerfis("medico"), (req, res) => {
    const db = readDB();
    const internacao = db.internacoes.find(i => String(i.id) === String(req.params.id));
    if (!internacao) return erro(res, 404, "Internação não encontrada.");

    const { leito, setor, observacoes } = req.body || {};
    if (leito !== undefined) {
      const novoLeito = String(leito).trim();
      const ocupado = db.internacoes.find(i => i.id !== internacao.id && i.status === "internado" && normalizar(i.leito) === normalizar(novoLeito));
      if (ocupado) return erro(res, 409, `O leito ${novoLeito} já está ocupado.`);
      internacao.leito = novoLeito;
    }
    if (setor !== undefined) internacao.setor = String(setor).trim();
    if (observacoes !== undefined) internacao.observacoes = String(observacoes);
    internacao.updatedAt = new Date().toISOString();

    const pacienteDB = db.pacientes.find(p => String(p.id) === String(internacao.patientId));
    if (pacienteDB) {
      pacienteDB.leito = internacao.leito;
      pacienteDB.setor = internacao.setor;
      pacienteDB.updatedAt = new Date().toISOString();
    }
    registrarAuditoria(db, req, "ATUALIZAR", "internacao", internacao.id, { patientId: internacao.patientId });
    writeDB(db);
    res.json(internacao);
  });

  // ALTA
  app.post("/alta", exigirPerfis("medico"), (req, res) => {
    const { patientId, paciente, diagnostico, medicacao, orientacoes, retorno, medicoResponsavel, dataAlta } = req.body || {};
    if (!diagnostico || !String(diagnostico).trim()) return erro(res, 400, "Diagnóstico é obrigatório.");

    const db = readDB();
    const pacienteDB = patientId
      ? db.pacientes.find(p => String(p.id) === String(patientId))
      : db.pacientes.find(p => normalizar(p.nome) === normalizar(paciente));
    if (!pacienteDB) return erro(res, 404, "Paciente não encontrado.");

    const internacaoAtiva = db.internacoes.find(i => i.status === "internado" && String(i.patientId) === String(pacienteDB.id));
    if (!internacaoAtiva) return erro(res, 409, "O paciente não possui internação ativa.");

    const dataFinal = dataAlta && !Number.isNaN(new Date(dataAlta).getTime()) ? new Date(dataAlta).toISOString() : new Date().toISOString();
    const triagem = db.triagens.find(t => String(t.patientId) === String(pacienteDB.id) && t.status !== "encerrada") || null;
    if (triagem) triagem.status = "encerrada";

    internacaoAtiva.status = "alta";
    internacaoAtiva.dataAlta = dataFinal;
    internacaoAtiva.updatedAt = new Date().toISOString();
    const alta = {
      id: crypto.randomUUID(),
      paciente: pacienteDB.nome,
      patientId: pacienteDB.id,
      internacaoId: internacaoAtiva.id,
      diagnostico: String(diagnostico).trim(),
      medicacao: medicacao || "",
      orientacoes: orientacoes || "",
      retorno: retorno || "",
      medicoResponsavel: medicoResponsavel || req.auth.usuario,
      dataAlta: dataFinal,
      triagem,
      createdAt: new Date().toISOString()
    };
    pacienteDB.status = "alta";
    pacienteDB.dataAlta = dataFinal;
    pacienteDB.internacaoId = null;
    pacienteDB.leito = null;
    pacienteDB.setor = null;
    pacienteDB.updatedAt = new Date().toISOString();
    db.altas.unshift(alta);
    registrarAuditoria(db, req, "CRIAR", "alta", alta.id, { patientId: pacienteDB.id, internacaoId: internacaoAtiva.id });
    writeDB(db);
    res.status(201).json(alta);
  });

  app.get("/altas", exigirPerfis("medico"), (_req, res) => res.json(readDB().altas));

  app.get("/auditoria", exigirPerfis("medico"), (_req, res) => res.json(readDB().auditoria));

  app.use((req, res, next) => {
    if (res.headersSent) return next();
    erro(res, 404, "Rota não encontrada.");
  });

  app.use((err, _req, res, _next) => {
    console.error("Erro não tratado:", err);
    erro(res, 500, "Erro interno do servidor.");
  });

  return app;
}

module.exports = { createApp, hashSenha, senhaConfere, criarToken, verificarToken };
