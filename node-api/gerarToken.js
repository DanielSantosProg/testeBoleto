const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");
const sql = require("mssql");
require("dotenv").config();

const tokenDir = path.join(process.cwd(), ".boleto-cache");
const tokenFile = path.join(tokenDir, "token.json");

// Garante que a pasta .boleto-cache exista
if (!fs.existsSync(tokenDir)) {
  fs.mkdirSync(tokenDir, { recursive: true });
}

async function gerarNovoToken(CAMINHO_CRT, SENHA_CRT, CLIENTID, CLIENTSECRET) {
  try {
    const httpsAgent = new https.Agent({
      pfx: fs.readFileSync(path.resolve(CAMINHO_CRT)),
      passphrase: SENHA_CRT,
    });

    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", CLIENTID);
    params.append("client_secret", CLIENTSECRET);
    const url =
      process.env.DB_AMBIENTE == 2
        ? "https://openapi.bradesco.com.br/auth/server-mtls/v2/token"
        : "https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token";

    const response = await axios.post(url, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      httpsAgent,
    });

    const { access_token } = response.data;
    const expires_in = parseInt(response.data.expires_in, 10);
    const now = Math.floor(Date.now() / 1000);
    const expires_at = now + expires_in - 60;

    fs.writeFileSync(
      tokenFile,
      JSON.stringify({ access_token, expires_at }, null, 2)
    );

    console.log("Novo token gerado e salvo em .boleto-cache/token.json.");
    return access_token;
  } catch (err) {
    console.error("Erro ao gerar novo token:", err.message);
    return null;
  }
}

async function getToken(CAMINHO_CRT, SENHA_CRT, CLIENTID, CLIENTSECRET) {
  try {
    if (fs.existsSync(tokenFile)) {
      const data = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
      const seconds = Math.floor(Date.now() / 1000);

      if (seconds < data.expires_at) {
        return data.access_token;
      } else {
        console.log("Token expirado. Gerando novo...");
      }
    } else {
      console.log("Token não encontrado. Gerando novo...");
    }
  } catch (err) {
    console.warn("Erro ao ler token. Gerando novo...");
  }

  return await gerarNovoToken(CAMINHO_CRT, SENHA_CRT, CLIENTID, CLIENTSECRET);
}

module.exports = getToken;
