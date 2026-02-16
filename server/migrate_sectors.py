import sqlite3
import os

# Caminho para o banco de dados
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "tickets_system.db")

def migrate():
    print(f"Iniciando migração no banco: {DB_PATH}")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Adicionar sector_id à tabela categories
        print("Adicionando sector_id à tabela 'categories'...")
        cursor.execute("ALTER TABLE categories ADD COLUMN sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL;")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Coluna 'sector_id' já existe em 'categories'.")
        else:
            print(f"Erro ao alterar 'categories': {e}")
            
    try:
        # Adicionar sector_id à tabela statuses
        print("Adicionando sector_id à tabela 'statuses'...")
        cursor.execute("ALTER TABLE statuses ADD COLUMN sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL;")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Coluna 'sector_id' já existe em 'statuses'.")
        else:
            print(f"Erro ao alterar 'statuses': {e}")
            
    conn.commit()
    conn.close()
    print("Migração concluída com sucesso!")

if __name__ == "__main__":
    migrate()
