const fs = require("fs");
const axios = require("axios");
const path = require("path");

const API_URL = "http://localhost:3000/gerar_boletos";

async function testarGeracaoBoletos() {
  const idsParaGerar = [8955, 8955, 8955];

  try {
    console.log("Enviando requisição POST para:", API_URL);

    const response = await axios.post(
      API_URL,
      { ids: idsParaGerar },
      { responseType: "json" }
    );

    const resultados = response.data.resultados;
    console.log(`Recebidos ${resultados.length} resultados.`);

    const outputDir = path.join(__dirname, "boletos");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    for (const resultado of resultados) {
      if (resultado.error) {
        console.error(`Erro no boleto ID ${resultado.id}: ${resultado.error}`);
        continue;
      }

      let buffer;

      if (typeof resultado.pdfBase64 === "string") {
        buffer = Buffer.from(resultado.pdfBase64, "base64");
      } else if (Array.isArray(resultado.pdfBase64)) {
        buffer = Buffer.from(resultado.pdfBase64);
      } else {
        console.error(
          `Formato inesperado para pdfBase64 no boleto ID ${resultado.id}`
        );
        continue;
      }

      const filename = `boleto_${resultado.id}_${Date.now()}.pdf`;
      const filepath = path.join(outputDir, filename);

      fs.writeFileSync(filepath, buffer);
      console.log(`Boleto ID ${resultado.id} salvo como '${filename}'`);
    }
  } catch (error) {
    if (error.response) {
      console.error("Erro na API:", error.response.status);
      console.error(error.response.data);
    } else {
      console.error("Erro inesperado:", error.message);
    }
  }
}

testarGeracaoBoletos();
