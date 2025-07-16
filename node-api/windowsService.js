const Service = require("node-windows").Service;

const svc = new Service({
  name: "API Boletos Bradesco",
  description: "API como serviço para Boletos Bradesco",
  script: __dirname,
});
svc.on("install", () => {
  console.log("Serviço instalado!");
  svc.start();
});
svc.install();
