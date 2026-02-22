import os
import sys
import subprocess
import platform
import importlib

# Configurações de cores para o terminal
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_status(message, status="INFO", category=""):
    cat_str = f"[{category}] " if category else ""
    if status == "OK":
        print(f"{Colors.GREEN}[V] {cat_str}{message}{Colors.ENDC}")
    elif status == "ERROR":
        print(f"{Colors.RED}[X] {cat_str}{message}{Colors.ENDC}")
    elif status == "WARN":
        print(f"{Colors.YELLOW}[!] {cat_str}{message}{Colors.ENDC}")
    else:
        print(f"{Colors.BLUE}[*] {cat_str}{message}{Colors.ENDC}")

def check_command(command, args):
    try:
        # No Windows, shell=True pode ser necessário para comandos como 'node' em alguns ambientes
        result = subprocess.run([command] + args, capture_output=True, text=True, check=True, shell=True)
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

def check_library(lib_name):
    try:
        importlib.import_module(lib_name)
        return True
    except ImportError:
        return False

def get_env_variable(var_name):
    env_path = os.path.join("server", ".env")
    if not os.path.exists(env_path):
        return None
    with open(env_path, "r") as f:
        for line in f:
            if line.strip().startswith(f"{var_name}="):
                return line.strip().split("=", 1)[1]
    return None

def main():
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== TICKETFLOW - CHECK DE AMBIENTE COMPLETO ==={Colors.ENDC}")
    print(f"{Colors.BLUE}Este script verifica se o projeto está pronto para rodar ou ser compilado.{Colors.ENDC}\n")
    
    essential_ok = True
    build_ok = True
    optional_warnings = []

    # 1. Sistema Operacional
    os_info = platform.system() + " " + platform.release()
    print_status(f"Sistema Operacional: {os_info}")

    # 2. Python (ESSENCIAL)
    py_version = sys.version_info
    if py_version.major >= 3 and py_version.minor >= 10:
        print_status(f"Python: {sys.version.split()[0]}", "OK", "PYTHON")
    else:
        print_status(f"Python: {sys.version.split()[0]}", "ERROR", "PYTHON")
        print(f"   -> {Colors.YELLOW}Como resolver: Instale o Python 3.10 ou superior.{Colors.ENDC}")
        essential_ok = False

    # 3. Bibliotecas Python Críticas (ESSENCIAL)
    critical_libs = ["fastapi", "uvicorn", "sqlalchemy", "pg8000", "win32api"]
    for lib in critical_libs:
        if check_library(lib):
            print_status(f"Biblioteca '{lib}': Instalada", "OK", "DEP")
        else:
            print_status(f"Biblioteca '{lib}': AUSENTE", "ERROR", "DEP")
            essential_ok = False
    
    if not essential_ok:
        print(f"   -> {Colors.YELLOW}Como resolver: Ative o venv e rode 'pip install -r server/requirements.txt'{Colors.ENDC}")

    # 4. Node.js e Frontend (ESSENCIAL)
    node_v = check_command("node", ["--version"])
    npm_v = check_command("npm", ["--version"])
    if node_v and npm_v:
        print_status(f"Node.js: {node_v} | npm: {npm_v}", "OK", "FRONTEND")
    else:
        print_status("Node.js ou npm não encontrados", "ERROR", "FRONTEND")
        essential_ok = False

    node_modules = os.path.join("client", "node_modules")
    if os.path.exists(node_modules):
        print_status("Dependências (client/node_modules): OK", "OK", "FRONTEND")
    else:
        print_status("Dependências (client/node_modules): Não encontrado", "ERROR", "FRONTEND")
        print(f"   -> {Colors.YELLOW}Como resolver: 'cd client && npm install'{Colors.ENDC}")
        essential_ok = False

    # 5. Configuração e Banco de Dados (ESSENCIAL)
    db_url = get_env_variable("DATABASE_URL")
    if db_url:
        print_status(f"Arquivo .env encontrado e configurado", "OK", "CONFIG")
        
        if "postgresql" in db_url.lower():
            print_status("Motor configurado: PostgreSQL", "INFO", "DB")
            try:
                import pg8000.native
                # Tenta extrair dados simples da URL (muito simplificado para o check)
                # Ex: postgresql+pg8000://user:pass@host:port/db
                parts = db_url.split("://")[1].split("@")
                creds = parts[0].split(":")
                addr = parts[1].split("/")
                host_port = addr[0].split(":")
                
                print(f"   -> Testando conexão com {host_port[0]}...")
                conn = pg8000.native.Connection(
                    user=creds[0],
                    password=creds[1] if len(creds)>1 else "",
                    host=host_port[0],
                    port=int(host_port[1]) if len(host_port)>1 else 5432,
                    database=addr[1]
                )
                conn.run("SELECT 1")
                conn.close()
                print_status("Conexão PostgreSQL: BEM-SUCEDIDA", "OK", "DB")
            except Exception as e:
                print_status(f"Conexão PostgreSQL: FALHOU ({str(e)})", "WARN", "DB")
                print(f"   -> {Colors.YELLOW}Nota: O banco pode não estar rodando ou os dados no .env estão incorretos.{Colors.ENDC}")
                print(f"   -> {Colors.BLUE}Se não tiver o PostgreSQL instalado, baixe aqui: https://www.postgresql.org/download/windows/{Colors.ENDC}")
        else:
            print_status("Motor configurado: SQLite", "INFO", "DB")
    else:
        print_status("Arquivo .env não encontrado ou sem DATABASE_URL", "WARN", "CONFIG")
        print(f"   -> {Colors.YELLOW}Nota: O sistema usará SQLite padrão no primeiro boot ou pedirá configuração.{Colors.ENDC}")

    # 6. Ferramentas de Build (PARA O INSTALADOR)
    pyinstaller_v = check_command("pyinstaller", ["--version"])
    if pyinstaller_v:
        print_status(f"PyInstaller: {pyinstaller_v}", "OK", "BUILD")
    else:
        print_status("PyInstaller: Não encontrado", "WARN", "BUILD")
        build_ok = False
        optional_warnings.append("Não será possível gerar o executável (.exe) sem PyInstaller.")

    # 7. Ollama (OPCIONAL/IA)
    ollama_v = check_command("ollama", ["--version"])
    if ollama_v:
        print_status(f"Ollama: {ollama_v}", "OK", "IA")
    else:
        print_status("Ollama não encontrado", "INFO", "IA")
        optional_warnings.append("Funcionalidades de IA (RAG) estarão desativadas.")

    # Resultado Final
    print("-" * 60)
    if essential_ok:
        print(f"\n{Colors.GREEN}{Colors.BOLD}PROJETO PRONTO PARA RODAR!{Colors.ENDC}")
        if build_ok:
            print(f"{Colors.GREEN}Tudo certo para gerar o instalador também.{Colors.ENDC}")
        else:
            print(f"{Colors.YELLOW}Nota: Para gerar o instalador, instale o PyInstaller.{Colors.ENDC}")
        
        print(f"\n{Colors.BLUE}Comandos para iniciar:{Colors.ENDC}")
        print(f" 1. Backend: uvicorn main:app --reload (na pasta server)")
        print(f" 2. Frontend: npm run dev (na pasta client)")
    else:
        print(f"\n{Colors.RED}{Colors.BOLD}ATENÇÃO: Existem itens ESSENCIAIS faltantes.{Colors.ENDC}")
        print("Corrija os erros marcados com [X] antes de prosseguir.")
    print("")

if __name__ == "__main__":
    main()
