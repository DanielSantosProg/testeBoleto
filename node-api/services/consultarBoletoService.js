const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");
const sql = require("mssql");
const getToken = require("../gerarToken");

// Requere o arquivo.env para a conexão com o banco de dados
require("dotenv").config();

async function consultarBoletoComRetry(
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
      resultado = await consultarBoleto(
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

      const deveTentarNovamente =
        statusCode === 504 ||
        (statusCode === 422 && !error.response.data.descricaoErro);

      if (!deveTentarNovamente) {
        if (
          error.response &&
          error.response.data &&
          error.response.data.descricaoErro
        ) {
          return {
            error: error.response.data.descricaoErro,
          };
        }
        return { error: msgErro };
      }

      console.warn(
        `Tentativa ${tentativa} para boleto ID ${id} falhou com erro: ${msgErro}`
      );

      let erro = {
        error:
          "Chegou ao limite de tentativas, tente novamente em alguns instantes",
      };
      if (tentativa === maxTentativas) {
        if (statusCode == 422 && error.response.data.mensagem) {
          erro = {
            error: `Chegou ao limite de tentativas, tente novamente em alguns instantes. ${error.response.data.mensagem}`,
          };
        }
        return erro;
      }

      // Espera crescente antes da próxima tentativa
      await new Promise((res) => setTimeout(res, 1000 * tentativa));
    }
  }
}

async function consultarBoleto(
  payload,
  CAMINHO_CRT,
  SENHA_CRT,
  CLIENTID,
  CLIENTSECRET
) {
  try {
    const url =
      process.env.DB_AMBIENTE == 2
        ? "https://openapi.bradesco.com.br/boleto/cobranca-consulta/v1/consultar"
        : "https://openapisandbox.prebanco.com.br/boleto/cobranca-consulta/v1/consultar";

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

    return response;
  } catch (err) {
    console.error("Erro ao fazer consulta: ", err.message);
    throw err;
  }
}

module.exports = { consultarBoletoComRetry, consultarBoleto };
