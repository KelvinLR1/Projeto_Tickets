import requests

url = "http://127.0.0.1:8000/token"
data = {
    "username": "admin",
    "password": "admin123" # Supondo senha padrão se houver
}

try:
    print(f"Testing login at {url}...")
    response = requests.post(url, data=data, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response Body: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")
