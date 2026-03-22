import requests

base_url = "http://127.0.0.1:8000"
login_data = {"username": "root", "password": "admin"}

try:
    print("1. Testing Login...")
    res = requests.post(f"{base_url}/token", data=login_data, timeout=10)
    print(f"Login Status: {res.status_code}")
    if res.status_code == 200:
        token = res.json()["access_token"]
        print("2. Testing /users/me...")
        headers = {"Authorization": f"Bearer {token}"}
        res_me = requests.get(f"{base_url}/users/me", headers=headers, timeout=10)
        print(f"Users/me Status: {res_me.status_code}")
        print(f"User Data: {res_me.text}")
    else:
        print(f"Login failed: {res.text}")
except Exception as e:
    print(f"Test failed: {e}")
