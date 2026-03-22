from sqlalchemy.orm import Session, joinedload
from typing import List, Dict, Any, Optional
from sqlalchemy import func, text
from datetime import datetime
try:
    from . import models, schemas, rag
except ImportError:
    import models, schemas, rag

# ==============================================================================
# ESTATÍSTICAS E RELATÓRIOS (REPORTING)
# ==============================================================================

def get_detailed_report_stats(db: Session, 
                              start_date: Optional[str] = None, 
                              end_date: Optional[str] = None, 
                              sector_id: Optional[int] = None, 
                              user_id: Optional[int] = None,
                              current_user: Optional[models.User] = None):
    """
    Retorna um compilado de estatísticas para o dashboard de relatórios.
    Inclui filtros por data, setor, usuário e respeita permissões de perfil.
    """
    
    # Base query filter for Ticket-related stats
    def apply_filters(q):
        if start_date:
            try:
                # Trata Z do ISO string vindo do frontend se necessário
                sd = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                q = q.filter(models.Ticket.created_at >= sd)
            except:
                q = q.filter(models.Ticket.created_at >= start_date)
        if end_date:
            try:
                ed = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                q = q.filter(models.Ticket.created_at <= ed)
            except:
                q = q.filter(models.Ticket.created_at <= end_date)
                
        if current_user and current_user.role not in ["ADMIN", "ROOT"]:
            perms = current_user.permissions.get("actions", []) if current_user.permissions else []
            if "*" not in perms:
                if "view_all_sectors_reports" not in perms:
                    my_sectors = [s.id for s in current_user.sectors] if current_user.sectors else []
                    from sqlalchemy import or_
                    if my_sectors:
                        q = q.filter(or_(models.Ticket.sector_id.in_(my_sectors), models.Ticket.sector_id == None))
                    else:
                        q = q.filter(models.Ticket.sector_id == None)
                
                if "view_all_users_reports" not in perms:
                    from sqlalchemy import or_
                    q = q.filter(or_(
                        models.Ticket.assigned_user_id == current_user.id,
                        models.Ticket.created_by_id == current_user.id
                    ))

        if sector_id:
            q = q.filter(models.Ticket.sector_id == sector_id)
        if user_id:
            q = q.filter(models.Ticket.assigned_user_id == user_id)
        return q

    # Tickets por Cliente (Top 10)
    client_q = db.query(models.Client.name, func.count(models.Ticket.id)).join(models.Ticket)
    client_stats = apply_filters(client_q).group_by(models.Client.id).order_by(func.count(models.Ticket.id).desc()).limit(5).all()

    # Tickets por Categoria (Top 5)
    category_q = db.query(models.Category.name, func.count(models.Ticket.id)).join(models.Ticket)
    category_stats = apply_filters(category_q).group_by(models.Category.id).order_by(func.count(models.Ticket.id).desc()).limit(5).all()

    # Distribuição de Prioridade
    priority_q = db.query(models.Ticket.priority, func.count(models.Ticket.id))
    priority_stats = apply_filters(priority_q).group_by(models.Ticket.priority).all()

    # Matriz Status x Prioridade
    status_priority_q = db.query(
        models.Ticket.status,
        models.Ticket.priority,
        func.count(models.Ticket.id),
        models.Status.is_final
    ).join(models.Status, models.Ticket.status_id == models.Status.id, isouter=True)
    status_priority_stats = apply_filters(status_priority_q).group_by(models.Ticket.status, models.Ticket.priority, models.Status.is_final).all()

    # Distribuição de Status
    status_q = db.query(models.Ticket.status, func.count(models.Ticket.id))
    status_stats = apply_filters(status_q).group_by(models.Ticket.status).all()

    # Evolução Temporal
    from datetime import datetime, timedelta
    date_q = db.query(func.date(models.Ticket.created_at), func.count(models.Ticket.id))
    
    # Se não houver filtro de data, mantemos os últimos 7 dias como padrão
    if not start_date and not end_date:
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        date_q = date_q.filter(models.Ticket.created_at >= seven_days_ago)
    
    date_stats = apply_filters(date_q).group_by(func.date(models.Ticket.created_at)).all()

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
            key = priority_map.get(p_name, p_name.lower())
            normalized_priority[key] = count

    # Estatísticas por Usuário - Tickets Atribuídos
    assigned_q = db.query(
        models.User.id,
        models.User.username,
        func.count(models.Ticket.id).label("tickets_assigned")
    ).outerjoin(models.Ticket, models.Ticket.assigned_user_id == models.User.id)
    
    # Aplicar filtros ao join para estatísticas de usuário
    assigned_q = apply_filters(assigned_q)

    assigned_stats = assigned_q.group_by(models.User.id).all()
    assigned_map = {row.id: {"username": row.username, "count": row[2]} for row in assigned_stats}

    # Estatísticas por Usuário - Tempo Total (via TimeLog)
    time_q = db.query(
        models.TicketTimeLog.user_id,
        func.sum(models.TicketTimeLog.duration).label("total_duration")
    ).join(models.Ticket, models.Ticket.id == models.TicketTimeLog.ticket_id)
    
    time_q = apply_filters(time_q)
    time_stats = time_q.group_by(models.TicketTimeLog.user_id).all()
    time_map = {row.user_id: row.total_duration for row in time_stats}

    # Estatísticas de Criação por Usuário
    creation_q = db.query(
        models.User.id,
        func.count(models.Ticket.id).label("tickets_created")
    ).outerjoin(models.Ticket, models.Ticket.created_by_id == models.User.id)
    
    creation_q = apply_filters(creation_q)
    creation_stats = creation_q.group_by(models.User.id).all()
    creation_map = {row.id: row.tickets_created for row in creation_stats}

    by_user_data = []
    all_user_ids = set(assigned_map.keys()) | set(time_map.keys()) | set(creation_map.keys())

    for uid in all_user_ids:
        username = assigned_map.get(uid, {}).get("username", "Unknown")
        t_assigned = assigned_map.get(uid, {}).get("count", 0)
        t_duration = time_map.get(uid, 0)
        t_created = creation_map.get(uid, 0)
        
        avg_user = t_duration / t_assigned if t_assigned > 0 else 0
        
        by_user_data.append({
            "id": uid,
            "name": username,
            "tickets_assigned": t_assigned,
            "tickets_created": t_created,
            "total_duration": int(t_duration or 0),
            "avg_ticket_time": avg_user
        })

    # Média Geral do Sistema
    total_duration_q = db.query(func.sum(models.TicketTimeLog.duration)).join(models.Ticket)
    total_duration_q = apply_filters(total_duration_q)
    
    total_duration_val = total_duration_q.scalar() or 0
    
    tickets_with_log_q = db.query(func.count(func.distinct(models.TicketTimeLog.ticket_id))).join(models.Ticket)
    tickets_with_log_q = apply_filters(tickets_with_log_q)
    
    total_tickets_with_log = tickets_with_log_q.scalar() or 0
    avg_system_time = total_duration_val / total_tickets_with_log if total_tickets_with_log > 0 else 0

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

# ==============================================================================
# GESTÃO DE CLIENTES (CLIENTS)
# ==============================================================================

def get_client(db: Session, client_id: int):
    """Busca um cliente pelo ID único."""
    return db.query(models.Client).filter(models.Client.id == client_id).first()

def get_client_by_email(db: Session, email: str):
    """Busca um cliente pelo endereço de e-mail."""
    return db.query(models.Client).filter(models.Client.email == email).first()

def get_client_by_cpf_cnpj(db: Session, cpf_cnpj: str):
    """Busca um cliente pelo documento CPF ou CNPJ."""
    if not cpf_cnpj:
        return None
    return db.query(models.Client).filter(models.Client.cpf_cnpj == cpf_cnpj).first()

def _apply_client_filters(query, q=None, doc_type=None, has_phone=None, start_date=None, end_date=None):
    """Helper interno para aplicar múltiplos filtros à listagem de clientes."""
    if q:
        from sqlalchemy import or_
        search = f"%{q}%"
        query = query.filter(or_(
            models.Client.name.ilike(search),
            models.Client.nickname.ilike(search),
            models.Client.email.ilike(search),
            models.Client.cpf_cnpj.ilike(search)
        ))
    
    if doc_type:
        if doc_type == 'cpf':
            # Filtra por comprimento (CPF geralmente tem até 11 dígitos s/ formatação)
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
        query = query.filter(models.Client.created_at >= start_date)
        
    if end_date:
        query = query.filter(models.Client.created_at <= end_date)
            
    return query

def get_clients(db: Session, skip: int = 0, limit: int = 100, q: Optional[str] = None, doc_type: Optional[str] = None, has_phone: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Retorna lista paginada e filtrada de clientes."""
    query = db.query(models.Client)
    query = _apply_client_filters(query, q, doc_type, has_phone, start_date, end_date)
    return query.order_by(models.Client.name.asc()).offset(skip).limit(limit).all()

def get_clients_count(db: Session, q: Optional[str] = None, doc_type: Optional[str] = None, has_phone: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Retorna o total de clientes que batem com os filtros ativos."""
    query = db.query(models.Client)
    query = _apply_client_filters(query, q, doc_type, has_phone, start_date, end_date)
    return query.count()

def create_client(db: Session, client: schemas.ClientCreate):
    """Cadastra um novo cliente no banco de dados."""
    db_client = models.Client(**client.dict())
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

def update_client(db: Session, client_id: int, client_update: schemas.ClientCreate):
    """Atualiza os dados de um cliente existente."""
    db_client = get_client(db, client_id)
    if db_client:
        update_data = client_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_client, key, value)
        db.commit()
        db.refresh(db_client)
    return db_client

def bulk_create_clients(db: Session, clients_data: List[dict]):
    """
    Importação massiva de clientes.
    Se já existir um cliente com o mesmo CPF/CNPJ, os dados são atualizados.
    """
    results: Dict[str, Any] = {"total": len(clients_data), "imported": 0, "updated": 0, "errors": []}
    
    for c_data in clients_data:
        try:
            doc = str(c_data.get("cpf_cnpj", "")).strip()
            
            if not doc:
                results["errors"].append(f"Erro: Cliente {c_data.get('name')} sem CPF/CNPJ informado.")
                continue

            existing = get_client_by_cpf_cnpj(db, doc)
            if existing:
                for key, value in c_data.items():
                    if value is not None and hasattr(existing, key):
                        setattr(existing, key, value)
                results["updated"] += 1
            else:
                db_client = models.Client(**c_data)
                db.add(db_client)
                results["imported"] += 1
        except Exception as e:
            results["errors"].append(f"Erro ao processar {c_data.get('name')}: {str(e)}")
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        results["errors"].append(f"Erro ao salvar no banco: {str(e)}")
    
    return results

def get_idle_clients(db: Session, start_date: datetime, end_date: datetime):
    """Busca clientes que não abriram nenhum chamado no período especificado."""
    active_client_ids = db.query(models.Ticket.client_id).filter(
        models.Ticket.created_at >= start_date,
        models.Ticket.created_at <= end_date
    ).distinct().all()
    
    active_ids = [row[0] for row in active_client_ids if row[0] is not None]
    
    idle_clients = db.query(models.Client).filter(
        ~models.Client.id.in_(active_ids)
    ).all()
    
    return idle_clients

# ==============================================================================
# GESTÃO DE CATEGORIAS (CATEGORIES)
# ==============================================================================

def get_categories(db: Session, sector_id: Optional[int] = None):
    """Retorna categorias raízes, opcionalmente filtradas por setor."""
    query = db.query(models.Category).filter(models.Category.parent_id == None)
    if sector_id is not None:
        from sqlalchemy import or_
        query = query.filter(or_(models.Category.sector_id == sector_id, models.Category.sector_id == None))
    return query.all()

def create_category(db: Session, cat: schemas.CategoryCreate):
    """Cria uma nova categoria ou subcategoria."""
    db_cat = models.Category(**cat.dict())
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

def delete_category(db: Session, cat_id: int):
    """Exclui uma categoria se não houver vínculos impeditivos (tickets)."""
    db_cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not db_cat:
        return False, "Categoria não encontrada"
    
    if db_cat.tickets:
        return False, "Não é possível excluir esta categoria porque ela possui chamados vinculados. Tente desativá-la em vez de excluir."
    
    if db_cat.subcategories:
        for sub in db_cat.subcategories:
            if sub.tickets:
                return False, f"Não é possível excluir porque a subcategoria '{sub.name}' possui chamados vinculados."

    db.delete(db_cat)
    db.commit()
    return True, "Categoria excluída com sucesso"

def update_category(db: Session, cat_id: int, cat_update: schemas.CategoryCreate):
    """Atualiza dados da categoria. Se desativar, desativa subcategorias recursivamente."""
    db_cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not db_cat:
        return None
    
    update_data = cat_update.dict(exclude_unset=True)
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

def get_or_create_default_category(db: Session, sector_id: Optional[int] = None):
    """Garante a existência de uma categoria padrão 'Sem Categoria'."""
    default_cat_name = "Sem Categoria"
    db_cat = db.query(models.Category).filter(models.Category.name == default_cat_name).first()
    if not db_cat:
        db_cat = models.Category(name=default_cat_name, sector_id=sector_id)
        db.add(db_cat)
        db.commit()
        db.refresh(db_cat)
    elif sector_id and not db_cat.sector_id:
        db_cat.sector_id = sector_id
        db.commit()
    return db_cat

# ==============================================================================
# GESTÃO DE STATUS (STATUSES)
# ==============================================================================

def get_statuses(db: Session, sector_id: Optional[int] = None):
    """Retorna todos os status, opcionalmente filtrados por setor."""
    query = db.query(models.Status)
    if sector_id is not None:
        from sqlalchemy import or_
        query = query.filter(or_(models.Status.sector_id == sector_id, models.Status.sector_id == None))
    return query.all()

def create_status(db: Session, status: schemas.StatusCreate):
    """Cria um novo status customizado."""
    db_status = models.Status(**status.dict())
    db.add(db_status)
    db.commit()
    db.refresh(db_status)
    return db_status

def delete_status(db: Session, status_id: int):
    """Remove um status se não houver chamados vinculados (impede quebra de integridade)."""
    db_status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if not db_status:
        return False, "Status não encontrado"
    
    if db_status.tickets:
        return False, "Não é possível excluir este status porque existem chamados vinculados a ele. Tente desativá-lo em vez de excluir."
        
    db.delete(db_status)
    db.commit()
    return True, "Status excluído com sucesso"

def update_status(db: Session, status_id: int, status_update: schemas.StatusBase):
    """Atualiza um status. Se o nome mudar, atualiza referências legadas na tabela de Tickets."""
    db_status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if not db_status:
        return None
    
    old_name = db_status.name
    new_name = status_update.name
    
    update_data = status_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_status, key, value)
    
    db.add(db_status)
    
    if old_name != new_name:
        db.query(models.Ticket).filter(models.Ticket.status == old_name).update({"status": new_name})
        
    db.commit()
    db.refresh(db_status)
    return db_status

def get_or_create_default_status(db: Session, sector_id: Optional[int] = None):
    """Garante a existência dos status básicos (Aberto e Finalizado) no banco."""
    # Status padrão inicial: Aberto
    default_name = "Aberto"
    db_status = db.query(models.Status).filter(models.Status.name == default_name).first()
    if not db_status:
        db_status = models.Status(name=default_name, color="#3b82f6", is_final=False, sector_id=sector_id)
        db.add(db_status)
        db.commit()
        db.refresh(db_status)
    elif sector_id and not db_status.sector_id:
        db_status.sector_id = sector_id
        db.commit()

    # Status padrão finalizador: Finalizado
    finalized_name = "Finalizado"
    db_finalized = db.query(models.Status).filter(models.Status.name == finalized_name).first()
    if not db_finalized:
        db_finalized = models.Status(name=finalized_name, color="#10b981", is_final=True, sector_id=sector_id)
        db.add(db_finalized)
        db.commit()
    elif sector_id and not db_finalized.sector_id:
        db_finalized.sector_id = sector_id
        db.commit()

    return db_status

# ==============================================================================
# GESTÃO DE CHAMADOS (TICKETS)
# ==============================================================================

def _get_tickets_base_query(db: Session, 
                            status: Optional[str] = None, client_id: Optional[int] = None, 
                            unassigned_only: bool = False, exclude_finalized: bool = False, 
                            sector_id: Optional[int] = None, priority: Optional[str] = None, 
                            category_id: Optional[int] = None, q: Optional[str] = None, 
                            assigned_user_id: Optional[int] = None, start_date: Optional[str] = None, 
                            end_date: Optional[str] = None, created_by_id: Optional[int] = None, 
                            follower_id: Optional[int] = None, my_plus_unassigned_id: Optional[int] = None):
    """Helper para construir a query base de chamados com todos os filtros possíveis."""
    from sqlalchemy.orm import joinedload
    from sqlalchemy import or_
    
    # Carregamento antecipado (Eager Loading) de relacionamentos comuns
    query = db.query(models.Ticket).options(
        joinedload(models.Ticket.client),
        joinedload(models.Ticket.assigned_user),
        joinedload(models.Ticket.status_obj)
    )
    
    # Busca global (Texto ou ID numérico)
    if q:
        search_filters = [
            models.Ticket.title.ilike(f"%{q}%"),
            models.Ticket.description.ilike(f"%{q}%"),
            models.Ticket.client.has(models.Client.name.ilike(f"%{q}%"))
        ]
        
        if q.isdigit():
            search_filters.append(models.Ticket.id == int(q))
            
        query = query.filter(or_(*search_filters))
    
    # Filtros exatos
    if status: query = query.filter(models.Ticket.status == status)
    if client_id: query = query.filter(models.Ticket.client_id == client_id)
    if sector_id: query = query.filter(models.Ticket.sector_id == sector_id)
    if priority: query = query.filter(models.Ticket.priority == priority)
    if category_id: query = query.filter(models.Ticket.category_id == category_id)
    if my_plus_unassigned_id:
        query = query.filter(or_(
            models.Ticket.assigned_user_id == my_plus_unassigned_id,
            models.Ticket.assigned_user_id == None
        ))
    elif assigned_user_id:
        query = query.filter(models.Ticket.assigned_user_id == assigned_user_id)
    if created_by_id: query = query.filter(models.Ticket.created_by_id == created_by_id)
    if follower_id: query = query.filter(models.Ticket.followers.any(models.User.id == follower_id))
    if unassigned_only: query = query.filter(models.Ticket.assigned_user_id == None)
    
    # Filtros de data
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(models.Ticket.created_at >= start_dt)
        except ValueError: pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(models.Ticket.created_at <= end_dt)
        except ValueError: pass
        
    # Exclusão de tickets finalizados/cancelados
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
    """Lista chamados paginados com filtros."""
    query = _get_tickets_base_query(db, **kwargs)
    return query.order_by(models.Ticket.created_at.desc()).offset(skip).limit(limit).all()

def get_tickets_count(db: Session, **kwargs):
    """Conta total de chamados para paginação."""
    kwargs.pop('skip', None)
    kwargs.pop('limit', None)
    query = _get_tickets_base_query(db, **kwargs)
    return query.count()

def create_ticket(db: Session, ticket: schemas.TicketCreate, created_by_id: int = None):
    """Abre um novo chamado com categoria e status padrões se não informados."""
    ticket_data = ticket.dict()
    if not ticket_data.get("category_id"):
        default_cat = get_or_create_default_category(db)
        ticket_data["category_id"] = default_cat.id
    
    if not ticket_data.get("status_id"):
        default_status = get_or_create_default_status(db)
        ticket_data["status_id"] = default_status.id
        ticket_data["status"] = default_status.name

    # Normalização de rótulos de prioridade
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
    if created_by_id:
        db_ticket.created_by_id = created_by_id

    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    
    # Indexação no RAG (Busca na Base de Conhecimento)
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
    """Abre um chamado simplificado, criando o cliente automaticamente se necessário."""
    client = db.query(models.Client).filter(models.Client.name == ticket.client_name).first()
    if not client:
        client = models.Client(name=ticket.client_name, email=f"{ticket.client_name.lower().replace(' ', '.')}@local.com")
        db.add(client)
        db.commit()
        db.refresh(client)
    
    ticket_data = ticket.dict()
    ticket_data.pop("client_name")
    ticket_data.pop("category", None)
    
    if not ticket_data.get("category_id"):
        default_cat = get_or_create_default_category(db)
        ticket_data["category_id"] = default_cat.id
    
    default_status = get_or_create_default_status(db)
    
    assigned_user = ticket_data.pop("assigned_user_id", None)
    created_by = ticket_data.pop("created_by_id", 1) 

    db_ticket = models.Ticket(
        **ticket_data, 
        client_id=client.id, 
        status_id=default_status.id, 
        status=default_status.name, 
        created_by_id=created_by,
        assigned_user_id=assigned_user
    )
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

def get_ticket(db: Session, ticket_id: int):
    """Busca um chamado completo pelo ID, carregando relacionamentos essenciais."""
    return db.query(models.Ticket).options(
        joinedload(models.Ticket.client),
        joinedload(models.Ticket.assigned_user),
        joinedload(models.Ticket.status_obj),
        joinedload(models.Ticket.followers)
    ).filter(models.Ticket.id == ticket_id).first()

def get_followed_tickets(db: Session, user_id: int):
    """Retorna a lista de chamados que um usuário específico está acompanhando."""
    return db.query(models.Ticket).filter(models.Ticket.followers.any(id=user_id)).all()

def create_ticket_message(db: Session, message: schemas.TicketMessageCreate, ticket_id: int):
    """Adiciona uma nova mensagem (interação) a um chamado."""
    db_message = models.TicketMessage(**message.dict(), ticket_id=ticket_id)
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

def create_ticket_history(db: Session, history: schemas.TicketHistoryCreate):
    """Registra um evento no histórico de auditoria do chamado."""
    db_history = models.TicketHistory(**history.dict())
    db.add(db_history)
    db.commit()
    db.refresh(db_history)
    return db_history

def get_ticket_history(db: Session, ticket_id: int):
    """Busca o histórico de eventos de um chamado, do mais recente para o mais antigo."""
    return db.query(models.TicketHistory).filter(models.TicketHistory.ticket_id == ticket_id).order_by(models.TicketHistory.created_at.desc()).all()

def get_ticket_history_list(db: Session, ticket_id: int):
    """Alias para get_ticket_history."""
    return db.query(models.TicketHistory).filter(models.TicketHistory.ticket_id == ticket_id).order_by(models.TicketHistory.created_at.desc()).all()

def update_ticket(db: Session, ticket_id: int, ticket_update: schemas.TicketUpdate, user_id: Optional[int] = None):
    """
    Atualiza os dados de um chamado e gera registros automáticos no histórico.
    Também dispara notificações para os envolvidos dependendo da alteração.
    """
    db_ticket = get_ticket(db, ticket_id)
    if not db_ticket:
        return None
        
    update_data = ticket_update.dict(exclude_unset=True)

    # Normaliza prioridade no update
    if "priority" in update_data and update_data["priority"]:
        priority_map = {
            "low": "Baixa", "baixa": "Baixa",
            "medium": "Média", "media": "Média", "média": "Média",
            "high": "Alta", "alta": "Alta",
            "critical": "Crítica", "critica": "Crítica", "crítica": "Crítica"
        }
        p_lower = update_data["priority"].lower().strip()
        update_data["priority"] = priority_map.get(p_lower, update_data["priority"])
        
    for field, new_value in update_data.items():
        if field == "status" and "status_id" in update_data:
            continue
            
        old_value = getattr(db_ticket, field)
        if old_value != new_value:
            # Define o tipo de evento para o histórico baseado no campo alterado
            event_type = "status_change" if field == "status_id" else ("category_change" if field == "category_id" else ("sector_change" if field == "sector_id" else ("assigned_user_change" if field == "assigned_user_id" else f"{field}_change")))
            desc = f"Alterou {field} de '{old_value}' para '{new_value}'"
            
            # Formata descrições amigáveis para o histórico
            if field == "description":
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
                
                # Notifica o novo responsável
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
                p_labels = {"low": "Baixa", "medium": "Média", "high": "Alta", "critical": "Crítica"}
                old_label = p_labels.get(str(old_value).lower(), old_value)
                new_label = p_labels.get(str(new_value).lower(), new_value)
                desc = f"Alterou prioridade de **{old_label}** para **{new_label}**"
            elif field == "category_id":
                old_cat = db.query(models.Category).filter(models.Category.id == old_value).first()
                new_cat = db.query(models.Category).filter(models.Category.id == new_value).first()
                old_label = old_cat.name if old_cat else "Sem Categoria"
                new_label = new_cat.name if new_cat else "Sem Categoria"
                desc = f"Alterou categoria de **{old_label}** para **{new_label}**"

            # Grava a alteração no histórico
            create_ticket_history(db, schemas.TicketHistoryCreate(
                ticket_id=ticket_id,
                user_id=user_id,
                event_type=event_type,
                description=desc
            ))
        
        # Notifica o responsável atual sobre mudanças de status ou prioridade
        if field in ["status_id", "priority"] and db_ticket.assigned_user_id and db_ticket.assigned_user_id != user_id:
                create_notification(db, schemas.NotificationCreate(
                user_id=db_ticket.assigned_user_id,
                title=f"Ticket Atualizado: #{ticket_id}",
                message=f"O ticket '{db_ticket.title}' teve atualizações em {field}.",
                type="info",
                link=f"/tickets/{ticket_id}"
            ))

    # Atualiza o nome legacy do status se o ID do status mudou
    if "status_id" in update_data:
        db_status = db.query(models.Status).filter(models.Status.id == update_data["status_id"]).first()
        if db_status:
            update_data["status"] = db_status.name

    for key, value in update_data.items():
        setattr(db_ticket, key, value)
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

# ==============================================================================
# GESTÃO DE SETORES (SECTORS)
# ==============================================================================

def get_sector(db: Session, sector_id: int):
    """Busca um setor pelo ID."""
    return db.query(models.Sector).filter(models.Sector.id == sector_id).first()

def get_sectors(db: Session, skip: int = 0, limit: int = 100):
    """Lista todos os setores paginados."""
    return db.query(models.Sector).offset(skip).limit(limit).all()

def create_sector(db: Session, sector: schemas.SectorCreate):
    """Cadastra um novo setor de atendimento."""
    db_sector = models.Sector(**sector.dict())
    db.add(db_sector)
    db.commit()
    db.refresh(db_sector)
    return db_sector

def update_sector(db: Session, sector_id: int, sector_update: schemas.SectorUpdate):
    """Atualiza os dados de um setor existente."""
    db_sector = get_sector(db, sector_id)
    if db_sector:
        update_data = sector_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_sector, key, value)
        db.commit()
        db.refresh(db_sector)
    return db_sector

def delete_sector(db: Session, sector_id: int):
    """
    Remove um setor se não houver vínculos impeditivos (tickets ou usuários).
    """
    db_sector = get_sector(db, sector_id)
    if not db_sector:
        return False, "Setor não encontrado"
    if db_sector.tickets:
        return False, "Impossível excluir: Existem tickets vinculados a este setor."
    users_count = db.query(models.User).filter(models.User.sectors.any(id=sector_id)).count()
    if users_count > 0:
        return False, f"Impossível excluir: Existem {users_count} usuários vinculados a este setor."
    db.delete(db_sector)
    db.commit()
    return True, "Setor excluído com sucesso"

def add_user_to_sector(db: Session, user_id: int, sector_id: int):
    """Vincula um usuário a um setor específico."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    sector = db.query(models.Sector).filter(models.Sector.id == sector_id).first()
    if user and sector:
        if sector not in user.sectors:
            user.sectors.append(sector)
            db.commit()
            return True
    return False

# ==============================================================================
# SISTEMA DE ACOMPANHAMENTO (FOLLOWERS)
# ==============================================================================

def add_ticket_follower(db: Session, ticket_id: int, user_id: int, actor_id: Optional[int] = None):
    """Adiciona um usuário como acompanhante de um chamado."""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if ticket and user:
        if user not in ticket.followers:
            ticket.followers.append(user)
            description = "Começou a acompanhar este ticket."
            if actor_id and actor_id != user_id:
                actor = db.query(models.User).filter(models.User.id == actor_id).first()
                actor_name = actor.full_name or actor.username if actor else "Um usuário"
                user_name = user.full_name or user.username
                description = f"O usuário {actor_name} adicionou {user_name} como acompanhante."
            
            # Registra no histórico do ticket
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
    """Remove um usuário da lista de acompanhantes de um chamado."""
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if ticket and user:
        if user in ticket.followers:
            ticket.followers.remove(user)
            description = "Deixou de acompanhar este ticket."
            if actor_id and actor_id != user_id:
                actor = db.query(models.User).filter(models.User.id == actor_id).first()
                actor_name = actor.full_name or actor.username if actor else "Um usuário"
                user_name = user.full_name or user.username
                description = f"O usuário {actor_name} removeu {user_name} dos acompanhantes."
            
            # Registra a remoção no histórico
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
    """Exclui permanentemente um chamado (cuidado: apaga histórico e mensagens vinculadas)."""
    db_ticket = get_ticket(db, ticket_id)
    if db_ticket:
        db.delete(db_ticket)
        db.commit()
        return True
    return False

# ==============================================================================
# BASE DE CONHECIMENTO (KNOWLEDGE BASE)
# ==============================================================================

def get_knowledge_documents(db: Session, skip: int = 0, limit: int = 100):
    """Lista todos os documentos da base de conhecimento com paginação."""
    return db.query(models.KnowledgeDocument).offset(skip).limit(limit).all()

def create_knowledge_document(db: Session, doc: schemas.KnowledgeDocumentCreate):
    """Cria um novo artigo ou tutorial na base de conhecimento."""
    db_doc = models.KnowledgeDocument(**doc.dict())
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

def search_knowledge_documents(db: Session, query: str, limit: int = 3):
    """
    Realiza busca textual na base de conhecimento.
    Tenta correspondência exata primeiro e depois busca por palavras-chave relevantes.
    """
    exact_match = db.query(models.KnowledgeDocument).filter(
        (models.KnowledgeDocument.title.ilike(f"%{query}%")) | 
        (models.KnowledgeDocument.content.ilike(f"%{query}%"))
    ).limit(limit).all()
    
    if exact_match:
        return exact_match
        
    # Busca por palavras com mais de 3 caracteres
    words = [w.lower() for w in query.split() if len(w) > 3]
    if not words:
        # Fallback para buscas genéricas
        if any(x in query.lower() for x in ["base", "documento", "lista", "manual", "tutorial"]):
            return db.query(models.KnowledgeDocument).order_by(models.KnowledgeDocument.created_at.desc()).limit(limit).all()
        return []
        
    from sqlalchemy import or_
    filters = []
    for word in words:
        filters.append(models.KnowledgeDocument.title.ilike(f"%{word}%"))
        filters.append(models.KnowledgeDocument.content.ilike(f"%{word}%"))
    results = db.query(models.KnowledgeDocument).filter(or_(*filters)).limit(limit).all()
    
    # Se não achar nada, retorna os mais recentes se a query sugerir busca geral
    if not results and any(x in query.lower() for x in ["base", "documento", "manual", "tem", "unico"]):
        return db.query(models.KnowledgeDocument).order_by(models.KnowledgeDocument.created_at.desc()).limit(limit).all()
    return results

def get_knowledge_document(db: Session, doc_id: int):
    """Busca um documento específico pelo ID."""
    return db.query(models.KnowledgeDocument).filter(models.KnowledgeDocument.id == doc_id).first()

def update_knowledge_document(db: Session, doc_id: int, doc_update: schemas.KnowledgeDocumentCreate):
    """Atualiza o conteúdo de um artigo existente."""
    db_doc = get_knowledge_document(db, doc_id)
    if db_doc:
        db_doc.title = doc_update.title
        db_doc.content = doc_update.content
        db_doc.category = doc_update.category
        db.commit()
        db.refresh(db_doc)
    return db_doc

def search_tickets(db: Session, query: str, limit: int = 3):
    """Busca textual simplificada em chamados antigos para auxílio na resolução."""
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
    """Remove um documento da base de conhecimento."""
    db_doc = get_knowledge_document(db, doc_id)
    if db_doc:
        db.delete(db_doc)
        db.commit()
        return True
    return False

# ==============================================================================
# GESTÃO DE PERFIS DE ACESSO (PROFILES)
# ==============================================================================

def get_profiles(db: Session, skip: int = 0, limit: int = 100):
    """Lista todos os perfis de permissão."""
    return db.query(models.Profile).offset(skip).limit(limit).all()

def get_profile(db: Session, profile_id: int):
    """Busca um perfil específico pelo ID."""
    return db.query(models.Profile).filter(models.Profile.id == profile_id).first()

def create_profile(db: Session, profile: schemas.ProfileCreate):
    """Cadastra um novo perfil de acesso com seu conjunto de permissões (JSON)."""
    db_profile = models.Profile(**profile.dict())
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile

def update_profile(db: Session, profile_id: int, profile_update: schemas.ProfileCreate):
    """Atualiza o nome, descrição ou permissões de um perfil."""
    db_profile = get_profile(db, profile_id)
    if db_profile:
        db_profile.name = profile_update.name
        db_profile.description = profile_update.description
        db_profile.permissions = profile_update.permissions
        db.commit()
        db.refresh(db_profile)
    return db_profile

def delete_profile(db: Session, profile_id: int):
    """Exclui um perfil, desde que nenhum usuário esteja vinculado a ele."""
    db_profile = get_profile(db, profile_id)
    if db_profile:
        if db_profile.users:
            return False
        db.delete(db_profile)
        db.commit()
        return True
    return False

# ==============================================================================
# GESTÃO DE USUÁRIOS (USERS)
# ==============================================================================

def get_user(db: Session, user_id: int):
    """Busca um usuário pelo ID, incluindo perfil e setores vinculados."""
    return db.query(models.User).options(joinedload(models.User.profile), joinedload(models.User.sectors)).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    """Busca um usuário pelo nome de login (username)."""
    return db.query(models.User).options(joinedload(models.User.profile), joinedload(models.User.sectors)).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    """Busca um usuário pelo e-mail cadastrado."""
    return db.query(models.User).options(joinedload(models.User.profile), joinedload(models.User.sectors)).filter(models.User.email == email).first()

def get_users_short(db: Session, sector_id: Optional[int] = None):
    """Retorna lista simplificada de usuários ativos (ID e Nome) para dropdowns."""
    query = db.query(models.User.id, models.User.full_name, models.User.username).filter(models.User.is_active == True)
    if sector_id:
        query = query.filter(models.User.sectors.any(id=sector_id))
    return query.all()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    """Lista todos os usuários cadastrados com seus detalhes paginados."""
    return db.query(models.User).options(joinedload(models.User.profile), joinedload(models.User.sectors)).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, hashed_password: str):
    """Cria um novo usuário no sistema com senha já hasheada e setores vinculados."""
    db_user = models.User(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password,
        role=user.role,
        profile_id=user.profile_id
    )
    if user.sector_ids:
        # Busca os setores pelos IDs informados para criar o relacionamento
        sectors = db.query(models.Sector).filter(models.Sector.id.in_(user.sector_ids)).all()
        db_user.sectors = sectors
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate, hashed_password: Optional[str] = None):
    """Atualiza dados do usuário, permitindo troca de senha e reatribuição de setores."""
    db_user = get_user(db, user_id)
    if db_user:
        update_data = user_update.dict(exclude_unset=True)
        if hashed_password:
            db_user.hashed_password = hashed_password
            update_data.pop("password", None)
            
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
    """Remove permanentemente um usuário do banco."""
    db_user = get_user(db, user_id)
    if db_user:
        db.delete(db_user)
        db.commit()
        return True
    return False

def reset_entities(db: Session, entities: List[str], current_user_id: int):
    """
    Limpa seletivamente entidades do sistema para fins de manutenção ou reinício.
    CUIDADO: Esta operação é destrutiva e irreversível.
    """
    results: Dict[str, Any] = {"total": 0, "deleted": [], "errors": []}
    try:
        # Remove todos os chamados e dados relacionados
        if "tickets" in entities:
            num_msgs = db.query(models.TicketMessage).delete(synchronize_session=False)
            num_logs = db.query(models.TicketTimeLog).delete(synchronize_session=False)
            num_hist = db.query(models.TicketHistory).delete(synchronize_session=False)
            num_tickets = db.query(models.Ticket).delete(synchronize_session=False)
            results["deleted"].append("tickets")
            results["total"] += (num_msgs + num_tickets + num_logs + num_hist)
            
        # Remove clientes (desvincula de tickets se estes não forem removidos)
        if "clients" in entities:
            if "tickets" not in entities:
                db.query(models.Ticket).update({models.Ticket.client_id: None})
            num_clients = db.query(models.Client).delete(synchronize_session=False)
            results["deleted"].append("clients")
            results["total"] += num_clients
            
        # Limpa base de conhecimento
        if "knowledge" in entities:
            num_kb = db.query(models.KnowledgeDocument).delete(synchronize_session=False)
            results["deleted"].append("knowledge")
            results["total"] += num_kb
            
        # Reinicia configurações de categorias e status
        if "settings" in entities:
            if "tickets" not in entities:
                db.query(models.Ticket).update({models.Ticket.category_id: None, models.Ticket.status_id: None})
            num_cats = db.query(models.Category).delete(synchronize_session=False)
            num_status = db.query(models.Status).delete(synchronize_session=False)
            results["deleted"].append("settings")
            results["total"] += (num_cats + num_status)
            
        # Remove usuários (preservando o ROOT e o usuário atual)
        if "users" in entities:
            target_users_query = db.query(models.User).filter(models.User.id != current_user_id, models.User.username != "admin")
            target_ids = [u.id for u in target_users_query.all()]
            if target_ids:
                # Limpa todas as referências dos usuários antes de deletar
                db.execute(models.user_sectors.delete().where(models.user_sectors.c.user_id.in_(target_ids)))
                db.query(models.Notification).filter((models.Notification.user_id.in_(target_ids)) | (models.Notification.created_by_user_id.in_(target_ids))).delete(synchronize_session=False)
                db.query(models.TicketTimeLog).filter(models.TicketTimeLog.user_id.in_(target_ids)).delete(synchronize_session=False)
                db.query(models.TicketHistory).filter(models.TicketHistory.user_id.in_(target_ids)).delete(synchronize_session=False)
                db.query(models.Ticket).filter(models.Ticket.assigned_user_id.in_(target_ids)).update({models.Ticket.assigned_user_id: None}, synchronize_session=False)
                db.query(models.Ticket).filter(models.Ticket.created_by_id.in_(target_ids)).update({models.Ticket.created_by_id: None}, synchronize_session=False)
                num_users = target_users_query.delete(synchronize_session=False)
                results["deleted"].append("users")
                results["total"] += num_users
        db.commit()
    except Exception as e:
        db.rollback()
        results["errors"].append(str(e))
    return results

# ==============================================================================
# CONTROLE DE TEMPO (TIMERS)
# ==============================================================================

def get_active_timers(db: Session, user_id: int):
    """Retorna cronômetros ativos para um usuário específico."""
    return db.query(models.TicketTimeLog).options(joinedload(models.TicketTimeLog.ticket).joinedload(models.Ticket.client)).filter(models.TicketTimeLog.user_id == user_id, models.TicketTimeLog.is_active == True).all()

def start_ticket_timer(db: Session, ticket_id: int, user_id: int):
    """
    Inicia a contagem de tempo em um chamado. 
    Interrompe automaticamente qualquer cronômetro ativo do mesmo usuário.
    """
    active_timers = get_active_timers(db, user_id)
    for timer in active_timers:
        stop_ticket_timer(db, timer.ticket_id, user_id)
        
    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not db_ticket:
        return None
        
    db_log = models.TicketTimeLog(ticket_id=ticket_id, user_id=user_id, status_id=db_ticket.status_id, start_time=datetime.utcnow(), is_active=True)
    db.add(db_log)
    db.commit()
    return db.query(models.TicketTimeLog).options(joinedload(models.TicketTimeLog.ticket).joinedload(models.Ticket.client)).filter(models.TicketTimeLog.id == db_log.id).first()

def stop_ticket_timer(db: Session, ticket_id: int, user_id: int):
    """Finaliza a contagem de tempo e calcula a duração total do log em segundos."""
    db_log = db.query(models.TicketTimeLog).filter(models.TicketTimeLog.ticket_id == ticket_id, models.TicketTimeLog.user_id == user_id, models.TicketTimeLog.is_active == True).first()
    if db_log:
        db_log.end_time = datetime.utcnow()
        db_log.is_active = False
        delta = db_log.end_time - db_log.start_time
        db_log.duration = int(delta.total_seconds())
        db.commit()
        db.refresh(db_log)
        return db.query(models.TicketTimeLog).options(joinedload(models.TicketTimeLog.ticket).joinedload(models.Ticket.client)).filter(models.TicketTimeLog.id == db_log.id).first()
    return None

def get_ticket_total_duration(db: Session, ticket_id: int):
    """Calcula a soma de todos os logs de tempo finalizados para um chamado."""
    results = db.query(func.sum(models.TicketTimeLog.duration)).filter(models.TicketTimeLog.ticket_id == ticket_id).scalar()
    return results or 0

def create_notification(db: Session, notification: schemas.NotificationCreate):
    """Gera uma nova notificação simples no sistema."""
    db_notification = models.Notification(**notification.dict())
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

def get_notifications(db: Session, user_id: int, skip: int = 0, limit: int = 50):
    """Lista notificações de um usuário com detalhes do remetente, paginadas."""
    notifications = db.query(models.Notification).filter(models.Notification.user_id == user_id).order_by(models.Notification.created_at.desc()).offset(skip).limit(limit).all()
    result = []
    for notif in notifications:
        result.append({
            "id": notif.id, "user_id": notif.user_id, "created_by_user_id": notif.created_by_user_id,
            "created_by_username": notif.created_by.username if notif.created_by else None,
            "title": notif.title, "message": notif.message, "type": notif.type,
            "read": notif.read, "link": notif.link, "created_at": notif.created_at
        })
    return result

def get_unread_notification_count(db: Session, user_id: int):
    """Conta quantas notificações não lidas o usuário possui."""
    return db.query(models.Notification).filter(models.Notification.user_id == user_id, models.Notification.read == False).count()

def mark_notification_as_read(db: Session, notification_id: int, user_id: int):
    """Marca uma notificação específica como lida."""
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == user_id).first()
    if notification:
        notification.read = True
        db.commit()
        db.refresh(notification)
    return notification

def mark_notification_as_unread(db: Session, notification_id: int, user_id: int):
    """Reverte o status de uma notificação para não lida."""
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == user_id).first()
    if notification:
        notification.read = False
        db.commit()
        db.refresh(notification)
    return notification

def delete_notification(db: Session, notification_id: int, user_id: int):
    """Exclui permanentemente uma notificação."""
    notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == user_id).first()
    if notification:
        db.delete(notification)
        db.commit()
        return True
    return False

def mark_all_notifications_as_read(db: Session, user_id: int):
    """Marca todas as notificações pendentes do usuário como lidas."""
    db.query(models.Notification).filter(models.Notification.user_id == user_id, models.Notification.read == False).update({models.Notification.read: True}, synchronize_session=False)
    db.commit()
    return True

# ==============================================================================
# GESTÃO DE ITENS DO CATÁLOGO (CATALOG ITEMS)
# ==============================================================================

def get_catalog_items(db: Session, skip: int = 0, limit: int = 100, active_only: bool = False):
    """Lista itens do catálogo com opção de filtrar apenas ativos."""
    query = db.query(models.CatalogItem)
    if active_only:
        query = query.filter(models.CatalogItem.is_active == True)
    return query.order_by(models.CatalogItem.name.asc()).offset(skip).limit(limit).all()

def create_catalog_item(db: Session, item: schemas.CatalogItemCreate):
    """Cria um novo item no catálogo de serviços/produtos."""
    db_item = models.CatalogItem(**item.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

def update_catalog_item(db: Session, item_id: int, item_update: schemas.CatalogItemUpdate):
    """Atualiza dados de um item do catálogo."""
    db_item = db.query(models.CatalogItem).filter(models.CatalogItem.id == item_id).first()
    if db_item:
        update_data = item_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_item, key, value)
        db.commit()
        db.refresh(db_item)
    return db_item

def delete_catalog_item(db: Session, item_id: int):
    """Exclui um item do catálogo."""
    db_item = db.query(models.CatalogItem).filter(models.CatalogItem.id == item_id).first()
    if not db_item:
        return False
    db.delete(db_item)
    db.commit()
    return True

def send_user_notification(db: Session, sender_id: int, data: schemas.NotificationSend):
    """Envia uma notificação para múltiplos destinatários (usuários ou setores)."""
    target_user_ids = set()
    if data.recipient_ids: target_user_ids.update(data.recipient_ids)
    if data.recipient_user_id: target_user_ids.add(data.recipient_user_id)
    if data.sector_ids:
        # Notifica todos os usuários ativos dos setores selecionados
        sector_users = db.query(models.User).join(models.User.sectors).filter(models.Sector.id.in_(data.sector_ids), models.User.is_active == True).all()
        for user in sector_users: target_user_ids.add(user.id)
        
    if not target_user_ids: return None
    
    link = f"/tickets/{data.ticket_id}" if data.ticket_id else None
    notifications_created = []
    for u_id in target_user_ids:
        db_notification = models.Notification(user_id=u_id, created_by_user_id=sender_id, title=data.title, message=data.message, type=data.type, link=link, read=False)
        db.add(db_notification)
        notifications_created.append(db_notification)
    db.commit()
    return notifications_created[0] if notifications_created else None

def get_system_settings(db: Session):
    """
    Busca as configurações gerais do sistema (marca, cores, favicon).
    Cria um registro padrão se a tabela estiver vazia.
    """
    try:
        settings = db.query(models.SystemSettings).first()
        if not settings:
            settings = models.SystemSettings(system_name="TicketFlow")
            db.add(settings)
            db.commit()
            db.refresh(settings)
        return settings
    except Exception as e:
        print(f"⚠️ Erro ao buscar configurações do sistema no banco: {e}")
        # Fallback seguro para evitar que a aplicação pare se o banco falhar
        from datetime import datetime
        return {
            "id": 0,
            "system_name": "TicketFlow",
            "logo_url_light": None,
            "logo_url_dark": None,
            "custom_colors": None,
            "favicon_url": None,
            "updated_at": datetime.utcnow()
        }

def update_system_settings(db: Session, update: schemas.SystemSettingsUpdate):
    """
    Atualiza a identidade visual e nome do sistema. 
    Trata o caso onde o banco de dados pode retornar um dicionário de fallback em caso de erro.
    """
    settings = get_system_settings(db)
    
    # Se settings for um dicionário (fallback de erro), não tentamos atualizar o objeto SQLAlchemy
    if isinstance(settings, dict):
        return settings
        
    if update.system_name is not None: settings.system_name = update.system_name
    if update.logo_url_light is not None: settings.logo_url_light = update.logo_url_light
    if update.logo_url_dark is not None: settings.logo_url_dark = update.logo_url_dark
    if update.custom_colors is not None: settings.custom_colors = update.custom_colors
    if update.favicon_url is not None: settings.favicon_url = update.favicon_url
    
    db.commit()
    db.refresh(settings)
    return settings

def get_ticket_timer_stats(db: Session, ticket_id: int):
    """
    Gera estatísticas consolidadas de tempo gasto em um chamado, 
    agrupadas por status e detalhadas por usuário.
    """
    logs = db.query(models.TicketTimeLog).filter(models.TicketTimeLog.ticket_id == ticket_id, models.TicketTimeLog.is_active == False).all()
    stats_map: Dict[int, Any] = {}
    
    for log in logs:
        # Extrai informações do status ou define padrão se não houver status vinculado
        status_name, status_color, status_id = (log.status.name, log.status.color, log.status.id) if log.status else ("Sem Status", "#9ca3af", 0)
        
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
        
        # Agrupa tempo por usuário dentro de cada status
        user_id, user_name = log.user_id, (log.user.full_name or log.user.username)
        if user_id not in group["users"]:
            group["users"][user_id] = {"user_id": user_id, "full_name": user_name, "duration": 0}
        group["users"][user_id]["duration"] += log.duration
        
    result = []
    for s_data in stats_map.values():
        # Converte o dicionário de usuários em lista para facilitar o consumo no frontend
        s_data["users"] = list(s_data["users"].values())
        result.append(s_data)
        
    return result

# ==============================================================================
# RELATÓRIOS CUSTOMIZADOS (CUSTOM REPORTS)
# ==============================================================================

def get_custom_reports(db: Session, skip: int = 0, limit: int = 100):
    """Lista todos os relatórios personalizados salvos."""
    return db.query(models.CustomReport).offset(skip).limit(limit).all()

def get_custom_report(db: Session, report_id: int):
    """Busca um relatório personalizado pelo ID."""
    return db.query(models.CustomReport).filter(models.CustomReport.id == report_id).first()

def create_custom_report(db: Session, report: schemas.CustomReportCreate, user_id: int):
    """
    Cria um novo relatório personalizado, convertendo as variáveis para JSON.
    """
    # Converte os schemas de variáveis para dicionários puros para o campo JSON
    variables_data = [v.dict() for v in report.variables]
    
    db_report = models.CustomReport(
        title=report.title,
        description=report.description,
        query=report.query,
        variables=variables_data,
        created_by_id=user_id
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

def update_custom_report(db: Session, report_id: int, report_update: schemas.CustomReportUpdate):
    """Atualiza dados e variáveis de um relatório personalizado."""
    db_report = get_custom_report(db, report_id)
    if not db_report:
        return None
    
    update_data = report_update.dict(exclude_unset=True)
    if 'variables' in update_data:
        update_data['variables'] = [v.dict() for v in update_data['variables']]
        
    for key, value in update_data.items():
        setattr(db_report, key, value)
    
    db.commit()
    db.refresh(db_report)
    return db_report

def delete_custom_report(db: Session, report_id: int):
    """Exclui um relatório personalizado do banco."""
    db_report = get_custom_report(db, report_id)
    if db_report:
        db.delete(db_report)
        db.commit()
        return True
    return False

def validate_sql_query(query: str):
    """
    Valida se a query contém comandos destrutivos ou não-autorizados.
    Lança exceção se detectar SQL perigoso.
    """
    forbidden = ["DROP", "DELETE", "TRUNCATE", "UPDATE", "INSERT", "ALTER", "CREATE", "GRANT", "REVOKE"]
    query_upper = query.upper()
    for cmd in forbidden:
        if cmd in query_upper:
            # Verifica se é uma palavra solta para evitar falso-positivo em nomes de colunas
            import re
            if re.search(rf"\b{cmd}\b", query_upper):
                raise Exception(f"Comando SQL não permitido para relatórios: {cmd}")
    return True

def execute_custom_report(db: Session, query: str, variables: Dict[str, Any]):
    """
    Executa uma query SQL customizada de forma segura usando parâmetros nomeados.
    Retorna os resultados como uma lista de dicionários.
    """
    try:
        # Validação de segurança básica contra injeção e comandos DDL/DML
        validate_sql_query(query)
        
        # Prepara a query SQL usando a sintaxe de bind parameters (:var_name)
        sql = text(query)
        
        # Executa a query com os parâmetros fornecidos para segurança máxima
        result = db.execute(sql, variables)
        
        # Converte o resultado em uma lista de dicionários (mapeia nomes de colunas aos valores)
        return [dict(zip(result.keys(), row)) for row in result.fetchall()]
    except Exception as e:
        raise Exception(f"Erro ao executar query: {str(e)}")
