const express = require("express");
const gerarBoleto = require("./gerarBoletoService");
const fetchDbData = require("./BoletoDataSandbox");
const puppeteer = require("puppeteer");
const sql = require("mssql");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/gerar_boleto", async (req, res) => {
  const { id } = req.body;
  if (!id)
    return res.status(400).json({ error: "ID do boleto não foi fornecido." });

  let pool;
  let transaction;

  try {
    pool = await sql.connect({
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    // Cria um transaction para garantir que todas as inserções e updates serão feitos.
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Busca os dados iniciais
    const request1 = new sql.Request(transaction);
    const dadosIniciais = await request1.input("id", sql.Int, id).query(`
      SELECT
        D.COR_DUP_ID AS duplicataId,
        D.COR_CLI_BANCO AS codBanco,
        D.COR_DUP_VALOR_DUPLICATA AS dupValor,
        D.COR_DUP_TIPO AS dupTipo,
        D.COR_DUP_DATA_EMISSAO AS dataEmissao,
        D.COR_DUP_DATA_VENCIMENTO AS dataVencimento,
        D.COR_DUP_DOCUMENTO AS numeroDocumento,
        D.COR_DUP_NUMERO_ORDEM AS parcela,
        D.COR_DUP_CLIENTE AS idCliente,
        D.COR_DUP_IDEMPRESA AS idEmpresa,
        B.CAMINHO_CRT AS caminhoCrt,
        B.SENHA_CRT AS senhaCrt,
        B.API_PIX_ID AS idConta,
        CO.CARTEIRA,
        CO.PROTESTO,
        CO.JUROS_DIA,
        CO.MODALIDADE_JUROS,
        CO.MULTA,
        CO.TIPO_MULTA,
        CO.DIAS_MULTA,
        CO.NOSSONUMERO,
        BB.LINHA_DIGITAVEL,
        BB.CODIGO_BARRA
      FROM COR_CADASTRO_DE_DUPLICATAS D
      INNER JOIN API_PIX_CADASTRO_DE_CONTA B ON D.COR_CLI_BANCO = B.API_PIX_ID
      INNER JOIN API_BOLETO_CAD_CONVENIO CO ON CO.IDCONTA = B.API_PIX_ID
      LEFT JOIN COR_BOLETO_BANCARIO BB ON BB.ID_DUPLICATA = D.COR_DUP_ID
      WHERE D.COR_DUP_ID = @id;
    `);

    if (!dadosIniciais.recordset.length) {
      throw new Error("Duplicata não encontrada para o ID informado.");
    }

    const data = dadosIniciais.recordset[0];

    // Gera o payload do boleto
    const payload = await fetchDbData(id, pool);
    console.log("Payload enviado para gerarBoleto:", payload);

    // Gera o boleto em html
    const resultado = await gerarBoleto(
      payload,
      data.caminhoCrt,
      data.senhaCrt
    );
    const { status, cod_barras, boleto_html, dados_bradesco_api } = resultado;

    console.log(dados_bradesco_api);

    // Atualiza COR_CADASTRO_DE_DUPLICATAS com nosso número e código de barras
    const request2 = new sql.Request(transaction);
    await request2
      .input("id", sql.Int, data.duplicataId)
      .input("nossoNumero", sql.Int, dados_bradesco_api.ctitloCobrCdent)
      .input("codBarras", sql.VarChar(50), cod_barras || "").query(`
    UPDATE COR_CADASTRO_DE_DUPLICATAS
    SET COR_DUP_PROTOCOLO = @nossoNumero,
        COR_DUP_COD_BARRAS = @codBarras
    WHERE COR_DUP_ID = @id
  `);

    // 5. Incrementar NOSSONUMERO em API_BOLETO_CAD_CONVENIO
    const request3 = new sql.Request(transaction);
    await request3.input("idConta", sql.Int, data.idConta).query(`
        UPDATE API_BOLETO_CAD_CONVENIO
        SET NOSSONUMERO = NOSSONUMERO + 1
        WHERE IDCONTA = @idConta
      `);

    // 6. Inserir registro em COR_BOLETO_BANCARIO
    const request4 = new sql.Request(transaction);
    await request4
      .input("dataVenc", sql.Date, data.dataVencimento)
      .input("nDoc", sql.Int, data.numeroDocumento)
      .input("dataProcess", sql.DateTime, new Date())
      .input("valor", sql.Float, data.dupValor)
      .input(
        "linhaDigitavel",
        sql.VarChar(60),
        dados_bradesco_api.linhaDig10 || ""
      )
      .input("codigoBarra", sql.VarChar(50), cod_barras || "")
      .input("idDuplicata", sql.Int, data.duplicataId)
      .input("anoBoleto", sql.Int, new Date().getFullYear())
      .input("idContaCorrente", sql.Int, data.idConta)
      .input("ativo", sql.VarChar(1), "S")
      .input("selecionado", sql.VarChar(1), "N")
      .input("dataCadastro", sql.DateTime, new Date())
      .input("idUsuCadastro", sql.Int, 0) // Ajuste conforme sua API
      .input("idCliente", sql.Int, data.idCliente)
      .input("idEmpresa", sql.Int, data.idEmpresa)
      .input("parcela", sql.Int, data.parcela || 1)
      .input("numBoleto", sql.Int, parseInt(dados_bradesco_api.snumero10))
      .input(
        "pixQrCode",
        sql.VarChar(500),
        dados_bradesco_api.wqrcdPdraoMercd || ""
      )
      .input("statusBol", sql.Int, dados_bradesco_api.codStatus10).query(`
        INSERT INTO COR_BOLETO_BANCARIO (
          DATA_VENC, N_DOC, DATA_PROCESS, VALOR, LINHA_DIGITAVEL, CODIGO_BARRA,
          NOSSO_NUMERO, ID_DUPLICATA, ANO_BOLETO, ID_CONTA_CORRENTE, ATIVO,
          SELECIONADO, DATA_CADASTRO, ID_USU_CADASTRO, ID_CLIENTE, IDEMPRESA,
          PARCELA, PIX_QRCODE, STATUS_BOL, N_BOLETO
        ) VALUES (
          @dataVenc, @nDoc, @dataProcess, @valor, @linhaDigitavel, @codigoBarra,
          '46576895814', @idDuplicata, @anoBoleto, @idContaCorrente, @ativo,
          @selecionado, @dataCadastro, @idUsuCadastro, @idCliente, @idEmpresa,
          @parcela, @pixQrCode, @statusBol, @numBoleto
        )
      `);

    // 7. Commit da transação
    await transaction.commit();

    // 8. Gerar PDF com Puppeteer
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

    // 9. Retornar PDF e status
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=boleto.pdf");
    res.setHeader("boleto-status", status);
    res.send(pdfBuffer);
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Erro ao dar rollback:", rollbackError);
      }
    }
    console.error("Erro ao gerar boleto:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  } finally {
    if (pool) await pool.close();
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
