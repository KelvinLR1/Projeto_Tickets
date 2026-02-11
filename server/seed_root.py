try:
    from .database import SessionLocal, engine
    from . import models, auth, crud, schemas
except ImportError:
    from database import SessionLocal, engine
    import models, auth, crud, schemas

def seed_root():
    # Cria as tabelas se não existirem
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. Cria Perfis Padrão
        admin_profile = db.query(models.Profile).filter(models.Profile.name == "Administrador").first()
        if not admin_profile:
            print("Criando perfil Administrador...")
            admin_profile = models.Profile(
                name="Administrador",
                description="Acesso total ao sistema",
                permissions={"menus": ["*"], "actions": ["*"]}
            )
            db.add(admin_profile)
            db.commit()
            db.refresh(admin_profile)

        manager_profile = db.query(models.Profile).filter(models.Profile.name == "Gestor").first()
        if not manager_profile:
            print("Criando perfil Gestor...")
            manager_profile = models.Profile(
                name="Gestor",
                description="Gestão de tickets e relatórios",
                permissions={
                    "menus": ["dashboard", "reports", "tickets", "clients", "knowledge", "settings"],
                    "actions": ["view_reports", "manage_tickets", "manage_clients"]
                }
            )
            db.add(manager_profile)
            db.commit()

        agent_profile = db.query(models.Profile).filter(models.Profile.name == "Agente").first()
        if not agent_profile:
            print("Criando perfil Agente...")
            agent_profile = models.Profile(
                name="Agente",
                description="Atendimento de tickets",
                permissions={
                    "menus": ["dashboard", "tickets", "knowledge", "chat"],
                    "actions": ["create_ticket", "view_ticket", "chat_ai"]
                }
            )
            db.add(agent_profile)
            db.commit()

        # Verifica se já existe um usuário root
        user = crud.get_user_by_username(db, username="root")
        if not user:
            print("Criando usuário ROOT inicial...")
            root_user = schemas.UserCreate(
                username="root",
                email="admin@sistema.com",
                full_name="Administrador Root",
                password="admin", # MUDE ISSO DEPOIS!
                role="ROOT",
                profile_id=admin_profile.id
            )
            hashed_pwd = auth.get_password_hash(root_user.password)
            crud.create_user(db, user=root_user, hashed_password=hashed_pwd)
            print("Usuário ROOT criado com sucesso! Usuário: root, Senha: admin")
        else:
            print("Usuário ROOT já existe.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_root()
