import sqlite3
import os

DB_PATH = os.path.join("server", "tickets_system.db")

def check_tickets_schema():
    print(f"Checking schema for 'tickets' table in: {DB_PATH}")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(tickets);")
        columns = cursor.fetchall()
        print("Columns in 'tickets' table:")
        for col in columns:
            print(f" - {col[1]} ({col[2]})")
        conn.close()
    except Exception as e:
        print(f"Error checking schema: {e}")

if __name__ == "__main__":
    check_tickets_schema()
