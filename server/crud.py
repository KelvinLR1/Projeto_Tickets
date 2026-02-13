from sqlalchemy.orm import Session, joinedload
from typing import List, Dict, Any, Optional
from sqlalchemy import func
from datetime import datetime
try:
    from . import models, schemas
except ImportError:
    import models, schemas

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

    status_priority_stats = db.query(
        models.Ticket.status,
        models.Ticket.priority,
        func.count(models.Ticket.id),
        models.Status.is_final
    ).join(models.Status, models.Ticket.status_id == models.Status.id, isouter=True).group_by(models.Ticket.status, models.Ticket.priority, models.Status.is_final).all()

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
            {"status": row[0], "priority": row[1], "count": row[2], "is_final": row[3]} for row in status_priority_stats
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

def update_category(db: Session, cat_id: int, cat_update: schemas.CategoryCreate):
    db_cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not db_cat:
        return None
    
    update_data = cat_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_cat, key, value)
    
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

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

def update_status(db: Session, status_id: int, status_update: schemas.StatusBase):
    db_status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if not db_status:
        return None
    
    old_name = db_status.name
    new_name = status_update.name
    
    update_data = status_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_status, key, value)
    
    db.add(db_status)
    
    # Se o nome mudou, atualiza todos os tickets que usam o nome denormalizado
    if old_name != new_name:
        db.query(models.Ticket).filter(models.Ticket.status == old_name).update({"status": new_name})
        
    db.commit()
    db.refresh(db_status)
    return db_status

def get_or_create_default_status(db: Session):
    default_name = "Aberto"
    db_status = db.query(models.Status).filter(models.Status.name == default_name).first()
    if not db_status:
        db_status = models.Status(name=default_name, color="#3b82f6", is_final=False)
        db.add(db_status)
        db.commit()
        db.refresh(db_status)
    return db_status

# --- Ticket CRUD ---
def get_tickets(db: Session, skip: int = 0, limit: int = 100, status: str = None, client_id: int = None):
    from sqlalchemy.orm import joinedload
    query = db.query(models.Ticket).options(
        joinedload(models.Ticket.client),
        joinedload(models.Ticket.assigned_user),
        joinedload(models.Ticket.status_obj)
    ).order_by(models.Ticket.created_at.desc())
    if status:
        query = query.filter(models.Ticket.status == status)
    if client_id:
        query = query.filter(models.Ticket.client_id == client_id)
    return query.offset(skip).limit(limit).all()

def create_ticket(db: Session, ticket: schemas.TicketCreate, created_by_id: int = None):
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
        if db_status:
            ticket_data["status"] = db_status.name
        
    db_ticket = models.Ticket(**ticket_data)
    # Use o argumento created_by_id passado para a função
    if created_by_id:
        db_ticket.created_by_id = created_by_id

    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    
    # Treinar a IA com o novo ticket em tempo real
    try:
        rag.add_document(
            doc_id=f"ticket_{db_ticket.id}",
            text=f"TICKET #{db_ticket.id} - {db_ticket.title}\nDESCRIÇÃO: {db_ticket.description}",
            meta={"source": "ticket", "title": db_ticket.title, "status": db_ticket.status}
        )
    except Exception as e:
        print(f"Erro ao indexar ticket no RAG: {e}")

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
    ticket_data.pop("category", None) # Remove campo que não existe no modelo Ticket
    
    # Lógica de categoria para o simple
    if not ticket_data.get("category_id"):
        default_cat = get_or_create_default_category(db)
        ticket_data["category_id"] = default_cat.id
    
    # Lógica de status padrão
    # Lógica de status padrão
    default_status = get_or_create_default_status(db)
    
    # Simple ticket geralmente vem do form público ou rápido, pode não ter user logado (definir como None ou Admin)
    # Se quiser forçar um user, pode ser o ID 1 (Admin)
    created_by = ticket_data.get("created_by_id", 1) 

    db_ticket = models.Ticket(**ticket_data, client_id=client.id, status_id=default_status.id, status=default_status.name, created_by_id=created_by)
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

def create_ticket_history(db: Session, history: schemas.TicketHistoryCreate):
    db_history = models.TicketHistory(**history.dict())
    db.add(db_history)
    db.commit()
    db.refresh(db_history)
    return db_history

def get_ticket_history(db: Session, ticket_id: int):
    return db.query(models.TicketHistory).filter(models.TicketHistory.ticket_id == ticket_id).order_by(models.TicketHistory.created_at.desc()).all()

# Note: Using a fixed name for the query as per schema or generic list
def get_ticket_history_list(db: Session, ticket_id: int):
    return db.query(models.TicketHistory).filter(models.TicketHistory.ticket_id == ticket_id).order_by(models.TicketHistory.created_at.desc()).all()

def update_ticket(db: Session, ticket_id: int, ticket_update: schemas.TicketUpdate, user_id: Optional[int] = None):
    db_ticket = get_ticket(db, ticket_id)
    if db_ticket:
        update_data = ticket_update.dict(exclude_unset=True)
        
        # Log de Histórico
        for field, new_value in update_data.items():
            old_value = getattr(db_ticket, field)
            if old_value != new_value:
                event_type = f"{field}_change"
                desc = f"Alterou {field} de '{old_value}' para '{new_value}'"
                
                # Nomes amigáveis para campos específicos
                if field == "description":
                    # Se houver o separador de nova informação, logamos de forma específica
                    if "---" in str(new_value):
                        desc = "Adicionada nova informação ao chamado"
                    else:
                        desc = "Descrição do ticket atualizada"
                elif field == "status_id":
                    new_status = db.query(models.Status).filter(models.Status.id == new_value).first()
                    new_label = new_status.name if new_status else str(new_value)
                    desc = f"Alterou Status para '{new_label}'"
                elif field == "assigned_user_id":
                    new_user = db.query(models.User).filter(models.User.id == new_value).first()
                    new_label = new_user.full_name or new_user.username if new_user else "Ninguém"
                    desc = f"Atribuiu o ticket para '{new_label}'"
                    
                    # Notify new assignee
                    if new_value and new_value != user_id:
                        create_notification(db, schemas.NotificationCreate(
                            user_id=new_value,
                            title=f"Ticket Atribuído: #{ticket_id}",
                            message=f"Você foi definido como responsável pelo ticket '{db_ticket.title}'.",
                            type="info",
                            link=f"/tickets/{ticket_id}"
                        ))

                elif field == "sector_id":
                    new_sector = db.query(models.Sector).filter(models.Sector.id == new_value).first()
                    new_label = new_sector.name if new_sector else "Nenhum"
                    desc = f"Transferiu para o setor '{new_label}'"
                elif field == "priority":
                    priority_map = {
                        "low": "Baixa",
                        "medium": "Média",
                        "high": "Alta",
                        "critical": "Crítica"
                    }
                    # Tenta traduzir valor novo e antigo para um log amigável
                    old_label = priority_map.get(str(old_value).lower(), old_value)
                    new_label = priority_map.get(str(new_value).lower(), new_value)
                    desc = f"Alterou prioridade de '{old_label}' para '{new_label}'"
                elif field == "category_id":
                    new_cat = db.query(models.Category).filter(models.Category.id == new_value).first()
                    new_label = new_cat.name if new_cat else "Sem Categoria"
                    desc = f"Alterou categoria para '{new_label}'"

                create_ticket_history(db, schemas.TicketHistoryCreate(
                    ticket_id=ticket_id,
                    user_id=user_id,
                    event_type=event_type,
                    description=desc
                ))
            
            # Notify assignee if status or priority changes (and auth user is not the assignee)
            if field in ["status_id", "priority"] and db_ticket.assigned_user_id and db_ticket.assigned_user_id != user_id:
                 create_notification(db, schemas.NotificationCreate(
                    user_id=db_ticket.assigned_user_id,
                    title=f"Ticket Atualizado: #{ticket_id}",
                    message=f"O ticket '{db_ticket.title}' teve atualizações em {field}.",
                    type="info",
                    link=f"/tickets/{ticket_id}"
                ))

        # Se atualizar status_id, sincroniza o nome do status (legado)
        if "status_id" in update_data:
            db_status = db.query(models.Status).filter(models.Status.id == update_data["status_id"]).first()
            if db_status:
                update_data["status"] = db_status.name

        for key, value in update_data.items():
            setattr(db_ticket, key, value)
        db.commit()
        db.refresh(db_ticket)
    return db_ticket

# --- Sector CRUD ---
def get_sector(db: Session, sector_id: int):
    return db.query(models.Sector).filter(models.Sector.id == sector_id).first()

def get_sectors(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Sector).offset(skip).limit(limit).all()

def create_sector(db: Session, sector: schemas.SectorCreate):
    db_sector = models.Sector(**sector.dict())
    db.add(db_sector)
    db.commit()
    db.refresh(db_sector)
    return db_sector

def delete_sector(db: Session, sector_id: int):
    db_sector = get_sector(db, sector_id)
    if db_sector:
        db.delete(db_sector)
        db.commit()
        return True
    return False

def add_user_to_sector(db: Session, user_id: int, sector_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    sector = db.query(models.Sector).filter(models.Sector.id == sector_id).first()
    if user and sector:
        if sector not in user.sectors:
            user.sectors.append(sector)
            db.commit()
            return True
    return False

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

def search_tickets(db: Session, query: str, limit: int = 3):
    # Busca similaridade básica em títulos e descrições de tickets
    words = [w.lower() for w in query.split() if len(w) > 3]
    if not words:
        return []
        
    from sqlalchemy import or_
    filters = []
    for word in words:
        filters.append(models.Ticket.title.ilike(f"%{word}%"))
        filters.append(models.Ticket.description.ilike(f"%{word}%"))
    
    return db.query(models.Ticket).filter(or_(*filters)).order_by(models.Ticket.created_at.desc()).limit(limit).all()

def delete_knowledge_document(db: Session, doc_id: int):
    db_doc = get_knowledge_document(db, doc_id)
    if db_doc:
        db.delete(db_doc)
        db.commit()
        return True
    if db_doc:
        db.delete(db_doc)
        db.commit()
        return True
    return False

# --- Profile CRUD ---
def get_profiles(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Profile).offset(skip).limit(limit).all()

def get_profile(db: Session, profile_id: int):
    return db.query(models.Profile).filter(models.Profile.id == profile_id).first()

def create_profile(db: Session, profile: schemas.ProfileCreate):
    db_profile = models.Profile(**profile.dict())
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile

def update_profile(db: Session, profile_id: int, profile_update: schemas.ProfileCreate):
    db_profile = get_profile(db, profile_id)
    if db_profile:
        db_profile.name = profile_update.name
        db_profile.description = profile_update.description
        db_profile.permissions = profile_update.permissions
        db.commit()
        db.refresh(db_profile)
    return db_profile

def delete_profile(db: Session, profile_id: int):
    db_profile = get_profile(db, profile_id)
    if db_profile:
        # Verifica se há usuários vinculados antes de deletar
        if db_profile.users:
            return False # Não pode deletar perfil em uso
        db.delete(db_profile)
        db.commit()
        return True
    return False

# --- User CRUD ---
def get_user(db: Session, user_id: int):
    return db.query(models.User).options(joinedload(models.User.profile)).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).options(joinedload(models.User.profile)).filter(models.User.username == username).first()

def get_users_short(db: Session):
    # Retorna uma lista de tuplas (id, full_name, username)
    return db.query(models.User.id, models.User.full_name, models.User.username).filter(models.User.is_active == True).all()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).options(joinedload(models.User.profile)).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).options(joinedload(models.User.profile)).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, hashed_password: str):
    db_user = models.User(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password,
        role=user.role,
        profile_id=user.profile_id
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate, hashed_password: str = None):
    db_user = get_user(db, user_id)
    if db_user:
        update_data = user_update.dict(exclude_unset=True)
        if hashed_password:
            db_user.hashed_password = hashed_password
            update_data.pop("password", None)
        
        for key, value in update_data.items():
            if key != "password":
                setattr(db_user, key, value)
        
        db.commit()
        db.refresh(db_user)
    return db_user

def delete_user(db: Session, user_id: int):
    db_user = get_user(db, user_id)
    if db_user:
        db.delete(db_user)
        db.commit()
        return True
    return False
def reset_entities(db: Session, entities: List[str], current_user_id: int):
    results = {"total": 0, "deleted": []}
    
    # Ordem de deleção é importante por causa de FKs
    if "tickets" in entities:
        # Mensagens de tickets dependem de tickets
        num_msgs = db.query(models.TicketMessage).delete(synchronize_session=False)
        num_tickets = db.query(models.Ticket).delete(synchronize_session=False)
        results["deleted"].append("tickets")
        results["total"] += (num_msgs + num_tickets)

    if "clients" in entities:
        num_clients = db.query(models.Client).delete(synchronize_session=False)
        results["deleted"].append("clients")
        results["total"] += num_clients

    if "knowledge" in entities:
        num_kb = db.query(models.KnowledgeDocument).delete(synchronize_session=False)
        results["deleted"].append("knowledge")
        results["total"] += num_kb
        # Nota: O ChromaDB (RAG) deve ser limpo pelo chamador (main.py)

    if "settings" in entities:
        num_cats = db.query(models.Category).delete(synchronize_session=False)
        num_status = db.query(models.Status).delete(synchronize_session=False)
        results["deleted"].append("settings")
        results["total"] += (num_cats + num_status)

    if "users" in entities:
        # Protege o usuário logado e o ROOT para evitar lockout total
        num_users = db.query(models.User).filter(
            models.User.id != current_user_id,
            models.User.role != "ROOT"
        ).delete(synchronize_session=False)
        results["deleted"].append("users")
        results["total"] += num_users

    db.commit()
    return results

# --- Timer CRUD ---
def get_active_timers(db: Session, user_id: int):
    return db.query(models.TicketTimeLog).options(
        joinedload(models.TicketTimeLog.ticket).joinedload(models.Ticket.client)
    ).filter(
        models.TicketTimeLog.user_id == user_id,
        models.TicketTimeLog.is_active == True
    ).all()

def start_ticket_timer(db: Session, ticket_id: int, user_id: int):
    # Primeiro, pausa qualquer timer ativo deste usuário (opcional, para evitar duplicatas no mesmo user)
    active_timers = get_active_timers(db, user_id)
    for timer in active_timers:
        stop_ticket_timer(db, timer.ticket_id, user_id)

    db_log = models.TicketTimeLog(
        ticket_id=ticket_id,
        user_id=user_id,
        start_time=datetime.utcnow(),
        is_active=True
    )
    db.add(db_log)
    db.commit()
    # Recarrega com as relações para o frontend
    return db.query(models.TicketTimeLog).options(
        joinedload(models.TicketTimeLog.ticket).joinedload(models.Ticket.client)
    ).filter(models.TicketTimeLog.id == db_log.id).first()

def stop_ticket_timer(db: Session, ticket_id: int, user_id: int):
    db_log = db.query(models.TicketTimeLog).filter(
        models.TicketTimeLog.ticket_id == ticket_id,
        models.TicketTimeLog.user_id == user_id,
        models.TicketTimeLog.is_active == True
    ).first()
    
    if db_log:
        db_log.end_time = datetime.utcnow()
        db_log.is_active = False
        # Cálculo da duração em segundos
        delta = db_log.end_time - db_log.start_time
        db_log.duration = int(delta.total_seconds())
        db.commit()
        db.refresh(db_log)
        
        # Recarrega com as relações para o frontend
        return db.query(models.TicketTimeLog).options(
            joinedload(models.TicketTimeLog.ticket).joinedload(models.Ticket.client)
        ).filter(models.TicketTimeLog.id == db_log.id).first()
    return None

def get_ticket_total_duration(db: Session, ticket_id: int):
    results = db.query(func.sum(models.TicketTimeLog.duration)).filter(
        models.TicketTimeLog.ticket_id == ticket_id
    ).scalar()
    return results or 0

# --- Notification CRUD ---
def create_notification(db: Session, notification: schemas.NotificationCreate):
    db_notification = models.Notification(**notification.dict())
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

def get_notifications(db: Session, user_id: int, skip: int = 0, limit: int = 50):
    """Get notifications for a user with creator username"""
    notifications = db.query(models.Notification).filter(
        models.Notification.user_id == user_id
    ).order_by(models.Notification.created_at.desc()).offset(skip).limit(limit).all()
    
    # Add created_by_username to each notification
    result = []
    for notif in notifications:
        notif_dict = {
            "id": notif.id,
            "user_id": notif.user_id,
            "created_by_user_id": notif.created_by_user_id,
            "created_by_username": notif.created_by.username if notif.created_by else None,
            "title": notif.title,
            "message": notif.message,
            "type": notif.type,
            "read": notif.read,
            "link": notif.link,
            "created_at": notif.created_at
        }
        result.append(notif_dict)
    
    return result

def get_unread_notification_count(db: Session, user_id: int):
    return db.query(models.Notification).filter(models.Notification.user_id == user_id, models.Notification.read == False).count()

def mark_notification_as_read(db: Session, notification_id: int, user_id: int):
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == user_id).first()
    if notification:
        notification.read = True
        db.commit()
        db.refresh(notification)
    return notification

def mark_notification_as_unread(db: Session, notification_id: int, user_id: int):
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == user_id).first()
    if notification:
        notification.read = False
        db.commit()
        db.refresh(notification)
    return notification

def delete_notification(db: Session, notification_id: int, user_id: int):
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == user_id).first()
    if notification:
        db.delete(notification)
        db.commit()
        return True
    return False

def mark_all_notifications_as_read(db: Session, user_id: int):
    db.query(models.Notification).filter(models.Notification.user_id == user_id, models.Notification.read == False).update({models.Notification.read: True}, synchronize_session=False)
    db.commit()
    return True

def send_user_notification(db: Session, sender_id: int, data: schemas.NotificationSend):
    """Send a notification from one user to another"""
    # Validate recipient exists
    recipient = db.query(models.User).filter(models.User.id == data.recipient_user_id).first()
    if not recipient:
        return None
    
    # Build link if ticket_id provided
    link = None
    if data.ticket_id:
        ticket = db.query(models.Ticket).filter(models.Ticket.id == data.ticket_id).first()
        if ticket:
            link = f"/tickets/{data.ticket_id}"
    
    # Create notification
    db_notification = models.Notification(
        user_id=data.recipient_user_id,
        created_by_user_id=sender_id,
        title=data.title,
        message=data.message,
        type=data.type,
        link=link,
        read=False
    )
    
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    
    return db_notification

# --- System Settings CRUD ---
def get_system_settings(db: Session):
    settings = db.query(models.SystemSettings).first()
    if not settings:
        # Criar configuração padrão se não existir
        settings = models.SystemSettings(system_name="TicketFlow")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

def update_system_settings(db: Session, update: schemas.SystemSettingsUpdate):
    settings = get_system_settings(db)
    if update.system_name is not None:
        settings.system_name = update.system_name
    if update.logo_url_light is not None:
        settings.logo_url_light = update.logo_url_light
    if update.logo_url_dark is not None:
        settings.logo_url_dark = update.logo_url_dark
    if update.custom_colors is not None:
        settings.custom_colors = update.custom_colors
    db.commit()
    db.refresh(settings)
    return settings
