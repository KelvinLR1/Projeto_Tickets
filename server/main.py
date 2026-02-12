from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import shutil
import uuid
import zipfile
import io
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Optional

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
        # Verificar se existem usuários
        admin_user = crud.get_user_by_username(db, username="admin")
        if not admin_user:
            print("Nenhum usuário encontrado. Criando usuário admin padrão...")
            admin_schema = schemas.UserCreate(
                username="admin",
                email="admin@sistema.com",
                full_name="Administrador Padrão",
                password="admin",
                role="ADMIN"
            )
            hashed_password = auth.get_password_hash("admin")
            crud.create_user(db, admin_schema, hashed_password)
            print("Usuário 'admin' com senha 'admin' criado com sucesso!")
        
        # Garantir categorias e status padrão se necessário
        crud.get_or_create_default_category(db)
        crud.get_or_create_default_status(db)
        
    except Exception as e:
        print(f"Erro ao popular banco de dados: {e}")
    finally:
        db.close()

app = FastAPI(title="Sistema de Tickets Offline")

@app.on_event("startup")
async def startup_event():
    seed_db()

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

# Dependency
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
            detail="Incorrect username or password",
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
        raise HTTPException(status_code=404, detail="Sector not found")
    return {"status": "ok"}

@app.post("/users/", response_model=schemas.User)
async def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    db_email = crud.get_user_by_email(db, email=user.email)
    if db_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    return crud.create_user(db=db, user=user, hashed_password=hashed_password)

@app.put("/users/{user_id}", response_model=schemas.User)
async def update_user_endpoint(user_id: int, user: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    # Apenas ROOT pode editar outros ADMINs ou mudar roles para ROOT
    if user.role == "ROOT" and current_user.role != "ROOT":
         raise HTTPException(status_code=403, detail="Only ROOT can create other ROOT users")
    
    hashed_password = None
    if user.password:
        hashed_password = auth.get_password_hash(user.password)
    
    db_user = crud.update_user(db=db, user_id=user_id, user_update=user, hashed_password=hashed_password)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.delete("/users/{user_id}")
async def delete_user_endpoint(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    success = crud.delete_user(db=db, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}

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
        raise HTTPException(status_code=404, detail="Profile not found")
    return db_profile

@app.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    success = crud.delete_profile(db=db, profile_id=profile_id)
    if not success:
        raise HTTPException(status_code=400, detail="Profile not found or currently in use by users")
    return {"message": "Profile deleted successfully"}

# --- Clients Endpoints ---
@app.post("/clients/", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db)):
    db_client = crud.get_client_by_email(db, email=client.email)
    if db_client:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_client(db=db, client=client)

@app.get("/clients/", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    clients = crud.get_clients(db, skip=skip, limit=limit)
    return clients

@app.put("/clients/{client_id}", response_model=schemas.Client)
def update_client(client_id: int, client: schemas.ClientCreate, db: Session = Depends(get_db)):
    db_client = crud.update_client(db=db, client_id=client_id, client_update=client)
    if db_client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return db_client

@app.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    success = crud.delete_client(db=db, client_id=client_id)
    if not success:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deleted successfully"}

# --- Import Endpoints ---
from fastapi import File, UploadFile
import io

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

@app.delete("/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    success = crud.delete_category(db=db, cat_id=cat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

# --- Status Endpoints ---
@app.get("/statuses/", response_model=List[schemas.Status])
def read_statuses(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_statuses(db)

@app.post("/statuses/", response_model=schemas.Status)
def create_status(status: schemas.StatusCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.create_status(db=db, status=status)

@app.delete("/statuses/{status_id}")
def delete_status(status_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    success = crud.delete_status(db=db, status_id=status_id)
    if not success:
        raise HTTPException(status_code=404, detail="Status not found")
    return {"message": "Status deleted"}

# --- Tickets Endpoints ---
@app.post("/tickets/", response_model=schemas.Ticket)
def create_ticket(ticket: schemas.TicketCreate, db: Session = Depends(get_db)):
    return crud.create_ticket(db=db, ticket=ticket)

@app.post("/tickets/simple", response_model=schemas.Ticket)
def create_ticket_simple(ticket: schemas.TicketCreateSimple, db: Session = Depends(get_db)):
    return crud.create_ticket_simple(db=db, ticket=ticket)

@app.get("/tickets/", response_model=List[schemas.Ticket])
def read_tickets(skip: int = 0, limit: int = 100, status: str = None, client_id: int = None, db: Session = Depends(get_db)):
    tickets = crud.get_tickets(db, skip=skip, limit=limit, status=status, client_id=client_id)
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
        raise HTTPException(status_code=404, detail="Ticket not found")
    return db_ticket

@app.post("/tickets/{ticket_id}/messages/", response_model=schemas.TicketMessage)
def create_message(ticket_id: int, message: schemas.TicketMessageCreate, db: Session = Depends(get_db)):
    return crud.create_ticket_message(db=db, message=message, ticket_id=ticket_id)

@app.put("/tickets/{ticket_id}", response_model=schemas.Ticket)
def update_ticket(ticket_id: int, ticket: schemas.TicketUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_ticket = crud.update_ticket(db=db, ticket_id=ticket_id, ticket_update=ticket, user_id=current_user.id)
    if db_ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return db_ticket

@app.get("/tickets/{ticket_id}/history", response_model=List[schemas.TicketHistory])
def read_ticket_history(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_ticket_history_list(db, ticket_id=ticket_id)

@app.delete("/tickets/{ticket_id}")
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    success = crud.delete_ticket(db=db, ticket_id=ticket_id)
    if not success:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"message": "Ticket deleted successfully"}

# --- Timer Endpoints ---
@app.post("/tickets/{ticket_id}/timer/start", response_model=schemas.TimeLog)
def start_timer(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.start_ticket_timer(db=db, ticket_id=ticket_id, user_id=current_user.id)

@app.post("/tickets/{ticket_id}/timer/stop", response_model=schemas.TimeLog)
def stop_timer(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_log = crud.stop_ticket_timer(db=db, ticket_id=ticket_id, user_id=current_user.id)
    if not db_log:
        raise HTTPException(status_code=400, detail="No active timer found for this ticket/user")
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
        raise HTTPException(status_code=404, detail="Document not found")
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
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}

from concurrent.futures import ThreadPoolExecutor

@app.get("/knowledge/search/")
def search_knowledge(query: str, limit: int = 3):
    # OTIMIZAÇÃO: Busca sequencial simples (mais rápida para bases pequenas)
    # Apenas RAG vetorial (ChromaDB) - mais inteligente e suficiente
    rag_results = rag.query_documents(query, n_results=limit)
    
    # Fallback SQL apenas se RAG falhar completamente
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

    # 1. Processa RAG (Vetorial - Mais inteligente)
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

    # 2. Complementa com SQL se houver espaço ou se o RAG falhou
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

# --- Upload Endpoints ---
@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    # Gerar nome único para o arquivo
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Retorna a URL para acessar o arquivo (assumindo rodar na porta 8080)
    # Em produção, isso viria de uma variável de ambiente BASE_URL
    return {"url": f"http://localhost:8080/uploads/{unique_filename}"}

# --- RAG / Knowledge Base Endpoints (Busca Vetorial - Temporariamente desativado) ---
# from pydantic import BaseModel
# 
# class DocumentInput(BaseModel):
#     doc_id: str
#     text: str
#     metadata: Optional[Dict] = None
# 
# @app.post("/knowledge/")
# def add_knowledge(doc: DocumentInput):
#     try:
#         # rag.add_document(doc.doc_id, doc.text, doc.metadata)
#         return {"status": "error", "message": "RAG module disabled temporarily"}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))
# 
# @app.get("/knowledge/search/")
# def search_knowledge(query: str, limit: int = 3):
#     try:
#         # results = rag.query_documents(query, n_results=limit)
#         return {"results": []} 
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

@app.post("/system/reset")
async def reset_database(
    params: schemas.SystemReset, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(auth.get_current_active_root)
):
    if params.confirmation != "DELETAR":
        raise HTTPException(status_code=400, detail="Confirmação de segurança inválida")
    
    # Executa limpeza SQL via CRUD
    stats = crud.reset_entities(db, entities=params.entities, current_user_id=current_user.id)
    
    # Se knowledge estiver incluso, limpa o ChromaDB também
    if "knowledge" in params.entities:
        rag_cleared = rag.clear_knowledge_base()
        stats["rag_cleared"] = rag_cleared
        
    return {
        "message": "Operação de limpeza concluída com sucesso",
        "details": stats
    }

@app.get("/system/backup")
def backup_system(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_root)
):
    # Buffer em memória para o ZIP
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # 1. Banco de Dados SQL
        if os.path.exists("./tickets_system.db"):
            zip_file.write("./tickets_system.db", arcname="tickets_system.db")
            
        # 2. Uploads
        if os.path.exists(UPLOAD_DIR):
            for root, dirs, files in os.walk(UPLOAD_DIR):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, os.path.dirname(UPLOAD_DIR))
                    zip_file.write(file_path, arcname=arcname)
                    
        # 3. ChromaDB (Banco Vetorial)
        CHROMA_DIR = "./chroma_db"
        if os.path.exists(CHROMA_DIR):
            for root, dirs, files in os.walk(CHROMA_DIR):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, os.path.dirname(CHROMA_DIR))
                    zip_file.write(file_path, arcname=arcname)

    zip_buffer.seek(0)
    
    # Nome do arquivo com data/hora seria ideal, mas frontend pode gerenciar nome
    return StreamingResponse(
        zip_buffer, 
        media_type="application/zip", 
        headers={"Content-Disposition": "attachment; filename=backup_ticketflow.zip"}
    )

@app.post("/system/restore")
async def restore_system(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_active_root)
):
    # Verificar extensão
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Arquivo deve ser um ZIP")

    try:
        # Ler conteúdo para memória
        content = await file.read()
        zip_buffer = io.BytesIO(content)
        
        # Validar ZIP
        if not zipfile.is_zipfile(zip_buffer):
            raise HTTPException(status_code=400, detail="Arquivo ZIP inválido")
            
        # Tentar fechar conexões com banco para liberar arquivo (Windows Lock)
        engine.dispose()
        
        # Extrair
        with zipfile.ZipFile(zip_buffer, 'r') as zip_ref:
            # Lista de arquivos no zip para validação básica
            file_names = zip_ref.namelist()
            
            # Resetar diretórios alvo
            if os.path.exists(UPLOAD_DIR):
                shutil.rmtree(UPLOAD_DIR)
            os.makedirs(UPLOAD_DIR)
            
            CHROMA_DIR = "./chroma_db"
            if os.path.exists(CHROMA_DIR):
                shutil.rmtree(CHROMA_DIR)
            os.makedirs(CHROMA_DIR)
            
            # Remover DB atual se existir (pode falhar no Windows se ainda tiver lock)
            if os.path.exists("./tickets_system.db"):
                try:
                    os.remove("./tickets_system.db")
                except PermissionError:
                    # Fallback: Se não conseguir deletar, tenta truncar/sobrescrever na extração
                    pass

            # Extrair tudo
            zip_ref.extractall(".")
            
        return {"message": "Sistema restaurado com sucesso. Reinicie o servidor se necessário."}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na restauração: {str(e)}")

# --- Notification Endpoints ---
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
    """Send a notification from current user to another user"""
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
