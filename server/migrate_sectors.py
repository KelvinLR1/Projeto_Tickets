import sqlite3
import os

db_path = "tickets_system.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # Criar tabela de setores
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT
        );
        """)
        
        # Criar tabela de associação user_sectors
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_sectors (
            user_id INTEGER NOT NULL,
            sector_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, sector_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
        );
        """)

        # Adicionar sector_id aos tickets
        cursor.execute("ALTER TABLE tickets ADD COLUMN sector_id INTEGER REFERENCES sectors(id);")
        
        # Inserir alguns setores padrão
        cursor.execute("INSERT OR IGNORE INTO sectors (name, description) VALUES ('Suporte', 'Atendimento de Nível 1');")
        cursor.execute("INSERT OR IGNORE INTO sectors (name, description) VALUES ('Desenvolvimento', 'Ajustes no código e bugs');")
        cursor.execute("INSERT OR IGNORE INTO sectors (name, description) VALUES ('Infraestrutura', 'Redes e servidores');")
        
        conn.commit()
        print("Migração de setores concluída com sucesso.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("A coluna sector_id já existe. Tabelas de setores mantidas.")
        else:
            print(f"Erro ao adicionar coluna: {e}")
    finally:
        conn.close()
else:
    print("Banco de dados não encontrado.")
