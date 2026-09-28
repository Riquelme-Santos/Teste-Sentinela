const path = require("path");
const { createApp } = require("./app");

const app = createApp({
  dbFile: path.join(__dirname, "db.json"),
  staticDir: path.join(__dirname, "../frontend")
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🏥 Hospital Pro rodando em http://localhost:3000");
});
