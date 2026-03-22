import requests

base_url = "http://127.0.0.1:8000"
# Primeiro pega o token
login_data = {"username": "root", "password": "admin"}
res = requests.post(f"{base_url}/token", data=login_data)
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Pega o primeiro ticket disponível
print("Getting tickets...")
res_tickets = requests.get(f"{base_url}/tickets/", headers=headers)
tickets = res_tickets.json()

if not tickets:
    print("No tickets found to test.")
else:
    ticket_id = tickets[0]["id"]
    print(f"Testing Timer Start for Ticket #{ticket_id}...")
    try:
        response = requests.post(f"{base_url}/tickets/{ticket_id}/timer/start", headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")
