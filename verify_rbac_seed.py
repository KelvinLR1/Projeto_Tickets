import sys
import os

# Adiciona o diretório atual ao sys.path para importar os módulos locais
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'server'))

try:
    from server import models, database
    from sqlalchemy.orm import Session
except ImportError:
    import models, database
    from sqlalchemy.orm import Session

db = database.SessionLocal()

def verify():
    print("--- Verificando Perfis ---")
    profiles = db.query(models.Profile).all()
    for p in profiles:
        print(f"ID: {p.id} | Nome: {p.name} | Menus: {p.permissions.get('menus')}")

    print("\n--- Verificando Admin ---")
    admin = db.query(models.User).filter(models.User.username == "admin").first()
    if admin:
        profile_name = admin.profile.name if admin.profile else "Nenhum"
        print(f"User: {admin.username} | Role: {admin.role} | Profile: {profile_name}")
    else:
        print("Admin não encontrado!")

if __name__ == "__main__":
    verify()
    db.close()
