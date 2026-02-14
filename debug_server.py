import sys
import os

# Adiciona o diretório server ao path
server_path = os.path.join(os.getcwd(), 'server')
sys.path.append(server_path)
os.chdir(server_path)

print(f"Python path: {sys.path}")
print(f"Current working directory: {os.getcwd()}")

try:
    print("Testando import de database...")
    import database
    print("Database importado com sucesso.")
    print(f"database.DB_PATH: {getattr(database, 'DB_PATH', 'NÃO ENCONTRADO')}")
except Exception as e:
    print(f"Erro ao importar database: {e}")
    import traceback
    traceback.print_exc()

try:
    print("\nTestando import de main...")
    import main
    print("Main importado com sucesso.")
except Exception as e:
    print(f"Erro ao importar main: {e}")
    import traceback
    traceback.print_exc()
