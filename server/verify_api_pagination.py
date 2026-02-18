import requests
import json

BASE_URL = "http://localhost:8080"

# Assuming you have a user to get a token, or we can use the endpoints if they are public (they are protected)
# We'll try to login as admin first.
def get_token():
    try:
        resp = requests.post(f"{BASE_URL}/token", data={"username": "admin", "password": "admin123"}) # Correct creds
        if resp.status_code == 200:
            return resp.json()["access_token"]
        print(f"Login failed: {resp.status_code} {resp.text}")
        return None
    except Exception as e:
        print(f"Connection failed: {e}")
        return None

def test_pagination():
    token = get_token()
    if not token:
        print("Skipping auth, trying without (likely 401)")
        headers = {}
    else:
        headers = {"Authorization": f"Bearer {token}"}

    # Page 1
    print("\n--- Requesting Page 1 (skip=0, limit=25) ---")
    try:
        resp1 = requests.get(f"{BASE_URL}/clients/", params={"skip": 0, "limit": 25}, headers=headers)
        print(f"Status: {resp1.status_code}")
        if resp1.status_code == 200:
            data = resp1.json()
            print(f"Count: {len(data)}")
            if len(data) > 0:
                print(f"First item: {data[0]['name']}")
        else:
            print(resp1.text)
    except Exception as e:
        print(e)

    # Page 2
    print("\n--- Requesting Page 2 (skip=25, limit=25) ---")
    try:
        resp2 = requests.get(f"{BASE_URL}/clients/", params={"skip": 25, "limit": 25}, headers=headers)
        print(f"Status: {resp2.status_code}")
        if resp2.status_code == 200:
            data = resp2.json()
            print(f"Count: {len(data)}")
            if len(data) > 0:
                print(f"First item: {data[0]['name']}")
        else:
            print(resp2.text)
    except Exception as e:
        print(e)

    # Page 1 again (to simulate going back)
    print("\n--- Requesting Page 1 Again ---")
    try:
        resp3 = requests.get(f"{BASE_URL}/clients/", params={"skip": 0, "limit": 25}, headers=headers)
        print(f"Status: {resp3.status_code}")
        if resp3.status_code == 200:
            data = resp3.json()
            print(f"Count: {len(data)}")
        else:
            print(resp3.text)
    except Exception as e:
        print(e)

if __name__ == "__main__":
    test_pagination()
