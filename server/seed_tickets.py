import sys
import os
import random
from datetime import datetime, timedelta

# Adiciona o diretório atual ao path para importar módulos locais
sys.path.append(os.getcwd())

from database import SessionLocal
from models import Client, Ticket, User, Category, Status, Sector
from sqlalchemy.sql import func

def seed_tickets():
    db = SessionLocal()
    try:
        print("Iniciando geração de massa de dados...")

        # 1. Obter referências existentes
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            print("ERRO: Usuário admin não encontrado. Rode o sistema primeiro.")
            return

        categories = db.query(Category).all()
        statuses = db.query(Status).all()
        sectors = db.query(Sector).all()

        if not categories or not statuses:
            print("Aviso: Categorias ou Status insuficientes. Rodando seed_org_data...")
            # Poderia chamar seed_org aqui, mas vamos assumir que já existe ou usar defaults
        
        # 2. Criar Clientes (30 clientes)
        print("Criando clientes...")
        clients = []
        for i in range(1, 31):
            client = Client(
                name=f"Empresa Cliente {i} Ltda",
                email=f"contato@cliente{i}.com.br",
                cpf_cnpj=f"00.000.{i:03d}/0001-00",
                phone=f"(11) 99999-{i:04d}",
                created_at=datetime.now() - timedelta(days=random.randint(0, 60))
            )
            db.add(client)
            clients.append(client)
        
        db.flush() # Para obter os IDs dos clientes
        
        # 3. Criar Tickets (55 tickets para garantir 3 páginas de 25)
        print("Criando tickets...")
        priorities = ["Baixa", "Média", "Alta", "Urgente"]
        
        for i in range(1, 56):
            # Escolha randomica de FKs
            client = random.choice(clients)
            category = random.choice(categories) if categories else None
            status = random.choice(statuses) if statuses else None
            sector = random.choice(sectors) if sectors else None
            
            created_at = datetime.now() - timedelta(days=random.randint(0, 30))
            
            ticket = Ticket(
                title=f"Chamado de Suporte #{i} - {client.name.split()[1]}",
                description=f"Descrição detalhada do problema relatado pelo cliente {client.name}. O sistema apresenta lentidão intermitente no módulo {random.choice(['Fiscal', 'Contábil', 'RH', 'Vendas'])}.",
                priority=random.choice(priorities),
                status=status.name if status else "Novo",
                status_id=status.id if status else None,
                category_id=category.id if category else None,
                client_id=client.id,
                sector_id=sector.id if sector else None,
                assigned_user_id=admin_user.id if random.random() > 0.3 else None, # 70% atribuídos ao admin
                created_by_id=admin_user.id,
                created_at=created_at,
                updated_at=created_at
            )
            db.add(ticket)

        db.commit()
        print(f"Sucesso! {len(clients)} clientes e 55 tickets criados.")
        
    except Exception as e:
        print(f"Erro ao popular dados: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_tickets()
