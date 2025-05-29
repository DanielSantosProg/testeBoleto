const fs = require("fs");
const pdf = require("html-pdf");
const Boleto = require("node-boleto").Boleto;

// Cria o boleto
const boleto = new Boleto({
  banco: "bradesco",
  data_emissao: new Date(),
  data_vencimento: new Date(new Date().getTime() + 5 * 24 * 60 * 60 * 1000), // +5 dias
  valor: 1500,
  nosso_numero: "12345678",
  numero_documento: "1234",
  cedente: "Empresa Exemplo LTDA",
  cedente_cnpj: "12345678000195",
  agencia: "1172",
  codigo_cedente: "469",
  carteira: "06",
  pagador:
    "Cliente Exemplo\nRua Exemplo, 123\nBairro\nCidade - UF - CEP: 12345-000",
  linha_digitavel: "23792.85600 95007.000011 41022.265205 1 10000000010000",
});

boleto.renderHTML((html) => {
  // Gera o PDF
  pdf.create(html).toFile("./boleto.pdf", (err, res) => {
    if (err) return console.log(err);
    console.log("Boleto PDF gerado:", res.filename);
  });
});
