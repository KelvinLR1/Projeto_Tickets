import requests
import json

def seed_clients():
    base_url = "http://127.0.0.1:8080"
    clients_to_add = [
        {"name": "Nova Tecnologia Ltda", "email": "contato@novatec.com.br", "cpf_cnpj": "12.345.678/0001-90", "phone": "(11) 98888-7777"},
        {"name": "Mecânica do Futuro", "email": "oficina@futuro.com.br", "cpf_cnpj": "98.765.432/0001-10", "phone": "(21) 97777-6666"},
        {"name": "Educação Integrada", "email": "diretoria@edu.com.br", "cpf_cnpj": "45.678.912/0001-30", "phone": "(31) 96666-5555"},
        {"name": "Logística Expressa", "email": "sac@logex.com.br", "cpf_cnpj": "78.912.345/0001-40", "phone": "(41) 95555-4444"},
        {"name": "Saúde Total Clínica", "email": "agendamento@saudetotal.com.br", "cpf_cnpj": "32.165.498/0001-20", "phone": "(51) 94444-3333"},
        {"name": "Arquitetura & Design", "email": "projetos@arquidesign.com.br", "cpf_cnpj": "65.432.109/0001-80", "phone": "(61) 93333-2222"},
        {"name": "AgroNegócio Sustentável", "email": "campo@agrosustentavel.com.br", "cpf_cnpj": "11.222.333/0001-55", "phone": "(71) 92222-1111"},
        {"name": "Moda & Estilo", "email": "vendas@modaestilo.com.br", "cpf_cnpj": "44.555.666/0001-77", "phone": "(81) 91111-0000"},
        {"name": "Restaurante Gourmet", "email": "reservas@gourmet.com.br", "cpf_cnpj": "88.999.000/0001-44", "phone": "(91) 90000-8888"},
        {"name": "Academia Performance", "email": "treino@performance.com.br", "cpf_cnpj": "22.333.444/0001-11", "phone": "(11) 91234-5678"},
    ]

    print(f"Iniciando cadastro de {len(clients_to_add)} novos clientes...")
    
    for client in clients_to_add:
        try:
            response = requests.post(f"{base_url}/clients/", json=client)
            if response.status_code in [200, 201]:
                print(f"✔ Cliente '{client['name']}' cadastrado com sucesso!")
            else:
                print(f"✘ Falha ao cadastrar '{client['name']}': {response.status_code} - {response.text}")
        except Exception as e:
            print(f"✘ Erro ao cadastrar '{client['name']}': {e}")

if __name__ == "__main__":
    seed_clients()
