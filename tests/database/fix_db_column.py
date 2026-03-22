import sqlite3
import os

db_path = 'tickets.db'

print(f"Connecting to database at: {os.path.abspath(db_path)}")

if not os.path.exists(db_path):
    print("Database file NOT FOUND!")
else:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check current columns in notifications table
        cursor.execute("PRAGMA table_info(notifications);")
        columns = [row[1] for row in cursor.fetchall()]
        print(f"Current columns in 'notifications': {columns}")
        
        if 'created_by_user_id' not in columns:
            print("Adding 'created_by_user_id' column...")
            cursor.execute("ALTER TABLE notifications ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)")
            conn.commit()
            print("✅ Column added successfully.")
        else:
            print("Column 'created_by_user_id' already exists.")
            
        conn.close()
    except Exception as e:
        print(f"Error modifying database: {e}")
