import os
import sys
from sqlalchemy import text
from database import get_engine_and_session

def reset_schema():
    engine, _ = get_engine_and_session()
    db_url = os.getenv("DATABASE_URL")
    
    if not db_url:
        print("DATABASE_URL não definida. Nada a fazer.")
        return

    if "sqlite" in db_url:
        print("Usando SQLite. Apagando arquivo local...")
        # Se for SQLite, podemos simplesmente deletar o arquivo do banco se necessário
        db_path = db_url.replace("sqlite:///", "")
        if os.path.exists(db_path):
            os.remove(db_path)
            print(f"Banco SQLite '{db_path}' removido com sucesso.")
    else:
        print(f"Conectando ao PostgreSQL para limpar o schema...")
        with engine.connect() as conn:
            # Configura AUTOCOMMIT para executar DROP/CREATE sem transação bloqueante
            conn = conn.execution_options(isolation_level="AUTOCOMMIT")
            print("Executando: DROP SCHEMA public CASCADE...")
            conn.execute(text("DROP SCHEMA public CASCADE;"))
            print("Executando: CREATE SCHEMA public...")
            conn.execute(text("CREATE SCHEMA public;"))
            print("Schema 'public' recriado e limpo com sucesso!")

if __name__ == "__main__":
    reset_schema()
