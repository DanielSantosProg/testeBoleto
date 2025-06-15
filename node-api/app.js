const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");
const sql = require("mssql");
const { spawn } = require("child_process");
const express = require("express");
const pdf = require("html-pdf");
require("dotenv").config({ path: "db.env" });

const getToken = require("./gerarToken");
const app = express();

app.use(express.json({ limit: "10mb" }));

app.post("/gerar_boleto", async (req, res) => {
  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ error: "Payload ausente." });

    const token = await getToken();
    if (!token) return res.status(500).json({ error: "Erro ao obter token." });

    const pool = await sql.connect({
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    const db_data = await pool
      .request()
      .query(
        "SELECT CLIENTID, CLIENTSECRET, CAMINHO_CRT, SENHA_CRT FROM API_PIX_CADASTRO_DE_CONTA WHERE CODBANCO = '237'"
      );

    const { CAMINHO_CRT, SENHA_CRT } = db_data.recordset[0];

    const python = spawn("python", ["../python-boleto/cli.py"]);

    let stdoutData = "";
    let stderrData = "";

    python.stdin.write(
      JSON.stringify({
        payload,
        token,
        pfxPath: CAMINHO_CRT,
        senha: SENHA_CRT,
      })
    );
    python.stdin.end();

    python.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    python.on("close", (code) => {
      console.log("stdoutData:", stdoutData);
      console.log("stderrData:", stderrData);
      if (code !== 0 || stdoutData.startsWith("[ERROR]")) {
        const erro = stdoutData.startsWith("[ERROR]")
          ? stdoutData.replace("[ERROR]", "").trim()
          : stderrData.trim();
        console.error("Erro na geração do boleto:", erro);
        return res
          .status(500)
          .json({ error: "Erro interno ao gerar boleto", detalhe: erro });
      }

      const html = stdoutData;

      require("html-pdf")
        .create(html, { format: "A4" })
        .toBuffer((err, buffer) => {
          if (err) {
            console.error("Erro ao gerar PDF:", err);
            return res.status(500).json({ error: "Erro ao gerar PDF" });
          }

          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            "attachment; filename=boleto.pdf"
          );
          res.send(buffer);
        });
    });
  } catch (error) {
    console.error("Erro inesperado:", error);
    res.status(500).json({ error: "Erro inesperado no servidor" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
