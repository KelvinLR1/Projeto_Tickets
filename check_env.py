import os
import sys
import subprocess
import platform

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
        print(f"{Colors.GREEN}[✓] {cat_str}{message}{Colors.ENDC}")
    elif status == "ERROR":
        print(f"{Colors.RED}[✗] {cat_str}{message}{Colors.ENDC}")
    elif status == "WARN":
        print(f"{Colors.YELLOW}[!] {cat_str}{message}{Colors.ENDC}")
    else:
        print(f"{Colors.BLUE}[•] {cat_str}{message}{Colors.ENDC}")

def check_command(command, args):
    try:
        result = subprocess.run([command] + args, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

def main():
    print(f"\n{Colors.HEADER}{Colors.BOLD}=== ANTIGRAVITY ENVIRONMENT CHECK ==={Colors.ENDC}")
    print(f"{Colors.BLUE}Este script verifica o que é essencial para o sistema rodar.{Colors.ENDC}\n")
    
    essential_ok = True
    optional_warnings = []

    # 1. Sistema Operacional
    os_info = platform.system() + " " + platform.release()
    print_status(f"Sistema Operacional: {os_info}")

    # 2. Python (ESSENCIAL)
    py_version = sys.version_info
    if py_version.major >= 3 and py_version.minor >= 10:
        print_status(f"Python: {sys.version.split()[0]}", "OK", "ESSENCIAL")
    else:
        print_status(f"Python: {sys.version.split()[0]}", "ERROR", "ESSENCIAL")
        print(f"   -> {Colors.YELLOW}Como resolver: Instale o Python 3.10 ou superior em python.org{Colors.ENDC}")
        essential_ok = False

    # 3. Node.js (ESSENCIAL)
    node_v = check_command("node", ["--version"])
    if node_v:
        major = int(node_v.strip('v').split('.')[0])
        if major >= 18:
            print_status(f"Node.js: {node_v}", "OK", "ESSENCIAL")
        else:
            print_status(f"Node.js: {node_v}", "ERROR", "ESSENCIAL")
            print(f"   -> {Colors.YELLOW}Como resolver: Atualize o Node.js para v18+ em nodejs.org{Colors.ENDC}")
            essential_ok = False
    else:
        print_status("Node.js não encontrado", "ERROR", "ESSENCIAL")
        print(f"   -> {Colors.YELLOW}Como resolver: Instale o Node.js v18+ (necessário para o Frontend){Colors.ENDC}")
        essential_ok = False

    # 4. Ollama & Modelos (RECOMENDADO / OPCIONAL)
    ollama_v = check_command("ollama", ["--version"])
    if ollama_v:
        print_status(f"Ollama: {ollama_v}", "OK", "RECOMENDADO")
        models = check_command("ollama", ["list"])
        if models:
            for model in ["llama3", "llava"]:
                if model in models:
                    print_status(f"IA Model '{model}': Presente", "OK", "IA")
                else:
                    print_status(f"IA Model '{model}': Ausente", "WARN", "IA")
                    print(f"   -> {Colors.YELLOW}Como resolver: Execute 'ollama pull {model}' para ativar RAG/Visão{Colors.ENDC}")
                    optional_warnings.append(f"Funcionalidades de {model} estarão desativadas.")
    else:
        print_status("Ollama não encontrado", "WARN", "RECOMENDADO")
        print(f"   -> {Colors.YELLOW}Como resolver: Instale em ollama.com se quiser usar IA local/offline{Colors.ENDC}")
        optional_warnings.append("O sistema rodará sem as funções de Inteligência Artificial.")

    # 5. Dependências e VENV (ESSENCIAL PARA RODAR)
    venv_path = os.path.join("server", ".venv")
    if os.path.exists(venv_path):
        print_status("Ambiente Virtual (server/.venv): OK", "OK", "ESSENCIAL")
    else:
        print_status("Ambiente Virtual (server/.venv): Não encontrado", "ERROR", "ESSENCIAL")
        print(f"   -> {Colors.YELLOW}Como resolver: Na pasta 'server', use: python -m venv .venv{Colors.ENDC}")
        essential_ok = False

    node_modules = os.path.join("client", "node_modules")
    if os.path.exists(node_modules):
        print_status("Dependências (client/node_modules): OK", "OK", "ESSENCIAL")
    else:
        print_status("Dependências (client/node_modules): Não encontrado", "ERROR", "ESSENCIAL")
        print(f"   -> {Colors.YELLOW}Como resolver: Na pasta 'client', use: npm install{Colors.ENDC}")
        essential_ok = False

    # Final result
    print("-" * 50)
    if essential_ok:
        if not optional_warnings:
            print(f"\n{Colors.GREEN}{Colors.BOLD}TUDO PRONTO! O sistema pode ser iniciado agora.{Colors.ENDC}")
        else:
            print(f"\n{Colors.GREEN}{Colors.BOLD}SISTEMA BASE PRONTO!{Colors.ENDC}")
            print(f"{Colors.YELLOW}Nota: {Colors.ENDC}O sistema vai rodar, mas com limitações:")
            for warn in optional_warnings:
                print(f" - {warn}")
        
        print(f"\n{Colors.BLUE}Para iniciar:{Colors.ENDC}")
        print(f" 1. Backend: 'cd server && .venv\\Scripts\\activate && uvicorn main:app --host 0.0.0.0 --port 8080'")
        print(f" 2. Frontend: 'cd client && npm run dev'\n")
    else:
        print(f"\n{Colors.RED}{Colors.BOLD}BLOQUEIO: O sistema NÃO vai rodar corretamente.{Colors.ENDC}")
        print(f"Corrija os itens marcados como {Colors.RED}[ESSENCIAL]{Colors.ENDC} acima.\n")

if __name__ == "__main__":
    main()
