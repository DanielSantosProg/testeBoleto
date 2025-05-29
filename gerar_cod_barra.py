import base64
import json
import re
from io import BytesIO
from pathlib import Path
from barcode import ITF
from barcode.writer import SVGWriter

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

def substituir_campo_por_id(html, campo_id, valor):
    return re.sub(
        rf'(<(span|td)[^>]*id="{campo_id}"[^>]*>)(.*?)(</\2>)',
        lambda m: f"{m.group(1)}{valor}{m.group(4)}",
        html,
        flags=re.DOTALL
    )

# Execução do código
if __name__ == "__main__":
    # Leitura dos dados do JSON retornado da API
    with open("dados_boleto.json", "r", encoding="utf-8") as f:
        dados = json.load(f)

    # Código de barras padrão FEBRABAN
    codigo_de_barras = "23791100000000100002856095007000014102226520"
    svg_base64 = base64_svg(codigo_de_barras)

    # Leitura do HTML base
    with open("boleto-base.html", "r", encoding="utf-8") as f:
        html = f.read()

    # Substitui o bloco do código de barras
    html = substituir_codigo_barras(html, svg_base64)

    # Campos do JSON que devem ser injetados no HTML
    campos = {
        "nome-beneficiario": dados.get("nomeBeneficiario", ""),
        "cnpj-beneficiario": dados.get("cpfcnpjBeneficiário", ""),
        "endereco-beneficiario": dados.get("logradouroBeneficiario", ""),
        "municipio-beneficiario": dados.get("municipioBeneficiario", ""),
        "uf-beneficiario": dados.get("ufBeneficiario", ""),
        "nome-pagador": dados.get("nomePagador", ""),
        "cpf-pagador": str(dados.get("cpfcnpjPagador", "")),
        "endereco-pagador": dados.get("enderecoPagador", ""),
        "municipio-pagador": dados.get("municipioPagador", ""),
        "uf-pagador": dados.get("ufPagador", ""),
        "linha-digitavel-1": dados.get("linhaDigitavel", ""),
        "linha-digitavel-2": dados.get("linhaDigitavel", ""),
        "moeda": dados.get("descricacaoMoeda", ""),
        "nosso-numero": dados.get("nuTituloGerado", ""),
        "vencimento": dados.get("dtVencimentoBoleto", ""),
        "especie-doc": dados.get("especieDocumentoTitulo", ""),
        "aceite": dados.get("aceite10", ""),
        "carteira": dados.get("idProduto", ""),        
        "valor": f'R$ {dados.get("vlTitulo", 0) / 100:.2f}'.replace('.', ','),
    }

    dt_emissao_str = dados.get("dtEmissao", "")

    # Formatando a data para "DD/MM/YYYY"
    if dt_emissao_str and len(dt_emissao_str) == 8:
        dia = dt_emissao_str[6:8]
        mes = dt_emissao_str[4:6]
        ano = dt_emissao_str[0:4]
        campos["data-emissao"] = f"{dia}/{mes}/{ano}"
    else:
        campos["data-emissao"] = ""

    endereco_pagador = (
        f'{dados["nomePagador"]}<br />'
        f'{dados["enderecoPagador"]}<br />'
        f'{dados["bairroPagador"]}<br />'
        f'{dados["municipioPagador"]} - {dados["ufPagador"]} - '
        f'CEP: {dados["cepPagador"]:05d}-{dados["cepComplementoPagador"]}'
    )
    campos["endereco-pagador"] = endereco_pagador

    # Substituição campo por campo
    for campo_id, valor in campos.items():
        html = substituir_campo_por_id(html, campo_id, valor)

    # Salva o HTML final
    with open("boleto-final.html", "w", encoding="utf-8") as f:
        f.write(html)

    print("boleto-final.html gerado com sucesso.")
