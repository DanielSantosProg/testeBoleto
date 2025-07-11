const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");
const sql = require("mssql");
const getToken = require("../gerarToken");

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

      const deveTentarNovamente = statusCode === 504;

      if (!deveTentarNovamente) {
        // Erro não é para retry, retorna imediatamente
        let erro = `Erro ao fazer a consulta: ${msgErro}`;
        return erro;
      }

      console.warn(
        `Tentativa ${tentativa} para boleto ID ${id} falhou com erro: ${msgErro}`
      );

      if (tentativa === maxTentativas) {
        // Última tentativa, retorna erro
        let erro =
          "Chegou ao limite de tentativas, tente novamente mais tarde.";
        return erro;
      }

      // Espera crescente antes da próxima tentativa
      await new Promise((res) => setTimeout(res, 500 * tentativa));
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
    throw err;
  }
}

module.exports = { consultarBoletoComRetry, consultarBoleto };
