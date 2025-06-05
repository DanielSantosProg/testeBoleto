import time
import json
import os
import pip._vendor.requests as requests

TOKEN_FILE = "token.json"

def get_token():
    # Se existir o token salvo e ainda estiver válido, usa ele. Senão, solicita novo token em seguida
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r", encoding="utf-8") as f:
            token_data = json.load(f)

        if time.time() < token_data.get("expires_at", 0):
            return token_data["access_token"]

    # Caminho de onde está o certificado
    cert_path = 'certificado.crt'
    key_path = 'chave.key'

    auth_url = 'https://openapisandbox.prebanco.com.br/auth/server-mtls/v2/token'
    client_id = '86c0b944-8bb5-4a0f-a668-bb92989d2deb'
    client_secret = '97da1e48-f8d6-4278-b84d-f7650c3d2578'

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