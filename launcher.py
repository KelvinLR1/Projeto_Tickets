import webbrowser
import os
import sys
import json

# Script simples para abrir o navegador sem janela de console
if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(sys.executable))
    json_path = os.path.join(base_dir, "system_ports.json")
    front_port = 3000
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)
                front_port = data.get('frontend_port', 3000)
        except:
            pass

    webbrowser.open(f"http://localhost:{front_port}")
    sys.exit(0)
