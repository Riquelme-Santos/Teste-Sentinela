# MedFlow V3 — Engenharia e Segurança

Esta versão mantém a base visual e os fluxos do MedFlow, mas corrige pontos estruturais identificados na análise técnica.

## Principais mudanças

- autenticação real por token HMAC assinado;
- autorização de API por perfil (`atendimento`, `triagem`, `medico`);
- token armazenado em `sessionStorage` e anexado automaticamente às requisições;
- encerramento de sessão no frontend quando a API retorna `401`;
- identificação por `patientId` nas operações novas de triagem, consulta, internação e alta;
- bloqueio de CPF duplicado quando informado;
- validação básica de CPF e temperatura;
- bloqueio de leito ocupado;
- auditoria das principais operações;
- escrita atômica do `db.json`;
- rota `/health`;
- rewrites de Vercel para todas as rotas novas;
- proteção contra exposição do hash de senha;
- cabeçalho `x-powered-by` desativado;
- limite de payload JSON.

## Observação importante sobre o banco

O `db.json` continua sendo usado nesta V3 para preservar a base atual e evitar uma migração destrutiva. Ele continua adequado apenas para protótipo/demonstração. Para produção real, a próxima etapa deve ser PostgreSQL com migrations, constraints e transações.

## Variáveis de ambiente

Copie `.env.example` para o ambiente de deploy e defina pelo menos `MEDFLOW_AUTH_SECRET` com um segredo forte.

## Validação

Foi feita validação sintática dos arquivos JavaScript com `node --check`. A instalação de dependências do projeto não pôde ser concluída neste ambiente, então um teste end-to-end do servidor deve ser executado após `npm install`/`npm ci` localmente ou no Render.
