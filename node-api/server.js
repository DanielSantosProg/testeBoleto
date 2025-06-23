// server.js
const express = require("express");
const gerarBoleto = require("./gerarBoletoService");
const pdf = require("html-pdf");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/gerar_boleto", async (req, res) => {
  try {
    const html = await gerarBoleto(req.body);

    pdf.create(html, { format: "A4" }).toBuffer((err, buffer) => {
      if (err) {
        console.error("Erro ao gerar PDF:", err);
        return res.status(500).json({ error: "Erro ao gerar PDF" });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=boleto.pdf");
      res.send(buffer);
    });
  } catch (error) {
    console.error("Erro ao gerar boleto:", error.message);
    res.status(500).json({ error: error.message });
  }
});

function startServer(porta = process.env.PORT || 3000) {
  app.listen(porta, () => {
    console.log(`Servidor rodando na porta ${porta}`);
  });
}

module.exports = {
  app,
  startServer,
};
