const path = require("path");
const { createApp } = require("../backend/app");

// IMPORTANTE: o banco de dados real fica em backend/db.json.
// (Antes este arquivo apontava para api/db.json, que não existe —
// por isso login e cadastro não funcionavam em produção.)
const app = createApp({
  dbFile: path.join(__dirname, "..", "backend", "db.json"),
  staticDir: path.join(__dirname, "..", "frontend")
});

module.exports = app;
