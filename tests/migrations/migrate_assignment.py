import sqlite3
import os

db_path = "tickets_system.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE tickets ADD COLUMN assigned_user_id INTEGER REFERENCES users(id);")
        conn.commit()
        print("Coluna assigned_user_id adicionada com sucesso.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("A coluna assigned_user_id já existe.")
        else:
            print(f"Erro ao adicionar coluna: {e}")
    finally:
        conn.close()
else:
    print("Banco de dados não encontrado.")
