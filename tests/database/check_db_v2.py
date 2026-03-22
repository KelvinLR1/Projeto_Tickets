import sqlite3
import os

db_path = os.path.join("server", "tickets_system.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print(f"Checking database at: {db_path}")

# Check clients table
cursor.execute("PRAGMA table_info(clients)")
columns = [row[1] for row in cursor.fetchall()]
print(f"Columns in 'clients': {columns}")

# Check ticket_time_logs table
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ticket_time_logs'")
table_exists = cursor.fetchone()
print(f"Table 'ticket_time_logs' exists: {bool(table_exists)}")

if table_exists:
    cursor.execute("PRAGMA table_info(ticket_time_logs)")
    print(f"Columns in 'ticket_time_logs': {[row[1] for row in cursor.fetchall()]}")

conn.close()
