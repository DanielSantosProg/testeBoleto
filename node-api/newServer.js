const express = require("express");
const gerarBoleto = require("./gerarBoletoService");
const fetchDbData = require("./BoletoDataSandbox");
const puppeteer = require("puppeteer");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/gerar_boleto", async (req, res) => {
  const { id } = req.body;
  if (!id)
    return res.status(400).json({ error: "ID do boleto não foi fornecido." });

  try {
    //Pega os dados do boleto do banco de dados
    const payload = await fetchDbData(id);
    console.log("Payload enviado para gerarBoleto:", payload);

    // Continua o processo até gerar o pdf
    const resultado = await gerarBoleto(payload);
    const { boleto_html, status, dados_bradesco_api } = resultado;

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(boleto_html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    // Envia o PDF gerado como resposta
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=boleto.pdf");
    res.setHeader("boleto-status", status);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Erro ao gerar boleto:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Função para iniciar o servidor em uma porta específica
function startServer(porta = process.env.PORT || 3000) {
  app.listen(porta, () => {
    console.log(`Servidor rodando na porta ${porta}`);
  });
}

// Exporta como módulo para uso externo
module.exports = {
  app,
  startServer,
};
