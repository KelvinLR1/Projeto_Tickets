import sys
import os

# Adiciona o diretório atual ao path para importar módulos locais
sys.path.append(os.getcwd())

from database import SessionLocal
from models import Category, Status

def seed_org():
    db = SessionLocal()
    try:
        print("Iniciando semente de organização...")

        # 1. Novas Categorias (Hierárquicas)
        org_categories = [
            {"name": "Infraestrutura", "subs": ["Rede", "Servidores", "Backup"]},
            {"name": "Sistemas", "subs": ["ERP", "CRM", "E-mail"]},
            {"name": "Hardware", "subs": ["Periféricos", "Notebooks"]},
            {"name": "Segurança", "subs": ["Firewall", "Antivírus"]},
            {"name": "RH", "subs": ["Treinamento", "Contratação"]}
        ]

        for cat_data in org_categories:
            parent = db.query(Category).filter(Category.name == cat_data["name"]).first()
            if not parent:
                parent = Category(name=cat_data["name"])
                db.add(parent)
                db.flush()
            
            for sub_name in cat_data["subs"]:
                exists = db.query(Category).filter(Category.name == sub_name, Category.parent_id == parent.id).first()
                if not exists:
                    sub = Category(name=sub_name, parent_id=parent.id)
                    db.add(sub)

        # 2. Novos Status (Com cores variadas)
        org_statuses = [
            {"name": "Em Triagem", "color": "#f59e0b", "is_final": False}, # Laranja
            {"name": "Aguardando Terceiro", "color": "#8b5cf6", "is_final": False}, # Roxo
            {"name": "Em Teste", "color": "#10b981", "is_final": False}, # Verde Esmeralda
            {"name": "Impedido", "color": "#ef4444", "is_final": False}, # Vermelho
            {"name": "Encerrado pelo Cliente", "color": "#6b7280", "is_final": True} # Cinza
        ]

        for status_data in org_statuses:
            exists = db.query(Status).filter(Status.name == status_data["name"]).first()
            if not exists:
                status = Status(**status_data)
                db.add(status)

        db.commit()
        print("Sucesso! Categorias e Status populados com sucesso.")
        
    except Exception as e:
        print(f"Erro ao popular organização: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_org()
