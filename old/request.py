import requests
import json

# URL da sua API Flask
API_URL = "http://127.0.0.1:5000/gerar_boleto"

# Dados de exemplo para o payload do boleto
dados_para_boleto = {
    "ctitloCobrCdent": 0,
    "registrarTitulo": 1,
    "nroCpfCnpjBenef": 68542653,
    "codUsuario": "APISERVIC",
    "filCpfCnpjBenef": "1018",
    "tipoAcesso": 2,
    "digCpfCnpjBenef": 38,
    "cpssoaJuridContr": "",
    "ctpoContrNegoc": "",
    "cidtfdProdCobr": 9,
    "nseqContrNegoc": "",
    "cnegocCobr": 111111111111111112,
    "filler": "",
    "eNseqContrNegoc": "",
    "tipoRegistro": 1,
    "codigoBanco": 237,
    "cprodtServcOper": "",
    "demisTitloCobr": "17.12.2024",
    "ctitloCliCdent": "TESTEBIA",
    "dvctoTitloCobr": "20.02.2025",
    "cidtfdTpoVcto": "",
    "vnmnalTitloCobr": 6000,
    "cindcdEconmMoeda": 9,
    "cespceTitloCobr": 2,
    "qmoedaNegocTitlo": 0,
    "ctpoProteTitlo": 0,
    "cindcdAceitSacdo": "N",
    "ctpoPrzProte": 0,
    "ctpoPrzDecurs": 0,
    "ctpoProteDecurs": 0,
    "cctrlPartcTitlo": 0,
    "cindcdPgtoParcial": "N",
    "cformaEmisPplta": "02",
    "qtdePgtoParcial": 0,
    "ptxJuroVcto": 0,
    "filler1": "",
    "vdiaJuroMora": 0,
    "pmultaAplicVcto": 0,
    "qdiaInicJuro": 0,
    "vmultaAtrsoPgto": 0,
    "pdescBonifPgto01": 0,
    "qdiaInicMulta": 0,
    "vdescBonifPgto01": 0,
    "pdescBonifPgto02": 0,
    "dlimDescBonif1": "",
    "vdescBonifPgto02": 0,
    "pdescBonifPgto03": 0,
    "dlimDescBonif2": "",
    "vdescBonifPgto03": 0,
    "ctpoPrzCobr": 0,
    "dlimDescBonif3": "",
    "pdescBonifPgto": 0,
    "dlimBonifPgto": "",
    "vdescBonifPgto": 0,
    "vabtmtTitloCobr": 0,
    "filler2": "",
    "viofPgtoTitlo": 0,
    "isacdoTitloCobr": "TESTE EMPRESA PGIT",
    "enroLogdrSacdo": "TESTE",
    "elogdrSacdoTitlo": "TESTE",
    "ecomplLogdrSacdo": "TESTE",
    "ccepSacdoTitlo": 6332,
    "ebairoLogdrSacdo": "TESTE",
    "ccomplCepSacdo": 130,
    "imunSacdoTitlo": "TESTE",
    "indCpfCnpjSacdo": 1,
    "csglUfSacdo": "SP",
    "renderEletrSacdo": "",
    "cdddFoneSacdo": 0,
    "nroCpfCnpjSacdo": 38453450803,
    "bancoDeb": 0,
    "cfoneSacdoTitlo": 0,
    "agenciaDebDv": 0,
    "agenciaDeb": 0,
    "bancoCentProt": 0,
    "contaDeb": 0,
    "isacdrAvalsTitlo": "",
    "agenciaDvCentPr": 0,
    "enroLogdrSacdr": "0",
    "elogdrSacdrAvals": "",
    "ecomplLogdrSacdr": "",
    "ccomplCepSacdr": 0,
    "ebairoLogdrSacdr": "",
    "csglUfSacdr": "",
    "ccepSacdrTitlo": 0,
    "imunSacdrAvals": "",
    "indCpfCnpjSacdr": 0,
    "renderEletrSacdr": "",
    "nroCpfCnpjSacdr": 0,
    "cdddFoneSacdr": 0,
    "filler3": "0",
    "cfoneSacdrTitlo": 0,
    "iconcPgtoSpi": "",
    "fase": "1",
    "cindcdCobrMisto": "S",
    "ialiasAdsaoCta": "",
    "ilinkGeracQrcd": "",
    "caliasAdsaoCta": "",
    "wqrcdPdraoMercd": "",
    "validadeAposVencimento": "",
    "filler4": "",
    "idLoc": ""
}

def testar_geracao_boleto():
    print(f"Enviando requisição POST para: {API_URL}")
    print(f"Payload de dados: {json.dumps(dados_para_boleto, indent=2)}")

    try:
        # Envia a requisição POST com o JSON no corpo
        response = requests.post(API_URL, json=dados_para_boleto)

        # Verifica o status da resposta
        if response.status_code == 200:
            # Se a resposta for 200 OK e Content-Type for application/pdf, salva o PDF
            if 'application/pdf' in response.headers.get('Content-Type', ''):
                # Obtém o nome do arquivo do cabeçalho 'Content-Disposition'
                download_name = "boleto_gerado.pdf"
                content_disposition = response.headers.get('Content-Disposition')
                if content_disposition:
                    filename_match = re.search(r'filename="([^"]+)"', content_disposition)
                    if filename_match:
                        download_name = filename_match.group(1)

                with open(download_name, 'wb') as f:
                    f.write(response.content)
                print(f"\nBoleto PDF gerado e salvo como '{download_name}'")
            else:
                print(f"\nErro: Resposta não é um PDF. Content-Type: {response.headers.get('Content-Type')}")
                print(f"Resposta da API: {response.text}")
        else:
            print(f"\nErro ao gerar boleto. Status Code: {response.status_code}")
            try:
                # Tenta exibir a mensagem de erro JSON da API
                error_data = response.json()
                print(f"Mensagem de erro da API: {json.dumps(error_data, indent=2)}")
            except json.JSONDecodeError:
                print(f"Resposta da API (texto): {response.text}")

    except requests.exceptions.ConnectionError as e:
        print(f"\nNão foi possível conectar à API.")
        print(f"Erro: {e}")
    except Exception as e:
        print(f"\nOcorreu um erro: {e}")

if __name__ == "__main__":
    import re # Importa re para usar na expressão regular
    testar_geracao_boleto()