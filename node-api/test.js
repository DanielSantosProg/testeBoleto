const fs = require("fs");
const axios = require("axios");
const path = require("path");

const API_URL = "http://localhost:3000/gerar_boleto"; // Endereço para o endpoint de geração de boleto

const dados_para_boleto = {
  ctitloCobrCdent: "12345678901",
  registrarTitulo: "1",
  codUsuario: "APISERVIC",
  nroCpfCnpjBenef: "123456789",
  filCpfCnpjBenef: "1018",
  digCpfCnpjBenef: "38",
  tipoAcesso: "2",
  cpssoaJuridContr: "0000000000",
  ctpoContrNegoc: "000",
  nseqContrNegoc: "0000000000",
  cidtfdProdCobr: "09",
  cnegocCobr: "111111111111111111",
  codigoBanco: "237",
  filler: "",
  eNseqContrNegoc: "0000000000",
  tipoRegistro: "001",
  cprodtServcOper: "00000000",
  ctitloCliCdent: "SEUNUMERO1234567890123",
  demisTitloCobr: "01.01.2024",
  dvctoTitloCobr: "11.08.2025",
  cidtfdTpoVcto: "0",
  cindcdEconmMoeda: "00006",
  vnmnalTitloCobr: "115832",
  qmoedaNegocTitlo: "00000000000000000",
  cespceTitloCobr: "25",
  cindcdAceitSacdo: "N",
  ctpoProteTitlo: "00",
  ctpoPrzProte: "00",
  ctpoProteDecurs: "00",
  ctpoPrzDecurs: "00",
  cctrlPartcTitlo: "0000000000000000000000000",
  cformaEmisPplta: "02",
  cindcdPgtoParcial: "N",
  qtdePgtoParcial: "000",
  filler1: "",
  ptxJuroVcto: "0",
  vdiaJuroMora: "00000000000000012",
  qdiaInicJuro: "01",
  pmultaAplicVcto: "000000",
  vmultaAtrsoPgto: "100",
  qdiaInicMulta: "01",
  pdescBonifPgto01: "0",
  vdescBonifPgto01: "0",
  dlimDescBonif1: "",
  pdescBonifPgto02: "0",
  vdescBonifPgto02: "0",
  dlimDescBonif2: "",
  pdescBonifPgto03: "0",
  vdescBonifPgto03: "0",
  dlimDescBonif3: "",
  ctpoPrzCobr: "00",
  pdescBonifPgto: "0",
  vdescBonifPgto: "0000",
  dlimBonifPgto: "",
  vabtmtTitloCobr: "00000000000000000",
  viofPgtoTitlo: "0",
  filler2: "",
  isacdoTitloCobr: "TESTE EMPRESA PGIT",
  elogdrSacdoTitlo: "RUA DAS FLORES",
  enroLogdrSacdo: "123",
  ecomplLogdrSacdo: "APT 101",
  ccepSacdoTitlo: "12345",
  ccomplCepSacdo: "000",
  ebairoLogdrSacdo: "CENTRO",
  imunSacdoTitlo: "SAO PAULO",
  csglUfSacdo: "SP",
  indCpfCnpjSacdo: "1",
  nroCpfCnpjSacdo: "12345678901",
  renderEletrSacdo: "email@teste.com",
  cdddFoneSacdo: "011",
  cfoneSacdoTitlo: "912345678",
  bancoDeb: "000",
  agenciaDeb: "00000",
  agenciaDebDv: "0",
  contaDeb: "0000000000000",
  bancoCentProt: "000",
  agenciaDvCentPr: "00000",
  isacdrAvalsTitlo: "",
  elogdrSacdrAvals: "",
  enroLogdrSacdr: "",
  ecomplLogdrSacdr: "",
  ccepSacdrTitlo: "00000",
  ccomplCepSacdr: "000",
  ebairoLogdrSacdr: "",
  imunSacdrAvals: "",
  csglUfSacdr: "",
  indCpfCnpjSacdr: "",
  nroCpfCnpjSacdr: "00000000000000",
  renderEletrSacdr: "",
  cdddFoneSacdr: "",
  cfoneSacdrTitlo: "",
  filler3: "0",
  fase: "1",
  cindcdCobrMisto: "S",
  ialiasAdsaoCta: "",
  iconcPgtoSpi: "",
  caliasAdsaoCta: "",
  ilinkGeracQrcd: "",
  wqrcdPdraoMercd: "",
  validadeAposVencimento: "0",
  filler4: "",
  idLoc: "",
};

async function testarGeracaoBoleto() {
  try {
    console.log("Enviando requisição POST para:", API_URL);

    const response = await axios.post(API_URL, dados_para_boleto, {
      responseType: "arraybuffer",
    });

    console.log(response.data);

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
