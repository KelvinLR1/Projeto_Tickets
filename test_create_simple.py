import requests

base_url = "http://127.0.0.1:8000"
# Primeiro pega o token
login_data = {"username": "root", "password": "admin"}
res = requests.post(f"{base_url}/token", data=login_data)
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

ticket_data = {
    "title": "Ticket Simple Test",
    "description": "Descrição Simple",
    "client_name": "Cliente Teste",
    "category_id": 1 # O frontend envia isso, mas o schema simple espera 'category' ou nada
}

print(f"Testing Ticket Creation at {base_url}/tickets/simple ...")
try:
    response = requests.post(f"{base_url}/tickets/simple", json=ticket_data, headers=headers, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response Body: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")
