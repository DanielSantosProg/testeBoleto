const express = require("express");
const gerarBoleto = require("./gerarBoletoService");
const consultarBoleto = require("./consultarBoletoService");
const fetchDbData = require("./BoletoDataSandbox");
const puppeteer = require("puppeteer");
const sql = require("mssql");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "100mb" }));

// Função para processar um boleto individualmente, recebendo o browser Puppeteer aberto
async function processarBoleto(id, pool, browser) {
  let transaction;
  let page;
  let resultado;
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
        D.COR_DUP_USU_CADASTROU AS usuCadastro,
        B.CLIENTID AS clientId,
        B.CLIENTSECRET AS clientSecret,
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

    // Insere um registro em COR_BOLETO_BANCARIO com os dados do boleto
    const request2 = new sql.Request(transaction);
    await request2
      .input("dataVenc", sql.Date, data.dataVencimento)
      .input("nDoc", sql.Int, data.numeroDocumento)
      .input("dataProcess", sql.DateTime, new Date())
      .input("valor", sql.Float, parseFloat(data.dupValor))
      .input("linhaDigitavel", sql.VarChar(60), "0")
      .input("codigoBarra", sql.VarChar(50), "0")
      .input("nossoNumero", sql.VarChar(50), "0")
      .input("idDuplicata", sql.Int, data.duplicataId)
      .input("anoBoleto", sql.Int, new Date().getFullYear())
      .input("idContaCorrente", sql.Int, data.idConta)
      .input("ativo", sql.VarChar(1), "S")
      .input("selecionado", sql.VarChar(1), "N")
      .input("dataCadastro", sql.DateTime, new Date())
      .input("idUsuCadastro", sql.Int, data.usuCadastro)
      .input("idCliente", sql.Int, data.idCliente)
      .input("idEmpresa", sql.Int, data.idEmpresa)
      .input("parcela", sql.Int, data.parcela || 1)
      .input("pixQrCode", sql.VarChar(500), "0")
      .input("numBoleto", sql.Int, 0)
      .input("statusBol", sql.Int, 0).query(`
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

    // Gera o payload do boleto
    const payload = await fetchDbData(id, pool);

    // Gera os dados do boleto e o html
    resultado = await gerarBoleto(
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.clientId,
      data.clientSecret
    );

    // Verifica se a função Python retornou erro
    if (resultado.error) {
      throw new Error(`Erro na geração do boleto: ${resultado.error}`);
    }

    const { status, cod_barras, boleto_html, dados_bradesco_api } = resultado;

    if (!dados_bradesco_api || Object.keys(dados_bradesco_api).length === 0) {
      throw new Error("Dados do bradesco incorretos.");
    }

    if (resultado) {
      // Define strings para o SQL
      const nossoNumeroValue =
        dados_bradesco_api.ctitloCobrCdent !== undefined &&
        dados_bradesco_api.ctitloCobrCdent !== null
          ? String(dados_bradesco_api.ctitloCobrCdent).substring(0, 11)
          : payload.ctitloCobrCdent
          ? String(payload.ctitloCobrCdent).substring(0, 11)
          : "";

      const linhaDigitavelValue = (
        dados_bradesco_api.linhaDig10 || "0"
      ).substring(0, 50);
      const pixQrCodeValue = (
        dados_bradesco_api.wqrcdPdraoMercd || "0"
      ).substring(0, 500);
      const codBarrasValue = cod_barras || "0";

      // Atualiza o COR_CADASTRO_DE_DUPLICATAS
      const request3 = new sql.Request(transaction);
      await request3
        .input("id", sql.Int, data.duplicataId)
        .input("nossoNumero", sql.VarChar(50), nossoNumeroValue)
        .input("codBarras", sql.VarChar(50), codBarrasValue).query(`
          UPDATE COR_CADASTRO_DE_DUPLICATAS
          SET COR_DUP_PROTOCOLO = @nossoNumero,
              COR_DUP_COD_BARRAS = @codBarras
          WHERE COR_DUP_ID = @id
        `);

      // Incrementa o NOSSONUMERO em API_BOLETO_CAD_CONVENIO
      const request4 = new sql.Request(transaction);
      await request4.input("idConta", sql.Int, data.idConta).query(`
          UPDATE API_BOLETO_CAD_CONVENIO
          SET NOSSONUMERO = ISNULL(NOSSONUMERO, 0) + 1
          WHERE IDCONTA = @idConta
        `);

      const request5 = new sql.Request(transaction);
      await request5
        .input("idDup", sql.Int, data.duplicataId)
        .input("linhaDigitavel", sql.VarChar(60), linhaDigitavelValue)
        .input("codigoBarra", sql.VarChar(50), codBarrasValue)
        .input("nossoNumero", sql.VarChar(50), nossoNumeroValue)
        .input("pixQrCode", sql.VarChar(500), pixQrCodeValue)
        .input("numBoleto", sql.Int, parseInt(dados_bradesco_api.snumero10))
        .input("statusBol", sql.Int, dados_bradesco_api.codStatus10)
        .query(`UPDATE COR_BOLETO_BANCARIO 
                SET LINHA_DIGITAVEL = @linhaDigitavel,
                CODIGO_BARRA = @codigoBarra,
                NOSSO_NUMERO = @nossoNumero,
                PIX_QRCODE = @pixQrCode,
                N_BOLETO = @numBoleto,
                STATUS_BOL = @statusBol
                WHERE ID_DUPLICATA = @idDup
              `);

      // Commit da transação
      await transaction.commit();
    }

    // Gera o PDF com Puppeteer usando browser já aberto
    page = await browser.newPage();
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
    return {
      id,
      error: error.message,
      pdfBase64: null,
    };
  } finally {
    if (page) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        if (
          error.message.includes("No target with given id") ||
          error.message.includes("Target closed")
        ) {
          console.log(`Página já fechada para o boleto ID ${id}`);
        } else {
          console.error(`Erro ao fechar página do boleto ID ${id}:`, error);
        }
      }
    }
  }
}

async function processarBoletoComRetry(id, pool, browser, maxTentativas = 2) {
  let tentativa = 0;
  let resultado;

  while (tentativa < maxTentativas) {
    tentativa++;
    try {
      resultado = await processarBoleto(id, pool, browser);
      if (!resultado.error) {
        return resultado;
      }
      throw new Error(resultado.error);
    } catch (error) {
      const msgErro = error.message || "";

      // Verifica se o erro contém a mensagem específica para retry
      const deveTentarNovamente =
        msgErro.includes("Erro na requisição para a API do Bradesco: 504") ||
        msgErro.includes("Gateway Time-out");

      if (!deveTentarNovamente) {
        // Se o erro não for o esperado para retry, retorna imediatamente
        return {
          id,
          error: msgErro,
          pdfBase64: null,
        };
      }

      console.warn(
        `Tentativa ${tentativa} para boleto ID ${id} falhou com erro: ${msgErro}`
      );

      if (tentativa === maxTentativas) {
        // Última tentativa, retorna erro
        return {
          id,
          error: msgErro,
          pdfBase64: null,
        };
      }

      // espera crescente antes da próxima tentativa
      await new Promise((res) => setTimeout(res, 500 * tentativa));
    }
  }
}

async function defParcelas(ids) {
  if (!ids || ids.length === 0) return [];

  const request6 = new sql.Request();

  // Monta parâmetros dinâmicos: @id0, @id1, ...
  const params = ids.map((id, index) => {
    const paramName = `id${index}`;
    request6.input(paramName, sql.Int, id);
    return `@${paramName}`;
  });

  const query = `
    SELECT COR_DUP_ID, COR_DUP_DOCUMENTO, COR_DUP_NUMERO_ORDEM, COR_DUP_PROTOCOLO 
    FROM COR_CADASTRO_DE_DUPLICATAS 
    WHERE COR_DUP_ID IN (${params.join(",")})
  `;

  const result = await request6.query(query);
  return result.recordset;
}

// Ordena as Duplicatas para serem ordenadas por número da parcela, ordenando duplicatas de mesmo documento sequencialmente
function OrderIds(ids, orderedIds) {
  ids.sort((a, b) => {
    if (a.COR_DUP_DOCUMENTO !== b.COR_DUP_DOCUMENTO) {
      return a.COR_DUP_DOCUMENTO - b.COR_DUP_DOCUMENTO;
    }
    const ordemA =
      a.COR_DUP_NUMERO_ORDEM === null
        ? -Infinity
        : Number(a.COR_DUP_NUMERO_ORDEM);
    const ordemB =
      b.COR_DUP_NUMERO_ORDEM === null
        ? -Infinity
        : Number(b.COR_DUP_NUMERO_ORDEM);

    return ordemA - ordemB;
  });
  ids.forEach((item) => {
    // Checa se já foi gerado boleto para a duplicata
    if (!item.COR_DUP_PROTOCOLO) {
      orderedIds.push(item.COR_DUP_ID);
    }
  });
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
  const results = [];

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

    // Pega os dados de parcelas e número do documento de cada duplicata
    const dadosNumDoc = await defParcelas(ids);

    // Cria um array para colocar os ids de forma ordenada
    let orderedIds = [];

    OrderIds(dadosNumDoc, orderedIds);

    if (orderedIds.length == 0) {
      console.log("As duplicatas informadas já tiveram seus boletos gerados.");
    }

    // Processa sequencialmente para garantir a ordem
    for (const id of orderedIds) {
      // Aguarda o processamento do boleto atual antes de continuar
      const resultado = await processarBoletoComRetry(id, pool, browser);
      console.log(`Boleto de id ${id} processado.`);
      results.push(resultado);
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

app.post("/consulta_boleto", async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "ID não foi fornecido." });
  }

  let pool;

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

    // Pega os dados do banco para gerar o payload
    const request7 = new sql.Request();
    const dadosDup = await request7.input("id", sql.Int, id).query(`
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
      D.COR_DUP_USU_CADASTROU AS usuCadastro,
      B.CLIENTID AS clientId,
      B.CLIENTSECRET AS clientSecret,
      B.CAMINHO_CRT AS caminhoCrt,
      B.SENHA_CRT AS senhaCrt,
      B.API_PIX_ID AS idConta,
      B.CONTA AS conta,
      B.AGENCIA AS agencia,
      CO.CARTEIRA AS carteira,
      CO.PROTESTO,
      CO.JUROS_DIA,
      CO.MODALIDADE_JUROS,
      CO.MULTA,
      CO.TIPO_MULTA,
      CO.DIAS_MULTA,
      CO.NOSSONUMERO,
      BB.LINHA_DIGITAVEL,
      BB.CODIGO_BARRA,
      BB.NOSSO_NUMERO AS nossoNumero,
      E.GER_EMP_C_N_P_J_ AS cpfCnpjEmpresa
    FROM COR_CADASTRO_DE_DUPLICATAS D
    INNER JOIN API_PIX_CADASTRO_DE_CONTA B ON D.COR_CLI_BANCO = B.API_PIX_ID
    INNER JOIN API_BOLETO_CAD_CONVENIO CO ON CO.IDCONTA = B.API_PIX_ID
    INNER JOIN GER_EMPRESA E ON E.GER_EMP_ID = D.COR_DUP_IDEMPRESA
    LEFT JOIN COR_BOLETO_BANCARIO BB ON BB.ID_DUPLICATA = D.COR_DUP_ID
    WHERE D.COR_DUP_ID = @id;
    `);

    const data = dadosDup.recordset[0];

    // Formata os campos para inserir no payload
    const cpfCnpjString = parseInt(data.cpfCnpjEmpresa.substring(0, 9), 10);
    let filialint = 0;
    let controleInt = parseInt(data.cpfCnpjEmpresa.slice(-2));
    let agencia = data.agencia ? String(data.agencia).substring(0, 4) : "0";
    let conta = data.conta ? String(data.conta).substring(0, 7) : "0";
    const isCpf = data.cpfCnpjEmpresa.length == 11 ? true : false;
    if (!isCpf) {
      filialint = parseInt(data.cpfCnpjEmpresa.substring(9, 12));
    }

    const negociacaoString = parseInt(String(agencia + conta));

    const payload = {
      cpfCnpj: {
        cpfCnpj: cpfCnpjString,
        filial: filialint,
        controle: controleInt,
      },
      produto: parseInt(data.carteira),
      negociacao: negociacaoString,
      nossoNumero: parseInt(data.nossoNumero),
      sequencia: 0,
      status: 0,
    };

    const resultado = await consultarBoleto(
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.caminhoCrt,
      data.senhaCrt
    );

    res.json({ resultado });
  } catch (error) {
    console.error("Erro geral ao gerar boletos:", error);
    res.status(500).json({ error: error.message });
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
