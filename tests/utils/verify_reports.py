import requests
import json

BASE_URL = "http://127.0.0.1:8080"

def verify_reports():
    url = f"{BASE_URL}/reports/summary"
    print(f"Testing GET {url}...")
    try:
        response = requests.get(url, timeout=5)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            by_client = data.get("by_client", [])
            by_category = data.get("by_category", [])
            
            print(f"Clients count: {len(by_client)}")
            print(f"Categories count: {len(by_category)}")
            
            # Check limits
            if len(by_client) <= 5:
                print("✅ Clients limit is OK (<= 5)")
            else:
                print(f"❌ Clients limit FAILED ({len(by_client)} > 5)")
                
            if len(by_category) <= 5:
                print("✅ Categories limit is OK (<= 5)")
            else:
                print(f"❌ Categories limit FAILED ({len(by_category)} > 5)")
                
            # Check sorting for categories
            is_sorted = all(by_category[i]['count'] >= by_category[i+1]['count'] for i in range(len(by_category)-1))
            if is_sorted:
                print("✅ Categories are correctly sorted by count descending")
            else:
                print("❌ Categories sorting FAILED")
                print(json.dumps(by_category, indent=2))
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"ERRO: {e}")

if __name__ == "__main__":
    verify_reports()
