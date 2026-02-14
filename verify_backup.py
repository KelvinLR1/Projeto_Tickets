import os
import zipfile
import io
import shutil
import sys

# Simular o ambiente do servidor para testar a lógica sem dependências pesadas
BASE_DIR = os.path.join(os.getcwd(), 'server')
DB_PATH = os.path.join(BASE_DIR, "tickets_system.db")

print(f"DB_PATH: {DB_PATH}")
print(f"BASE_DIR: {BASE_DIR}")

def test_backup_logic():
    print("\n--- Testando Lógica de Backup ---")
    # Criar arquivos dummy se não existirem
    for ext in ["", "-wal", "-shm"]:
        path = f"{DB_PATH}{ext}"
        if not os.path.exists(path):
            with open(path, "w") as f:
                f.write(f"dummy content for {ext}")
            print(f"Criado arquivo dummy: {path}")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for ext in ["", "-wal", "-shm"]:
            db_file_path = f"{DB_PATH}{ext}"
            if os.path.exists(db_file_path):
                print(f"Zipping {os.path.basename(db_file_path)}...")
                zip_file.write(db_file_path, arcname=os.path.basename(db_file_path))
    
    zip_buffer.seek(0)
    with zipfile.ZipFile(zip_buffer, "r") as zip_ref:
        names = zip_ref.namelist()
        print(f"Arquivos no ZIP: {names}")
        assert "tickets_system.db" in names
        assert "tickets_system.db-wal" in names
        assert "tickets_system.db-shm" in names
    print("Sucesso: Backup inclui todos os arquivos do SQLite.")

def test_restore_logic():
    print("\n--- Testando Lógica de Restauração ---")
    # Criar um zip fake
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("tickets_system.db", "new db content")
        zip_file.writestr("tickets_system.db-wal", "new wal content")
    
    zip_buffer.seek(0)
    
    # Simular a remoção
    for ext in ["", "-wal", "-shm"]:
        db_file = f"{DB_PATH}{ext}"
        if os.path.exists(db_file):
            try:
                os.remove(db_file)
                print(f"Removido: {db_file}")
            except Exception as e:
                print(f"Erro ao remover {db_file}: {e}")

    # Extrair
    with zipfile.ZipFile(zip_buffer, 'r') as zip_ref:
        print(f"Extraindo para: {BASE_DIR}")
        zip_ref.extractall(BASE_DIR)
    
    # Verificar
    assert os.path.exists(DB_PATH)
    assert os.path.exists(f"{DB_PATH}-wal")
    print("Sucesso: Restauração extraiu os arquivos corretamente.")

if __name__ == "__main__":
    test_backup_logic()
    test_restore_logic()
