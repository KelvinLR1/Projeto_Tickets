import sqlite3
import os

db_path = os.path.join("server", "tickets_system.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, username, email, role, profile_id FROM users")
users = cursor.fetchall()
print(f"Users found: {users}")

conn.close()
