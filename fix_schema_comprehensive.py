import sqlite3
import os

DB_PATH = os.path.join("server", "tickets_system.db")

def migrate():
    print(f"Connecting to: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print("Database not found!")
        return

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 1. Update tickets table
        cursor.execute("PRAGMA table_info(tickets);")
        ticket_cols = [row[1] for row in cursor.fetchall()]
        
        updates_tickets = [
            ("status_id", "INTEGER REFERENCES statuses(id)"),
            ("sector_id", "INTEGER REFERENCES sectors(id)"),
            ("assigned_user_id", "INTEGER REFERENCES users(id)")
        ]
        
        for col_name, col_def in updates_tickets:
            if col_name not in ticket_cols:
                print(f"Adding '{col_name}' to 'tickets'...")
                cursor.execute(f"ALTER TABLE tickets ADD COLUMN {col_name} {col_def}")
                conn.commit()
            else:
                print(f"'{col_name}' already exists in 'tickets'.")

        # 2. Update users table (checking for profile_id if needed)
        cursor.execute("PRAGMA table_info(users);")
        user_cols = [row[1] for row in cursor.fetchall()]
        
        if 'profile_id' not in user_cols:
            print("Adding 'profile_id' to 'users'...")
            cursor.execute("ALTER TABLE users ADD COLUMN profile_id INTEGER REFERENCES profiles(id)")
            conn.commit()
            
        if 'is_active' not in user_cols:
            print("Adding 'is_active' to 'users'...")
            cursor.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1")
            conn.commit()

        # 3. Update notifications table (checking for created_by_user_id)
        cursor.execute("PRAGMA table_info(notifications);")
        notif_cols = [row[1] for row in cursor.fetchall()]
        
        if 'created_by_user_id' not in notif_cols:
            print("Adding 'created_by_user_id' to 'notifications'...")
            cursor.execute("ALTER TABLE notifications ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)")
            conn.commit()

        print("✅ Migration completed successfully.")
        conn.close()
    except Exception as e:
        print(f"❌ Error during migration: {e}")

if __name__ == "__main__":
    migrate()
