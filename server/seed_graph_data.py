import sys
import os
from datetime import datetime, timedelta
import random

# Adiciona o diretório atual ao path para importar módulos locais
sys.path.append(os.getcwd())

from database import SessionLocal
from models import Ticket, Status

def seed_tickets():
    db = SessionLocal()
    try:
        # Configurações básicas
        client_id = 1
        user_id = 1
        category_id = 1
        status_id = 1
        
        # Obter o nome do status para manter consistência
        status = db.query(Status).filter(Status.id == status_id).first()
        status_name = status.name if status else "Aberto"

        titles = [
            "Problema na conexão de rede",
            "Erro ao processar pagamento",
            "Dúvida sobre fatura",
            "Solicitação de novo acesso",
            "Lentidão no sistema financeiro",
            "Bug na visualização de relatórios",
            "Ajuste de perfil de usuário",
            "Configuração de impressora",
            "Troca de monitor",
            "Atualização de software necessária",
            "Falha no backup diário",
            "Treinamento de novo funcionário"
        ]

        # Criar tickets para os últimos 5 dias
        num_days = 5
        tickets_per_day = 2
        
        print(f"Iniciando semente de {len(titles)} tickets...")
        
        for i, title in enumerate(titles):
            # Calcular uma data retroativa
            days_ago = i % (num_days + 1)
            date = datetime.utcnow() - timedelta(days=days_ago)
            # Adicionar um offset aleatório de horas para não ficarem todos no mesmo minuto
            date = date - timedelta(hours=random.randint(0, 23), minutes=random.randint(0, 59))
            
            new_ticket = Ticket(
                client_id=client_id,
                title=title,
                description=f"Descrição automática para teste do gráfico - Gerado em {date.strftime('%d/%m/%Y')}",
                status=status_name,
                status_id=status_id,
                priority=random.choice(["Baixa", "Média", "Alta", "Crítica"]),
                category_id=category_id,
                created_by_id=user_id,
                created_at=date,
                updated_at=date
            )
            db.add(new_ticket)
        
        db.commit()
        print(f"Sucesso! {len(titles)} tickets criados com datas retroativas.")
        
    except Exception as e:
        print(f"Erro ao criar tickets: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_tickets()
