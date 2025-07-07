import base64
import re
import qrcode
import qrcode.image.svg
import requests
import requests_pkcs12
import sys

from io import BytesIO
from barcode import ITF
from barcode.writer import SVGWriter, ImageWriter

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

# Função para registrar o boleto
def registrar_boleto(auth_token, dados_payload, pfx_path, senha):
    url = 'https://openapisandbox.prebanco.com.br/boleto-hibrido/cobranca-registro/v1/gerarBoleto'
    headers = {
        'Authorization': auth_token,
        "Content-Type": "application/json"
    }

    try:
        boleto_response = requests_pkcs12.post(
            url,
            headers=headers,
            json=dados_payload,
            pkcs12_filename=pfx_path,
            pkcs12_password=senha
        )
        boleto_response.raise_for_status()
        return boleto_response.json()
    except requests.exceptions.RequestException as e:
        # Escreve a mensagem de erro no stderr para debug (opcional)
        sys.stderr.write(f"Erro na requisição para a API do Bradesco: {e}\n")
        if hasattr(e, 'response') and e.response is not None:
            sys.stderr.write(f"Status Code: {e.response.status_code}\n")
            sys.stderr.write(f"Response Text: {e.response.text}\n")
        # Retorna JSON com erro para o stdout (que será capturado pelo Node.js)
        return {"error": f"Erro na requisição para a API do Bradesco: {str(e)}"}

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

# Função para Criar o código de barras em PNG base64
def base64_png(codigo_de_barras: str) -> str:
   data = BytesIO()
   ITF(codigo_de_barras, writer=ImageWriter()).write( 
      data,
      options={ 
         'module_width': 0.25,
         'module_height': 20, 
         'write_text': False,
       }, 
   ) 
   b64 = base64.b64encode(data.getvalue()).decode('utf-8') 
   return 'data:image/png;charset=utf-8;base64,' + b64

# A seguir as funções de Substituição no html
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
        f'<td class="w123 qrcode" id="qr-code">Pague com Pix<br/>{img_tag}</td>',
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

# Faz a decodificação do código de barras
def decode_cod_bar(cod_bar_str, ebcdic_dict):
    cleaned_cod_bar_str = cod_bar_str.strip('<>') 
    decoded = ""

    length = 5
    for i in range(0, len(cleaned_cod_bar_str), length):
        segment = cleaned_cod_bar_str[i : i + length]
        
        if segment in ebcdic_dict:
            decoded += ebcdic_dict[segment]
        else:
            raise ValueError(f"Segmento de código de barras não reconhecido: {segment}")
    return decoded

# Gera o QR Code
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

def calcular_digito_verificador(carteira, nosso_numero):
    # Concatenar carteira + nosso número
    num = carteira + nosso_numero
    
    # Pesos de 2 a 7, da direita para a esquerda
    pesos = [2, 3, 4, 5, 6, 7]
    
    soma = 0
    peso_index = 0
    
    # Percorrer os dígitos da direita para a esquerda
    for digito in reversed(num):
        soma += int(digito) * pesos[peso_index]
        peso_index = (peso_index + 1) % len(pesos)
    
    resto = soma % 11
    digito = 11 - resto

    if resto == 0:
        return "0"
    
    if resto == 1:
        return "P"
    
    return str(digito)

def gerar_boleto(dados_payload: dict, token: str, pfx_path: str, senha: str) -> dict:
    try:
        # Envia a requisição para registro do boleto
        dados = registrar_boleto(token, dados_payload, pfx_path, senha) 

        # Cancela a criação do boleto se não retornar os dados dele.
        if not dados:
            return {"error": "Não foi possível registrar o boleto."}

        # Código de barras padrão FEBRABAN
        codigo_de_barras = dados.get("codBarras10", "")    
        
        cod_barras_decoded = decode_cod_bar(codigo_de_barras, ebcdic_to_num)
        png_base64_barcode = base64_png(cod_barras_decoded)

        # Leitura do HTML base
        try:
            with open("boleto-base.html", "r", encoding="utf-8") as f:
                html = f.read()
        except FileNotFoundError:
            return {"error": "Template HTML do boleto não encontrado."}
        except Exception as e:
            return {"error": f"Erro ao ler template HTML: {e}"}

        # Substitui o bloco do código de barras
        html = substituir_codigo_barras(html, png_base64_barcode)

        # Campos do JSON para inserir no html
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
            "vencimento": f'{dados.get("dataVencto10", "")}'.replace('.','/'),
            "especie-doc": dados.get("especDocto10", ""),
            "aceite": dados.get("aceite10", ""),
            "carteira": dados.get("cidtfdProdCobr", ""),                
        }

        # Formatando a data para "DD/MM/AAAA"
        dt_emissao_str = f'{dados.get("dataEmis10", "")}'.replace('.','/')
        campos["data-emissao"] = dt_emissao_str

        nosso_num_string = str(dados.get("ctitloCobrCdent", ""))
        nosso_num_format = nosso_num_string.zfill(11)
        carteira = str(dados.get("cidtfdProdCobr", ""))
        carteira = carteira.zfill(2)

        digito = calcular_digito_verificador(carteira, nosso_num_string)

        nosso_num_format =  carteira + "/" + nosso_num_format + "-" + digito
        campos["nosso-numero"] = nosso_num_format

        # Definindo o valor correto
        valor_do_boleto_string = dados.get("valMoeda10", "0")
        try:
            valor_float = int(valor_do_boleto_string) / 100.0
            valor_format = "R${:,.2f}".format(valor_float).replace(".","*").replace(",",".").replace("*",",")
        except ValueError:
            valor_float = 0.0
            valor_format = '0,00'
        
        campos["valor"] = valor_format

        # Formatando a string de endereço completo
        nome_sacado = dados.get("nomeSacado10", "")
        end_sacado = dados.get("endSacado10", "")
        bai_sacado = dados.get("baiSacado10", "")
        cid_sacado = dados.get("cidSacado10", "")
        uf_sacado = dados.get("ufSacado10", "")
        cep_sacado = dados.get("cepSacado10", "0")
        cepc_sacado = dados.get("cepcSacado10", "")

        try:
            endereco_pagador = (
                f'{nome_sacado}<br />'
                f'{end_sacado}<br />'
                f'{bai_sacado}<br />'
                f'{cid_sacado} - {uf_sacado} - '
                f'CEP: {int(cep_sacado):05d}-{cepc_sacado}'
            )
        except ValueError: # Caso o CEP não seja numérico
             endereco_pagador = (
                f'{nome_sacado}<br />'
                f'{end_sacado}<br />'
                f'{bai_sacado}<br />'
                f'{cid_sacado} - {uf_sacado} - '
                f'CEP: {cep_sacado}-{cepc_sacado}'
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

        # Gerar e substituir QR Code Pix
        pix_payload = dados.get("wqrcdPdraoMercd", "")
        if pix_payload:
            qrcode_svg_base64 = gerar_qrcode_pix_svg_base64(pix_payload)
            html = substituir_qr_code(html, qrcode_svg_base64)
        else:
            html = substituir_qr_code(html, "") # Substitui por vazio para remover a tag img

        # Substituição campo por campo
        for campo_id, valor in campos.items():
            html = substituir_campo_por_id(html, campo_id, valor)

        status_boleto = dados.get("statusHttp", "")

        if status_boleto == 200:
            status_final = "success"
        else:
            status_final = "failed"

        # Não salva o HTML, passa ele para a API, junto com o status, código de barras e os dados de saída do boleto
        return {
            "status": status_final,
            "cod_barras": cod_barras_decoded, # número do código de barras para inserção no banco
            "boleto_html": html,
            "dados_bradesco_api": dados, # retorna os dados da API
            "nosso_numero_full": nosso_num_format,
        }
    except Exception as e:
        return {"error": f"Erro interno na geração do boleto: dados = {dados}, erro={e}"}