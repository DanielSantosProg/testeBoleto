const fs = require("fs");
const Boleto = require("node-boleto").Boleto;

// Cria o boleto
const boleto = new Boleto({
  banco: "bradesco",
  data_emissao: new Date(),
  data_vencimento: new Date(new Date().getTime() + 5 * 24 * 60 * 60 * 1000),
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
});

boleto.renderHTML((html) => {
  fs.writeFileSync("boleto-base.html", html); // Cria o arquivo em html
  console.log("Arquivo HTML do boleto salvo como boleto-base.html");
});
