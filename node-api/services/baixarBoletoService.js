const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");
const sql = require("mssql");
const getToken = require("../gerarToken");

// Requere o arquivo.env para a conexão com o banco de dados
require("dotenv").config();

async function baixarBoletoComRetry(
  id,
  payload,
  CAMINHO_CRT,
  SENHA_CRT,
  CLIENTID,
  CLIENTSECRET,
  maxTentativas = 3
) {
  let tentativa = 0;
  let resultado;

  while (tentativa < maxTentativas) {
    tentativa++;
    try {
      resultado = await baixarBoleto(
        payload,
        CAMINHO_CRT,
        SENHA_CRT,
        CLIENTID,
        CLIENTSECRET
      );

      // Se a função retornar um objeto com erro, lance para entrar no catch
      if (resultado.error) {
        throw new Error(resultado.error);
      }

      return resultado;
    } catch (error) {
      const msgErro = error.message || "";

      const statusCode = error.response ? error.response.status : null;

      const deveTentarNovamente = statusCode === 504 || statusCode === 422;

      if (!deveTentarNovamente) {
        let erro = { error: `Erro ao fazer a consulta: ${msgErro}` }; // objeto!
        return erro;
      }

      console.warn(
        `Tentativa ${tentativa} para boleto ID ${id} falhou com erro: ${msgErro}`
      );

      if (tentativa === maxTentativas) {
        let erro = {
          error: "Chegou ao limite de tentativas, tente novamente mais tarde.",
        };
        return erro;
      }

      // Espera crescente antes da próxima tentativa
      await new Promise((res) => setTimeout(res, 1000 * tentativa));
    }
  }
}

async function baixarBoleto(
  payload,
  CAMINHO_CRT,
  SENHA_CRT,
  CLIENTID,
  CLIENTSECRET
) {
  try {
    let url;
    process.env.DB_AMBIENTE == 1
      ? (url =
          "https://openapisandbox.prebanco.com.br/boleto/cobranca-baixa/v1/baixar")
      : (url =
          "https://openapi.bradesco.com.br/boleto/cobranca-baixa/v1/baixar");

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
    throw err;
  }
}

module.exports = { baixarBoletoComRetry, baixarBoleto };
