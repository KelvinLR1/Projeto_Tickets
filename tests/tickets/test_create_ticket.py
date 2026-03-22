import requests

base_url = "http://127.0.0.1:8000"
# Primeiro pega o token
login_data = {"username": "root", "password": "admin"}
res = requests.post(f"{base_url}/token", data=login_data)
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

ticket_data = {
    "title": "Ticket de Teste Depuração",
    "description": "Descrição do ticket de teste para verificar erro de criação.",
    "priority": "Média",
    "client_id": 1
}

print(f"Testing Ticket Creation at {base_url}/tickets/ ...")
try:
    response = requests.post(f"{base_url}/tickets/", json=ticket_data, headers=headers, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response Body: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")
