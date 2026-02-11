import sqlite3
import os

db_path = 'tickets.db'
print(f"Checking database at: {os.path.abspath(db_path)}")

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # List tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables found: {[t[0] for t in tables]}")
    
    # specific check for notifications
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='notifications';")
    schema = cursor.fetchone()
    if schema:
        print(f"Notifications table schema: {schema[0]}")
    else:
        print("Notifications table NOT FOUND in sqlite_master")
        
    conn.close()
else:
    print("Database file does not exist.")
