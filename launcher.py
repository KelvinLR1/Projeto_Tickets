import webbrowser
import os
import sys
import json

# Script utilitário para abrir a interface do sistema no navegador padrão 
# sem exibir uma janela de console persistente (usado pelo atalho do desktop).
if __name__ == "__main__":
    # Localiza o diretório do executável para encontrar o arquivo de portas
    base_dir = os.path.dirname(os.path.abspath(sys.executable))
    json_path = os.path.join(base_dir, "system_ports.json")
    front_port = 3000
    
    # Tenta ler a porta configurada no JSON do sistema
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)
                front_port = data.get('frontend_port', 3000)
        except:
            pass # Fallback para porta 3000 se houver erro na leitura

    # Abre o navegador no endereço local
    webbrowser.open(f"http://localhost:{front_port}")
    sys.exit(0)
