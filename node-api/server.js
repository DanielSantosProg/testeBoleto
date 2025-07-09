const express = require("express");
// Imports dos arquivos de services
const gerarBoleto = require("./services/gerarBoletoService");
const consultarBoleto = require("./services/consultarBoletoService");
const consultarBoletosPendentes = require("./services/consultarBoletosPendentesService");
const consultarBoletosLiquidados = require("./services/consultarBoletosLiquidadosService");
const alterarBoleto = require("./services/alterarBoletoService");
const fetchDbData = require("./BoletoDataSandbox");

// Importa dependências do Node
const puppeteer = require("puppeteer");
const sql = require("mssql");
const fs = require("fs");
const path = require("path");

// Requere o arquivo.env para a conexão com o banco de dados
require("dotenv").config();

// Inicia o app express
const app = express();
app.use(express.json({ limit: "100mb" }));
app.use("/boletos", express.static(path.join(__dirname, "boletos")));

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
        B.DVCONTA AS digConta,
        B.DVAGENCIA AS digAgencia        
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
      data.clientSecret,
      data.digConta,
      data.digAgencia
    );

    // Verifica se a função Python retornou erro
    if (resultado.error) {
      throw new Error(`Erro na geração do boleto: ${resultado.error}`);
    }

    const {
      status,
      cod_barras,
      boleto_html,
      dados_bradesco_api,
      nosso_numero_full,
    } = resultado;

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
        .input("nossoNumero", sql.VarChar(50), nosso_numero_full)
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

async function processarBoletoComRetry(id, pool, browser, maxTentativas = 3) {
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
    SELECT COR_DUP_ID, COR_DUP_DOCUMENTO, COR_DUP_NUMERO_ORDEM, BB.ID_DUPLICATA AS dupId 
    FROM COR_CADASTRO_DE_DUPLICATAS D
    LEFT JOIN COR_BOLETO_BANCARIO BB ON BB.ID_DUPLICATA = D.COR_DUP_ID
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
    if (!item.dupId) {
      orderedIds.push(item.COR_DUP_ID);
    }
  });
}

// Função para gerar os arquivos PDF
async function gerarBoletos(results) {
  try {
    const resultados = results;
    console.log(`Recebidos ${resultados.length} resultados.\n`);

    const outputDir = path.join(__dirname, "boletos");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const arquivosGerados = [];

    for (const resultado of results) {
      if (resultado.error) continue;
      if (!resultado.pdfBase64) continue;

      let buffer;
      if (typeof resultado.pdfBase64 === "string") {
        buffer = Buffer.from(resultado.pdfBase64, "base64");
      } else if (Array.isArray(resultado.pdfBase64)) {
        buffer = Buffer.from(resultado.pdfBase64);
      } else {
        continue;
      }

      const filename = `boleto_${resultado.id}_${Date.now()}.pdf`;
      const filepath = path.join(outputDir, filename);

      fs.writeFileSync(filepath, buffer);
      arquivosGerados.push(filename);
    }

    return arquivosGerados;
  } catch (error) {
    if (error.response) {
      console.error("Erro na API:", error.response.status);
      console.error(error.response.data);
    } else {
      console.error("Erro inesperado:", error.message);
    }
  }
}

// Endpoint para geração de boletos
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
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
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

    ids.forEach((id) => {
      if (!dadosNumDoc.some((dado) => dado.COR_DUP_ID == id)) {
        console.log(`Duplicata de ID ${id} não encontrada.`);
      }
    });

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
      if (resultado && !resultado.error) {
        console.log(`Boleto de id ${id} processado.`);
        results.push(resultado);
      } else {
        console.log(`Boleto de id ${id} apresentou erros e não foi gerado.`);
      }
    }

    const arquivosPdf = await gerarBoletos(results);

    const urls = arquivosPdf.map(
      (filename) => `${req.protocol}://${req.get("host")}/boletos/${filename}`
    );

    res.json({
      resultados: results,
      arquivos: arquivosPdf,
      links: urls,
    });
  } catch (error) {
    console.error("Erro geral ao gerar boletos:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
    if (pool) await pool.close();
  }
});

// Endpoint para consulta de boleto
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
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
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
      BB.STATUS_BOL AS status,
      BB.ID_BOLETO AS idBoleto,
      BB.NOSSO_NUMERO AS nossoNumero,
      E.GER_EMP_C_N_P_J_ AS cpfCnpjEmpresa
    FROM COR_CADASTRO_DE_DUPLICATAS D
    INNER JOIN API_PIX_CADASTRO_DE_CONTA B ON D.COR_CLI_BANCO = B.API_PIX_ID
    INNER JOIN API_BOLETO_CAD_CONVENIO CO ON CO.IDCONTA = B.API_PIX_ID
    INNER JOIN GER_EMPRESA E ON E.GER_EMP_ID = D.COR_DUP_IDEMPRESA
    LEFT JOIN COR_BOLETO_BANCARIO BB ON BB.ID_DUPLICATA = D.COR_DUP_ID
    WHERE BB.ID_BOLETO = @id;
    `);

    const data = dadosDup.recordset[0];

    if (!data) {
      throw new Error("Não existe o boleto informado.");
    }

    // Formata os campos para inserir no payload
    const cpfCnpjString = parseInt(data.cpfCnpjEmpresa.substring(0, 9));
    let filialint = 0;
    let controleInt = parseInt(data.cpfCnpjEmpresa.slice(-2));
    let agencia = data.agencia ? String(data.agencia).substring(0, 4) : "0000";
    let conta = data.conta ? String(data.conta).substring(0, 7) : "0000000";
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
      data.clientId,
      data.clientSecret
    );

    if (!resultado) {
      throw new Error("Não foi possível fazer a consulta no Bradesco.");
    }

    let dataMov = new Date();
    let movimento = false;

    // Faz update no registro do boleto no banco após a consulta
    if (resultado.titulo.codStatus != data.status) {
      movimento = true;
      const request9 = new sql.Request();
      await request9
        .input("dataMovimento", sql.DateTime, dataMov)
        .input("codStatus", sql.Int, resultado.titulo.codStatus)
        .input("id", sql.Int, data.idBoleto).query(`
        UPDATE COR_BOLETO_BANCARIO SET DATA_MOVIMENTO = @dataMovimento, STATUS_BOL = @codStatus WHERE ID_BOLETO = @id
      `);

      console.log("Boleto atualizado com novo status.");
    }

    if (movimento) {
      res.json({
        duplicata: data.duplicataId,
        dataMovimento: dataMov,
        status: resultado.titulo.codStatus,
        resultado: resultado,
      });
    } else {
      res.json({
        duplicata: data.duplicataId,
        dataMovimento: null,
        status: resultado.titulo.codStatus,
        resultado: resultado,
      });
    }
  } catch (error) {
    console.error("Erro geral ao consultar o boleto: ", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

function formatDate(data) {
  let date = new Date(data);
  let dia = String(date.getUTCDate()).padStart(2, "0");
  let mes = String(date.getUTCMonth() + 1).padStart(2, "0");
  let ano = date.getUTCFullYear();
  return `${dia}${mes}${ano}`;
}

app.post("/consultar_pendentes", async (req, res) => {
  const {
    nossoNumero,
    cpfCnpj,
    dataVencInicial,
    dataVencFinal,
    dataRegInicial,
    dataRegFinal,
    valor,
    faixaVencimento,
  } = req.body;

  let pool;

  try {
    pool = await sql.connect({
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    // Pega os dados do banco para gerar o payload
    const request7 = new sql.Request();
    const dadosDup = await request7.input("id", sql.Int, id).query(`
      SELECT TOP 1
      B.CONTA AS conta,
      B.AGENCIA AS agencia,
      B.CLIENTID AS clientId,
      B.CLIENTSECRET AS clientSecret,
      B.CAMINHO_CRT AS caminhoCrt,
      B.SENHA_CRT AS senhaCrt,
      CO.CARTEIRA AS carteira,
      E.GER_EMP_C_N_P_J_ AS cpfCnpjEmpresa
    FROM COR_CADASTRO_DE_DUPLICATAS D
    INNER JOIN API_PIX_CADASTRO_DE_CONTA B ON D.COR_CLI_BANCO = B.API_PIX_ID
    INNER JOIN API_BOLETO_CAD_CONVENIO CO ON CO.IDCONTA = B.API_PIX_ID
    INNER JOIN GER_EMPRESA E ON E.GER_EMP_ID = D.COR_DUP_IDEMPRESA
    WHERE B.CODBANCO = 237;
    `);

    const data = dadosDup.recordset[0];

    if (!data) {
      throw new Error("Dados não encontrados.");
    }

    // Formata os campos para inserir no payload
    const cpfCnpjString = parseInt(data.cpfCnpjEmpresa.substring(0, 9));
    let filialint = 0;
    let controleInt = parseInt(data.cpfCnpjEmpresa.slice(-2));
    let agencia = data.agencia ? String(data.agencia).substring(0, 4) : "0000";
    let conta = data.conta ? String(data.conta).substring(0, 7) : "0000000";
    const isCpf = data.cpfCnpjEmpresa.length == 11 ? true : false;
    if (!isCpf) {
      filialint = parseInt(data.cpfCnpjEmpresa.substring(9, 12));
    }

    // Formata campos de Cpf/Cnpj do pagador
    const cpfCnpjStringPagador = parseInt(cpfCnpj.substring(0, 9));
    let filialintPagador = 0;
    let controleIntPagador = parseInt(cpfCnpj.slice(-2));
    const isCpfPagador = cpfCnpj.length == 11 ? true : false;
    if (!isCpfPagador) {
      filialintPagador = parseInt(cpfCnpj.substring(9, 12));
    }

    const negociacaoString = parseInt(String(agencia + conta));

    let payload = {
      cpfCnpj: {
        cpfCnpj: cpfCnpjString,
        filial: filialint,
        controle: controleInt,
      },
      produto: parseInt(data.carteira),
      negociacao: negociacaoString,
      nossoNumero: parseInt(nossoNumero) || 0,
      cpfCnpjPagador: {
        cpfCnpj: cpfCnpjStringPagador || 0,
        filial: filialintPagador || 0,
        controle: controleIntPagador || 0,
      },
      dataVencimentoDe: dataVencInicial || 0,
      dataVencimentoAte: dataVencFinal || 0,
      dataRegistroDe: dataRegInicial || 0,
      dataRegistroAte: dataRegFinal || 0,
      valorTituloDe: valor || 0,
      faixaVencto: faixaVencimento || 7,
      paginaAnterior: 0,
    };

    let resultadoCompleto;
    let resultado = await consultarBoletosPendentes(
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.clientId,
      data.clientSecret
    );

    if (!resultado) {
      throw new Error("Não foi possível fazer a consulta no Bradesco.");
    }
    resultadoCompleto = resultado.titulos;
    let pagina;
    let titulosLeft = true;

    while (titulosLeft) {
      resultado.titulos.forEach((titulo) => {
        console.log("\nTítulo: ");
        console.log(titulo);
      });
      pagina = resultado.pagina;
      titulosLeft = resultado.indMaisPagina == "S" ? true : false;

      if (titulosLeft) {
        payload = {
          cpfCnpj: {
            cpfCnpj: cpfCnpjString,
            filial: filialint,
            controle: controleInt,
          },
          produto: parseInt(data.carteira),
          negociacao: negociacaoString,
          nossoNumero: parseInt(nossoNumero) || 0,
          cpfCnpjPagador: {
            cpfCnpj: cpfCnpjStringPagador || 0,
            filial: filialintPagador || 0,
            controle: controleIntPagador || 0,
          },
          dataVencimentoDe: dataVencInicial || 0,
          dataVencimentoAte: dataVencFinal || 0,
          dataRegistroDe: dataRegInicial || 0,
          dataRegistroAte: dataRegFinal || 0,
          valorTituloDe: valor || 0,
          faixaVencto: faixaVencimento || 7,
          paginaAnterior: pagina,
        };
        resultado = await consultarBoletosPendentes(
          payload,
          data.caminhoCrt,
          data.senhaCrt,
          data.clientId,
          data.clientSecret
        );

        if (!resultado) {
          throw new Error("Não foi possível fazer a consulta no Bradesco.");
        }

        resultadoCompleto += resultado.titulos;
      }
    }

    /*
    let dataMov = new Date();
    let movimento = false;

    // Faz update no registro do boleto no banco após a consulta
    if (resultado.titulo.codStatus != data.status) {
      movimento = true;
      const request9 = new sql.Request();
      await request9
        .input("dataMovimento", sql.DateTime, dataMov)
        .input("codStatus", sql.Int, resultado.titulo.codStatus)
        .input("id", sql.Int, data.idBoleto).query(`
        UPDATE COR_BOLETO_BANCARIO SET DATA_MOVIMENTO = @dataMovimento, STATUS_BOL = @codStatus WHERE ID_BOLETO = @id
      `);

      console.log("Boleto atualizado com novo status.");
    }

    if (movimento) {
      res.json({
        duplicata: data.duplicataId,
        dataMovimento: dataMov,
        status: resultado.titulo.codStatus,
        resultado: resultado,
      });
    } else {
      res.json({
        duplicata: data.duplicataId,
        dataMovimento: null,
        status: resultado.titulo.codStatus,
        resultado: resultado,
      });
    } */
    res.json({
      resultados: resultadoCompleto,
    });
  } catch (error) {
    console.error("Erro geral ao consultar os boletos:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

app.post("/consultar_liquidados", async (req, res) => {
  const {
    cpfCnpj,
    dataVencInicial,
    dataVencFinal,
    dataRegInicial,
    dataRegFinal,
    tipoRegistro,
    valorInicial,
    valorFinal,
  } = req.body;

  let pool;

  try {
    pool = await sql.connect({
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    // Pega os dados do banco para gerar o payload
    const request7 = new sql.Request();
    const dadosDup = await request7.input("id", sql.Int, id).query(`
      SELECT TOP 1
      B.CONTA AS conta,
      B.AGENCIA AS agencia,
      B.CLIENTID AS clientId,
      B.CLIENTSECRET AS clientSecret,
      B.CAMINHO_CRT AS caminhoCrt,
      B.SENHA_CRT AS senhaCrt,
      CO.CARTEIRA AS carteira,
      E.GER_EMP_C_N_P_J_ AS cpfCnpjEmpresa
    FROM COR_CADASTRO_DE_DUPLICATAS D
    INNER JOIN API_PIX_CADASTRO_DE_CONTA B ON D.COR_CLI_BANCO = B.API_PIX_ID
    INNER JOIN API_BOLETO_CAD_CONVENIO CO ON CO.IDCONTA = B.API_PIX_ID
    INNER JOIN GER_EMPRESA E ON E.GER_EMP_ID = D.COR_DUP_IDEMPRESA
    WHERE B.CODBANCO = 237;
    `);

    const data = dadosDup.recordset[0];

    if (!data) {
      throw new Error("Dados não encontrados.");
    }

    // Formata os campos para inserir no payload
    const cpfCnpjString = parseInt(data.cpfCnpjEmpresa.substring(0, 9));
    let filialint = 0;
    let controleInt = parseInt(data.cpfCnpjEmpresa.slice(-2));
    let agencia = data.agencia ? String(data.agencia).substring(0, 4) : "0000";
    let conta = data.conta ? String(data.conta).substring(0, 7) : "0000000";
    const isCpf = data.cpfCnpjEmpresa.length == 11 ? true : false;
    if (!isCpf) {
      filialint = parseInt(data.cpfCnpjEmpresa.substring(9, 12));
    }

    const negociacaoString = parseInt(String(agencia + conta));

    let payload = {
      cpfCnpj: {
        cpfCnpj: cpfCnpjString,
        filial: filialint,
        controle: controleInt,
      },
      produto: parseInt(data.carteira),
      negociacao: negociacaoString,
      dataMovimentoDe: dataVencInicial || 0,
      dataMovimentoAte: dataVencFinal || 0,
      dataPagamentoDe: dataRegInicial || 0,
      dataPagamentoAte: dataRegFinal || 0,
      origemPagamento: tipoRegistro || 0,
      valorTituloDe: valorInicial || 0,
      valorTituloAte: valorFinal || 0,
      paginaAnterior: 0,
    };

    let resultadoCompleto;
    let resultado = await consultarBoletosLiquidados(
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.clientId,
      data.clientSecret
    );

    if (!resultado) {
      throw new Error("Não foi possível fazer a consulta no Bradesco.");
    }

    resultadoCompleto = resultado.titulos;
    let pagina;
    let titulosLeft = true;

    while (titulosLeft) {
      resultado.titulos.forEach((titulo) => {
        console.log("\nTítulo: ");
        console.log(titulo);
      });
      pagina = resultado.pagina;
      titulosLeft = resultado.indMaisPagina == "S" ? true : false;

      if (titulosLeft) {
        payload = {
          cpfCnpj: {
            cpfCnpj: cpfCnpjString,
            filial: filialint,
            controle: controleInt,
          },
          produto: parseInt(data.carteira),
          negociacao: negociacaoString,
          dataMovimentoDe: dataVencInicial || 0,
          dataMovimentoAte: dataVencFinal || 0,
          dataPagamentoDe: dataRegInicial || 0,
          dataPagamentoAte: dataRegFinal || 0,
          origemPagamento: 0,
          valorTituloDe: valorInicial || 0,
          valorTituloAte: valorFinal || 0,
          paginaAnterior: pagina,
        };

        resultado = await consultarBoletosPendentes(
          payload,
          data.caminhoCrt,
          data.senhaCrt,
          data.clientId,
          data.clientSecret
        );
        if (!resultado) {
          throw new Error("Não foi possível fazer a consulta no Bradesco.");
        }
        resultadoCompleto += resultado.titulos;
        console.log("Resultado completo da consulta: ");
        console.log(resultadoCompleto);
      }
    }

    res.json({
      resultados: resultadoCompleto,
    });
  } catch (error) {
    console.error("Erro geral ao consultar os boletos:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

// Endpoint para alteração de boleto
app.post("/alterar_boleto", async (req, res) => {
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
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

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

    // Pega os dados do banco para gerar o payload
    const request8 = new sql.Request();
    const dadosDup = await request8.input("id", sql.Int, id).query(`
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
    const cpfCnpjString = parseInt(data.cpfCnpjEmpresa.substring(0, 9));
    let filialint = 0;
    let controleInt = parseInt(data.cpfCnpjEmpresa.slice(-2));
    let agencia = data.agencia ? String(data.agencia).substring(0, 4) : "0000";
    let conta = data.conta ? String(data.conta).substring(0, 7) : "0000000";
    const isCpf = data.cpfCnpjEmpresa.length == 11 ? true : false;
    if (!isCpf) {
      filialint = parseInt(data.cpfCnpjEmpresa.substring(9, 12));
    }

    const negociacaoString = parseInt(String(agencia + conta));

    const valorvar = parseInt(dupValor * 100);

    const payload = {
      codUsuario: "OPENAPI",
      vnmnalTitloCobr: valorvar,
      chave: {
        cnpjCpf: cpfCnpjString,
        filial: filialint,
        controle: controleInt,
        idprod: parseInt(data.carteira),
        ctaprod: negociacaoString,
        nossoNumero: String(data.nossoNumero),
      },
      dadosTitulo: {
        seuNumero: String(data.numeroDocumento),
        dataEmissao: data.dataEmissao
          ? parseInt(formatDate(data.dataEmissao))
          : 0,
        especie: String(dupTipoMap[data.dupTipo]) || "99",
        dataVencimento: data.dataVencimento
          ? parseInt(formatDate(data.dataVencimento))
          : 0,
        codVencimento: 0,
        codInstrucaoProtesto: 0,
        diasProtesto: 0,
        codDecurso: 0,
        diasDecurso: 0,
        codAbatimento: 1,
        valorAbatimentoTitulo: 190,
        dataPrimeiroDesc: 0,
        valorPrimeiroDesc: 0,
        codPrimeiroDesc: 0,
        acaoPrimeiroDesc: 0,
        dataSegundoDesc: 0,
        valorSegundoDesc: 0,
        codSegundoDesc: 0,
        acaoSegundoDesc: 0,
        dataTerceiroDesc: 0,
        valorTerceiroDesc: 0,
        codTerceiroDesc: 0,
        acaoTerceiroDesc: 0,
        controleParticipante: "146738343034214732",
        idAvisoSacado: "S",
        diasAposVencidoJuros: 0,
        valorJuros: 0,
        codJuros: 0,
        diasAposVencimentoMulta: 0,
        valorMulta: 0,
        codMulta: 0,
        codNegativacao: 0,
        diasNegativacao: 0,
        codPagamentoParcial: "N",
        qtdePagamentosParciais: 0,
        sacado: "",
        cgcCpfSacado: "0",
        endereco: "",
        cep: 0,
        cepSuf: 0,
        sacadorAvalista: "",
        aceite: "0",
        cgcCpfAvalista: "0",
      },
    };

    const resultado = await alterarBoleto(
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.clientId,
      data.clientSecret
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
