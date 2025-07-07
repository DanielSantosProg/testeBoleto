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

    print("Resto: ", resto)
    print("Digito: ", digito)

    if resto == 0:
        return "0"
    
    if resto == 1:
        return "P"
    
    return str(digito)

nosso_num_string = str(970021236)
nosso_num_format = nosso_num_string.zfill(11)
carteira = 6
carteira = str(carteira)

digito = calcular_digito_verificador(carteira, nosso_num_string)

nosso_num_format =  carteira.zfill(2) + "/" + nosso_num_format + "-" + digito

print(nosso_num_format)
#campos["nosso-numero"] = dt_emissao_str