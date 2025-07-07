import sys
import json
import io
from gerar_boleto_qr import gerar_boleto

def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    input_data = sys.stdin.read()
    try:
        parsed = json.loads(input_data)
        payload = parsed.get("payload")
        token = parsed.get("token")
        pfx_path = parsed.get("pfxPath")
        senha = parsed.get("senha")

        if not token or not pfx_path or not senha:
            print(json.dumps({"error": "Token, certificado ou senha não fornecidos."}))
            sys.exit(1)

        resultado = gerar_boleto(payload, token, pfx_path, senha)

        if "error" in resultado:
            print(json.dumps({"error": resultado["error"]}))
            sys.exit(1)

        print(json.dumps({
            "status": resultado["status"],
            "cod_barras": resultado["cod_barras"],
            "boleto_html": resultado["boleto_html"],
            "dados_bradesco_api": resultado["dados_bradesco_api"],
            "nosso_numero_full": resultado["nosso_numero_full"]
        }))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": f"Erro inesperado: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
