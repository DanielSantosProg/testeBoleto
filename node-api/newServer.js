const express = require("express");
const gerarBoleto = require("./gerarBoletoService");
const fetchDbData = require("./BoletoDataSandbox");
const puppeteer = require("puppeteer");
const sql = require("mssql");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "100mb" }));

// Função para processar um boleto individualmente, recebendo o browser Puppeteer aberto
async function processarBoleto(id, pool, browser) {
  let transaction;
  try {
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
      throw new Error(`Duplicata não encontrada para o ID ${id}.`);
    }

    const data = dadosIniciais.recordset[0];

    // Gera o payload do boleto
    const payload = await fetchDbData(id, pool);

    // Gera os dados do boleto e o html
    const resultado = await gerarBoleto(
      payload,
      data.caminhoCrt,
      data.senhaCrt
    );
    const { status, cod_barras, boleto_html, dados_bradesco_api } = resultado;

    // Define strings para o SQL
    const nossoNumeroValue =
      dados_bradesco_api.ctitloCobrCdent !== undefined &&
      dados_bradesco_api.ctitloCobrCdent !== null
        ? String(dados_bradesco_api.ctitloCobrCdent).substring(0, 11)
        : payload.ctitloCobrCdent
        ? String(payload.ctitloCobrCdent).substring(0, 11)
        : "";

    const linhaDigitavelValue = (dados_bradesco_api.linhaDig10 || "").substring(
      0,
      50
    );
    const pixQrCodeValue = (dados_bradesco_api.wqrcdPdraoMercd || "").substring(
      0,
      500
    );
    const codBarrasValue = cod_barras || "";

    // Atualiza o COR_CADASTRO_DE_DUPLICATAS
    const request2 = new sql.Request(transaction);
    await request2
      .input("id", sql.Int, data.duplicataId)
      .input("nossoNumero", sql.VarChar(50), nossoNumeroValue)
      .input("codBarras", sql.VarChar(50), codBarrasValue).query(`
        UPDATE COR_CADASTRO_DE_DUPLICATAS
        SET COR_DUP_PROTOCOLO = @nossoNumero,
            COR_DUP_COD_BARRAS = @codBarras
        WHERE COR_DUP_ID = @id
      `);

    // Incrementa o NOSSONUMERO em API_BOLETO_CAD_CONVENIO
    const request3 = new sql.Request(transaction);
    await request3.input("idConta", sql.Int, data.idConta).query(`
        UPDATE API_BOLETO_CAD_CONVENIO
        SET NOSSONUMERO = ISNULL(NOSSONUMERO, 0) + 1
        WHERE IDCONTA = @idConta
      `);

    // Insere um registro em COR_BOLETO_BANCARIO com os dados do boleto
    const request4 = new sql.Request(transaction);
    await request4
      .input("dataVenc", sql.Date, data.dataVencimento)
      .input("nDoc", sql.Int, data.numeroDocumento)
      .input("dataProcess", sql.DateTime, new Date())
      .input("valor", sql.Float, data.dupValor)
      .input("linhaDigitavel", sql.VarChar(60), linhaDigitavelValue)
      .input("codigoBarra", sql.VarChar(50), codBarrasValue)
      .input("nossoNumero", sql.VarChar(50), nossoNumeroValue)
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
      .input("pixQrCode", sql.VarChar(500), pixQrCodeValue)
      .input("numBoleto", sql.Int, parseInt(dados_bradesco_api.snumero10))
      .input("statusBol", sql.Int, dados_bradesco_api.codStatus10).query(`
        INSERT INTO COR_BOLETO_BANCARIO (
          DATA_VENC, N_DOC, DATA_PROCESS, VALOR, LINHA_DIGITAVEL, CODIGO_BARRA,
          NOSSO_NUMERO, ID_DUPLICATA, ANO_BOLETO, ID_CONTA_CORRENTE, ATIVO,
          SELECIONADO, DATA_CADASTRO, ID_USU_CADASTRO, ID_CLIENTE, IDEMPRESA,
          PARCELA, PIX_QRCODE, STATUS_BOL, N_BOLETO
        ) VALUES (
          @dataVenc, @nDoc, @dataProcess, @valor, @linhaDigitavel, @codigoBarra,
          @nossoNumero, @idDuplicata, @anoBoleto, @idContaCorrente, @ativo,
          @selecionado, @dataCadastro, @idUsuCadastro, @idCliente, @idEmpresa,
          @parcela, @pixQrCode, @statusBol, @numBoleto
        )
      `);

    // Commita a transação
    await transaction.commit();

    // Gera o PDF com Puppeteer usando browser já aberto
    const page = await browser.newPage();
    await page.setContent(boleto_html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await page.close();

    return {
      id,
      status,
      pdfBase64: Buffer.from(pdfBuffer).toString("base64"),
    };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(`Erro ao dar rollback para ID ${id}:`, rollbackError);
      }
    }
    console.error(`Erro no processamento do boleto ID ${id}:`, error);
    return {
      id,
      error: error.message,
    };
  }
}

app.post("/gerar_boletos", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res
      .status(400)
      .json({ error: "Array de IDs não fornecido ou vazio." });
  }

  let pool;
  let browser;
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

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Processa todos os boletos em paralelo com limite
    const limit = 5;
    const results = [];
    for (let i = 0; i < ids.length; i += limit) {
      const chunk = ids.slice(i, i + limit);
      const chunkResults = await Promise.all(
        chunk.map((id) => processarBoleto(id, pool, browser))
      );
      results.push(...chunkResults);
    }

    res.json({ resultados: results });
  } catch (error) {
    console.error("Erro geral ao gerar boletos:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
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
