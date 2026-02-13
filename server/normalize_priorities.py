import sys
import os

# Adiciona o diretório server ao path para importar models e database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import models
    import database
except ImportError:
    from server import models, database

def normalize_priorities():
    db = database.SessionLocal()
    try:
        print("Iniciando normalização de prioridades...")
        
        # Mapeamento de normalização
        priority_map = {
            "low": "Baixa",
            "low": "Baixa",
            "baixa": "Baixa",
            "medium": "Média",
            "media": "Média",
            "média": "Média",
            "high": "Alta",
            "alta": "Alta",
            "critical": "Crítica",
            "critica": "Crítica",
            "crítica": "Crítica"
        }
        
        tickets = db.query(models.Ticket).all()
        updated_count = 0
        
        for ticket in tickets:
            if not ticket.priority:
                ticket.priority = "Média"
                updated_count += 1
                continue
                
            current = ticket.priority.lower().strip()
            if current in priority_map:
                normalized = priority_map[current]
                if ticket.priority != normalized:
                    print(f"Ticket #{ticket.id}: '{ticket.priority}' -> '{normalized}'")
                    ticket.priority = normalized
                    updated_count += 1
            elif ticket.priority not in ["Baixa", "Média", "Alta", "Crítica"]:
                 # Fallback para algo não reconhecido
                 print(f"Ticket #{ticket.id}: Prioridade desconhecida '{ticket.priority}', ajustando para Média")
                 ticket.priority = "Média"
                 updated_count += 1
        
        db.commit()
        print(f"Sucesso! {updated_count} tickets atualizados.")
        
    except Exception as e:
        print(f"Erro durante a migração: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    normalize_priorities()
