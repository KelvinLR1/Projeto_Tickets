from sqlalchemy.orm import Session, joinedload
from typing import List, Dict, Any, Optional
from sqlalchemy import func
from datetime import datetime
try:
    from . import models, schemas, rag
except ImportError:
    import models, schemas, rag

def get_detailed_report_stats(db: Session):
    # Tickets por Cliente (Top 10)
    client_stats = db.query(
        models.Client.name, 
        func.count(models.Ticket.id)
    ).join(models.Ticket).group_by(models.Client.id).order_by(func.count(models.Ticket.id).desc()).limit(5).all()

    # Tickets por Categoria (Top 5)
    category_stats = db.query(
        models.Category.name, 
        func.count(models.Ticket.id)
    ).join(models.Ticket).group_by(models.Category.id).order_by(func.count(models.Ticket.id).desc()).limit(5).all()

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

    # Mapeamento para normalizar prioridades para o frontend
    priority_map = {
        "Baixa": "low",
        "Média": "medium",
        "Alta": "high",
        "Crítica": "critical"
    }

    normalized_priority = {}
    for p_name, count in priority_stats:
        if p_name:
            # Tenta mapear o nome exato, se não existir usa o lowercase como fallback
            key = priority_map.get(p_name, p_name.lower())
            normalized_priority[key] = count

    # Estatísticas por Usuário - Tickets Atribuídos
    assigned_stats = db.query(
        models.User.id,
        models.User.username,
        func.count(models.Ticket.id).label("tickets_assigned")
    ).outerjoin(models.Ticket, models.Ticket.assigned_user_id == models.User.id).group_by(models.User.id).all()
    
    assigned_map = {row.id: {"username": row.username, "count": row[2]} for row in assigned_stats}

    # Estatísticas por Usuário - Tempo Total (via TimeLog)
    time_stats = db.query(
        models.TicketTimeLog.user_id,
        func.sum(models.TicketTimeLog.duration).label("total_duration")
    ).group_by(models.TicketTimeLog.user_id).all()

    time_map = {row.user_id: row.total_duration for row in time_stats}

    # Estatísticas de Criação por Usuário
    creation_stats = db.query(
        models.User.id,
        func.count(models.Ticket.id).label("tickets_created")
    ).outerjoin(models.Ticket, models.Ticket.created_by_id == models.User.id).group_by(models.User.id).all()
    
    creation_map = {row.id: row.tickets_created for row in creation_stats}

    by_user_data = []

    # Get all unique user IDs from the maps
    all_user_ids = set(assigned_map.keys()) | set(time_map.keys()) | set(creation_map.keys())

    for uid in all_user_ids:
        # Default user data if only present in one list
        username = assigned_map.get(uid, {}).get("username", "Unknown")
        # Se username for Unknown, tentar pegar via User query ou assumir que é ID system
        # Mas assigned_map vem de User query, então só será Unknown se o user não tiver ticket atribuído mas tiver log/criação.
        # Nesse caso, TimeLog tem user_id, mas não username.
        # Vamos assumir que users ativos estão em assigned_stats (mesmo com count 0 se outerjoin funcionar bem)
        # O outerjoin acima é User -> Ticket, então Users sem tickets APARECEM com count 0.
        # Logo, assigned_map deve ter todos os users.

        t_assigned = assigned_map.get(uid, {}).get("count", 0)
        t_duration = time_map.get(uid, 0)
        t_created = creation_map.get(uid, 0)
        
        # Média por ticket deste usuário
        avg_user = t_duration / t_assigned if t_assigned > 0 else 0
        
        by_user_data.append({
            "id": uid,
            "name": username,
            "tickets_assigned": t_assigned,
            "tickets_created": t_created,
            "total_duration": t_duration or 0, # Ensure int
            "avg_ticket_time": avg_user
        })

    # Média Geral do Sistema Baseada em TimeLogs Reais
    # Soma total de duração / Número de tickets que tiveram apontamento
    total_duration_query = db.query(func.sum(models.TicketTimeLog.duration)).scalar() or 0
    total_tickets_with_log = db.query(func.count(func.distinct(models.TicketTimeLog.ticket_id))).scalar() or 0
    
    avg_system_time = total_duration_query / total_tickets_with_log if total_tickets_with_log > 0 else 0

    return {
        "by_client": [{"name": row[0], "count": row[1]} for row in client_stats],
        "by_category": [{"name": row[0] or "Sem Categoria", "count": row[1]} for row in category_stats],
        "by_priority": normalized_priority,
        "by_status": dict(status_stats),
        "by_date": {str(row[0]): row[1] for row in date_stats},
        "status_priority_matrix": [
            {"status": row[0], "priority": row[1], "count": row[2], "is_final": row[3]} for row in status_priority_stats
        ],
        "avg_attendance_time": avg_system_time,
        "by_user": by_user_data
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

def _apply_client_filters(query, q=None, doc_type=None, has_phone=None, start_date=None, end_date=None):
    if q:
        from sqlalchemy import or_
        search = f"%{q}%"
        query = query.filter(or_(
            models.Client.name.ilike(search),
            models.Client.email.ilike(search),
            models.Client.cpf_cnpj.ilike(search)
        ))
    
    if doc_type:
        if doc_type == 'cpf':
            query = query.filter(func.length(func.replace(models.Client.cpf_cnpj, '.', '')) <= 12) 
        elif doc_type == 'cnpj':
            query = query.filter(func.length(func.replace(models.Client.cpf_cnpj, '.', '')) > 12)

    if has_phone:
        if has_phone == 'yes':
            query = query.filter(models.Client.phone != None, models.Client.phone != "")
        elif has_phone == 'no':
            from sqlalchemy import or_
            query = query.filter(or_(models.Client.phone == None, models.Client.phone == ""))
            
    if start_date:
        # Assumes start_date is a string 'YYYY-MM-DD' or datetime object
        # If it's a string from query param, we might need to cast or rely on SQLAlchemy/driver
        # Usually params coming from main.py will be str.
        query = query.filter(models.Client.created_at >= start_date)
        
    if end_date:
        # If end_date is just YYYY-MM-DD, we might miss the later hours?
        # Typically handled by frontend adding time or backend adjusting.
        # Check how tickets do it.
        # Ticket params: start_date: Optional[str], end_date: Optional[str]
        # logic in get_tickets uses them directly.
        query = query.filter(models.Client.created_at <= end_date)
            
    return query

def get_clients(db: Session, skip: int = 0, limit: int = 100, q: Optional[str] = None, doc_type: Optional[str] = None, has_phone: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    query = db.query(models.Client)
    query = _apply_client_filters(query, q, doc_type, has_phone, start_date, end_date)
    return query.order_by(models.Client.name.asc()).offset(skip).limit(limit).all()

def get_clients_count(db: Session, q: Optional[str] = None, doc_type: Optional[str] = None, has_phone: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    query = db.query(models.Client)
    query = _apply_client_filters(query, q, doc_type, has_phone, start_date, end_date)
    return query.count()

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

# --- Special Reports CRUD ---
def get_idle_clients(db: Session, start_date: datetime, end_date: datetime):
    # Clientes que tiveram tickets no período
    active_client_ids = db.query(models.Ticket.client_id).filter(
        models.Ticket.created_at >= start_date,
        models.Ticket.created_at <= end_date
    ).distinct().all()
    
    active_ids = [row[0] for row in active_client_ids if row[0] is not None]
    
    # Clientes que NÃO estão na lista acima
    idle_clients = db.query(models.Client).filter(
        ~models.Client.id.in_(active_ids)
    ).all()
    
    return idle_clients

# --- Category CRUD ---
def get_categories(db: Session, sector_id: Optional[int] = None):
    # Retorna apenas categorias raiz (sem pai), as subcategorias virão via relationship
    query = db.query(models.Category).filter(models.Category.parent_id == None)
    if sector_id is not None:
        from sqlalchemy import or_
        query = query.filter(or_(models.Category.sector_id == sector_id, models.Category.sector_id == None))
    return query.all()

def create_category(db: Session, cat: schemas.CategoryCreate):
    db_cat = models.Category(**cat.dict())
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

def delete_category(db: Session, cat_id: int):
    db_cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not db_cat:
        return False, "Categoria não encontrada"
    
    # Verifica se há tickets vinculados
    if db_cat.tickets:
        return False, "Não é possível excluir esta categoria porque ela possui chamados vinculados. Tente desativá-la em vez de excluir."
    
    # Verifica se há subcategorias com tickets (recursivo simples)
    if db_cat.subcategories:
        for sub in db_cat.subcategories:
            if sub.tickets:
                return False, f"Não é possível excluir porque a subcategoria '{sub.name}' possui chamados vinculados."

    db.delete(db_cat)
    db.commit()
    return True, "Categoria excluída com sucesso"

def update_category(db: Session, cat_id: int, cat_update: schemas.CategoryCreate):
    db_cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not db_cat:
        return None
    
    update_data = cat_update.dict(exclude_unset=True)
    
    # Se estiver desativando a categoria, desativa todas as subcategorias recursivamente
    is_deactivating = update_data.get('is_active') is False and db_cat.is_active is True
    
    for key, value in update_data.items():
        setattr(db_cat, key, value)
    
    if is_deactivating:
        def deactivate_recursive(cat):
            for sub in cat.subcategories:
                sub.is_active = False
                deactivate_recursive(sub)
        deactivate_recursive(db_cat)

    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

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
def get_statuses(db: Session, sector_id: Optional[int] = None):
    query = db.query(models.Status)
    if sector_id is not None:
        from sqlalchemy import or_
        query = query.filter(or_(models.Status.sector_id == sector_id, models.Status.sector_id == None))
    return query.all()

def create_status(db: Session, status: schemas.StatusCreate):
    db_status = models.Status(**status.dict())
    db.add(db_status)
    db.commit()
    db.refresh(db_status)
    return db_status

def delete_status(db: Session, status_id: int):
    db_status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if not db_status:
        return False, "Status não encontrado"
    
    # Verifica se há tickets vinculados
    if db_status.tickets:
        return False, "Não é possível excluir este status porque existem chamados vinculados a ele. Tente desativá-lo em vez de excluir."
        
    db.delete(db_status)
    db.commit()
    return True, "Status excluído com sucesso"

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
def _get_tickets_base_query(db: Session, 
                            status: Optional[str] = None, client_id: Optional[int] = None, 
                            unassigned_only: bool = False, exclude_finalized: bool = False, 
                            sector_id: Optional[int] = None, priority: Optional[str] = None, 
                            category_id: Optional[int] = None, q: Optional[str] = None, 
                            assigned_user_id: Optional[int] = None, start_date: Optional[str] = None, 
                            end_date: Optional[str] = None, created_by_id: Optional[int] = None, 
                            follower_id: Optional[int] = None, my_plus_unassigned_id: Optional[int] = None):
    from sqlalchemy.orm import joinedload
    from sqlalchemy import or_
    
    query = db.query(models.Ticket).options(
        joinedload(models.Ticket.client),
        joinedload(models.Ticket.assigned_user),
        joinedload(models.Ticket.status_obj)
    )
    
    if q:
        search_filters = [
            models.Ticket.title.ilike(f"%{q}%"),
            models.Ticket.description.ilike(f"%{q}%"),
            models.Ticket.client.has(models.Client.name.ilike(f"%{q}%"))
        ]
        
        # Se for numérico, também busca por ID
        if q.isdigit():
            search_filters.append(models.Ticket.id == int(q))
            
        query = query.filter(or_(*search_filters))
    
    if status:
        query = query.filter(models.Ticket.status == status)
    if client_id:
        query = query.filter(models.Ticket.client_id == client_id)
    if sector_id:
        query = query.filter(models.Ticket.sector_id == sector_id)
    if priority:
        query = query.filter(models.Ticket.priority == priority)
    if category_id:
        query = query.filter(models.Ticket.category_id == category_id)
    if my_plus_unassigned_id:
        query = query.filter(or_(
            models.Ticket.assigned_user_id == my_plus_unassigned_id,
            models.Ticket.assigned_user_id == None
        ))
    elif assigned_user_id:
        query = query.filter(models.Ticket.assigned_user_id == assigned_user_id)
    if created_by_id:
        query = query.filter(models.Ticket.created_by_id == created_by_id)
    if follower_id:
        query = query.filter(models.Ticket.followers.any(models.User.id == follower_id))
    if unassigned_only:
        query = query.filter(models.Ticket.assigned_user_id == None)
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(models.Ticket.created_at >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(models.Ticket.created_at <= end_dt)
        except ValueError:
            pass
        
    if exclude_finalized:
        query = query.outerjoin(models.Status, models.Ticket.status_id == models.Status.id).filter(
            or_(
                models.Status.is_final == False,
                models.Status.id == None
            )
        )
        final_keywords = ["encerrado", "finalizado", "concluido", "resolvido", "cancelado"]
        for kw in final_keywords:
            query = query.filter(models.Ticket.status.ilike(f"%{kw}%") == False)
            
    return query

def get_tickets(db: Session, skip: int = 0, limit: int = 100, **kwargs):
    query = _get_tickets_base_query(db, **kwargs)
    return query.order_by(models.Ticket.created_at.desc()).offset(skip).limit(limit).all()

def get_tickets_count(db: Session, **kwargs):
    # Removendo offset e limit para contagem total
    kwargs.pop('skip', None)
    kwargs.pop('limit', None)
    query = _get_tickets_base_query(db, **kwargs)
    return query.count()

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
        # Sincroniza o nome do status se o ID for passado (Placeholder para lógica de sincronia)
        pass

    # Normalização de Prioridade
    priority_map = {
        "low": "Baixa", "baixa": "Baixa",
        "medium": "Média", "media": "Média", "média": "Média",
        "high": "Alta", "alta": "Alta",
        "critical": "Crítica", "critica": "Crítica", "crítica": "Crítica"
    }
    if ticket_data.get("priority"):
        p_lower = ticket_data["priority"].lower().strip()
        ticket_data["priority"] = priority_map.get(p_lower, ticket_data["priority"])

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
    return db.query(models.Ticket).options(
        joinedload(models.Ticket.client),
        joinedload(models.Ticket.assigned_user),
        joinedload(models.Ticket.status_obj),
        joinedload(models.Ticket.followers)
    ).filter(models.Ticket.id == ticket_id).first()

def get_followed_tickets(db: Session, user_id: int):
    return db.query(models.Ticket).filter(models.Ticket.followers.any(id=user_id)).all()

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
    if not db_ticket:
        return None
        
    update_data = ticket_update.dict(exclude_unset=True)

    # Normalização de Prioridade
    if "priority" in update_data and update_data["priority"]:
        priority_map = {
            "low": "Baixa", "baixa": "Baixa",
            "medium": "Média", "media": "Média", "média": "Média",
            "high": "Alta", "alta": "Alta",
            "critical": "Crítica", "critica": "Crítica", "crítica": "Crítica"
        }
        p_lower = update_data["priority"].lower().strip()
        update_data["priority"] = priority_map.get(p_lower, update_data["priority"])
        
    # Log de Histórico
    for field, new_value in update_data.items():
        # Evita log duplicado: se estamos alterando status_id, ignoramos o log do campo 'status' (legado/denormalizado)
        if field == "status" and "status_id" in update_data:
            continue
            
        old_value = getattr(db_ticket, field)
        if old_value != new_value:
            event_type = "status_change" if field == "status_id" else ("category_change" if field == "category_id" else ("sector_change" if field == "sector_id" else ("assigned_user_change" if field == "assigned_user_id" else f"{field}_change")))
            desc = f"Alterou {field} de '{old_value}' para '{new_value}'"
            
            # Nomes amigáveis para campos específicos
            if field == "description":
                # Se houver o separador de nova informação, logamos de forma específica
                if "---" in str(new_value):
                    desc = "Adicionada nova informação ao chamado"
                else:
                    desc = "Descrição do ticket atualizada"
            elif field == "status_id":
                old_status = db.query(models.Status).filter(models.Status.id == old_value).first()
                new_status = db.query(models.Status).filter(models.Status.id == new_value).first()
                old_label = old_status.name if old_status else str(old_value)
                new_label = new_status.name if new_status else str(new_value)
                desc = f"Alterou status de **{old_label}** para **{new_label}**"
            elif field == "assigned_user_id":
                old_user = db.query(models.User).filter(models.User.id == old_value).first()
                new_user = db.query(models.User).filter(models.User.id == new_value).first()
                
                old_label = (old_user.full_name or old_user.username) if old_user else "Ninguém"
                new_label = (new_user.full_name or new_user.username) if new_user else "Ninguém"
                
                desc = f"Alterou responsável de **{old_label}** para **{new_label}**"
                
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
                old_sector = db.query(models.Sector).filter(models.Sector.id == old_value).first()
                new_sector = db.query(models.Sector).filter(models.Sector.id == new_value).first()
                old_label = old_sector.name if old_sector else "Global (Geral)"
                new_label = new_sector.name if new_sector else "Global (Geral)"
                desc = f"Transferiu do setor **{old_label}** para **{new_label}**"
            elif field == "priority":
                p_labels = {
                    "low": "Baixa",
                    "medium": "Média",
                    "high": "Alta",
                    "critical": "Crítica"
                }
                # Tenta traduzir valor novo e antigo para um log amigável
                old_label = p_labels.get(str(old_value).lower(), old_value)
                new_label = p_labels.get(str(new_value).lower(), new_value)
                desc = f"Alterou prioridade de **{old_label}** para **{new_label}**"
            elif field == "category_id":
                old_cat = db.query(models.Category).filter(models.Category.id == old_value).first()
                new_cat = db.query(models.Category).filter(models.Category.id == new_value).first()
                old_label = old_cat.name if old_cat else "Sem Categoria"
                new_label = new_cat.name if new_cat else "Sem Categoria"
                desc = f"Alterou categoria de **{old_label}** para **{new_label}**"

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

def update_sector(db: Session, sector_id: int, sector_update: schemas.SectorUpdate):
    db_sector = get_sector(db, sector_id)
    if db_sector:
        update_data = sector_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_sector, key, value)
        db.commit()
        db.refresh(db_sector)
    return db_sector

def delete_sector(db: Session, sector_id: int):
    db_sector = get_sector(db, sector_id)
    if not db_sector:
        return False, "Setor não encontrado"
        
    # Verificar se há usuários ou tickets vinculados
    if db_sector.tickets:
        return False, "Impossível excluir: Existem tickets vinculados a este setor."
        
    # Verificar usuários (relação many-to-many)
    # A verificação direta db.query(models.User).filter(models.User.sectors.any(id=sector_id)).count() é mais segura
    users_count = db.query(models.User).filter(models.User.sectors.any(id=sector_id)).count()
    if users_count > 0:
        return False, f"Impossível excluir: Existem {users_count} usuários vinculados a este setor."
        
    db.delete(db_sector)
    db.commit()
    return True, "Setor excluído com sucesso"

def add_user_to_sector(db: Session, user_id: int, sector_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    sector = db.query(models.Sector).filter(models.Sector.id == sector_id).first()
    if user and sector:
        if sector not in user.sectors:
            user.sectors.append(sector)
            db.commit()
            return True
    return False

def add_ticket_follower(db: Session, ticket_id: int, user_id: int, actor_id: Optional[int] = None):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    
    if ticket and user:
        if user not in ticket.followers:
            ticket.followers.append(user)
            
            # Determine history message
            description = "Começou a acompanhar este ticket."
            if actor_id and actor_id != user_id:
                actor = db.query(models.User).filter(models.User.id == actor_id).first()
                actor_name = actor.full_name or actor.username if actor else "Um usuário"
                user_name = user.full_name or user.username
                description = f"O usuário {actor_name} adicionou {user_name} como acompanhante."
            
            # Log history
            create_ticket_history(db, schemas.TicketHistoryCreate(
                ticket_id=ticket_id,
                user_id=actor_id if actor_id else user_id,
                event_type="FOLLOW",
                description=description
            ))
            
            db.commit()
            db.refresh(ticket)
            return True, ticket
    return False, None

def remove_ticket_follower(db: Session, ticket_id: int, user_id: int, actor_id: Optional[int] = None):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    
    if ticket and user:
        if user in ticket.followers:
            ticket.followers.remove(user)
            
            # Determine history message
            description = "Deixou de acompanhar este ticket."
            if actor_id and actor_id != user_id:
                actor = db.query(models.User).filter(models.User.id == actor_id).first()
                actor_name = actor.full_name or actor.username if actor else "Um usuário"
                user_name = user.full_name or user.username
                description = f"O usuário {actor_name} removeu {user_name} dos acompanhantes."

            # Log history
            create_ticket_history(db, schemas.TicketHistoryCreate(
                ticket_id=ticket_id,
                user_id=actor_id if actor_id else user_id,
                event_type="UNFOLLOW",
                description=description
            ))
            
            db.commit()
            db.refresh(ticket)
            return True, ticket
    return False, None

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
    return db.query(models.User).options(joinedload(models.User.profile), joinedload(models.User.sectors)).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).options(joinedload(models.User.profile), joinedload(models.User.sectors)).filter(models.User.username == username).first()

def get_users_short(db: Session, sector_id: Optional[int] = None):
    # Retorna uma lista de tuplas (id, full_name, username)
    query = db.query(models.User.id, models.User.full_name, models.User.username).filter(models.User.is_active == True)
    if sector_id:
        query = query.filter(models.User.sectors.any(id=sector_id))
    return query.all()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).options(joinedload(models.User.profile), joinedload(models.User.sectors)).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).options(joinedload(models.User.profile), joinedload(models.User.sectors)).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, hashed_password: str):
    db_user = models.User(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password,
        role=user.role,
        profile_id=user.profile_id
    )
    
    # Adicionar setores
    if user.sector_ids:
        sectors = db.query(models.Sector).filter(models.Sector.id.in_(user.sector_ids)).all()
        db_user.sectors = sectors

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate, hashed_password: Optional[str] = None):
    db_user = get_user(db, user_id)
    if db_user:
        update_data = user_update.dict(exclude_unset=True)
        if hashed_password:
            db_user.hashed_password = hashed_password
            update_data.pop("password", None)
        
        # Atualizar setores se fornecido
        if "sector_ids" in update_data:
            sector_ids = update_data.pop("sector_ids")
            if sector_ids is not None:
                sectors = db.query(models.Sector).filter(models.Sector.id.in_(sector_ids)).all()
                db_user.sectors = sectors

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
    results: Dict[str, Any] = {"total": 0, "deleted": [], "errors": []}
    
    try:
        # Ordem de deleção é importante por causa de FKs
        if "tickets" in entities:
            # Mensagens de tickets dependem de tickets
            num_msgs = db.query(models.TicketMessage).delete(synchronize_session=False)
            num_logs = db.query(models.TicketTimeLog).delete(synchronize_session=False)
            num_hist = db.query(models.TicketHistory).delete(synchronize_session=False)
            num_tickets = db.query(models.Ticket).delete(synchronize_session=False)
            results["deleted"].append("tickets")
            results["total"] += (num_msgs + num_tickets + num_logs + num_hist)

        if "clients" in entities:
            # Se não deletou tickets, precisa nulificar references
            if "tickets" not in entities:
                db.query(models.Ticket).update({models.Ticket.client_id: None})
            
            num_clients = db.query(models.Client).delete(synchronize_session=False)
            results["deleted"].append("clients")
            results["total"] += num_clients

        if "knowledge" in entities:
            num_kb = db.query(models.KnowledgeDocument).delete(synchronize_session=False)
            results["deleted"].append("knowledge")
            results["total"] += num_kb
            # Nota: O ChromaDB (RAG) deve ser limpo pelo chamador (main.py)

        if "settings" in entities:
            # Nulifica referências em tickets se existirem
            if "tickets" not in entities:
                db.query(models.Ticket).update({
                    models.Ticket.category_id: None,
                    models.Ticket.status_id: None
                })
            
            num_cats = db.query(models.Category).delete(synchronize_session=False)
            num_status = db.query(models.Status).delete(synchronize_session=False)
            results["deleted"].append("settings")
            results["total"] += (num_cats + num_status)

        if "users" in entities:
            # Identifica usuários que serão removidos
            target_users_query = db.query(models.User).filter(
                models.User.id != current_user_id,
                models.User.username != "admin"
            )
            target_ids = [u.id for u in target_users_query.all()]
            
            if target_ids:
                # 1. Limpa associações de setores
                db.execute(
                    models.user_sectors.delete().where(models.user_sectors.c.user_id.in_(target_ids))
                )
                
                # 2. Limpa notificações
                db.query(models.Notification).filter(
                    (models.Notification.user_id.in_(target_ids)) | 
                    (models.Notification.created_by_user_id.in_(target_ids))
                ).delete(synchronize_session=False)
                
                # 3. Limpa logs de tempo e história se os tickets ainda existirem
                db.query(models.TicketTimeLog).filter(models.TicketTimeLog.user_id.in_(target_ids)).delete(synchronize_session=False)
                db.query(models.TicketHistory).filter(models.TicketHistory.user_id.in_(target_ids)).delete(synchronize_session=False)
                
                # 4. Nulifica referências em tickets
                db.query(models.Ticket).filter(models.Ticket.assigned_user_id.in_(target_ids)).update(
                    {models.Ticket.assigned_user_id: None}, synchronize_session=False
                )
                db.query(models.Ticket).filter(models.Ticket.created_by_id.in_(target_ids)).update(
                    {models.Ticket.created_by_id: None}, synchronize_session=False
                )
                
                # 5. Finalmente deleta os usuários
                num_users = target_users_query.delete(synchronize_session=False)
                results["deleted"].append("users")
                results["total"] += num_users

        db.commit()
        print(f"[RESET] Sucesso! Entidades: {results['deleted']}, Total: {results['total']}")
    except Exception as e:
        db.rollback()
        results["errors"].append(str(e))
        print(f"[RESET] Erro durante limpeza: {e}")
        
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

    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not db_ticket:
        return None

    db_log = models.TicketTimeLog(
        ticket_id=ticket_id,
        user_id=user_id,
        status_id=db_ticket.status_id,
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
    """Send a notification from one user to another (or multiple)"""
    
    target_user_ids = set()

    # 1. Add individual recipients
    if data.recipient_ids:
        target_user_ids.update(data.recipient_ids)
    
    # Backward compatibility
    if data.recipient_user_id:
        target_user_ids.add(data.recipient_user_id)

    # 2. Add recipients from sectors
    if data.sector_ids:
        # Get all users belonging to these sectors
        sector_users = db.query(models.User).join(models.User.sectors).filter(
            models.Sector.id.in_(data.sector_ids),
            models.User.is_active == True
        ).all()
        
        for user in sector_users:
            target_user_ids.add(user.id)

    if not target_user_ids:
        return None
    
    # Build link if ticket_id provided
    link = None
    if data.ticket_id:
        ticket = db.query(models.Ticket).filter(models.Ticket.id == data.ticket_id).first()
        if ticket:
            link = f"/tickets/{data.ticket_id}"

    notifications_created = []

    for user_id in target_user_ids:
        # Validate recipient exists
        recipient = db.query(models.User).filter(models.User.id == user_id).first()
        if not recipient:
            continue

        # Create notification
        db_notification = models.Notification(
            user_id=user_id,
            created_by_user_id=sender_id,
            title=data.title,
            message=data.message,
            type=data.type,
            link=link,
            read=False
        )
        db.add(db_notification)
        notifications_created.append(db_notification)
    
    db.commit()
    
    # Return the first one created to satisfy potential single-return expectations
    return notifications_created[0] if notifications_created else None

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


def get_ticket_timer_stats(db: Session, ticket_id: int):
    # Logs finalizados agrupados por status e usuário
    logs = db.query(models.TicketTimeLog).filter(
        models.TicketTimeLog.ticket_id == ticket_id,
        models.TicketTimeLog.is_active == False
    ).all()

    # Estrutura de retorno: List[schemas.StatusTimeGroup]
    stats_map: Dict[int, Any] = {}

    for log in logs:
        status_name = "Sem Status"
        status_color = "#9ca3af"
        status_id = 0

        if log.status:
            status_name = log.status.name
            status_color = log.status.color
            status_id = log.status.id

        if status_id not in stats_map:
            stats_map[status_id] = {
                "status_id": status_id,
                "status_name": status_name,
                "status_color": status_color,
                "total_duration": 0,
                "users": {}
            }

        group = stats_map[status_id]
        group["total_duration"] += log.duration

        user_id = log.user_id
        user_name = log.user.full_name or log.user.username

        if user_id not in group["users"]:
            group["users"][user_id] = {
                "user_id": user_id,
                "full_name": user_name,
                "duration": 0
            }

        group["users"][user_id]["duration"] += log.duration

    # Converte maps para listas
    result = []
    for s_data in stats_map.values():
        s_data["users"] = list(s_data["users"].values())
        result.append(s_data)

    return result
