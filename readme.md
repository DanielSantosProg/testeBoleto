# gerar-boleto-bradesco

Um pacote Node.js para geração de boletos bradesco integrado com Python.

## Pré-requisitos

Para usar este pacote, você deve ter os seguintes itens instalados em seu sistema:

1.  **Node.js** (versão 18.16.0 ou superior)
2.  **Python 3** (versão 3.13.3 ou superior)
3.  **Pip** (gerenciador de pacotes do Python)

## Instalação

1.  **Instale as dependências Python:**

    Navegue até o diretório `python-boleto` dentro dos arquivos do pacote instalados pelo npm e digite o comando:

```bash
    pip install -r requirements.txt
```

2.  **Instale as dependências do pacote Node:**

    Navegue para dentro da pasta node-api e digite no terminal:

```bash
    npm install gerar-boleto-bradesco
```

3.  **Crie um arquivo ".env" com os dados de conexão ao banco de dados**

    Copie .env.example para .env e configure suas variáveis antes de iniciar o servidor.

## Uso

```javascript
// Exemplo de como usar o pacote
const meuPacoteBoleto = require("gerar-boleto-bradesco");
```

Para iniciar o servidor, digite no terminal o comando:

```bash
    npm start
```

Para gerar um boleto teste, rode no terminal o comando:

```bash
    npm run boleto-teste
```
