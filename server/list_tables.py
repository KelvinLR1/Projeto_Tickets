import sqlite3
import os

db_path = 'tickets.db'

if not os.path.exists(db_path):
    print(f"Error: Database file '{db_path}' not found in current directory.")
else:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tables found:", [table[0] for table in tables])
        conn.close()
    except Exception as e:
        print(f"Error accessing database: {e}")
