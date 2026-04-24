import uuid

data = [
    {
        "contratante": "OSNEI FRANCISCO DE FARIAS", "rg1": "5088548-1 SSP/PR", "cpf1": "256.324.428-37",
        "endereco": "Rua Alcides Chierentin, 720 - Jd. Anchieta", "cep": "19.915-010", "municipio": "Ourinhos (SP)",
        "unidade": "Jd. Matilde", "idoso": "JOÃO FRANCISCO DE FARIA", "rg2": "62.283.539-0", "cpf2": "024.327.308-00",
        "dn": "1933-08-05", "valor": 3200.00, "data_inicio": "2025-11-24"
    },
    {
        "contratante": "ELCIO AGNALDO DUARTE DOS SANTOS", "rg1": "24.382.150 SSP/SP", "cpf1": "137.187.668-70",
        "endereco": "Rua Luiz Baroni, 412 - Jd. Santana 2", "cep": "19.931-150", "municipio": "Ourinhos (SP)",
        "unidade": "Vila Moraes", "idoso": "DULCINÉIA DUARTE DOS SANTOS", "rg2": "36.914.783-X SSP/SP", "cpf2": "285.998.718-03",
        "dn": "1960-09-23", "valor": 2900.00, "data_inicio": "2025-06-07"
    },
    {
        "contratante": "DANIEL DIAS PEREDIM", "rg1": "47578332 SSP/SP", "cpf1": "321.533.778-50",
        "endereco": "Rua Vicentino Adolpho Campello, 255 - Vila Califórnia", "cep": "19.915-050", "municipio": "Ourinhos (SP)",
        "unidade": "Vila Moraes", "idoso": "MADALENA FLORENCIO DIAS PEREDIM", "rg2": "59.885.037-4 SSP/SP", "cpf2": "298.244.108-05",
        "dn": "1953-08-28", "valor": 3200.00, "data_inicio": "2026-01-23"
    },
    {
        "contratante": "ISABEL CRISTINA DE LUCIO FERREIRA", "rg1": "20.424.118 SSP/SP", "cpf1": "222.350.858-33",
        "endereco": "Rua Luiz Nogueira, 231 - Conj. Hab. Padre E. Murante", "cep": "19.905-390", "municipio": "Ourinhos (SP)",
        "unidade": "Vila Moraes", "idoso": "CARMEM FLORINDO DE LUCIO", "rg2": "14.605.201-8 SSP/SP", "cpf2": "300.657.888-28",
        "dn": "1934-07-06", "valor": 3200.00, "data_inicio": "2026-01-22"
    },
    {
        "contratante": "CÉLIA GONÇALVES SALVAZO", "rg1": "16.259.344 SSP/SP", "cpf1": "101.678.508-41",
        "endereco": "Rua Clóvis Ana, c Macedo Filho, 177 - Jd. América", "cep": "19.914-115", "municipio": "Ourinhos (SP)",
        "unidade": "Vila Moraes", "idoso": "CARMEN VILHA GONÇALVES", "rg2": "14.602.276-8 SSP/SP", "cpf2": "340.627.788-30",
        "dn": "1940-02-13", "valor": 3000.00, "data_inicio": "2026-01-21"
    },
    {
        "contratante": "OSMAR BONEIN", "rg1": "16.973.439-0 SSP/SP", "cpf1": "345.725.658-77",
        "endereco": "Rua João Carlos Baccellini, 201 - Ville de France", "cep": "19.933-372", "municipio": "Ourinhos (SP)",
        "unidade": "Vila Moraes", "idoso": "ZILDA VILA BONEIN", "rg2": "30.324.382-1 SSP/SP", "cpf2": "100.023.248-02",
        "dn": "1940-04-13", "valor": 3000.00, "data_inicio": "2026-03-01"
    },
    {
        "contratante": "ADALBERTO DE SOUSA", "rg1": "12.384.314 SSP/SP", "cpf1": "315.754.408-73",
        "endereco": "Av. Dr. Arnaldo Ferreira da Silva, 655 - Jd. Das Paineiras", "cep": "19.907-150", "municipio": "Chavantes (SP)",
        "unidade": "Jd. Matilde", "idoso": "SURIA CURY DE SOUSA", "rg2": "8.867.017-X SSP/SP", "cpf2": "040.727.118-02",
        "dn": "1938-04-11", "valor": 3800.00, "data_inicio": "2026-03-21"
    },
    {
        "contratante": "MARCO ANTONIO GRANADO", "rg1": "16.887.819 SSP/SP", "cpf1": "318.892.838-58",
        "endereco": "Rua Dr. Caio Mauburi, 512 L20 Q-V - Vila Soares", "cep": "19.906-530", "municipio": "Ourinhos (SP)",
        "unidade": "Jd. Matilde", "idoso": "JOSÉ GRANADO ANDREU", "rg2": "3.393.432 SSP/SP", "cpf2": "044.401.558-15",
        "dn": "1930-04-25", "valor": 3100.00, "data_inicio": "2026-04-01"
    },
    {
        "contratante": "ANA BEATRIZ DE MORAES MARCOLINO", "rg1": "47.015.712-1 SSP/SP", "cpf1": "461.501.148-22",
        "endereco": "Rua Nove de Julho, 628 - Nova Canitar", "cep": "19.960-000", "municipio": "Canitar (SP)",
        "unidade": "Vila Moraes", "idoso": "APARECIDA ESMERIA DE MORAES", "rg2": "29.087.151-7 SSP/SP", "cpf2": "195.395.318-52",
        "dn": None, "valor": 3000.00, "data_inicio": "2026-02-02"
    },
    {
        "contratante": "JOSE GUILHERME PAULETI", "rg1": "21.896.953 SSP/SP", "cpf1": "143.232.838-17",
        "endereco": "Rua Pedro Alexandre, 206 - Vila Gomes", "cep": "19.915-431", "municipio": "Ourinhos (SP)",
        "unidade": "Vila Moraes", "idoso": "ANNA DUMARA VILLAÇA PAULETE", "rg2": "20.978.488-4 SSP/SP", "cpf2": "349.805.578-29",
        "dn": "1942-01-10", "valor": 3100.00, "data_inicio": "2026-04-10"
    },
    {
        "contratante": "MARIA MADALENA CORREA", "rg1": "17.082.813-X SSP/SP", "cpf1": "328.732.128-09",
        "endereco": "Rua Rui Correa, 142", "cep": "18.760-000", "municipio": "Cerqueira César (SP)",
        "unidade": "Vila Moraes", "idoso": "MARTA FIRVINO DUTRA", "rg2": "5.316.442-5 SSP/SP", "cpf2": "049.605.348-34",
        "dn": "1944-10-07", "valor": 3000.00, "data_inicio": "2026-04-08"
    },
    {
        "contratante": "TANIA DE FATIMA CAMARGO", "rg1": "1.821.789 SSP/SP", "cpf1": "447.322.428-71",
        "endereco": "Chácara Nossa Senhora das Graças, 11 - Ribeirão Grande", "cep": "19.930-000", "municipio": "Ribeirão do Sul (SP)",
        "unidade": "Vila Moraes", "idoso": "DIONCALO DE SOUZA CAMARGO", "rg2": "26.068.415-8", "cpf2": "25.088.411-9",
        "dn": None, "valor": 3100.00, "data_inicio": "2026-04-12"
    },
    {
        "contratante": "PEDRO LUIZ PAVANI", "rg1": "9.381.109-9 SSP/SP", "cpf1": "340.727.758-65",
        "endereco": "Rua MTC. Sebastião Fonseca, 434 - Centro", "cep": "19.907-175", "municipio": "Ourinhos (SP)",
        "unidade": "Vila Moraes", "idoso": "TEREZINHA PAVANI", "rg2": "111111", "cpf2": "037.996.358-03",
        "dn": "1934-11-05", "valor": 3200.00, "data_inicio": "2025-04-27"
    },
    {
        "contratante": "ELANE MARGARETE ORLANDI DANTAS", "rg1": "2.842.177-0 SSP/PR", "cpf1": "282.510.158-91",
        "endereco": None, "cep": None, "municipio": None,
        "unidade": "Jd. Matilde", "idoso": "TEREZINHA IDINEIA BEFFANTI ORLANDINI", "rg2": "8.935.924-5 SSP/SP", "cpf2": "044.814.988-50",
        "dn": "1935-09-25", "valor": 3200.00, "data_inicio": "2025-04-14"
    },
    {
        "contratante": "SUELEN DA SILVA AZEVEDO", "rg1": "41.534.443-3 SSP/SP", "cpf1": "340.121.078-52",
        "endereco": "Rua Michel Abdo Tanus, 153 - Orlando Quagliato", "cep": "19.915-489", "municipio": "Ourinhos (SP)",
        "unidade": "Jd. Matilde", "idoso": "LEONORA PENTEADO AZEVEDO", "rg2": "37.453.345-5 SSP/SP", "cpf2": "055.807.568-80",
        "dn": "1931-07-25", "valor": 3100.00, "data_inicio": "2025-07-14"
    },
    {
        "contratante": "WILMA SANT ANA OLIVEIRA", "rg1": "16.345.659 SSP/SP", "cpf1": "381.843.518-18",
        "endereco": "Tv. Henrique Dias, 577 - Jardim Aurora", "cep": None, "municipio": "Ourinhos (SP)",
        "unidade": "Jd. Matilde", "idoso": "VALTER SANT ANA", "rg2": "24.619.692-0 SSP/SP", "cpf2": "137.185.478-67",
        "dn": "1945-09-12", "valor": 3000.00, "data_inicio": "2026-02-02"
    },
    {
        "contratante": "RITA DE CASSIA DA SILVA", "rg1": "43.027.562-1 SSP/SP", "cpf1": "340.580.038-92",
        "endereco": "Rua Pedro Gonçalves da Silva, 120 - Ourinhos Constante II", "cep": "19.904-734", "municipio": "Ourinhos (SP)",
        "unidade": "Jd. Matilde", "idoso": "ANTONIO DA SILVA", "rg2": "1.993.159-5 SSP/PR", "cpf2": "452.286.878-04",
        "dn": "1943-05-28", "valor": 2700.00, "data_inicio": "2026-03-02"
    },
    {
        "contratante": "ARLY APARECIDA DE SOUZA FERRARI", "rg1": "8.881.636-0 SSP/SP", "cpf1": "057.495.838-89",
        "endereco": "Av. Horácio Soares, 1082 - Jd. Ouro Verde", "cep": "19.900-515", "municipio": "Ourinhos (SP)",
        "unidade": "Jd. Matilde", "idoso": "ANTONIO CLOVIS DE SOUZA", "rg2": "14.488.358-X SSP/SP", "cpf2": "104.781.928-15",
        "dn": "1947-12-08", "valor": 3000.00, "data_inicio": "2026-04-13"
    },
    {
        "contratante": "ROGERIO FABER", "rg1": "15.539.515-3 SSP/SP", "cpf1": "320.138.828-44",
        "endereco": "Rua José de Paula Vieira, 488 - Vila São Silvestre", "cep": "19.905-445", "municipio": "Ourinhos (SP)",
        "unidade": "Jd. Matilde", "idoso": "JOSÉ BISPO PAVÃO", "rg2": "5.626.319 SSP/SP", "cpf2": "338.319.388-12",
        "dn": "1946-06-15", "valor": 3100.00, "data_inicio": "2025-05-17"
    },
    {
        "contratante": "IZAURA KUMAGAI", "rg1": "5.515.742 SSP/PR", "cpf1": "055.658.428-49",
        "endereco": "Rua Cel. Figueiredo, 817 - Centro", "cep": "19.940-000", "municipio": "Jacarezinho (PR)",
        "unidade": "Jd. Matilde", "idoso": "OSVALDO TANABE", "rg2": "4.05.048-9 SSP/PR", "cpf2": "231.340.898-92",
        "dn": "1942-07-18", "valor": 3100.00, "data_inicio": "2025-09-01"
    }
]

sql_statements = []

for item in data:
    patient_id = str(uuid.uuid4())
    entity_id = str(uuid.uuid4())
    
    # Patient registration
    dn_val = f"'{item['dn']}'" if item['dn'] else "NULL"
    addr_val = f"'{item['endereco']}'" if item['endereco'] else "NULL"
    cep_val = f"'{item['cep']}'" if item['cep'] else "NULL"
    city_val = f"'{item['municipio']}'" if item['municipio'] else "NULL"
    
    sql_patients = f"""
    INSERT INTO patients (id, nome, cpf, rg, data_nascimento, responsavel, resp_rg, resp_cpf, resp_endereco, resp_cidade, resp_cep, unidade, status)
    VALUES ('{patient_id}', '{item['idoso']}', '{item['cpf2']}', '{item['rg2']}', {dn_val}, '{item['contratante']}', '{item['rg1']}', '{item['cpf1']}', {addr_val}, {city_val}, {cep_val}, '{item['unidade']}', 'ativo');
    """
    sql_statements.append(sql_patients)
    
    # Entity registration (Contractor/Responsible)
    sql_entities = f"""
    INSERT INTO entities (id, name, type, document)
    VALUES ('{entity_id}', '{item['contratante']}', 'customer', '{item['cpf1']}');
    """
    sql_statements.append(sql_entities)
    
    # Contract registration
    sql_contracts = f"""
    INSERT INTO contracts (pacienteId, pacienteNome, valor, dataInicio, status)
    VALUES ('{patient_id}', '{item['idoso']}', {item['valor']}, '{item['data_inicio']}', 'ativo');
    """
    sql_statements.append(sql_contracts)

with open("insert_patients.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(sql_statements))
