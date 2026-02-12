import sqlite3
import os

DB_PATH = os.path.join("server", "tickets_system.db")

def test_db():
    print(f"Testing connection to: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("Database file does not exist!")
        return
    
    try:
        conn = sqlite3.connect(DB_PATH, timeout=5)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"Connection successful. Found {len(tables)} tables.")
        for table in tables:
            print(f" - {table[0]}")
        conn.close()
    except Exception as e:
        print(f"Error connecting to database: {e}")

if __name__ == "__main__":
    test_db()
