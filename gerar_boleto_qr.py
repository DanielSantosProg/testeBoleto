import base64
import json
import re
import qrcode
import qrcode.image.svg
from io import BytesIO
from pathlib import Path
from barcode import ITF
from barcode.writer import SVGWriter

# Dictionary para utilizar no decode do código de barras
ebcdic_to_num = {
    "nnWWn": "00", "NnwwN": "01", "nNwwN": "02", "NNwwn": "03", "nnWwN": "04",
    "NnWwn": "05", "nNWwn": "06", "nnwWN": "07", "NnwWn": "08", "nNwWn": "09", 
    "wnNNw": "10", "WnnnW": "11", "wNnnW": "12", "WNnnw": "13", "wnNnW": "14", 
    "WnNnw": "15", "wNNnw": "16", "wnnNW": "17", "WnnNw": "18", "wNnNw": "19",
    "nwNNw": "20", "NwnnW": "21", "nWnnW": "22", "NWnnw": "23", "nwNnW": "24",
    "NwNnw": "25", "nWNnw": "26", "nwnNW": "27", "NwnNw": "28", "nWnNw": "29",
    "wwNNn": "30", "WwnnN": "31", "wWnnN": "32", "WWnnn": "33", "wwNnN": "34",
    "WwNnn": "35", "wWNnn": "36", "wwnNN": "37", "WwnNn": "38", "wWnNn": "39",
    "nnWNw": "40", "NnwnW": "41", "nNwnW": "42", "NNwnw": "43", "nnWnW": "44",
    "NnWnw": "45", "nNWnw": "46", "nnwNW": "47", "NnwNw": "48", "nNwNw": "49",
    "wnWNn": "50", "WnwnN": "51", "wNwnN": "52", "WNwnn": "53", "wnWnN": "54",
    "WnWnn": "55", "wNWnn": "56", "wnwNN": "57", "WnwNn": "58", "wNwNn": "59",
    "nwWNn": "60", "NwwnN": "61", "nWwnN": "62", "NWwnn": "63", "nwWnN": "64",
    "NwWnn": "65", "nWWnn": "66", "nwwNN": "67", "NwwNn": "68", "nWwNn": "69",
    "nnNWw": "70", "NnnwW": "71", "nNnwW": "72", "NNnww": "73", "nnNwW": "74",
    "NnNww": "75", "nNNww": "76", "nnnWW": "77", "NnnWw": "78", "nNnWw": "79",
    "wnNWn": "80", "WnnwN": "81", "wNnwN": "82", "WNnwn": "83", "wnNwN": "84",
    "WnNwn": "85", "wNNwn": "86", "wnnWN": "87", "WnnWn": "88", "wNnWn": "89",
    "nwNWn": "90", "NwnwN": "91", "nWnwN": "92", "NWnwn": "93", "nwNwN": "94",
    "NwNwn": "95", "nWNwn": "96", "nwnWN": "97", "NwnWn": "98", "nWnWn": "99",
}

# Função para Criar o código de barras em SVG base64
def base64_svg(codigo_de_barras: str) -> str:
    data = BytesIO()
    ITF(codigo_de_barras, writer=SVGWriter()).write(
        data,
        options={
            'module_width': 0.25,
            'module_height': 20,
            'write_text': False,
        },
    )
    b64 = base64.b64encode(data.getvalue()).decode('utf-8')
    return 'data:image/svg+xml;charset=utf-8;base64,' + b64

def html_base64_img(filename: str | Path, base64: str) -> None:
    with open(filename, 'w') as f:
        f.write("<img src='{}'>".format(base64))

# === FUNÇÕES DE SUBSTITUIÇÃO NO HTML ===
def substituir_codigo_barras(html, svg_base64):
    img_tag = f'<img src="{svg_base64}" height="50px" />'
    return re.sub(
        r'<div class="barcode">.*?</div>',
        f'<div class="barcode">{img_tag}</div>',
        html,
        flags=re.DOTALL
    )

def substituir_qr_code(html, svg_base64):
    img_tag = f'<img src="{svg_base64}" />'
    return re.sub(
        r'<td class="w123 qrcode" id="qr-code">.*?</td>',
        f'<td class="w123 qrcode" id="qr-code">{img_tag}</td>',
        html,
        flags=re.DOTALL
    )
def substituir_campo_por_id(html, campo_id, valor):
    return re.sub(
        rf'(<(span|td)[^>]*id="{campo_id}"[^>]*>)(.*?)(</\2>)',
        lambda m: f"{m.group(1)}{valor}{m.group(4)}",
        html,
        flags=re.DOTALL
    )

def decode_cod_bar(cod_bar_str, dict):
    cleaned_cod_bar_str = cod_bar_str.strip('<>') 
    decoded = ""

    length = 5
    for i in range(0, len(cleaned_cod_bar_str), length):
        segment = cleaned_cod_bar_str[i : i + length]
        
        if segment in dict:
            decoded += dict[segment]
        else:
            print(f"Não reconhecido: {segment}")
    return decoded

def gerar_qrcode_pix_svg_base64(pix_payload: str) -> str:    
    qr = qrcode.QRCode(
        version=None, 
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=5, 
        border=4,
    )

    # Adiciona os dados do Pix ao QR Code
    qr.add_data(pix_payload)
    qr.make(fit=True) 

    # Cria a imagem do QR Code
    img_buffer = BytesIO()
    
    img = qr.make_image(image_factory=qrcode.image.svg.SvgImage)
    img.save(img_buffer)

    # Converte o conteúdo SVG do buffer para Base64
    b64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
    
    return 'data:image/svg+xml;charset=utf-8;base64,' + b64

# Execução do código
if __name__ == "__main__":
    # Leitura dos dados do JSON retornado da API
    with open("dados_boleto_qr.json", "r", encoding="utf-8") as f:
        dados = json.load(f)

    # Código de barras padrão FEBRABAN
    codigo_de_barras = dados.get("codBarras10", "")
    cod_barras_decoded = decode_cod_bar(codigo_de_barras, ebcdic_to_num)
    svg_base64 = base64_svg(cod_barras_decoded)

    # Leitura do HTML base
    with open("boleto-base.html", "r", encoding="utf-8") as f:
        html = f.read()

    # Substitui o bloco do código de barras
    html = substituir_codigo_barras(html, svg_base64)

    # Campos do JSON que devem ser injetados no HTML
    campos = {
        "nome-beneficiario": dados.get("cedente10", ""),
        "cnpj-beneficiario": dados.get("cnpjCpfCedente10", ""),
        "nome-pagador": dados.get("nomeSacado10", ""),
        "cpf-pagador": dados.get("cnpjSacado10", ""),
        "endereco-pagador": dados.get("endSacado10", ""),
        "municipio-pagador": dados.get("cidSacado10", ""),
        "uf-pagador": dados.get("ufSacado10", ""),
        "linha-digitavel-1": dados.get("linhaDig10", ""),
        "linha-digitavel-2": dados.get("linhaDig10", ""),
        "moeda": dados.get("especMoeda10", ""),
        "nosso-numero": dados.get("ctitloCobrCdent", ""),
        "vencimento": f'{dados.get("dataVencto10", "")}'.replace('.','/'),
        "especie-doc": dados.get("especDocto10", ""),
        "aceite": dados.get("aceite10", ""),
        "carteira": dados.get("cidtfdProdCobr", ""),                
    }

    # Formatando a data para "DD/MM/YYYY"
    dt_emissao_str = f'{dados.get("dataEmis10", "")}'.replace('.','/')

    campos["data-emissao"] = dt_emissao_str

    # Definindo o valor correto
    valor_do_boleto_string = dados.get("valMoeda10", "0")

    pix_payload = dados.get("wqrcdPdraoMercd", "")
    if pix_payload:
        qrcode_svg_base64 = gerar_qrcode_pix_svg_base64(pix_payload)
        print("QR Code Pix (Base64 SVG) gerado com sucesso!")
        print(qrcode_svg_base64)
        html = substituir_qr_code(html, qrcode_svg_base64)
    else:
        print("Payload Pix (wqrcdPdraoMercd) não encontrado na resposta da API.")


    # Formatando o valor do boleto
    try:
        valor_float = int(valor_do_boleto_string) / 100.0
        valor_format = f'R$ {valor_float:.2f}'.replace('.', ',')
    except ValueError:
        valor_float = 0.0
        valor_format = '0,00'
    
    campos["valor"] = valor_format

    # Formatando a string de endereço completo
    endereco_pagador = (
        f'{dados["nomeSacado10"]}<br />'
        f'{dados["endSacado10"]}<br />'
        f'{dados["baiSacado10"]}<br />'
        f'{dados["cidSacado10"]} - {dados["ufSacado10"]} - '
        f'CEP: {int(dados["cepSacado10"]):05d}-{dados["cepcSacado10"]}'
    )
    campos["endereco-pagador"] = endereco_pagador

    # Formatação do número de Agência/conta

    valor_agencia_int = dados.get("agencCred10", "")
    valor_conta_int = dados.get("ctaCred10", "")

    try:
        valor_agencia = str(valor_agencia_int)
        valor_conta = str(valor_conta_int)
        str_agencia_conta = f'{valor_agencia}/{valor_conta}'        
    except ValueError:
        valor_agencia = '0'
        valor_conta = '0'
        str_agencia_conta = '0/0'

    campos['agencia-conta-beneficiario'] = str_agencia_conta

    # Substituição campo por campo
    for campo_id, valor in campos.items():
        html = substituir_campo_por_id(html, campo_id, valor)

    # Salva o HTML final
    with open("boleto-qr.html", "w", encoding="utf-8") as f:
        f.write(html)

    print("boleto-qr.html gerado com sucesso.")
