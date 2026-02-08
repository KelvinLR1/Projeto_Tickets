import sys
import os

# Adiciona o diretório atual ao path
sys.path.append(os.getcwd())

print(f"CWD: {os.getcwd()}")
print(f"Path: {sys.path}")

try:
    print("Tentando importar server.main...")
    from server import main
    print("Importação de server.main BEM SUCEDIDA!")
except ImportError as ie:
    print(f"Erro de Importação: {ie}")
except Exception as e:
    print(f"Erro Geral: {e}")
    import traceback
    traceback.print_exc()
