const { startServer } = require("./serverSemImpressao");
require("dotenv").config();

const serverPort = process.env.SRV_PORT ?? 3000;

startServer(serverPort); // inicia na porta definida
