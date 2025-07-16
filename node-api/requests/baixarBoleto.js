const axios = require("axios");

const API_URL = "http://localhost:3000/baixar_boleto";

async function baixa(id) {
  try {
    console.log("Enviando requisição POST para:", API_URL);

    const response = await axios.post(
      API_URL,
      { id: id },
      { responseType: "json" }
    );

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    const duplicata = response.data.duplicata;
    const status = response.data.status;
    const resultFull = response.data.resultado;

    console.log(`Boleto da duplicata de ID ${duplicata} encontrado.`);
    console.log("Status: ", status);
    console.log("Resultado Completo: ", resultFull);
  } catch (error) {
    if (error.response) {
      console.error("Erro na API:", error.response.status);
      console.error(error.response.data);
    } else {
      console.error("Erro encontrado:", error.message);
    }
  }
}

// Executa somente se chamado diretamente via Linha de comando
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Por favor, informe um ID de boleto como argumento.");
    process.exit(1);
  }

  if (args.length > 1) {
    console.error("Por favor, informe apenas um único ID.");
    process.exit(1);
  }

  const id = parseInt(args[0], 10);

  if (isNaN(id)) {
    console.error("ID inválido. Informe um número válido.");
    process.exit(1);
  }

  baixa(id).catch((err) => {
    console.error("Erro ao consultar boleto:", err);
    process.exit(1);
  });
}

module.exports = { baixa };
