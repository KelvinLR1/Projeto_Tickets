from fastapi.testclient import TestClient
from server.main import app
import sys
import traceback

client = TestClient(app)

print("Calling /tickets/...")
try:
    response = client.get("/tickets/")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception:
    with open("traceback_log.txt", "w") as f:
        traceback.print_exc(file=f)
    print("Traceback saved to traceback_log.txt")
