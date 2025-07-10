const axios = require("axios");

function enviarRequisicoesParalelas(ids) {
  for (const id of ids) {
    axios
      .post("http://localhost:3000/gerar_boletos", { ids: [id] })
      .then((response) => {
        console.log(`Resposta para ID ${id}:`, response.data);
      })
      .catch((error) => {
        console.error(`Erro na requisição para ID ${id}:`, error.message);
      });
  }
}

// Exemplo de uso:
const listaDeIds = [1, 2, 3, 4, 5];
enviarRequisicoesParalelas(listaDeIds);
