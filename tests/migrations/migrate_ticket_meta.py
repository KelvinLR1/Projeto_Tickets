import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "tickets_system.db")

def migrate():
    if not os.path.exists(db_path):
        print(f"Banco de dados não encontrado em {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Adicionar created_by_id
        try:
            cursor.execute("ALTER TABLE tickets ADD COLUMN created_by_id INTEGER REFERENCES users(id);")
            print("Coluna created_by_id adicionada.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Coluna created_by_id já existe.")
            else:
                raise e

        # 2. Adicionar created_at
        try:
            cursor.execute("ALTER TABLE tickets ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;")
            print("Coluna created_at adicionada.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Coluna created_at já existe.")
            else:
                raise e

        # 3. Adicionar updated_at
        try:
            cursor.execute("ALTER TABLE tickets ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;")
            print("Coluna updated_at adicionada.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Coluna updated_at já existe.")
            else:
                raise e

        conn.commit()
        print("Migração de metadados de tickets concluída com sucesso.")
    except Exception as e:
        print(f"Erro na migração: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
