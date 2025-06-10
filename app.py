from flask import Flask, request, send_file, jsonify
from io import BytesIO
from gerar_boleto_qr import gerar_boleto
import pdfkit
import os

app = Flask(__name__)

@app.route('/gerar_boleto', methods=['POST'])
def gerar_boleto_endpoint():
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    dados_payload = request.get_json()
    if not dados_payload:
        return jsonify({"error": "Payload JSON vazio ou inválido."}), 400

    print("Requisição recebida para /gerar_boleto. Processando...")

    resultado = gerar_boleto(dados_payload)

    if "error" in resultado:
        print(f"Erro ao gerar boleto: {resultado['error']}")
        return jsonify({"status": "error", "message": resultado['error']}), 500

    html = resultado.get("boleto_html")
    if not html:
        return jsonify({"error": "HTML do boleto não gerado."}), 500

    # Gera o PDF usando pdfkit
    WKHTMLTOPDF_PATH = os.path.join(os.path.dirname(__file__), 'bin', 'wkhtmltopdf.exe')
    config = pdfkit.configuration(wkhtmltopdf=WKHTMLTOPDF_PATH)
    try:
        pdf_bytes = pdfkit.from_string(html, False, configuration=config, options={"encoding": "UTF-8"})
    except Exception as e:
        return jsonify({"error": f"Erro ao converter HTML em PDF: {e}"}), 500

    pdf_io = BytesIO(pdf_bytes)
    pdf_io.seek(0)

    # Faz o retorno do pdf
    return send_file(
        pdf_io,
        mimetype='application/pdf',
        as_attachment=True,
        download_name='boleto.pdf'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
