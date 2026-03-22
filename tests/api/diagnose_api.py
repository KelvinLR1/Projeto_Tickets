import requests
import json

BASE_URL = "http://127.0.0.1:8080"

def test_endpoint(endpoint, method="GET", data=None, auth_token=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    
    print(f"Testando {method} {url}...")
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=5)
        else:
            response = requests.post(url, headers=headers, json=data, timeout=5)
            
        print(f"Status: {response.status_code}")
        try:
            print(f"Resposta: {json.dumps(response.json(), indent=2)}")
        except:
            print(f"Resposta (texto): {response.text[:100]}")
    except Exception as e:
        print(f"ERRO: {e}")

if __name__ == "__main__":
    # 1. Testar se o servidor está vivo
    test_endpoint("/")
    
    # 2. Testar se o endpoint de timers retorna 401 (esperado sem token)
    test_endpoint("/tickets/timers/active")
