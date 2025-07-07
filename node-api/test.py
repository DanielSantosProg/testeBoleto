test_cpf = '07416529514'
test_cnpj = '69215334000189'

def format_cpf_cnpj(cpf_cnpj):
    if (len(cpf_cnpj) == 11):
        result_string = cpf_cnpj[:3] + "." + cpf_cnpj[3:6] + "." + cpf_cnpj[6:9] + "-" + cpf_cnpj[9:]
        return result_string
    result_string = cpf_cnpj[:2] + "." + cpf_cnpj[2:5] + "." + cpf_cnpj[5:8] + "/" + cpf_cnpj[8:12] + "-" + cpf_cnpj[12:]
    return  result_string

cnpj = format_cpf_cnpj(test_cnpj)
cpf = format_cpf_cnpj(test_cpf)

print("CPF: ", cpf)
print("CNPJ: ", cnpj)