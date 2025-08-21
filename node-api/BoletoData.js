require("dotenv").config();
const sql = require("mssql");

function formatDate(data) {
  let date = new Date(data);
  let dia = String(date.getUTCDate()).padStart(2, "0");
  let mes = String(date.getUTCMonth() + 1).padStart(2, "0");
  let ano = date.getUTCFullYear();
  return `${dia}.${mes}.${ano}`;
}

async function fetchDbData(id, pool) {
  try {
    const dataSelect = await pool.request().input("id", sql.Int, id).query(`
      WITH Contacts AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY COR_CON_CLI_ID ORDER BY COR_CON_ID ASC) as cont 
          FROM COR_CONTATOS
      )
      SELECT D.COR_DUP_ID AS duplicataId, D.COR_DUP_DOCUMENTO AS dupDocumento,
             D.COR_DUP_DATA_EMISSAO AS dataEmissao, D.COR_DUP_DATA_VENCIMENTO AS dataVencimento,
             D.COR_DUP_VALOR_DUPLICATA AS dupValor, RTRIM(D.COR_DUP_TIPO) AS dupTipo,
             RTRIM(C.COR_CLI_NOME) AS clienteNome, RTRIM(C.COR_CLI_CNPJ_CPF) AS cnpjCpfCliente,
             RTRIM(B.AGENCIA) AS agencia, RTRIM(B.CONTA) AS conta, RTRIM(B.CODBANCO) AS codBanco,
             CO.NOSSONUMERO AS nossoNumero, RTRIM(CO.NUMCONTRATO) as numContrato,
             RTRIM(CO.CARTEIRA) AS carteira, (CO.PROTESTO) AS protesto, (CO.DIASPROTESTO) AS diasProtesto,
             CO.LIMITE_RECEB_DIAS AS diasDecurso, CO.JUROS_DIA AS juros, RTRIM(CO.MODALIDADE_JUROS) as modalidadeJuros,
             CO.MULTA as multa, RTRIM(CO.TIPO_MULTA) AS tipoMulta, CO.DIAS_MULTA AS diasMulta,
             RTRIM(E.GER_EMP_C_N_P_J_) AS empresaCnpj,
             RTRIM(CN.COR_CON_NUMERO_ENDERECO) AS numeroEnderecoContato,
             RTRIM(CN.COR_CON_ENDERECO) AS enderecoContato, RTRIM(CN.COR_CON_COMPLEMENTO_ENDERECO) AS complementoContato,
             RTRIM(CN.COR_CON_BAIRRO) AS bairroContato, RTRIM(CN.COR_CON_CEP) AS cepContato,
             RTRIM(CN.COR_CON_EMAIL) AS emailContato, RTRIM(CN.COR_CON_TELEFONE) AS telefoneContato,
             RTRIM(M.GER_MUN_DESCRICAO) AS municipio, RTRIM(ES.GER_EST_UF) AS uf
      FROM COR_CADASTRO_DE_DUPLICATAS D
      INNER JOIN COR_CLIENTE C ON D.COR_DUP_CLIENTE = C.COR_CLI_ID
      INNER JOIN API_PIX_CADASTRO_DE_CONTA B ON D.COR_CLI_BANCO = B.API_PIX_ID
      INNER JOIN API_BOLETO_CAD_CONVENIO CO ON D.COR_CLI_BANCO = CO.IDCONTA
      INNER JOIN GER_EMPRESA E ON D.COR_DUP_IDEMPRESA = E.GER_EMP_ID
      INNER JOIN Contacts CN ON C.COR_CLI_ID = CN.COR_CON_CLI_ID AND CN.cont = 1
      INNER JOIN GER_MUNICIPIO M ON CN.COR_CON_MUN_ID = M.GER_MUN_ID
      INNER JOIN GER_ESTADO ES ON CN.COR_CON_EST_ID = ES.GER_EST_ID
      WHERE D.COR_DUP_ID = @id;
    `);

    const newData = dataSelect.recordset[0];
    if (!newData) return null;

    const dupTipoMap = {
      CH: "1",
      DM: "2",
      DMI: "3",
      DS: "4",
      DSI: "5",
      DR: "6",
      LC: "7",
      NCC: "8",
      NCE: "9",
      NCI: "10",
      NCR: "11",
      NP: "12",
      NPR: "13",
      TM: "14",
      TS: "15",
      NS: "16",
      RC: "17",
      FAT: "18",
      ND: "19",
      AP: "20",
      ME: "21",
      PC: "22",
      DD: "23",
      CCB: "24",
      FI: "25",
      RD: "26",
      DRI: "27",
      EC: "28",
      ECI: "29",
      CC: "31",
      BDP: "32",
      OUT: "99",
    };

    const {
      diasDecurso,
      dupDocumento,
      dataEmissao,
      dataVencimento,
      dupValor,
      dupTipo,
      clienteNome,
      cnpjCpfCliente,
      agencia,
      conta,
      codBanco,
      nossoNumero,
      numContrato,
      carteira,
      protesto,
      diasProtesto,
      juros,
      modalidadeJuros,
      multa,
      tipoMulta,
      diasMulta,
      empresaCnpj,
      numeroEnderecoContato,
      enderecoContato,
      complementoContato,
      bairroContato,
      cepContato,
      emailContato,
      telefoneContato,
      municipio,
      uf,
    } = newData;

    const payload = {
      ctitloCobrCdent: String(nossoNumero ?? "0").padStart(11, "0"),
      registrarTitulo: "1",
      qtdDecurPrz: String(diasDecurso ?? "0"),
      codUsuario: "APISERV",
      nroCpfCnpjBenef: String(empresaCnpj ?? "").substring(0, 8),
      filCpfCnpjBenef: String(empresaCnpj ?? "").substring(8, 12),
      digCpfCnpjBenef: String(empresaCnpj ?? "").slice(-2),
      tipoAcesso: "2",
      cpssoaJuridContr: String(numContrato ?? "0"),
      ctpoContrNegoc: "000",
      nseqContrNegoc: String(numContrato ?? "0"),
      cidtfdProdCobr: String(carteira ?? "0"),
      cnegocCobr: String(
        String(agencia ?? "").padStart(4, "0") +
          String(conta ?? "").padStart(14, "0")
      ),
      codigoBanco: String(codBanco ?? "237"),
      filler: "",
      eNseqContrNegoc: String(numContrato ?? "0"),
      tipoRegistro: protesto ? "002" : "001",
      cprodtServcOper: "00000000",
      ctitloCliCdent: String(dupDocumento ?? "0"),
      demisTitloCobr: formatDate(dataEmissao),
      dvctoTitloCobr: formatDate(dataVencimento),
      cidtfdTpoVcto: "0",
      cindcdEconmMoeda: "00006",
      vnmnalTitloCobr: String(parseInt(dupValor * 100)),
      qmoedaNegocTitlo: "0",
      cespceTitloCobr: "02",
      cindcdAceitSacdo: "N",
      ctpoProteTitlo: protesto ? "2" : "0",
      ctpoPrzProte: protesto ? diasProtesto : "0",
      ctpoProteDecurs: protesto ? "2" : "0",
      ctpoPrzDecurs: "0",
      cctrlPartcTitlo: "0",
      cformaEmisPplta: "02",
      cindcdPgtoParcial: "N",
      qtdePgtoParcial: "0",
      filler1: "",
      ptxJuroVcto:
        modalidadeJuros === "P" ? Number(juros ?? 0).toFixed(5) : "0",
      vdiaJuroMora:
        modalidadeJuros === "V"
          ? String(Math.round((juros ?? 0) * 100)).padStart(3, "0")
          : "0",
      qdiaInicJuro: juros ? "1" : "0",
      pmultaAplicVcto: tipoMulta === "P" ? Number(multa ?? 0).toFixed(5) : "0",
      vmultaAtrsoPgto:
        tipoMulta === "V"
          ? String(Math.round((multa ?? 0) * 100)).padStart(3, "0")
          : "0",
      qdiaInicMulta: String(diasMulta ?? "0"),
      pdescBonifPgto01: "0",
      vdescBonifPgto01: "0",
      dlimDescBonif1: "",
      pdescBonifPgto02: "0",
      vdescBonifPgto02: "0",
      dlimDescBonif2: "",
      pdescBonifPgto03: "0",
      vdescBonifPgto03: "0",
      dlimDescBonif3: "",
      ctpoPrzCobr: "0",
      pdescBonifPgto: "0",
      vdescBonifPgto: "0",
      dlimBonifPgto: "",
      vabtmtTitloCobr: "0",
      viofPgtoTitlo: "0",
      filler2: "",
      isacdoTitloCobr: String(clienteNome ?? ""),
      elogdrSacdoTitlo: String(enderecoContato ?? ""),
      enroLogdrSacdo: String(numeroEnderecoContato ?? ""),
      ecomplLogdrSacdo: String(complementoContato ?? ""),
      ccepSacdoTitlo: cepContato ? String(cepContato).substring(0, 5) : "00000",
      ccomplCepSacdo: cepContato ? String(cepContato).slice(-3) : "000",
      ebairoLogdrSacdo: String(bairroContato ?? ""),
      imunSacdoTitlo: String(municipio ?? ""),
      csglUfSacdo: String(uf ?? ""),
      indCpfCnpjSacdo:
        cnpjCpfCliente && String(cnpjCpfCliente).length === 11 ? "1" : "2",
      nroCpfCnpjSacdo: String(cnpjCpfCliente ?? "0"),
      renderEletrSacdo: String(emailContato ?? ""),
      cdddFoneSacdo: telefoneContato
        ? String(telefoneContato).substring(0, 2)
        : "00",
      cfoneSacdoTitlo: String(telefoneContato ?? "0"),
      bancoDeb: "000",
      agenciaDeb: "00000",
      agenciaDebDv: "0",
      contaDeb: "0000000000000",
      bancoCentProt: "0",
      agenciaDvCentPr: "0",
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
      validadeAposVencimento: "",
      filler4: "",
      idLoc: "",
    };

    return payload;
  } catch (error) {
    console.error("Ocorreu um erro ao pegar os dados:", error);
    throw error;
  }
}

module.exports = fetchDbData;
