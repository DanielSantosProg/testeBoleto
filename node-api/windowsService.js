const Service = require("node-windows").Service;

const svc = new Service({
  name: "API Boletos Bradesco",
  description: "API como serviço para Boletos Bradesco",
  script:
    "C:\\Users\\Meu computador\\Documents\\GitHub\\Testes\\TesteBoleto\\node-api",
});
svc.on("install", () => {
  console.log("Serviço instalado!");
  svc.start();
});
svc.install();
