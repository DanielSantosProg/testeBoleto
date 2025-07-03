const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");
const sql = require("mssql");
const getToken = require("../gerarToken");

async function consultarBoleto(
  payload,
  CAMINHO_CRT,
  SENHA_CRT,
  CLIENTID,
  CLIENTSECRET
) {
  try {
    const url =
      "https://openapisandbox.prebanco.com.br/boleto/cobranca-consulta/v1/consultar";

    //Busca o token para fazer a operação de consulta
    const token = await getToken(
      CAMINHO_CRT,
      SENHA_CRT,
      CLIENTID,
      CLIENTSECRET
    );
    if (!token) throw new Error("Erro ao obter token");

    const httpsAgent = new https.Agent({
      pfx: fs.readFileSync(path.resolve(CAMINHO_CRT)),
      passphrase: SENHA_CRT,
    });

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      httpsAgent,
    });

    return response.data;
  } catch (err) {
    console.error("Erro ao fazer consulta: ", err.message);
    return null;
  }
}

module.exports = consultarBoleto;
