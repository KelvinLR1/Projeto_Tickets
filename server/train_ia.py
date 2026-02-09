import sys
import os

# Adiciona o diretório atual ao path para importar modulos locais
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
import models
import rag
from database import SessionLocal

def train_ia():
    db: Session = SessionLocal()
    print("--- INICIANDO TREINAMENTO DA IA (INDEXAÇÃO) ---")
    
    # 1. Indexar Base de Conhecimento
    docs = db.query(models.KnowledgeDocument).all()
    print(f"Indexando {len(docs)} documentos da base de conhecimento...")
    for doc in docs:
        rag.add_document(
            doc_id=f"kb_{doc.id}",
            text=f"TÍTULO: {doc.title}\nCONTEÚDO: {doc.content}",
            meta={"source": "kb", "title": doc.title, "category": doc.category}
        )
    
    # 2. Indexar Tickets Antigos
    tickets = db.query(models.Ticket).all()
    print(f"Indexando {len(tickets)} tickets do histórico...")
    for t in tickets:
        # Indexar título e descrição para busca semântica
        rag.add_document(
            doc_id=f"ticket_{t.id}",
            text=f"TICKET #{t.id} - {t.title}\nDESCRIÇÃO: {t.description}",
            meta={"source": "ticket", "title": t.title, "status": t.status}
        )
    
    db.close()
    print("--- TREINAMENTO CONCLUÍDO COM SUCESSO ---")

if __name__ == "__main__":
    train_ia()
