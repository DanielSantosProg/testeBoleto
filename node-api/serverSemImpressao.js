const express = require("express");
// Imports dos arquivos de services
const { requisicaoBradesco } = require("./services/gerarBoletoService");
const {
  consultarBoletoComRetry,
} = require("./services/consultarBoletoService");
const { baixarBoletoComRetry } = require("./services/baixarBoletoService");
const { alterarBoletoComRetry } = require("./services/alterarBoletoService");
// const consultarBoletosPendentes = require("./services/consultarBoletosPendentesService");
// const consultarBoletosLiquidados = require("./services/consultarBoletosLiquidadosService");

let fetchDbData;
process.env.DB_AMBIENTE == 1
  ? (fetchDbData = require("./BoletoDataSandbox"))
  : (fetchDbData = require("./BoletoData"));

// Importa dependências do Node
const sql = require("mssql");
const path = require("path");

// Requere o arquivo.env para a conexão com o banco de dados
require("dotenv").config();

// Inicia o app express
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use("/boletos", express.static(path.join(__dirname, "boletos")));

// Função para processar um boleto individualmente
async function processarBoleto(id, pool) {
  let transaction;
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

    // Gera o payload do boleto
    const payload = await fetchDbData(id, pool);

    // Gera os dados do boleto
    resultado = await requisicaoBradesco(
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.clientId,
      data.clientSecret
    );

    if (resultado.error) {
      await transaction.rollback();
      return { id, error: resultado.error };
    }

    const { dados_bradesco_api, nossoNumeroFull, cod_barras } = resultado;

    if (!dados_bradesco_api) {
      throw new Error(
        resultado && resultado.error
          ? resultado.error
          : "Dados do bradesco incorretos."
      );
    }

    if (resultado) {
      // Define strings para o SQL
      const linhaDigitavelValue = (
        dados_bradesco_api.linhaDig10 || "0"
      ).substring(0, 50);
      const pixQrCodeValue = (
        dados_bradesco_api.wqrcdPdraoMercd || "0"
      ).substring(0, 500);
      const codBarrasValue = cod_barras || "0";

      const txid =
        process.env.DB_AMBIENTE == 1
          ? "20241122237093995007555702570068544"
          : dados_bradesco_api.iconcPgtoSpi;

      // Insere um registro em COR_BOLETO_BANCARIO com os dados do boleto
      const request2 = new sql.Request(transaction);
      await request2
        .input("dataVenc", sql.Date, data.dataVencimento)
        .input("nDoc", sql.Int, data.numeroDocumento)
        .input("dataProcess", sql.DateTime, new Date())
        .input("valor", sql.Float, parseFloat(data.dupValor))
        .input("linhaDigitavel", sql.VarChar(60), linhaDigitavelValue)
        .input("codigoBarra", sql.VarChar(50), codBarrasValue)
        .input(
          "nossoNumero",
          sql.VarChar(50),
          String(dados_bradesco_api?.ctitloCobrCdent)
        )
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
        .input("pixQrCode", sql.VarChar(500), pixQrCodeValue)
        .input("numBoleto", sql.Int, dados_bradesco_api.snumero10)
        .input("idTransacao", sql.VarChar(50), txid)
        .input("statusBol", sql.Int, dados_bradesco_api.codStatus10).query(`
        INSERT INTO COR_BOLETO_BANCARIO (
          DATA_VENC, N_DOC, DATA_PROCESS, VALOR, LINHA_DIGITAVEL, CODIGO_BARRA,
          NOSSO_NUMERO, ID_DUPLICATA, ANO_BOLETO, ID_CONTA_CORRENTE, ATIVO,
          SELECIONADO, DATA_CADASTRO, ID_USU_CADASTRO, ID_CLIENTE, IDEMPRESA,
          PARCELA, PIX_QRCODE, STATUS_BOL, N_BOLETO, ID_TRANSACAO
        ) VALUES (
          @dataVenc, @nDoc, @dataProcess, @valor, @linhaDigitavel, @codigoBarra,
          @nossoNumero, @idDuplicata, @anoBoleto, @idContaCorrente, @ativo,
          @selecionado, @dataCadastro, @idUsuCadastro, @idCliente, @idEmpresa,
          @parcela, @pixQrCode, @statusBol, @numBoleto, @idTransacao
        )
      `);

      // Atualiza o COR_CADASTRO_DE_DUPLICATAS
      const request3 = new sql.Request(transaction);
      await request3
        .input("id", sql.Int, data.duplicataId)
        .input("nossoNumero", sql.VarChar(50), nossoNumeroFull)
        .input("codBarras", sql.VarChar(50), codBarrasValue).query(`
          UPDATE COR_CADASTRO_DE_DUPLICATAS
          SET COR_DUP_PROTOCOLO = @nossoNumero,
              COR_DUP_COD_BARRAS = @codBarras,
              COR_DUP_LOCALIZACAO = ISNULL((SELECT TOP 1 L.COP_LOC_ID FROM COP_LOCALIZACAO_CORE_E_COPA L WITH (NOLOCK) WHERE L.COP_LOC_CODIGO = ISNULL((SELECT TOP 1 S.LOCALIZACAO FROM STATUS_BOLETO_COBRANCA S WITH (NOLOCK) WHERE S.COD_STATUS = 1 AND S.BANCO = 237), 2) AND L.COP_LOC_DESTINO = 'CR'), COR_DUP_LOCALIZACAO)              
          WHERE COR_DUP_ID = @id
        `);

      // Incrementa o NOSSONUMERO em API_BOLETO_CAD_CONVENIO
      const request4 = new sql.Request(transaction);
      await request4.input("idConta", sql.Int, data.idConta).query(`
          UPDATE API_BOLETO_CAD_CONVENIO
          SET NOSSONUMERO = ISNULL(NOSSONUMERO, 0) + 1
          WHERE IDCONTA = @idConta
        `);

      // Commit da transação
      await transaction.commit();
    }

    return {
      id,
      error: null,
      status: dados_bradesco_api.codStatus10,
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
      status: 0,
    };
  }
}

async function processarBoletoComRetry(id, pool, maxTentativas = 3) {
  let tentativa = 0;
  let resultado;

  while (tentativa < maxTentativas) {
    tentativa++;
    try {
      resultado = await processarBoleto(id, pool);

      // Se a função retornar um objeto com erro, lance para entrar no catch
      if (resultado.error) {
        throw new Error(resultado.error);
      }

      // Sucesso: retorna o resultado
      return resultado;
    } catch (error) {
      const msgErro = error.message || "";

      // Verifica se o erro contém a mensagem específica para retry
      const deveTentarNovamente =
        msgErro.includes("Erro na requisição para a API do Bradesco: 504") ||
        msgErro.toLowerCase().includes("gateway time-out") ||
        msgErro.includes("Erro na requisição para a API do Bradesco: 422");

      if (!deveTentarNovamente) {
        // Erro não é para retry, retorna imediatamente
        return {
          id,
          error: msgErro,
          status: 0,
        };
      }

      console.warn(
        `Tentativa ${tentativa} para boleto ID ${id} falhou com erro: ${msgErro}`
      );

      if (tentativa === maxTentativas) {
        console.log(`Tentativa ${tentativa} - msgErro: ${msgErro}`);
        return {
          id,
          error: msgErro,
          status: 0,
        };
      }

      // Espera crescente antes da próxima tentativa
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
function OrderIds(ids, orderedIds, results) {
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

  let stringDuplicatasGeradas = "";
  ids.forEach((item) => {
    if (!item.dupId) {
      orderedIds.push(item.COR_DUP_ID);
    } else {
      stringDuplicatasGeradas += ` ${item.dupId},`;
      results.push({
        id: item.COR_DUP_ID,
        error: "Duplicata já gerou boleto",
        status: 100,
      });
    }
  });

  if (stringDuplicatasGeradas != "") {
    stringDuplicatasGeradas = stringDuplicatasGeradas.slice(0, -1);
    console.log(`Duplicatas${stringDuplicatasGeradas} já foram geradas.`);
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

    // Pega os dados de parcelas e número do documento de cada duplicata
    const dadosNumDoc = await defParcelas(ids);

    ids.forEach((id) => {
      if (!dadosNumDoc.some((dado) => dado.COR_DUP_ID == id)) {
        console.log(`Duplicata de ID ${id} não encontrada.`);
      }
    });

    // Cria um array para colocar os ids de forma ordenada
    let orderedIds = [];

    OrderIds(dadosNumDoc, orderedIds, results);

    // Processa sequencialmente para garantir a ordem
    for (const id of orderedIds) {
      // Aguarda o processamento do boleto atual antes de continuar
      const resultado = await processarBoletoComRetry(id, pool);
      if (resultado && !resultado.error) {
        console.log(`Boleto de id ${id} processado.`);
        results.push(resultado);
      } else if (resultado.error) {
        console.log(`Boleto de id ${id} apresentou erros e não foi gerado.`);
        console.log("Erro: ", resultado.error);
        results.push(resultado);
      }
    }

    return res.json({
      resultados: results,
    });
  } catch (error) {
    console.error("Erro geral ao gerar boletos:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

function parseDateFromDDMMYYYY(str) {
  if (!str) return null;

  str = str.toString();

  if (str.length !== 8) return null;

  let dia = str.substring(0, 2);
  let mes = str.substring(2, 4);
  let ano = str.substring(4, 8);

  const date = new Date(`${ano}-${mes}-${dia}T00:00:00Z`);

  if (isNaN(date.getTime())) return null;

  return date;
}

function getCampo(obj, path) {
  return path.reduce((acc, curr) => acc?.[curr], obj);
}

// Endpoint para consulta de boleto
app.post("/consulta_boleto", async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "ID não foi fornecido." });
  }

  let pool;
  let resultado = null;

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
    INNER JOIN COR_BOLETO_BANCARIO BB ON BB.ID_DUPLICATA = D.COR_DUP_ID
    WHERE D.COR_DUP_ID = @id;
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

    resultado = await consultarBoletoComRetry(
      id,
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.clientId,
      data.clientSecret
    );

    if (!resultado || resultado.error) {
      throw new Error(resultado?.error || "Não foi possível fazer a consulta.");
    }

    let dataMov = new Date();
    let movimento = false;

    const camposDatas = [
      ["dtPagto"],
      ["baixa", "data"],
      ["dataCartor"],
      ["dataInstr"],
    ];

    // Faz update no registro do boleto no banco após a consulta
    if (resultado?.titulo?.codStatus != data.status) {
      movimento = true;

      for (const path of camposDatas) {
        const val = getCampo(resultado.titulo, path);
        if (val && val != 0 && val !== "") {
          const dateObj = parseDateFromDDMMYYYY(val);
          if (dateObj && !isNaN(dateObj)) {
            dataMov = dateObj;
            break;
          }
        }
      }

      const request9 = new sql.Request();
      await request9
        .input("dataMovimento", sql.DateTime, dataMov)
        .input("dataConsulta", sql.DateTime, new Date())
        .input("codStatus", sql.Int, resultado.titulo.codStatus)
        .input("id", sql.Int, id).query(`
        UPDATE COR_BOLETO_BANCARIO SET DATA_MOVIMENTO = @dataMovimento, STATUS_BOL = @codStatus, DATA_CONSULTA = @dataConsulta WHERE ID_DUPLICATA = @id
      `);

      console.log("Boleto atualizado com novo status.");
    }

    if (movimento) {
      return res.json({
        duplicata: id,
        dataMovimento: dataMov,
        status: resultado.titulo.codStatus,
        resultado: resultado,
        error: null,
      });
    } else {
      return res.json({
        duplicata: id,
        dataMovimento: null,
        status: resultado?.titulo?.codStatus,
        resultado: resultado,
        error: null,
      });
    }
  } catch (error) {
    console.error(error);
    res.json({
      duplicata: id,
      dataMovimento: null,
      status: 0,
      resultado: null,
      error: error.message,
    });
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

function formatDateToYYYYMMDD(date) {
  const yyyy = date.getUTCFullYear();
  let mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  let dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function parsetoDate(str) {
  const year = parseInt(str.substr(0, 4));
  const month = parseInt(str.substr(4, 2)) - 1;
  const day = parseInt(str.substr(6, 2));
  return new Date(year, month, day);
}

app.post("/baixar_boleto", async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "ID não foi fornecido." });
  }

  let pool;
  let resultado = null;
  let transaction;

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
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Pega os dados do banco para gerar o payload
    const request10 = new sql.Request();
    const dadosDup = await request10.input("id", sql.Int, id).query(`
      SELECT
      D.COR_DUP_ID AS duplicataId,
      D.COR_DUP_IDEMPRESA AS idEmpresa,
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
    INNER JOIN COR_BOLETO_BANCARIO BB ON BB.ID_DUPLICATA = D.COR_DUP_ID
    WHERE D.COR_DUP_ID = @id;
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
      codigoBaixa: 57,
    };

    resultado = await baixarBoletoComRetry(
      id,
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.clientId,
      data.clientSecret
    );

    if (!resultado || resultado.error) {
      throw new Error(
        resultado
          ? resultado.error
          : "Não foi possível solicitar a baixa no bradesco."
      );
    }

    if (resultado && resultado.status != 200) {
      return res.json({
        duplicata: data.duplicataId,
        error: resultado.mensagem,
        status: resultado.dados.status,
        resultado: resultado,
      });
    } else {
      // Atualiza o COR_BOLETO_BANCARIO
      const request = new sql.Request(transaction);
      await request
        .input("dataMovimento", sql.DateTime, new Date())
        .input("dataConsulta", sql.DateTime, new Date())
        .input("codStatus", sql.Int, resultado.dados.status)
        .input("id", sql.Int, id).query(`
          UPDATE COR_BOLETO_BANCARIO SET DATA_MOVIMENTO = @dataMovimento, STATUS_BOL = @codStatus, DATA_CONSULTA = @dataConsulta, ID_DUPLICATA = NULL WHERE ID_DUPLICATA = @id
        `);

      // Atualiza o COR_CADASTRO_DE_DUPLICATAS
      const request2 = new sql.Request(transaction);
      await request2.input("id", sql.Int, id).query(`
          UPDATE COR_CADASTRO_DE_DUPLICATAS
          SET COR_DUP_COD_BARRAS = NULL, COR_DUP_PROTOCOLO = NULL, COR_DUP_LOCALIZACAO = ISNULL((SELECT TOP 1 COP_LOC_ID FROM COP_LOCALIZACAO_CORE_E_COPA INNER JOIN STATUS_BOLETO_COBRANCA ON BANCO = 237 AND CANCELAMENTO = 1 WHERE LOCALIZACAO = COP_LOC_CODIGO AND COP_LOC_DESTINO = 'CR'), COR_DUP_LOCALIZACAO)              
          WHERE COR_DUP_ID = @id
        `);

      await transaction.commit();
    }

    return res.json({
      duplicata: id,
      error: null,
      status: resultado.dados.status,
      resultado: resultado,
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackErr) {
        console.error("Erro ao dar rollback:", rollbackErr);
      }
    }
    console.error(error);
    res.json({
      duplicata: id,
      error: error.message,
      status: 0,
      resultado: null,
    });
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
      D.COR_DUP_DATA_PRORROGACAO AS dataProrrogacao,
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
      BB.ID_TRANSACAO AS txId,
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
    const isCpf = data.cpfCnpjEmpresa.length == 11;
    if (!isCpf) {
      filialint = parseInt(data.cpfCnpjEmpresa.substring(9, 12));
    }

    const negociacaoString = parseInt(String(agencia + conta));

    const valorvar = 1000;
    const dataProrrogacao = data.dataProrrogacao
      ? formatDate(String(data.dataProrrogacao))
      : 0;

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
        especie: (dupTipoMap[data.dupTipo] || "99").toString(),
        dataVencimento: dataProrrogacao,
        codVencimento: 0,
        codInstrucaoProtesto: 0,
        diasProtesto: 0,
        codDecurso: 0,
        diasDecurso: 0,
        codAbatimento: 1,
        valorAbatimentoTitulo: 0,
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
        controleParticipante: "11111111111111111",
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

    const resultado = await alterarBoletoComRetry(
      id,
      payload,
      data.caminhoCrt,
      data.senhaCrt,
      data.clientId,
      data.clientSecret,
      data.txId
    );

    if (!resultado || resultado.error) {
      throw new Error(
        resultado
          ? resultado.error
          : "Não foi possível fazer a alteração no boleto."
      );
    }

    if (resultado && resultado.codigo && resultado.codigo != "CBTT0445") {
      return res.json({
        duplicata: id,
        error: resultado?.mensagem ? resultado.mensagem : null,
        status: 0,
        resultado: resultado,
      });
    } else {
      // Atualiza a COR_CADASTRO_DE_DUPLICATAS com nova data de vencimento
      let dataProrrogacao_yyyymmdd = formatDateToYYYYMMDD(data.dataProrrogacao);
      let dataProrrogacaoDate = parsetoDate(dataProrrogacao_yyyymmdd);

      const request = new sql.Request();
      await request
        .input("dataVencimento", sql.Date, dataProrrogacaoDate)
        .input("id", sql.Int, id).query(`
          UPDATE COR_CADASTRO_DE_DUPLICATAS SET COR_DUP_DATA_VENCIMENTO = @dataVencimento WHERE COR_DUP_ID = @id
        `);
    }

    return res.json({
      duplicata: id,
      error: null,
      status: 1,
      resultado: resultado,
    });
  } catch (error) {
    let mensagemErro = error?.message;
    if (error.response?.data?.mensagem) {
      mensagemErro = error.response.data.mensagem;
    }
    console.error("Erro geral ao alterar boleto:", mensagemErro);
    res.json({
      duplicata: id,
      error: mensagemErro,
      status: 0,
      resultado: error,
    });
  } finally {
    if (pool) await pool.close();
  }
});

/*app.post("/consultar_pendentes", async (req, res) => {
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
}); */

function startServer(porta = process.env.PORT || 3000) {
  let ambiente = process.env.DB_AMBIENTE == 1 ? "Homologação" : "Produção";
  app.listen(porta, () => {
    console.log(`Servidor rodando na porta: ${porta}`);
    console.log(`Ambiente: ${ambiente}`);
  });
}

module.exports = {
  app,
  startServer,
};
