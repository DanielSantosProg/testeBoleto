const fs = require("fs");
const axios = require("axios");
const path = require("path");

const API_URL = "http://localhost:3000/gerar_boleto"; // Endereço para o endpoint de geração de boleto

async function testarGeracaoBoleto() {
  try {
    console.log("Enviando requisição POST para:", API_URL);

    const response = await axios.post(
      API_URL,
      { id: 8955 },
      {
        responseType: "arraybuffer",
      }
    );

    const status = response.headers["boleto-status"];
    const contentType = response.headers["content-type"];
    const identificador = Date.now();
    const filename = `boleto_${identificador}.pdf`;

    console.log("Status do boleto:", status);

    if (contentType.includes("application/pdf")) {
      fs.writeFileSync(path.join(__dirname, filename), response.data);
      console.log(`Boleto PDF salvo como '${filename}'`);
    } else {
      console.error("A resposta não é um PDF. Tipo:", contentType);
      console.error("Resposta:", response.data.toString("utf-8"));
    }
  } catch (error) {
    if (error.response) {
      console.error("Erro na API:", error.response.status);
      console.error(error.response.data.toString("utf-8"));
    } else {
      console.error("Erro inesperado:", error.message);
    }
  }
}

testarGeracaoBoleto();
