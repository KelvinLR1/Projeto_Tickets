from sqlalchemy.orm import Session
from typing import List, Dict, Any
from sqlalchemy import func
from . import models, schemas

def get_detailed_report_stats(db: Session):
    # Tickets por Cliente (Top 10)
    client_stats = db.query(
        models.Client.name, 
        func.count(models.Ticket.id)
    ).join(models.Ticket).group_by(models.Client.id).order_by(func.count(models.Ticket.id).desc()).limit(10).all()

    # Tickets por Categoria
    category_stats = db.query(
        models.Category.name, 
        func.count(models.Ticket.id)
    ).join(models.Ticket).group_by(models.Category.id).all()

    # Distribuição de Prioridade
    priority_stats = db.query(
        models.Ticket.priority, 
        func.count(models.Ticket.id)
    ).group_by(models.Ticket.priority).all()

    # Status por Prioridade (Matriz)
    status_priority_stats = db.query(
        models.Ticket.status,
        models.Ticket.priority,
        func.count(models.Ticket.id)
    ).group_by(models.Ticket.status, models.Ticket.priority).all()

    # Distribuição de Status
    status_stats = db.query(
        models.Ticket.status, 
        func.count(models.Ticket.id)
    ).group_by(models.Ticket.status).all()

    # Evolução Temporal (Últimos 7 dias)
    from datetime import datetime, timedelta
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    date_stats = db.query(
        func.date(models.Ticket.created_at), 
        func.count(models.Ticket.id)
    ).filter(models.Ticket.created_at >= seven_days_ago).group_by(func.date(models.Ticket.created_at)).all()

    return {
        "by_client": [{"name": row[0], "count": row[1]} for row in client_stats],
        "by_category": [{"name": row[0] or "Sem Categoria", "count": row[1]} for row in category_stats],
        "by_priority": dict(priority_stats),
        "by_status": dict(status_stats),
        "by_date": {str(row[0]): row[1] for row in date_stats},
        "status_priority_matrix": [
            {"status": row[0], "priority": row[1], "count": row[2]} for row in status_priority_stats
        ]
    }

# --- Client CRUD ---
def get_client(db: Session, client_id: int):
    return db.query(models.Client).filter(models.Client.id == client_id).first()

def get_client_by_email(db: Session, email: str):
    return db.query(models.Client).filter(models.Client.email == email).first()

def get_client_by_cpf_cnpj(db: Session, cpf_cnpj: str):
    if not cpf_cnpj:
        return None
    return db.query(models.Client).filter(models.Client.cpf_cnpj == cpf_cnpj).first()

def get_clients(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Client).offset(skip).limit(limit).all()

def create_client(db: Session, client: schemas.ClientCreate):
    db_client = models.Client(
        name=client.name, 
        email=client.email, 
        cpf_cnpj=client.cpf_cnpj,
        phone=client.phone
    )
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

def update_client(db: Session, client_id: int, client_update: schemas.ClientCreate):
    db_client = get_client(db, client_id)
    if db_client:
        db_client.name = client_update.name
        db_client.email = client_update.email
        db_client.cpf_cnpj = client_update.cpf_cnpj
        db_client.phone = client_update.phone
        db.commit()
        db.refresh(db_client)
    return db_client

def bulk_create_clients(db: Session, clients_data: List[dict]):
    results: Dict[str, Any] = {"total": len(clients_data), "imported": 0, "duplicates": 0, "errors": []}
    
    for c_data in clients_data:
        try:
            doc = str(c_data.get("cpf_cnpj", "")).strip()
            
            # Verificação obrigatória por CPF/CNPJ
            if not doc:
                results["errors"].append(f"Erro: Cliente {c_data.get('name')} sem CPF/CNPJ informado.")
                continue

            # Verifica se já existe pelo documento
            existing = get_client_by_cpf_cnpj(db, doc)
            if existing:
                results["duplicates"] += 1
                continue
            
            db_client = models.Client(
                name=c_data["name"],
                email=c_data["email"],
                cpf_cnpj=doc,
                phone=c_data.get("phone")
            )
            db.add(db_client)
            results["imported"] += 1
        except Exception as e:
            results["errors"].append(f"Erro ao importar {c_data.get('name')}: {str(e)}")
    
    db.commit()
    return results

# --- Category CRUD ---
def get_categories(db: Session):
    # Retorna apenas categorias raiz (sem pai), as subcategorias virão via relationship
    return db.query(models.Category).filter(models.Category.parent_id == None).all()

def create_category(db: Session, cat: schemas.CategoryCreate):
    db_cat = models.Category(**cat.dict())
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

def delete_category(db: Session, cat_id: int):
    db_cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if db_cat:
        db.delete(db_cat)
        db.commit()
        return True
    return False

    return False

def get_or_create_default_category(db: Session):
    default_cat_name = "Sem Categoria"
    db_cat = db.query(models.Category).filter(models.Category.name == default_cat_name).first()
    if not db_cat:
        db_cat = models.Category(name=default_cat_name)
        db.add(db_cat)
        db.commit()
        db.refresh(db_cat)
    return db_cat

# --- Status CRUD ---
def get_statuses(db: Session):
    return db.query(models.Status).all()

def create_status(db: Session, status: schemas.StatusCreate):
    db_status = models.Status(**status.dict())
    db.add(db_status)
    db.commit()
    db.refresh(db_status)
    return db_status

def delete_status(db: Session, status_id: int):
    db_status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if db_status:
        db.delete(db_status)
        db.commit()
        return True
    return False

def get_or_create_default_status(db: Session):
    default_name = "Aberto"
    db_status = db.query(models.Status).filter(models.Status.name == default_name).first()
    if not db_status:
        db_status = models.Status(name=default_name, color="#3b82f6")
        db.add(db_status)
        db.commit()
        db.refresh(db_status)
    return db_status

# --- Ticket CRUD ---
def get_tickets(db: Session, skip: int = 0, limit: int = 100, status: str = None, client_id: int = None):
    query = db.query(models.Ticket)
    if status:
        query = query.filter(models.Ticket.status == status)
    if client_id:
        query = query.filter(models.Ticket.client_id == client_id)
    return query.offset(skip).limit(limit).all()

def create_ticket(db: Session, ticket: schemas.TicketCreate):
    ticket_data = ticket.dict()
    if not ticket_data.get("category_id"):
        default_cat = get_or_create_default_category(db)
        ticket_data["category_id"] = default_cat.id
    
    if not ticket_data.get("status_id"):
        default_status = get_or_create_default_status(db)
        ticket_data["status_id"] = default_status.id
        ticket_data["status"] = default_status.name
    else:
        # Sincroniza o nome do status se o ID for passado
        db_status = db.query(models.Status).filter(models.Status.id == ticket_data["status_id"]).first()
        if db_status:
            ticket_data["status"] = db_status.name
        
    db_ticket = models.Ticket(**ticket_data)
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

def create_ticket_simple(db: Session, ticket: schemas.TicketCreateSimple):
    # Procura ou cria cliente pelo nome
    client = db.query(models.Client).filter(models.Client.name == ticket.client_name).first()
    if not client:
        client = models.Client(name=ticket.client_name, email=f"{ticket.client_name.lower().replace(' ', '.')}@local.com")
        db.add(client)
        db.commit()
        db.refresh(client)
    
    # Cria o ticket
    ticket_data = ticket.dict()
    ticket_data.pop("client_name")
    
    # Lógica de categoria para o simple
    if not ticket_data.get("category_id"):
        default_cat = get_or_create_default_category(db)
        ticket_data["category_id"] = default_cat.id
    
    # Lógica de status padrão
    default_status = get_or_create_default_status(db)
    
    db_ticket = models.Ticket(**ticket_data, client_id=client.id, status_id=default_status.id, status=default_status.name)
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

def get_ticket(db: Session, ticket_id: int):
    return db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()

def create_ticket_message(db: Session, message: schemas.TicketMessageCreate, ticket_id: int):
    db_message = models.TicketMessage(**message.dict(), ticket_id=ticket_id)
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

def update_ticket(db: Session, ticket_id: int, ticket_update: schemas.TicketUpdate):
    db_ticket = get_ticket(db, ticket_id)
    if db_ticket:
        update_data = ticket_update.dict(exclude_unset=True)
        # Se atualizar status_id, sincroniza o nome do status
        if "status_id" in update_data:
            db_status = db.query(models.Status).filter(models.Status.id == update_data["status_id"]).first()
            if db_status:
                update_data["status"] = db_status.name

        for key, value in update_data.items():
            setattr(db_ticket, key, value)
        db.commit()
        db.refresh(db_ticket)
    return db_ticket

def delete_ticket(db: Session, ticket_id: int):
    db_ticket = get_ticket(db, ticket_id)
    if db_ticket:
        db.delete(db_ticket)
        db.commit()
        return True
    return False

# --- Knowledge Base CRUD ---
def get_knowledge_documents(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.KnowledgeDocument).offset(skip).limit(limit).all()

def create_knowledge_document(db: Session, doc: schemas.KnowledgeDocumentCreate):
    db_doc = models.KnowledgeDocument(**doc.dict())
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

def search_knowledge_documents(db: Session, query: str, limit: int = 3):
    # ... (lógica existente mantida)
    # 1. Tenta busca exata da frase primeiro
    exact_match = db.query(models.KnowledgeDocument).filter(
        (models.KnowledgeDocument.title.ilike(f"%{query}%")) | 
        (models.KnowledgeDocument.content.ilike(f"%{query}%"))
    ).limit(limit).all()
    
    if exact_match:
        return exact_match
    
    # 2. Se não encontrar a frase exata, busca pelas palavras (mínimo 3 de caracteres)
    words = [w.lower() for w in query.split() if len(w) > 3]
    if not words:
        # Se a query for muito curta mas mencionar 'base' ou 'documento', retorna os últimos
        if any(x in query.lower() for x in ["base", "documento", "lista", "manual", "tutorial"]):
            return db.query(models.KnowledgeDocument).order_by(models.KnowledgeDocument.created_at.desc()).limit(limit).all()
        return []
    
    from sqlalchemy import or_
    filters = []
    for word in words:
        filters.append(models.KnowledgeDocument.title.ilike(f"%{word}%"))
        filters.append(models.KnowledgeDocument.content.ilike(f"%{word}%"))
    
    results = db.query(models.KnowledgeDocument).filter(or_(*filters)).limit(limit).all()
    
    # 3. Se ainda assim não encontrar nada, mas a pergunta for sobre "o que tem na base", retorna os últimos
    if not results and any(x in query.lower() for x in ["base", "documento", "manual", "tem", "unico"]):
        return db.query(models.KnowledgeDocument).order_by(models.KnowledgeDocument.created_at.desc()).limit(limit).all()
        
    return results

def get_knowledge_document(db: Session, doc_id: int):
    return db.query(models.KnowledgeDocument).filter(models.KnowledgeDocument.id == doc_id).first()

def update_knowledge_document(db: Session, doc_id: int, doc_update: schemas.KnowledgeDocumentCreate):
    db_doc = get_knowledge_document(db, doc_id)
    if db_doc:
        db_doc.title = doc_update.title
        db_doc.content = doc_update.content
        db_doc.category = doc_update.category
        db.commit()
        db.refresh(db_doc)
    return db_doc

def delete_knowledge_document(db: Session, doc_id: int):
    db_doc = get_knowledge_document(db, doc_id)
    if db_doc:
        db.delete(db_doc)
        db.commit()
        return True
    return False
