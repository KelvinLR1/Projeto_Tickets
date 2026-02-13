from sqlalchemy import create_engine, text, inspect
import os

# Configuração do Banco de Dados
DATABASE_URL = "sqlite:///./tickets_system.db"

def add_column():
    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)
    
    # Verifica se a coluna já existe
    columns = [col['name'] for col in inspector.get_columns('tickets')]
    if 'created_by_id' in columns:
        print("Coluna 'created_by_id' já existe na tabela 'tickets'.")
        return

    print("Adicionando coluna 'created_by_id' à tabela 'tickets'...")
    
    with engine.connect() as conn:
        try:
            # Adiciona a coluna permitindo NULL inicialmente
            conn.execute(text("ALTER TABLE tickets ADD COLUMN created_by_id INTEGER REFERENCES users(id)"))
            
            # Atualiza tickets existentes para ter um criador padrão (ex: ID 1 - Admin/Root)
            # Se não houver usuários, ficará NULL
            conn.execute(text("UPDATE tickets SET created_by_id = 1 WHERE created_by_id IS NULL"))
            
            conn.commit()
            print("Coluna adicionada e dados migrados com sucesso!")
        except Exception as e:
            print(f"Erro ao migrar banco de dados: {e}")

if __name__ == "__main__":
    if not os.path.exists("./tickets_system.db"):
        print("Banco de dados não encontrado. Execute o servidor primeiro para criar o DB.")
    else:
        add_column()
