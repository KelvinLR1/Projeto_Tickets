import os
import sys
import re

# ─────────────────────────────────────────────
#  Utilitários de caminho e .env
# ─────────────────────────────────────────────

def get_install_dir():
    """Retorna o diretório de instalação do sistema (pasta do EXE ou pasta do script)."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        # Se estiver rodando como script dentro de /server
        base = os.path.dirname(os.path.abspath(__file__))
        if os.path.basename(base) == "server":
            return os.path.dirname(base)
        return base


def get_current_db_url():
    """Lê a DATABASE_URL atual do arquivo .env buscando em locais possíveis."""
    install_dir = get_install_dir()
    
    # Locais possíveis para o .env
    env_locations = [
        os.path.join(install_dir, ".env"),
        os.path.join(install_dir, "server", ".env")
    ]
    
    for env_path in env_locations:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DATABASE_URL="):
                        return line.split("=", 1)[1].strip()
    return None


def update_env_file(database_url):
    """Salva a DATABASE_URL no arquivo .env preferencial (na raiz da instalação)."""
    install_dir = get_install_dir()
    env_path = os.path.join(install_dir, ".env")
    
    # Se não existe na raiz mas existe em /server, usamos o de /server
    if not os.path.exists(env_path):
        alt_path = os.path.join(install_dir, "server", ".env")
        if os.path.exists(alt_path):
            env_path = alt_path

    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
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

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


def create_database_if_not_exists(user, password, host, port, dbname):
    """Cria o banco PostgreSQL se não existir."""
    import pg8000.native
    conn = pg8000.native.Connection(
        user=user, password=password,
        host=host, port=int(port),
        database="postgres"
    )
    result = conn.run("SELECT 1 FROM pg_database WHERE datname=:db", db=dbname)
    if not result:
        conn.run(f"CREATE DATABASE {dbname}")
    conn.close()


def run_silent():
    """Configura SQLite padrão de forma silenciosa (usado pelo instalador)."""
    install_dir = get_install_dir()
    dbname = "tickets.db"
    
    # Define o caminho do banco relativo à estrutura do projeto
    db_path = os.path.join(install_dir, "server", dbname).replace(os.sep, "/")
    db_url = f"sqlite:///{db_path}"
    
    update_env_file(db_url)
    print(f"[config_db] SQLite configurado em {db_path}")


def main():
    # Agora o config_db.py funciona apenas em modo silencioso ou terminal
    # para auxiliar o instalador ou scripts de automação.
    # A configuração visual deve ser feita pela tela de Login do sistema.
    
    if "--silent" in sys.argv or not sys.stdin.isatty():
        run_silent()
    else:
        print("-----------------------------------------------------------------")
        print(" TicketFlow - Database Setup Helper")
        print("-----------------------------------------------------------------")
        print("A configuracao visual do banco de dados agora deve ser feita")
        print("diretamente pelo navegador na tela de Login do sistema.")
        print("")
        print("Este script e usado internamente pelo instalador para configurar")
        print("o banco inicial (SQLite).")
        print("")
        print("Para configuracao silenciosa, use: python config_db.py --silent")
        print("-----------------------------------------------------------------")

if __name__ == "__main__":
    main()
