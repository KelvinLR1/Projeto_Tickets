import sqlite3
import os

db_path = "tickets_system.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        # Criar tabela de histórico
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ticket_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            user_id INTEGER,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
        """)
        
        conn.commit()
        print("Tabela ticket_history criada com sucesso.")
    except Exception as e:
        print(f"Erro na migração: {e}")
    finally:
        conn.close()
else:
    print("Banco de dados não encontrado.")
