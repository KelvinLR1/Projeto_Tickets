from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import shutil
import uuid
import zipfile
import io
import asyncio
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import Request, Response

# Importando módulos locais (sem ponto inicial se rodar como script, 
# mas mantendo estrutura de pacote se rodar com uvicorn main:app)
try:
    from . import models, database, schemas, crud, rag, auth
    from .database import engine, get_db
except ImportError:
    import models, database, schemas, crud, rag, auth
    from database import engine, get_db

from fastapi.security import OAuth2PasswordRequestForm

models.Base.metadata.create_all(bind=engine)

def seed_db():
    db = database.SessionLocal()
    try:
        # 1. Garantir usuário ROOT (admin)
        # Tenta buscar por username ou por email de sistema
        admin_user = db.query(models.User).filter(
            (models.User.username == "admin") | (models.User.email == "admin@sistema.com")
        ).first()

        if not admin_user:
            print("Nenhum usuário ROOT encontrado. Criando admin padrão...")
            admin_schema = schemas.UserCreate(
                username="admin",
                email="admin@sistema.com",
                full_name="Administrador Padrão",
                password="admin",
                role="ROOT"
            )
            hashed_password = auth.get_password_hash("admin")
            crud.create_user(db, admin_schema, hashed_password)
            print("Usuário 'admin' (ROOT) criado com sucesso!")
        else:
            # Garante que as credenciais e papel estão corretos
            updated = False
            if admin_user.username != "admin":
                admin_user.username = "admin"
                updated = True
            if admin_user.role != "ROOT":
                admin_user.role = "ROOT"
                updated = True
            
            if updated:
                db.commit()
                print("Usuário admin existente atualizado para papel ROOT.")

        # 2. Garantir categorias e status padrão
        crud.get_or_create_default_category(db)
        crud.get_or_create_default_status(db)
        
    except Exception as e:
        print(f"Erro ao popular banco de dados: {e}")
        db.rollback()
    finally:
        db.close()

app = FastAPI(title="Sistema de Tickets Offline")

@app.on_event("startup")
async def startup_event():
    seed_db()

# Flag global para manutenção durante restauração
IS_RESTORING = False

@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    # Permite o endpoint de restauração mesmo em modo de restauração
    if IS_RESTORING and request.url.path != "/system/restore":
        return Response(
            content='{"detail": "Sistema em manutenção para restauração de backup. Tente novamente em alguns segundos."}',
            status_code=503,
            media_type="application/json"
        )
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Criar pasta de uploads se não existir
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Montar arquivos estáticos
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# get_db is imported from database module

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Sistema de Tickets Offline Rodando"}

# --- Auth Endpoints ---
@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Na verdade, precisamos buscar o usuário primeiro
    db_user = crud.get_user_by_username(db, username=form_data.username)
    if not db_user or not auth.verify_password(form_data.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": db_user.username})
    return {"access_token": access_token, "token_type": "bearer"}

# --- Users Endpoints ---
@app.get("/users/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.get("/users/", response_model=List[schemas.User])
async def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    users = crud.get_users(db, skip=skip, limit=limit)
    return users

@app.get("/users/attendants")
async def read_attendants(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    users = crud.get_users_short(db)
    return [{"id": u[0], "name": u[1] or u[2]} for u in users]

# --- Sectors Endpoints ---
@app.get("/sectors/", response_model=List[schemas.Sector])
async def read_sectors(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_sectors(db, skip=skip, limit=limit)

@app.post("/sectors/", response_model=schemas.Sector)
async def create_sector(sector: schemas.SectorCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.create_sector(db=db, sector=sector)

@app.delete("/sectors/{sector_id}")
async def delete_sector(sector_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    if not crud.delete_sector(db, sector_id):
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    return {"status": "ok"}

@app.post("/users/", response_model=schemas.User)
async def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Nome de usuário já registrado")
    db_email = crud.get_user_by_email(db, email=user.email)
    if db_email:
        raise HTTPException(status_code=400, detail="E-mail já registrado")
    
    hashed_password = auth.get_password_hash(user.password)
    return crud.create_user(db=db, user=user, hashed_password=hashed_password)

@app.put("/users/{user_id}", response_model=schemas.User)
async def update_user_endpoint(user_id: int, user: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    # Apenas ROOT pode editar outros ADMINs ou mudar roles para ROOT
    if user.role == "ROOT" and current_user.role != "ROOT":
         raise HTTPException(status_code=403, detail="Apenas usuários ROOT podem criar outros ROOT")
    
    hashed_password = None
    if user.password:
        hashed_password = auth.get_password_hash(user.password)
    
    db_user = crud.update_user(db=db, user_id=user_id, user_update=user, hashed_password=hashed_password)
    if db_user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return db_user

@app.delete("/users/{user_id}")
async def delete_user_endpoint(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    success = crud.delete_user(db=db, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"message": "Usuário excluído com sucesso"}

# --- Profile Endpoints ---
@app.get("/profiles/", response_model=List[schemas.Profile])
def read_profiles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.get_profiles(db, skip=skip, limit=limit)

@app.post("/profiles/", response_model=schemas.Profile)
def create_profile(profile: schemas.ProfileCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    return crud.create_profile(db=db, profile=profile)

@app.put("/profiles/{profile_id}", response_model=schemas.Profile)
def update_profile(profile_id: int, profile: schemas.ProfileCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    db_profile = crud.update_profile(db=db, profile_id=profile_id, profile_update=profile)
    if not db_profile:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    return db_profile

@app.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    success = crud.delete_profile(db=db, profile_id=profile_id)
    if not success:
        raise HTTPException(status_code=400, detail="Perfil não encontrado ou em uso")
    return {"message": "Perfil excluído com sucesso"}

# --- Clients Endpoints ---
@app.post("/clients/", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db)):
    db_client = crud.get_client_by_email(db, email=client.email)
    if db_client:
        raise HTTPException(status_code=400, detail="E-mail já registrado")
    return crud.create_client(db=db, client=client)

@app.get("/clients/", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    clients = crud.get_clients(db, skip=skip, limit=limit)
    return clients

@app.put("/clients/{client_id}", response_model=schemas.Client)
def update_client(client_id: int, client: schemas.ClientCreate, db: Session = Depends(get_db)):
    db_client = crud.update_client(db=db, client_id=client_id, client_update=client)
    if db_client is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return db_client

@app.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    success = crud.delete_client(db=db, client_id=client_id)
    if not success:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return {"message": "Cliente excluído com sucesso"}

# --- Import Endpoints ---
@app.post("/clients/import/excel", response_model=schemas.ImportResult)
async def import_clients_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    import pandas as pd
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents)) if file.filename.endswith(('.xlsx', '.xls')) else pd.read_csv(io.BytesIO(contents))
        
        # Normalização básica de colunas
        df.columns = [c.lower().strip() for c in df.columns]
        
        # Mapeamento obrigatório: name, email, cpf_cnpj
        required = {'name', 'email', 'cpf_cnpj'}
        if not required.issubset(df.columns):
            raise HTTPException(status_code=400, detail=f"Arquivo deve conter as colunas obrigatórias: {required}")
            
        data = df.to_dict('records')
        return crud.bulk_create_clients(db, data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no processamento: {str(e)}")

@app.post("/clients/import/db", response_model=schemas.ImportResult)
def import_clients_db(config: schemas.DBImportConfigs, db: Session = Depends(get_db)):
    from sqlalchemy import create_engine, text
    import pandas as pd
    
    # Monta string de conexão
    driver_map = {
        "mysql": "mysql+pymysql",
        "postgresql": "postgresql+psycopg2",
        "sqlserver": "mssql+pymssql"
    }
    
    driver = driver_map.get(config.db_type)
    if not driver:
        raise HTTPException(status_code=400, detail="Tipo de banco não suportado")
    
    url = f"{driver}://{config.user}:{config.password}@{config.host}:{config.port}/{config.database}"
    
    try:
        ext_engine = create_engine(url)
        with ext_engine.connect() as conn:
            query = f"SELECT * FROM {config.table}"
            df = pd.read_sql(text(query), conn)
            
        if config.mapping:
            df = df.rename(columns=config.mapping)
            
        # Normalização
        df.columns = [c.lower().strip() for c in df.columns]
        required = {'name', 'email', 'cpf_cnpj'}
        if not required.issubset(df.columns):
            raise HTTPException(status_code=400, detail=f"Colunas obrigatórias {'/'.join(required)} não encontradas após mapeamento.")
            
        data = df.to_dict('records')
        return crud.bulk_create_clients(db, data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na conexão/extração: {str(e)}")

# --- Categories Endpoints ---
@app.get("/categories/", response_model=List[schemas.CategoryWithSub])
def read_categories(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_categories(db)

@app.post("/categories/", response_model=schemas.Category)
def create_category(cat: schemas.CategoryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.create_category(db=db, cat=cat)

@app.put("/categories/{cat_id}", response_model=schemas.Category)
def update_category(cat_id: int, cat: schemas.CategoryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    db_cat = crud.update_category(db=db, cat_id=cat_id, cat_update=cat)
    if not db_cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return db_cat

@app.delete("/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    success, message = crud.delete_category(db=db, cat_id=cat_id)
    if not success:
        if "não encontrada" in message:
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}

# --- Status Endpoints ---
@app.get("/statuses/", response_model=List[schemas.Status])
def read_statuses(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_statuses(db)

@app.post("/statuses/", response_model=schemas.Status)
def create_status(status: schemas.StatusCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.create_status(db=db, status=status)

@app.delete("/statuses/{status_id}")
def delete_status(status_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    success, message = crud.delete_status(db=db, status_id=status_id)
    if not success:
        if message == "Status não encontrado":
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}

@app.put("/statuses/{status_id}", response_model=schemas.Status)
def update_status(status_id: int, status: schemas.StatusBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    db_status = crud.update_status(db=db, status_id=status_id, status_update=status)
    if not db_status:
        raise HTTPException(status_code=404, detail="Status não encontrado")
    return db_status

# --- Tickets Endpoints ---
@app.post("/tickets/", response_model=schemas.Ticket)
def create_ticket(ticket: schemas.TicketCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.create_ticket(db=db, ticket=ticket, created_by_id=current_user.id)

@app.post("/tickets/simple", response_model=schemas.Ticket)
def create_ticket_simple(ticket: schemas.TicketCreateSimple, db: Session = Depends(get_db)):
    return crud.create_ticket_simple(db=db, ticket=ticket)

@app.get("/tickets/", response_model=List[schemas.Ticket])
def read_tickets(skip: int = 0, limit: int = 100, status: str = None, client_id: int = None, unassigned_only: bool = False, db: Session = Depends(get_db)):
    tickets = crud.get_tickets(db, skip=skip, limit=limit, status=status, client_id=client_id, unassigned_only=unassigned_only)
    return tickets

@app.get("/dashboard/stats")
def read_stats(db: Session = Depends(get_db)):
    return {
        "summary": crud.get_detailed_report_stats(db),
        "trends": [] # Placeholder para futuras tendências temporais
    }

@app.get("/reports/summary")
def get_report_summary(db: Session = Depends(get_db)):
    return crud.get_detailed_report_stats(db)

@app.get("/tickets/{ticket_id}", response_model=schemas.Ticket)
def read_ticket(ticket_id: int, db: Session = Depends(get_db)):
    db_ticket = crud.get_ticket(db, ticket_id=ticket_id)
    if db_ticket is None:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    return db_ticket

@app.post("/tickets/{ticket_id}/messages/", response_model=schemas.TicketMessage)
def create_message(ticket_id: int, message: schemas.TicketMessageCreate, db: Session = Depends(get_db)):
    return crud.create_ticket_message(db=db, message=message, ticket_id=ticket_id)

@app.put("/tickets/{ticket_id}", response_model=schemas.Ticket)
def update_ticket(ticket_id: int, ticket: schemas.TicketUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_ticket = crud.update_ticket(db=db, ticket_id=ticket_id, ticket_update=ticket, user_id=current_user.id)
    if db_ticket is None:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    return db_ticket

@app.get("/tickets/{ticket_id}/history", response_model=List[schemas.TicketHistory])
def read_ticket_history(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_ticket_history_list(db, ticket_id=ticket_id)

@app.get("/tickets/export")
def export_tickets(format: str = "csv", db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    import pandas as pd
    from io import BytesIO, StringIO
    
    # Busca TODOS os tickets solicitados para exportação
    tickets = crud.get_tickets(db, limit=5000) # Limite generoso para exportação
    
    data = []
    for t in tickets:
        data.append({
            "ID": t.id,
            "Título": t.title,
            "Status": t.status,
            "Prioridade": t.priority,
            "Cliente": t.client.name if t.client else "N/A",
            "Categoria": t.category.name if t.category else "N/A",
            "Data Criação": t.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "Responsável": t.assigned_user.full_name or t.assigned_user.username if t.assigned_user else "N/A",
        })
    
    df = pd.DataFrame(data)
    filename = f"relatorio_tickets_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    if format == "excel":
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Tickets')
        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"}
        )
    
    elif format == "json":
        output = StringIO()
        df.to_json(output, orient="records", force_ascii=False, indent=2)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename}.json"}
        )
    
    else: # Default CSV
        output = StringIO()
        df.to_csv(output, index=False, encoding='utf-8-sig')
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )

@app.delete("/tickets/{ticket_id}")
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    success = crud.delete_ticket(db=db, ticket_id=ticket_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chamado não encontrado")
    return {"message": "Chamado excluído com sucesso"}

# --- Timer Endpoints ---
@app.post("/tickets/{ticket_id}/timer/start", response_model=schemas.TimeLog)
def start_timer(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.start_ticket_timer(db=db, ticket_id=ticket_id, user_id=current_user.id)

@app.post("/tickets/{ticket_id}/timer/stop", response_model=schemas.TimeLog)
def stop_timer(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_log = crud.stop_ticket_timer(db=db, ticket_id=ticket_id, user_id=current_user.id)
    if not db_log:
        raise HTTPException(status_code=400, detail="Nenhum cronômetro ativo para este chamado/usuário")
    return db_log

@app.get("/tickets/timers/active", response_model=List[schemas.TimeLog])
def get_active_timers(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_active_timers(db=db, user_id=current_user.id)

# --- Knowledge Base Endpoints ---
@app.get("/knowledge/", response_model=List[schemas.KnowledgeDocument])
def read_knowledge(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_knowledge_documents(db, skip=skip, limit=limit)

@app.post("/knowledge/", response_model=schemas.KnowledgeDocument)
def create_knowledge(doc: schemas.KnowledgeDocumentCreate, db: Session = Depends(get_db)):
    db_doc = crud.create_knowledge_document(db=db, doc=doc)
    # Indexa no ChromaDB para busca vetorial
    rag.add_document(
        doc_id=db_doc.id, 
        text=db_doc.content, 
        meta={"title": db_doc.title, "category": db_doc.category}
    )
    return db_doc

@app.put("/knowledge/{doc_id}", response_model=schemas.KnowledgeDocument)
def update_knowledge(doc_id: int, doc: schemas.KnowledgeDocumentCreate, db: Session = Depends(get_db)):
    db_doc = crud.update_knowledge_document(db=db, doc_id=doc_id, doc_update=doc)
    if not db_doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    # Atualiza no ChromaDB
    rag.add_document(
        doc_id=db_doc.id, 
        text=db_doc.content, 
        meta={"title": db_doc.title, "category": db_doc.category}
    )
    return db_doc

@app.delete("/knowledge/{doc_id}")
def delete_knowledge(doc_id: int, db: Session = Depends(get_db)):
    success = crud.delete_knowledge_document(db=db, doc_id=doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return {"message": "Documento excluído com sucesso"}

from concurrent.futures import ThreadPoolExecutor

@app.get("/knowledge/search/")
def search_knowledge(query: str, limit: int = 3):
    rag_results = rag.query_documents(query, n_results=limit)
    
    sql_kb_docs = []
    sql_tickets = []
    
    if not rag_results.get("documents") or len(rag_results.get("documents", [[]])[0]) == 0:
        with database.SessionLocal() as session:
            sql_kb_docs = crud.search_knowledge_documents(session, query=query, limit=limit)
            sql_tickets = crud.search_tickets(session, query=query, limit=limit)

    unified_results = {
        "documents": [[], []], # 0: KB, 1: Tickets
        "metadatas": [[], []],
        "ids": [[], []],
        "source": "parallel_hybrid_search"
    }

    if rag_results.get("documents") and len(rag_results["documents"][0]) > 0:
        for i in range(len(rag_results["documents"][0])):
            doc = rag_results["documents"][0][i]
            meta = rag_results["metadatas"][0][i]
            id_ = rag_results["ids"][0][i]
            
            if meta.get("source") == "ticket":
                unified_results["documents"][1].append(doc)
                unified_results["metadatas"][1].append({"title": f"HISTÓRICO #{id_.replace('ticket_', '')}: {meta.get('title')}", "category": "Ticket (RAG)"})
                unified_results["ids"][1].append(id_)
            else:
                unified_results["documents"][0].append(doc)
                unified_results["metadatas"][0].append({"title": meta.get("title", "Manual"), "category": "Manual (RAG)"})
                unified_results["ids"][0].append(id_)

    if len(unified_results["documents"][0]) < limit:
        for doc in sql_kb_docs:
            if doc.content not in unified_results["documents"][0]:
                unified_results["documents"][0].append(doc.content)
                unified_results["metadatas"][0].append({"title": doc.title, "category": "Manual (SQL)"})
                unified_results["ids"][0].append(f"kb_sql_{doc.id}")

    if len(unified_results["documents"][1]) < limit:
        for t in sql_tickets:
            if t.description not in unified_results["documents"][1]:
                unified_results["documents"][1].append(t.description)
                unified_results["metadatas"][1].append({"title": f"HISTÓRICO #{t.id}: {t.title}", "category": "Ticket (SQL)"})
                unified_results["ids"][1].append(f"ticket_sql_{t.id}")

    return unified_results

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"http://localhost:8080/uploads/{unique_filename}"}

@app.post("/system/reset")
async def reset_database(
    params: schemas.SystemReset, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(auth.get_current_active_root)
):
    if params.confirmation != "DELETAR":
        raise HTTPException(status_code=400, detail="Confirmação de segurança inválida")
    
    stats = crud.reset_entities(db, entities=params.entities, current_user_id=current_user.id)
    
    # Se houve erros na limpeza (ex: FK bloqueada), reporta
    if stats.get("errors"):
        error_msg = "; ".join(stats["errors"])
        raise HTTPException(status_code=500, detail=f"Erro parcial na limpeza: {error_msg}")

    if "knowledge" in params.entities:
        try:
            rag_cleared = rag.clear_knowledge_base()
            stats["rag_cleared"] = rag_cleared
        except Exception as e:
            print(f"[RESET] Erro ao limpar RAG: {e}")
            stats["rag_cleared"] = False
        
    return {
        "message": "Operação de limpeza concluída com sucesso",
        "details": stats
    }

@app.get("/system/backup")
def backup_system(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_root)
):
    zip_buffer = io.BytesIO()
    
    print(f"[BACKUP] Iniciando backup para o usuário {current_user.username}...")
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for ext in ["", "-wal", "-shm"]:
            db_file_path = f"{database.DB_PATH}{ext}"
            if os.path.exists(db_file_path):
                file_size = os.path.getsize(db_file_path)
                print(f"[BACKUP] Zipping {os.path.basename(db_file_path)} ({file_size} bytes)...")
                zip_file.write(db_file_path, arcname=os.path.basename(db_file_path))
            
        if os.path.exists(UPLOAD_DIR):
            for root, dirs, files in os.walk(UPLOAD_DIR):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.join("uploads", os.path.relpath(file_path, UPLOAD_DIR))
                    zip_file.write(file_path, arcname=arcname)
                    
        CHROMA_DIR = os.path.join(database.BASE_DIR, "chroma_db")
        if os.path.exists(CHROMA_DIR):
            for root, dirs, files in os.walk(CHROMA_DIR):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.join("chroma_db", os.path.relpath(file_path, CHROMA_DIR))
                    zip_file.write(file_path, arcname=arcname)

    zip_buffer.seek(0)
    # Pegar o tamanho total do buffer para o cabeçalho Content-Length
    content_size = len(zip_buffer.getvalue())
    
    return StreamingResponse(
        zip_buffer, 
        media_type="application/zip", 
        headers={
            "Content-Disposition": "attachment; filename=backup_ticketflow.zip",
            "Content-Length": str(content_size)
        }
    )

@app.post("/system/restore")
async def restore_system(
    request: Request,
    file: UploadFile = File(...)
):
    global IS_RESTORING
    
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Arquivo deve ser um ZIP")

    # 1. Autenticação Manual (para não segurar a conexão do get_db do Depends)
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Não autenticado")
    
    token = auth_header.split(" ")[1]
    
    # Abrimos uma sessão temporária apenas para validar o usuário
    temp_db = database.SessionLocal()
    try:
        current_user = auth.get_current_user(temp_db, token)
        if current_user.role != "ROOT":
            raise HTTPException(status_code=403, detail="Acesso negado: Apenas ROOT pode restaurar")
    finally:
        temp_db.close() # FECHAMOS IMEDIATAMENTE

    # Pasta temporária para o processo
    temp_restore_path = os.path.join(database.BASE_DIR, f"temp_restore_{uuid.uuid4().hex}.zip")
    bak_dir = os.path.join(database.BASE_DIR, "restore_bak")

    try:
        # Salva o upload no disco para não estourar a RAM com backups gigantes
        print(f"[RESTORE] Salvando arquivo temporário: {temp_restore_path}")
        with open(temp_restore_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        if not zipfile.is_zipfile(temp_restore_path):
            raise HTTPException(status_code=400, detail="Arquivo ZIP inválido")
            
        # Ativa modo manutenção
        IS_RESTORING = True
        print("[RESTORE] Modo manutenção ATIVADO.")
        
        # Aguarda um pouco para conexões pendentes fecharem
        await asyncio.sleep(1.5)
        
        # Fecha todas as conexões do pool
        engine.dispose()
        
        with zipfile.ZipFile(temp_restore_path, 'r') as zip_ref:
            # Limpa pastas (uploads e chroma)
            for target_dir in [UPLOAD_DIR, os.path.join(database.BASE_DIR, "chroma_db")]:
                if os.path.exists(target_dir):
                    shutil.rmtree(target_dir, ignore_errors=True)
                os.makedirs(target_dir, exist_ok=True)
            
            # Trata arquivos de banco (Move em vez de deletar para evitar lock de leitura)
            if os.path.exists(bak_dir):
                shutil.rmtree(bak_dir, ignore_errors=True)
            os.makedirs(bak_dir, exist_ok=True)

            for ext in ["", "-wal", "-shm"]:
                db_file = f"{database.DB_PATH}{ext}"
                if os.path.exists(db_file):
                    try:
                        shutil.move(db_file, os.path.join(bak_dir, os.path.basename(db_file)))
                    except Exception as e:
                        print(f"[RESTORE] Aviso: Não foi possível mover {db_file}: {e}")

            # Extrai o novo backup
            print("[RESTORE] Extraindo arquivos do backup...")
            zip_ref.extractall(database.BASE_DIR)
            
        print("[RESTORE] Backup extraído. Populando banco...")
        seed_db()
        
        # Limpa arquivos temporários
        if os.path.exists(bak_dir):
            shutil.rmtree(bak_dir, ignore_errors=True)
        
        return {"message": "Sistema restaurado com sucesso! O servidor está pronto."}
        
    except Exception as e:
        print(f"[RESTORE] ERRO CRÍTICO: {e}")
        # Tentar desfazer? No SQLite é difícil sem parar o processo. 
        # Idealmente o usuário restauraria outro backup estável.
        raise HTTPException(status_code=500, detail=f"Erro na restauração: {str(e)}")
    finally:
        IS_RESTORING = False
        if os.path.exists(temp_restore_path):
            os.remove(temp_restore_path)
        print("[RESTORE] Modo manutenção DESATIVADO.")


@app.get("/notifications", response_model=List[schemas.Notification])
def read_notifications(
    skip: int = 0, 
    limit: int = 50, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.get_notifications(db, user_id=current_user.id, skip=skip, limit=limit)

@app.get("/notifications/unread-count")
def read_unread_notification_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    count = crud.get_unread_notification_count(db, user_id=current_user.id)
    return {"count": count}

@app.post("/notifications/{notification_id}/read", response_model=schemas.Notification)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    notification = crud.mark_notification_as_read(db, notification_id=notification_id, user_id=current_user.id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    return notification

@app.post("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    crud.mark_all_notifications_as_read(db, user_id=current_user.id)
    return {"message": "Todas as notificações marcadas como lidas"}

@app.post("/notifications/send", response_model=schemas.Notification)
def send_notification(
    notification_data: schemas.NotificationSend,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    notification = crud.send_user_notification(db, sender_id=current_user.id, data=notification_data)
    if not notification:
        raise HTTPException(status_code=404, detail="Usuário destinatário não encontrado")
    return notification

@app.post("/notifications/{notification_id}/unread", response_model=schemas.Notification)
def mark_notification_unread(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    notification = crud.mark_notification_as_unread(db, notification_id=notification_id, user_id=current_user.id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    return notification

@app.delete("/notifications/{notification_id}")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    success = crud.delete_notification(db, notification_id=notification_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    return {"message": "Notificação excluída com sucesso"}

@app.get("/system-settings", response_model=schemas.SystemSettings)
def read_system_settings(db: Session = Depends(get_db)):
    return crud.get_system_settings(db)

@app.patch("/system-settings", response_model=schemas.SystemSettings)
def update_system_settings_endpoint(
    update: schemas.SystemSettingsUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    return crud.update_system_settings(db, update)

@app.post("/system-settings/logo")
async def upload_system_logo(
    theme: str = "light", 
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_admin)
):
    BRANDING_DIR = os.path.join(UPLOAD_DIR, "branding")
    if not os.path.exists(BRANDING_DIR):
        os.makedirs(BRANDING_DIR)
        
    ext = os.path.splitext(file.filename)[1]
    filename = f"logo_{theme}_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(BRANDING_DIR, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    logo_url = f"/uploads/branding/{filename}"
    update_data = {}
    if theme == "dark":
        update_data["logo_url_dark"] = logo_url
    else:
        update_data["logo_url_light"] = logo_url
        
    crud.update_system_settings(db, schemas.SystemSettingsUpdate(**update_data))
    return {"logo_url": logo_url, "theme": theme}
