import sqlite3
import os

def fix_schema():
    db_path = os.path.join(os.path.dirname(__file__), "tickets_system.db")
    if not os.path.exists(db_path):
        print(f"Banco de dados não encontrado em {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        print("Verificando coluna 'is_active' na tabela 'categories'...")
        cursor.execute("PRAGMA table_info(categories)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_active' not in columns:
            print("Adicionando coluna 'is_active' à tabela 'categories'...")
            cursor.execute("ALTER TABLE categories ADD COLUMN is_active BOOLEAN DEFAULT 1")
            conn.commit()
            print("Coluna 'is_active' adicionada com sucesso!")
        else:
            print("Coluna 'is_active' já existe.")

        # Verificar outras tabelas que possam ter o mesmo problema devido ao reset
        tables_to_check = ['sectors', 'statuses', 'users']
        for table in tables_to_check:
            print(f"Verificando coluna 'is_active' na tabela '{table}'...")
            cursor.execute(f"PRAGMA table_info({table})")
            columns = [column[1] for column in cursor.fetchall()]
            if 'is_active' not in columns:
                print(f"Adicionando coluna 'is_active' à tabela '{table}'...")
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN is_active BOOLEAN DEFAULT 1")
                conn.commit()
                print(f"Coluna 'is_active' adicionada com sucesso em '{table}'!")

    except Exception as e:
        print(f"Erro ao ajustar o esquema: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    fix_schema()
