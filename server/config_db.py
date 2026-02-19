import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

def update_env_file(database_url):
    env_path = ".env"
    lines = []
    
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()
    
    db_url_found = False
    new_lines = []
    for line in lines:
        if line.strip().startswith("DATABASE_URL="):
            new_lines.append(f"DATABASE_URL={database_url}\n")
            db_url_found = True
        else:
            new_lines.append(line)
            
    if not db_url_found:
        new_lines.append(f"\nDATABASE_URL={database_url}\n")
        
    with open(env_path, "w") as f:
        f.writelines(new_lines)

def main():
    print("="*60)
    print("   CONFIGURADOR DE BANCO DE DADOS - TICKETFLOW")
    print("="*60)
    print("\nEste utilitário irá configurar a conexão com o PostgreSQL.\n")
    
    host = input("Endereço do Servidor (ex: localhost ou IP): ").strip() or "localhost"
    port = input("Porta (padrão: 5432): ").strip() or "5432"
    user = input("Usuário do Banco: ").strip()
    password = input("Senha do Banco: ").strip()
    dbname = input("Nome do Banco de Dados: ").strip()
    
    # Montar URL de conexão
    db_url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    
    print(f"\nTestando conexão com: {host}:{port}...")
    
    try:
        # Tenta criar o engine e conectar
        engine = create_engine(db_url)
        with engine.connect() as conn:
            print("✅ Conexão bem-sucedida!")
            
        print("\nSalvando configurações no arquivo .env...")
        update_env_file(db_url)
        print("✅ Arquivo .env atualizado com sucesso!")
        
        print("\nAgora você pode iniciar o servidor do TicketFlow.")
        
    except SQLAlchemyError as e:
        print("\n❌ ERRO DE CONEXÃO:")
        print(f"Detalhes: {str(e)}")
        print("\nCertifique-se de que o PostgreSQL está rodando e as credenciais estão corretas.")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Ocorreu um erro inesperado: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
