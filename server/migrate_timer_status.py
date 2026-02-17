import sqlite3
import os

db_path = 'tickets_system.db'

def migrate():
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. Adicionar a coluna status_id
        print("Adicionando coluna status_id à tabela ticket_time_logs...")
        cursor.execute("ALTER TABLE ticket_time_logs ADD COLUMN status_id INTEGER REFERENCES statuses(id)")
        conn.commit()
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Coluna status_id já existe.")
        else:
            print(f"Erro ao adicionar coluna: {e}")
            return

    # 2. Popular status_id para logs existentes com base no status atual do ticket
    print("Populando status_id para logs existentes...")
    cursor.execute("""
        UPDATE ticket_time_logs
        SET status_id = (
            SELECT status_id FROM tickets WHERE tickets.id = ticket_time_logs.ticket_id
        )
        WHERE status_id IS NULL
    """)
    conn.commit()
    
    print("Migração concluída com sucesso!")
    conn.close()

if __name__ == "__main__":
    migrate()
