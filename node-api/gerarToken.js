// gerarToken.js
const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");
const sql = require("mssql");
require("dotenv").config({ path: "db.env" });

const tokenFile = path.join(__dirname, "token.json");

async function gerarNovoToken() {
  try {
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

    const { CLIENTID, CLIENTSECRET, CAMINHO_CRT, SENHA_CRT } =
      db_data.recordset[0];
    const httpsAgent = new https.Agent({
      pfx: fs.readFileSync(path.resolve(CAMINHO_CRT)),
      passphrase: SENHA_CRT,
    });

    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", CLIENTID);
    params.append("client_secret", CLIENTSECRET);

    const response = await axios.post(
      "https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        httpsAgent,
      }
    );

    const { access_token, expires_in } = response.data;
    const expires_at = Math.floor(Date.now() / 1000) + expires_in - 60; // 1 min de folga

    fs.writeFileSync(
      tokenFile,
      JSON.stringify({ access_token, expires_at }, null, 2)
    );
    console.log("Novo token gerado e salvo.");
    return access_token;
  } catch (err) {
    console.error("Erro ao gerar novo token:", err.message);
    return null;
  }
}

async function getToken() {
  try {
    if (fs.existsSync(tokenFile)) {
      const data = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
      if (Date.now() / 1000 < data.expires_at) {
        return data.access_token;
      } else {
        console.log("Token expirado. Gerando novo...");
      }
    } else {
      console.log("Arquivo de token não encontrado. Gerando novo...");
    }
  } catch (err) {
    console.warn("Erro ao ler token.json. Gerando novo token...");
  }

  return await gerarNovoToken();
}

module.exports = getToken;
