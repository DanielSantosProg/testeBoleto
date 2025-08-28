const axios = require("axios");
const https = require("https");
const fs = require("fs");
const getToken = require("../gerarToken");

// Requere o arquivo.env para a conexão com o banco de dados
require("dotenv").config();

const API_URL =
  process.env.DB_AMBIENTE == 2
    ? "https://openapi.bradesco.com.br/boleto-hibrido/cobranca-registro/v1/gerarBoleto"
    : "https://openapisandbox.prebanco.com.br/boleto-hibrido/cobranca-registro/v1/gerarBoleto";

function calcularDigitoVerificador(carteira, nossoNumero) {
  const num = carteira + nossoNumero;
  const pesos = [2, 3, 4, 5, 6, 7];

  let soma = 0;
  let pesoIndex = 0;

  // Percorrer os dígitos da direita para a esquerda
  for (let i = num.length - 1; i >= 0; i--) {
    const digito = parseInt(num[i], 10);
    soma += digito * pesos[pesoIndex];
    pesoIndex = (pesoIndex + 1) % pesos.length;
  }

  const resto = soma % 11;
  const digito = 11 - resto;

  if (resto === 0) {
    return "0";
  }
  if (resto === 1) {
    return "P";
  }
  return digito.toString();
}

function gerarNossoNumeroFull(dados) {
  const nossoNumString = (dados.ctitloCobrCdent || "")
    .toString()
    .padStart(11, "0");

  const carteira = (dados.cidtfdProdCobr || "").toString().padStart(2, "0");

  const digito = calcularDigitoVerificador(carteira, nossoNumString);

  const nossoNumFormat = `${carteira}/${nossoNumString}-${digito}`;

  return nossoNumFormat;
}

function decodeCodBar(codBarStr, ebcdicDict) {
  // Remove '<>' das extremidades da string, se existirem
  const cleanedCodBarStr = codBarStr.replace(/^<|>$/g, "");

  let decoded = "";
  const length = 5;

  // Itera sobre a string do código de barras em segmentos de 5 caracteres
  for (let i = 0; i < cleanedCodBarStr.length; i += length) {
    const segment = cleanedCodBarStr.substring(i, i + length); // Usa substring para obter o segmento

    // Verifica se o segmento existe no dicionário
    if (segment in ebcdicDict) {
      decoded += ebcdicDict[segment];
    } else {
      // Lança um erro se o segmento não for reconhecido
      throw new Error(
        `Segmento de código de barras não reconhecido: ${segment}`
      );
    }
  }
  return decoded;
}

const ebcdicToNum = {
  nnWWn: "00",
  NnwwN: "01",
  nNwwN: "02",
  NNwwn: "03",
  nnWwN: "04",
  NnWwn: "05",
  nNWwn: "06",
  nnwWN: "07",
  NnwWn: "08",
  nNwWn: "09",
  wnNNw: "10",
  WnnnW: "11",
  wNnnW: "12",
  WNnnw: "13",
  wnNnW: "14",
  WnNnw: "15",
  wNNnw: "16",
  wnnNW: "17",
  WnnNw: "18",
  wNnNw: "19",
  nwNNw: "20",
  NwnnW: "21",
  nWnnW: "22",
  NWnnw: "23",
  nwNnW: "24",
  NwNnw: "25",
  nWNnw: "26",
  nwnNW: "27",
  NwnNw: "28",
  nWnNw: "29",
  wwNNn: "30",
  WwnnN: "31",
  wWnnN: "32",
  WWnnn: "33",
  wwNnN: "34",
  WwNnn: "35",
  wWNnn: "36",
  wwnNN: "37",
  WwnNn: "38",
  wWnNn: "39",
  nnWNw: "40",
  NnwnW: "41",
  nNwnW: "42",
  NNwnw: "43",
  nnWnW: "44",
  NnWnw: "45",
  nNWnw: "46",
  nnwNW: "47",
  NnwNw: "48",
  nNwNw: "49",
  wnWNn: "50",
  WnwnN: "51",
  wNwnN: "52",
  WNwnn: "53",
  wnWnN: "54",
  WnWnn: "55",
  wNWnn: "56",
  wnwNN: "57",
  WnwNn: "58",
  wNwNn: "59",
  nwWNn: "60",
  NwwnN: "61",
  nWwnN: "62",
  NWwnn: "63",
  nwWnN: "64",
  NwWnn: "65",
  nWWnn: "66",
  nwwNN: "67",
  NwwNn: "68",
  nWwNn: "69",
  nnNWw: "70",
  NnnwW: "71",
  nNnwW: "72",
  NNnww: "73",
  nnNwW: "74",
  NnNww: "75",
  nNNww: "76",
  nnnWW: "77",
  NnnWw: "78",
  nNnWw: "79",
  wnNWn: "80",
  WnnwN: "81",
  wNnwN: "82",
  WNnwn: "83",
  wnNwN: "84",
  WnNwn: "85",
  wNNwn: "86",
  wnnWN: "87",
  WnnWn: "88",
  wNnWn: "89",
  nwNWn: "90",
  NwnwN: "91",
  nWnwN: "92",
  NWnwn: "93",
  nwNwN: "94",
  NwNwn: "95",
  nWNwn: "96",
  nwnWN: "97",
  NwnWn: "98",
  nWnWn: "99",
};

async function requisicaoBradesco(
  payload,
  CAMINHO_CRT,
  SENHA_CRT,
  CLIENTID,
  CLIENTSECRET
) {
  const token = await getToken(CAMINHO_CRT, SENHA_CRT, CLIENTID, CLIENTSECRET);
  if (!token) throw new Error("Erro ao obter token");

  const agent = new https.Agent({
    pfx: fs.readFileSync(CAMINHO_CRT),
    passphrase: SENHA_CRT,
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  try {
    console.log("Enviando requisição POST para:", API_URL);

    const response = await axios.post(API_URL, payload, {
      httpsAgent: agent,
      headers: headers,
      responseType: "json",
    });

    const resultado = response.data;

    if (!resultado || Object.keys(resultado).length === 0) {
      return { error: "Resposta vazia da API ou dados inválidos." };
    }

    if (resultado.error) {
      console.error(`Erro no boleto ID ${resultado.id}: ${resultado.error}`);
      return resultado;
    }

    const nossoNumeroFull = gerarNossoNumeroFull(resultado);

    const decoded = decodeCodBar(resultado.codBarras10, ebcdicToNum);

    return {
      dados_bradesco_api: resultado,
      nossoNumeroFull,
      cod_barras: decoded,
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data.errorMessage
        ? error.response.data.errorMessage
        : error.response.data;

      console.error("Erro na API:", status);
      console.error(data.mensagem ?? "Nenhum mensagem de erro retornada");

      // Retorna uma mensagem detalhada para o retry identificar
      return {
        error: `Erro na requisição para a API do Bradesco: ${status} - ${
          typeof data === "string"
            ? data.mensagem ?? data.substring(0, 200) + "..."
            : JSON.stringify(data.mensagem ?? data)
        }`,
      };
    } else {
      console.error("Erro inesperado:", error.message);
      return { error: error.message || "Erro desconhecido" };
    }
  }
}

module.exports = { requisicaoBradesco };
