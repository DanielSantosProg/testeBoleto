const fs = require("fs");
const axios = require("axios");
const path = require("path");

const API_URL = "http://localhost:3000/gerar_boletos";

async function gerarBoletos(idsParaGerar) {
  try {
    console.log("Enviando requisição POST para:", API_URL);

    console.log("\nIniciando a geração de boletos...\n");
    const response = await axios.post(
      API_URL,
      { ids: idsParaGerar },
      { responseType: "json" }
    );

    const resultados = response.data.resultados;

    if (resultados.length == 0) {
      console.log(
        "Verifique se as duplicatas informadas existem ou se já gerou boleto."
      );
      return;
    }

    // Loga as os dados recebidos
    console.log(`\nForam recebidas ${resultados.length} respostas:`);

    console.log(resultados);
  } catch (error) {
    if (error.response) {
      console.error("Erro na API:", error.response.status);
      console.error(error.response.data);
    } else {
      console.error("Erro inesperado:", error.message);
    }
  }
}

// Executa se chamado diretamente pela linha de comando
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Por favor, informe pelo menos um ID de boleto como argumento."
    );
    process.exit(1);
  }
  // Converte argumentos para números e filtra inválidos
  const ids = args.map((id) => parseInt(id)).filter((id) => !isNaN(id));

  if (ids.length === 0) {
    console.error("Nenhum ID válido informado.");
    process.exit(1);
  }

  gerarBoletos(ids).catch((err) => {
    console.error("Erro ao gerar boletos:", err);
    process.exit(1);
  });
}

module.exports = {
  gerarBoletos,
};
