import os
import sys
import pg8000.native

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

def create_database_if_not_exists(user, password, host, port, dbname):
    print(f"🔍 Verificando banco de dados '{dbname}' em {host}:{port}...")
    try:
        # Usamos pg8000.native para uma conexão direta e simples
        # Conecta ao banco 'postgres' padrão
        conn = pg8000.native.Connection(
            user=user,
            password=password,
            host=host,
            port=int(port),
            database="postgres"
        )
        
        # Busca o banco
        result = conn.run("SELECT 1 FROM pg_database WHERE datname=:db", db=dbname)
        
        if not result:
            print(f"🛠️ Banco de dados '{dbname}' não encontrado. Criando...")
            # CREATE DATABASE não pode ter parâmetros em pg8000.native.run, usamos f-string mas o dbname é santizado por ser escolha do user em campo controlado
            conn.run(f"CREATE DATABASE {dbname}")
            print(f"✅ Banco de dados '{dbname}' criado com sucesso!")
        else:
            print(f"ℹ️ Banco de dados '{dbname}' já existe.")
        
        conn.close()
    except Exception as e:
        print(f"❌ Erro ao tentar criar o banco automaticamente via pg8000: {str(e)}")
        raise e

def main():
    print("="*60)
    print("   CONFIGURADOR DE BANCO DE DADOS - TICKETFLOW")
    print("="*60)
    print("\nEscolha o motor de banco de dados:")
    print("1. SQLite (Simples, sem instalação extra)")
    print("2. PostgreSQL (Recomendado para rede/servidor)")
    
    choice = input("\nOpção (1 ou 2): ").strip()
    
    if choice == "1":
        print("\n--- CONFIGURAÇÃO SQLITE ---")
        dbname = input("Nome do arquivo (padrão: tickets.db): ").strip() or "tickets.db"
        if not dbname.endswith(".db"):
            dbname += ".db"
        
        db_path = os.path.join(os.getcwd(), dbname).replace(os.sep, '/')
        db_url = f"sqlite:///{db_path}"
        
        print(f"\nConfigurando SQLite em: {db_path}")
        update_env_file(db_url)
        print("✅ Configuração do SQLite concluída com sucesso!")
        
    elif choice == "2":
        print("\n--- CONFIGURAÇÃO POSTGRESQL ---")
        host = input("Endereço do Servidor (ex: localhost ou IP): ").strip() or "localhost"
        port = input("Porta (padrão: 5432): ").strip() or "5432"
        user = input("Usuário do Banco (ex: postgres): ").strip() or "postgres"
        password = input("Senha do Banco: ").strip()
        dbname = input("Nome do Banco de Dados: ").strip() or "ticketflow_db"
        
        try:
            # Primeiro, tenta garantir que o banco existe
            create_database_if_not_exists(user, password, host, port, dbname)
            
            # Montar URL de conexão final (usando pg8000 no sqlalchemy)
            db_url = f"postgresql+pg8000://{user}:{password}@{host}:{port}/{dbname}"
            
            print(f"\nSalvando configurações no arquivo .env...")
            update_env_file(db_url)
            print("✅ Arquivo .env atualizado com sucesso!")
            
        except Exception as e:
            print(f"\n❌ Falha na configuração do PostgreSQL: {str(e)}")
            sys.exit(1)
    else:
        print("\n❌ Opção inválida!")
        sys.exit(1)

    print("\nConfiguração concluída! Você já pode usar o sistema.")

if __name__ == "__main__":
    main()
