from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import shutil
import uuid
from sqlalchemy.orm import Session
from typing import List, Dict, Optional

# Importando módulos locais (sem ponto inicial se rodar como script, 
# mas mantendo estrutura de pacote se rodar com uvicorn main:app)
try:
    from . import models, database, schemas, crud, rag
    from .database import engine
except ImportError:
    import models, database, schemas, crud, rag
    from database import engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sistema de Tickets Offline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
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
def read_categories(db: Session = Depends(get_db)):
    return crud.get_categories(db)

@app.post("/categories/", response_model=schemas.Category)
def create_category(cat: schemas.CategoryCreate, db: Session = Depends(get_db)):
    return crud.create_category(db=db, cat=cat)

@app.delete("/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    success = crud.delete_category(db=db, cat_id=cat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

# --- Status Endpoints ---
@app.get("/statuses/", response_model=List[schemas.Status])
def read_statuses(db: Session = Depends(get_db)):
    return crud.get_statuses(db)

@app.post("/statuses/", response_model=schemas.Status)
def create_status(status: schemas.StatusCreate, db: Session = Depends(get_db)):
    return crud.create_status(db=db, status=status)

@app.delete("/statuses/{status_id}")
def delete_status(status_id: int, db: Session = Depends(get_db)):
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
def update_ticket(ticket_id: int, ticket: schemas.TicketUpdate, db: Session = Depends(get_db)):
    db_ticket = crud.update_ticket(db=db, ticket_id=ticket_id, ticket_update=ticket)
    if db_ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return db_ticket

@app.delete("/tickets/{ticket_id}")
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    success = crud.delete_ticket(db=db, ticket_id=ticket_id)
    if not success:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"message": "Ticket deleted successfully"}

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

@app.get("/knowledge/search/")
def search_knowledge(query: str, limit: int = 3, db: Session = Depends(get_db)):
    # 1. Tenta busca vetorial (RAG)
    results = rag.query_documents(query, n_results=limit)
    
    # 2. Se falhar ou retornar zero resultados, tenta o fallback SQL inteligente
    has_results = results.get("documents") and len(results["documents"]) > 0 and len(results["documents"][0]) > 0
    is_unavailable = results.get("error") == "ChromaDB not available"
    
    if is_unavailable or not has_results:
        sql_docs = crud.search_knowledge_documents(db, query=query, limit=limit)
        return {
            "documents": [[doc.content for doc in sql_docs]],
            "metadatas": [[{"title": doc.title, "category": doc.category} for doc in sql_docs]],
            "ids": [[str(doc.id) for doc in sql_docs]],
            "source": "sql_fallback"
        }
    return results

# --- Upload Endpoints ---
@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    # Gerar nome único para o arquivo
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Retorna a URL para acessar o arquivo (assumindo rodar na porta 8000)
    # Em produção, isso viria de uma variável de ambiente BASE_URL
    return {"url": f"http://localhost:8000/uploads/{unique_filename}"}

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
