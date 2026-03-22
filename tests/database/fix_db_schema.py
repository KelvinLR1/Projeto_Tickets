from sqlalchemy import create_engine, text, inspect
import os

# Configuração do Banco de Dados
DATABASE_URL = "sqlite:///./tickets_system.db"

def fix_schema():
    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)
    
    # 1. Verificar tabela system_settings
    if inspector.has_table("system_settings"):
        columns = [col['name'] for col in inspector.get_columns('system_settings')]
        
        with engine.connect() as conn:
            try:
                if 'logo_url_light' not in columns:
                    print("Adicionando coluna 'logo_url_light'...")
                    conn.execute(text("ALTER TABLE system_settings ADD COLUMN logo_url_light VARCHAR"))
                
                if 'logo_url_dark' not in columns:
                    print("Adicionando coluna 'logo_url_dark'...")
                    conn.execute(text("ALTER TABLE system_settings ADD COLUMN logo_url_dark VARCHAR"))
                
                if 'custom_colors' not in columns:
                    print("Adicionando coluna 'custom_colors'...")
                    conn.execute(text("ALTER TABLE system_settings ADD COLUMN custom_colors JSON"))
                
                conn.commit()
                print("Tabela system_settings verificada e ajustada.")
            except Exception as e:
                print(f"Erro ao ajustar system_settings: {e}")
    else:
        print("Tabela system_settings não existe. Será criada na inicialização do servidor.")

    # 2. Verificar tabela tickets (apenas por precaução)
    if inspector.has_table("tickets"):
        columns = [col['name'] for col in inspector.get_columns('tickets')]
        if 'created_by_id' not in columns:
            print("Adicionando coluna 'created_by_id'...")
            with engine.connect() as conn:
                try:
                    conn.execute(text("ALTER TABLE tickets ADD COLUMN created_by_id INTEGER REFERENCES users(id)"))
                    conn.execute(text("UPDATE tickets SET created_by_id = 1 WHERE created_by_id IS NULL"))
                    conn.commit()
                    print("Coluna created_by_id adicionada.")
                except Exception as e:
                    print(f"Erro ao ajustar tickets: {e}")
        else:
            print("Coluna created_by_id já existe.")

if __name__ == "__main__":
    if not os.path.exists("./tickets_system.db"):
        print("Banco de dados não encontrado.")
    else:
        fix_schema()
