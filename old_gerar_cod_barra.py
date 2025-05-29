import base64
import re
from io import BytesIO
from pathlib import Path

from barcode import ITF
from barcode.writer import ImageWriter, SVGWriter
from PIL import Image

# Funções modificadas do repositório original
def image_png(filename: str | Path, codigo_de_barras: str) -> None:
    data = BytesIO()
    ITF(codigo_de_barras, writer=ImageWriter()).write(
        data,
        options={
            'module_width': 0.25,
            'module_height': 20,
            'write_text': False,
        },
    )
    image = Image.open(data)
    image.save(filename)

def image_svg(filename: str | Path, codigo_de_barras: str) -> None:
    with open(filename, 'wb') as f:
        ITF(codigo_de_barras, writer=SVGWriter()).write(
            f,
            options={
                'module_width': 0.25,
                'module_height': 20,
                'write_text': False,
            },
        )

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

if __name__ == '__main__':
    # Código de barras no padrão FEBRABAN
    codigo_de_barras = "23791100000000100002856095007000014102226520"
    print("Cod. Barras: ", codigo_de_barras)

    # Linha digitável (não usada aqui diretamente)
    codigo_de_barras_com_dac = "23792856009500700001141022265205110000000010000"

    # Geração de arquivos de imagem (opcional)
    image_png('codigo_de_barras.png', codigo_de_barras)
    image_svg('codigo_de_barras.svg', codigo_de_barras)
    html_base64_img('index1.html', base64_png(codigo_de_barras))
    html_base64_img('index2.html', base64_svg(codigo_de_barras))

    # Substitui a <div class="barcode"> do HTML base
    base64_svg_str = base64_svg(codigo_de_barras)
    img_tag = f'<img src="{base64_svg_str}" height="50px" />'

    # Caminhos dos arquivos
    caminho_html_base = Path("boleto-base.html")
    caminho_html_final = Path("boleto-final.html")

    # Lê e altera o HTML
    with open(caminho_html_base, "r", encoding="utf-8") as f:
        html = f.read()

    html_atualizado = re.sub(
        r'<div class="barcode">.*?</div>',
        f'<div class="barcode">{img_tag}</div>',
        html,
        flags=re.DOTALL
    )

    # Salva o HTML final com código de barras substituído
    with open(caminho_html_final, "w", encoding="utf-8") as f:
        f.write(html_atualizado)

    print("Arquivo boleto-final.html gerado com sucesso.")
