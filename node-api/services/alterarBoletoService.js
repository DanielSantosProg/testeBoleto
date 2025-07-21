const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");
const getToken = require("../gerarToken");

require("dotenv").config();

async function alterarBoletoComRetry(
  id,
  payload,
  CAMINHO_CRT,
  SENHA_CRT,
  CLIENTID,
  CLIENTSECRET,
  TXID,
  maxTentativas = 3
) {
  let tentativa = 0;
  let resultado;

  while (tentativa < maxTentativas) {
    tentativa++;
    try {
      resultado = await alterarBoleto(
        payload,
        CAMINHO_CRT,
        SENHA_CRT,
        CLIENTID,
        CLIENTSECRET,
        TXID
      );

      if (resultado.error) {
        throw new Error(resultado.error);
      }

      return resultado;
    } catch (error) {
      const msgErro = error.message || "";
      const statusCode = error.response ? error.response.status : null;
      const mensagem =
        error.response?.data?.mensagem ||
        error.response?.data?.descricaoErro ||
        msgErro;

      const deveTentarNovamente =
        statusCode === 504 ||
        (statusCode === 422 && !error.response?.data?.descricaoErro) ||
        !statusCode;

      if (!deveTentarNovamente) {
        if (error.response?.data?.descricaoErro) {
          return { error: error.response.data.descricaoErro };
        }
        return { error: mensagem };
      }

      console.warn(
        `Tentativa ${tentativa} para boleto ID ${id} falhou com erro: ${msgErro}`
      );

      if (tentativa === maxTentativas) {
        let erroFinal = {
          error:
            "Chegou ao limite de tentativas, tente novamente em alguns instantes",
        };
        if (statusCode == 422 && error.response?.data?.mensagem) {
          erroFinal = {
            error: `Chegou ao limite de tentativas, tente novamente em alguns instantes. ${error.response.data.mensagem}`,
          };
        }
        return erroFinal;
      }

      // Espera crescente antes da próxima tentativa (ex: 1s, 2s, 3s)
      await new Promise((res) => setTimeout(res, 1000 * tentativa));
    }
  }
}

async function alterarBoleto(
  payload,
  CAMINHO_CRT,
  SENHA_CRT,
  CLIENTID,
  CLIENTSECRET,
  TXID
) {
  try {
    const url =
      process.env.DB_AMBIENTE == 1
        ? "https://openapisandbox.prebanco.com.br/boleto-hibrido/cobranca-alteracao/v1/alteraBoletoConsulta"
        : "https://openapi.bradesco.com.br/boleto/cobranca-altera/v1/alterar";

    const token = await getToken(
      CAMINHO_CRT,
      SENHA_CRT,
      CLIENTID,
      CLIENTSECRET
    );
    if (!token) throw new Error("Erro ao obter token");

    const idTransacao =
      process.env.DB_AMBIENTE == 1
        ? "20241122237093995007555702570068544"
        : TXID;

    const httpsAgent = new https.Agent({
      pfx: fs.readFileSync(path.resolve(CAMINHO_CRT)),
      passphrase: SENHA_CRT,
    });

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        txid: idTransacao,
      },
      httpsAgent,
    });

    return response.data;
  } catch (err) {
    let mensagem = err?.response?.data?.mensagem || err.message;
    console.error("Erro ao fazer alteração do boleto: ", mensagem);
    const erroCompleto = new Error(mensagem);
    throw erroCompleto;
  }
}

module.exports = { alterarBoletoComRetry, alterarBoleto };
