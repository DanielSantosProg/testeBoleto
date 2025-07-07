const { spawn } = require("child_process");
const sql = require("mssql");
const getToken = require("../gerarToken");
const path = require("path");

async function gerarBoleto(
  payload,
  CAMINHO_CRT,
  SENHA_CRT,
  CLIENTID,
  CLIENTSECRET,
  DIG_CONTA,
  DIG_AGENCIA
) {
  const token = await getToken(CAMINHO_CRT, SENHA_CRT, CLIENTID, CLIENTSECRET);
  if (!token) throw new Error("Erro ao obter token");

  return new Promise((resolve, reject) => {
    const python = spawn("python", [
      path.join(__dirname, "..", "python-boleto", "cli.py"),
    ]);
    const dados = {
      payload,
      token,
      pfxPath: CAMINHO_CRT,
      senha: SENHA_CRT,
      dig_conta: DIG_CONTA,
      dig_agencia: DIG_AGENCIA,
    };

    let stdout = "",
      stderr = "";

    python.stdin.write(JSON.stringify(dados));
    python.stdin.end();

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.on("error", (err) => {
      reject(new Error(`Falha ao iniciar processo Python: ${err.message}`));
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout);

        if (parsed.error) {
          // Se o JSON tem a chave error, rejeita com essa mensagem
          return reject(new Error(parsed.error));
        }

        if (code !== 0) {
          return reject(
            new Error(`Processo Python finalizado com código ${code}`)
          );
        }

        resolve(parsed);
      } catch (err) {
        reject(
          new Error("Erro ao interpretar resposta do Python: " + err.message)
        );
      }
    });
  });
}

module.exports = gerarBoleto;
