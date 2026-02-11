import requests
import time

base_url = "http://127.0.0.1:8000"
# Primeiro pega o token
login_data = {"username": "root", "password": "admin"}
res = requests.post(f"{base_url}/token", data=login_data)
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

ticket_id = 1 # Usando o mesmo do teste anterior

print(f"Waiting 2 seconds before stopping timer for Ticket #{ticket_id}...")
time.sleep(2)

try:
    print("Testing Timer Stop...")
    response = requests.post(f"{base_url}/tickets/{ticket_id}/timer/stop", headers=headers, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response Body: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")
