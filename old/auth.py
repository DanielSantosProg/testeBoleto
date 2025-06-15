from dotenv import load_dotenv
import time
import json
import os
import requests
import pyodbc

TOKEN_FILE = "token.json"

def get_token():
    # Carrega os dados do banco de dados do arquivo .env
    load_dotenv(dotenv_path='db.env')

    server = os.getenv("DB_SERVER")
    database = os.getenv("DB_DATABASE")
    odbc_driver = os.getenv("ODBC_DRIVER")

    # Cria a string de conexão com o banco de dados
    cnxn_str = (
        f"DRIVER={odbc_driver};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"Trusted_Connection=yes;"
    )

    try:
        cnxn = pyodbc.connect(cnxn_str)
        cursor = cnxn.cursor()
        print("Conectado ao Banco de dados.")

        # query para pegar as credenciais do banco
        cursor.execute("SELECT * FROM credencial where id=1")
        cred_row = cursor.fetchone()
        client_id = cred_row.client_id
        client_secret = cred_row.client_secret

        # query para pegar o caminho dos certificados do banco
        cursor.execute("SELECT * FROM certificado where id=1")
        cert_row = cursor.fetchone()
        cert_path = cert_row.path_cert
        key_path = cert_row.path_key

        cursor.close()
        cnxn.close()

    except pyodbc.Error as ex:
        sqlstate = ex.args[0]
        print(f"Erro ao conectar ou executar query: {sqlstate}")
        print(ex)
    
    # Se existir o token salvo e ainda estiver válido, usa ele. Senão, solicita novo token em seguida
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r", encoding="utf-8") as f:
            token_data = json.load(f)

        if time.time() < token_data.get("expires_at", 0):
            return token_data["access_token"]

    auth_url = 'https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token'


    payload = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
    }

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
    }

    # Faz a requisição com certificado
    response = requests.post(
        auth_url,
        data=payload,
        headers=headers,
        cert=(cert_path, key_path)
    )

    # Pega a resposta da api, retorna o token e o armazena em cache
    if response.status_code == 200:
        data = response.json()
        token = data.get('access_token')
        expires_in = data.get('expires_in', 3600)  # Token expira em 1 hora(3600 segundos)

        expires_at = int(time.time()) + int(expires_in) - 30  # Diminui 30 segundos do tempo de expiração para evitar erros em tempo de execução

        # Salva em arquivo
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "access_token": token,
                "expires_at": expires_at
            }, f)

        print("Novo token salvo com sucesso.")
        return token
    else:
        print("Erro ao autenticar:", response.status_code)
        print(response.text)
        return None