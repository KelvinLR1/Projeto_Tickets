import os
from sqlalchemy import create_engine, text

# Forçando o caminho correto para o banco de dados
DB_PATH = os.path.join(os.path.dirname(__file__), "server", "tickets_system.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)

with engine.connect() as conn:
    print("Migrating tickets table...")
    
    # Add status_id column to tickets
    try:
        conn.execute(text("ALTER TABLE tickets ADD COLUMN status_id INTEGER REFERENCES statuses(id)"))
        print("Column 'status_id' added successfully.")
    except Exception as e:
        if "duplicate column name" in str(e).lower():
            print("Column 'status_id' likely already exists.")
        else:
            print(f"Error adding status_id: {e}")

    # Add cpf_cnpj column to clients
    try:
        conn.execute(text("ALTER TABLE clients ADD COLUMN cpf_cnpj VARCHAR"))
        print("Column 'cpf_cnpj' added successfully.")
    except Exception as e:
        if "duplicate column name" in str(e).lower():
            print("Column 'cpf_cnpj' likely already exists.")
        else:
            print(f"Error adding cpf_cnpj: {e}")

    conn.commit()
    print("Migration complete.")
