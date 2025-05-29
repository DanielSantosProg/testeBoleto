import base64
import re
from io import BytesIO
from pathlib import Path

from barcode import ITF
from barcode.writer import SVGWriter

# Funções modificadas do repositório original
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

    # Geração do SVG em base64

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
