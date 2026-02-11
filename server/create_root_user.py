"""
Script para criar usuário ROOT inicial no banco de dados
"""
from database import SessionLocal, engine
from models import Base, User
from auth import get_password_hash

# Criar todas as tabelas
Base.metadata.create_all(bind=engine)

# Criar sessão
db = SessionLocal()

try:
    # Verificar se já existe um usuário ROOT
    existing_root = db.query(User).filter(User.role == "ROOT").first()
    
    if existing_root:
        print(f"✓ Usuário ROOT já existe: {existing_root.username}")
    else:
        # Criar usuário ROOT
        root_user = User(
            username="admin",
            email="admin@ticketflow.com",
            full_name="Administrador",
            hashed_password=get_password_hash("admin123"),
            role="ROOT",
            is_active=True
        )
        db.add(root_user)
        db.commit()
        db.refresh(root_user)
        print(f"✓ Usuário ROOT criado com sucesso!")
        print(f"  Username: admin")
        print(f"  Senha: admin123")
        print(f"  Email: admin@ticketflow.com")
        
    # Listar todos os usuários
    all_users = db.query(User).all()
    print(f"\n📋 Total de usuários no banco: {len(all_users)}")
    for user in all_users:
        print(f"  - {user.username} ({user.role}) - Ativo: {user.is_active}")
        
except Exception as e:
    print(f"❌ Erro: {e}")
    db.rollback()
finally:
    db.close()
