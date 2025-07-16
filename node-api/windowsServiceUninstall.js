const Service = require("node-windows").Service;

const svc = new Service({
  name: "API Boletos Bradesco",
  description: "API como serviço para Boletos Bradesco",
  script: __dirname,
});

// Desinstalar serviço
svc.on("uninstall", () => {
  console.log("Serviço desinstalado!");
});

svc.uninstall();
