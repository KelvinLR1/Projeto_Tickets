import requests

# Test login endpoint
url = "http://localhost:8001/token"
data = {
    "username": "admin",
    "password": "admin123"
}

try:
    response = requests.post(url, data=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        print("✅ Login funcionou!")
    else:
        print("❌ Login falhou!")
except Exception as e:
    print(f"❌ Erro: {e}")
