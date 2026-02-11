import sqlite3

def add_column():
    conn = sqlite3.connect('tickets.db')
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE notifications ADD COLUMN created_by_user_id INTEGER REFERENCES users(id)")
        conn.commit()
        print("Successfully added 'created_by_user_id' column.")
    except sqlite3.OperationalError as e:
        print(f"Error adding column (it might already exist): {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_column()
