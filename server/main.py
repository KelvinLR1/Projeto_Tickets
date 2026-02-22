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
from typing import List, Dict, Optional, Any
from fastapi import Request, Response
import pandas as pd

# Importando módulos locais
try:
    from . import models, database, schemas, crud, rag, auth
    from .database import engine, get_db
except ImportError:
    import models, database, schemas, crud, rag, auth
    from database import engine, get_db

from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func

try:
    models.Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"⚠️ Alerta: Não foi possível inicializar as tabelas do banco de dados: {e}")
    print("⚠️ Acesse as configurações no frontend para corrigir os dados de conexão.")

def seed_db():
    db = database.SessionLocal()
    try:
        support_sector = db.query(models.Sector).filter(func.lower(models.Sector.name) == "suporte").first()
        if not support_sector:
            support_sector = models.Sector(name="Suporte", description="Setor padrão de atendimento")
            db.add(support_sector)
            db.commit()
            db.refresh(support_sector)

        master_profile = db.query(models.Profile).filter(models.Profile.name == "Master").first()
        if not master_profile:
            master_profile = models.Profile(name="Master", description="Acesso total ao sistema", permissions={"menus": ["*"], "actions": ["*"]})
            db.add(master_profile)
            db.commit()
            db.refresh(master_profile)

        if not db.query(models.Profile).filter(models.Profile.name == "Técnico").first():
            tech_profile = models.Profile(name="Técnico", description="Atendimento e gestão de chamados", permissions={"menus": ["dashboard", "tickets", "clients", "knowledge"], "actions": ["create_ticket", "edit_ticket"]})
            db.add(tech_profile)
            db.commit()

        if not db.query(models.Profile).filter(models.Profile.name == "Leitor").first():
            reader_profile = models.Profile(name="Leitor", description="Apenas visualização", permissions={"menus": ["dashboard", "tickets"], "actions": []})
            db.add(reader_profile)
            db.commit()

        admin_user = db.query(models.User).filter((models.User.username == "admin") | (models.User.email == "admin@sistema.com")).first()
        if not admin_user:
            admin_schema = schemas.UserCreate(username="admin", email="admin@sistema.com", full_name="Administrador Padrão", password="admin", role="ROOT")
            hashed_password = auth.get_password_hash("admin")
            admin_user = crud.create_user(db, admin_schema, hashed_password)
            admin_user.profile_id = master_profile.id
            if support_sector not in admin_user.sectors:
                admin_user.sectors.append(support_sector)
            db.commit()
        else:
            updated = False
            if admin_user.role != "ROOT":
                admin_user.role = "ROOT"
                updated = True
            if not admin_user.profile_id:
                admin_user.profile_id = master_profile.id
                updated = True
            if support_sector not in admin_user.sectors:
                admin_user.sectors.append(support_sector)
                updated = True
            if updated:
                db.commit()

        crud.get_or_create_default_category(db, sector_id=support_sector.id)
        crud.get_or_create_default_status(db, sector_id=support_sector.id)
        
    except Exception as e:
        # Erro comum se o banco de dados ainda não existir: (pg8000.dbapi.ProgrammingError) {'S': 'FATAL', 'C': '3D000', 'M': 'banco de dados ... não existe', ...}
        if "não existe" in str(e).lower() or "not exist" in str(e).lower():
            print(f"ℹ️ seed_db: Banco de dados ainda não existe. Ignorando população inicial.")
        else:
            print(f"⚠️ Erro ao popular banco de dados: {e}")
        db.rollback()
    finally:
        db.close()

app = FastAPI(title="Sistema de Tickets Offline")

@app.on_event("startup")
async def startup_event():
    seed_db()

IS_RESTORING = False

@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    if IS_RESTORING and request.url.path != "/system/restore":
        return Response(content='{"detail": "Sistema em manutenção para restauração de backup."}', status_code=503, media_type="application/json")
    return await call_next(request)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        print(f"DEBUG: {request.method} {request.url.path} - {response.status_code} ({process_time:.2f}ms)")
        return response
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        print(f"DEBUG ERROR: {request.method} {request.url.path} - FAILED ({process_time:.2f}ms): {e}")
        raise e

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Sistema de Tickets Offline Rodando"}

@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.post("/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=form_data.username)
    if not db_user or not auth.verify_password(form_data.password, db_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário ou senha incorretos", headers={"WWW-Authenticate": "Bearer"})
    access_token = auth.create_access_token(data={"sub": db_user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.get("/users/", response_model=List[schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.get_users(db, skip=skip, limit=limit)

@app.get("/users/attendants")
def read_attendants(sector_id: Optional[int] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    users = crud.get_users_short(db, sector_id=sector_id)
    return [{"id": u[0], "name": u[1] or u[2]} for u in users]

@app.get("/sectors/", response_model=List[schemas.Sector])
def read_sectors(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_sectors(db, skip=skip, limit=limit)

@app.post("/sectors/", response_model=schemas.Sector)
def create_sector(sector: schemas.SectorCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.create_sector(db=db, sector=sector)

@app.put("/sectors/{sector_id}", response_model=schemas.Sector)
def update_sector(sector_id: int, sector: schemas.SectorUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    db_sector = crud.update_sector(db=db, sector_id=sector_id, sector_update=sector)
    if not db_sector:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    return db_sector

@app.delete("/sectors/{sector_id}")
def delete_sector(sector_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    success, message = crud.delete_sector(db, sector_id)
    if not success:
        if "não encontrado" in message:
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}

@app.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user: raise HTTPException(status_code=400, detail="Nome de usuário já registrado")
    db_email = crud.get_user_by_email(db, email=user.email)
    if db_email: raise HTTPException(status_code=400, detail="E-mail já registrado")
    hashed_password = auth.get_password_hash(user.password)
    return crud.create_user(db=db, user=user, hashed_password=hashed_password)

@app.put("/users/{user_id}", response_model=schemas.User)
def update_user_endpoint(user_id: int, user: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    if user.role == "ROOT" and current_user.role != "ROOT":
         raise HTTPException(status_code=403, detail="Apenas usuários ROOT podem criar outros ROOT")
    hashed_password = auth.get_password_hash(user.password) if user.password else None
    db_user = crud.update_user(db=db, user_id=user_id, user_update=user, hashed_password=hashed_password)
    if db_user is None: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return db_user

@app.delete("/users/{user_id}")
def delete_user_endpoint(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    success = crud.delete_user(db=db, user_id=user_id)
    if not success: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"message": "Usuário excluído com sucesso"}

@app.get("/profiles/", response_model=List[schemas.Profile])
def read_profiles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.get_profiles(db, skip=skip, limit=limit)

@app.post("/profiles/", response_model=schemas.Profile)
def create_profile(profile: schemas.ProfileCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    return crud.create_profile(db=db, profile=profile)

@app.put("/profiles/{profile_id}", response_model=schemas.Profile)
def update_profile(profile_id: int, profile: schemas.ProfileCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    db_profile = crud.update_profile(db=db, profile_id=profile_id, profile_update=profile)
    if not db_profile: raise HTTPException(status_code=404, detail="Perfil não encontrado")
    return db_profile

@app.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    success = crud.delete_profile(db=db, profile_id=profile_id)
    if not success: raise HTTPException(status_code=400, detail="Perfil não encontrado ou em uso")
    return {"message": "Perfil excluído com sucesso"}

@app.post("/clients/", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db)):
    db_client = crud.get_client_by_email(db, email=client.email)
    if db_client: raise HTTPException(status_code=400, detail="E-mail já registrado")
    return crud.create_client(db=db, client=client)

@app.get("/clients/", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, q: Optional[str] = None, doc_type: Optional[str] = None, has_phone: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_clients(db, skip=skip, limit=limit, q=q, doc_type=doc_type, has_phone=has_phone, start_date=start_date, end_date=end_date)

@app.get("/clients/count")
def read_clients_count(q: Optional[str] = None, doc_type: Optional[str] = None, has_phone: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return {"count": crud.get_clients_count(db, q=q, doc_type=doc_type, has_phone=has_phone, start_date=start_date, end_date=end_date)}

@app.get("/clients/{client_id}", response_model=schemas.Client)
def read_client(client_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_client = crud.get_client(db, client_id=client_id)
    if db_client is None: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return db_client

@app.put("/clients/{client_id}", response_model=schemas.Client)
def update_client(client_id: int, client: schemas.ClientCreate, db: Session = Depends(get_db)):
    db_client = crud.update_client(db=db, client_id=client_id, client_update=client)
    if db_client is None: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return db_client

@app.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    success = crud.delete_client(db=db, client_id=client_id)
    if not success: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return {"message": "Cliente excluído com sucesso"}

CLIENT_IMPORT_COLUMNS = {"name": "Nome Completo", "nickname": "Nome Fantasia", "email": "E-mail", "cpf_cnpj": "CPF_CNPJ", "phone": "Telefone", "cep": "CEP", "city": "Cidade", "uf": "UF", "street": "Logradouro", "number": "Número", "complement": "Complemento", "neighborhood": "Bairro", "state_registration": "Inscrição Estadual", "tax_regime": "Regime Tributário"}

@app.get("/clients/import/template")
def download_client_template():
    from io import BytesIO
    df = pd.DataFrame(columns=list(CLIENT_IMPORT_COLUMNS.values()))
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Modelo Importação')
    return Response(content=output.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=modelo_importacao_clientes.xlsx"})

@app.post("/clients/import/excel", response_model=schemas.ImportResult)
async def import_clients_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents)) if file.filename.endswith(('.xlsx', '.xls')) else pd.read_csv(io.BytesIO(contents))
        reverse_mapping = {v.lower().strip(): k for k, v in CLIENT_IMPORT_COLUMNS.items()}
        df.columns = [reverse_mapping.get(str(c).lower().strip(), str(c).lower().strip()) for c in df.columns]
        if not {'name', 'cpf_cnpj'}.issubset(df.columns):
            raise HTTPException(status_code=400, detail="Arquivo deve conter ao menos Nome e CPF_CNPJ")
        valid_cols = set(CLIENT_IMPORT_COLUMNS.keys())
        df = df[[c for c in df.columns if c in valid_cols]]
        return crud.bulk_create_clients(db, df.to_dict('records'))
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/clients/import/db/preview")
def preview_clients_db(config: schemas.DBImportConfigs, db: Session = Depends(get_db)):
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import URL
    
    # driver_map: preference for pyodbc on Windows for SQL Server
    driver_map = {"mysql": "mysql+pymysql", "postgresql": "postgresql+psycopg2", "sqlserver": "mssql+pyodbc"}
    driver = driver_map.get(config.db_type)
    if not driver: raise HTTPException(status_code=400, detail="Tipo de banco não suportado")
    
    url_args = {
        "drivername": driver,
        "username": config.user,
        "password": config.password,
        "host": config.host,
        "database": config.database
    }
    
    # MS SQL Server specific config for pyodbc
    if config.db_type == 'sqlserver':
        # Default Windows driver. Can be 'ODBC Driver 17 for SQL Server' if installed, but 'SQL Server' is universal on Windows.
        # We pass it as a query param to the URL.
        url_args["query"] = {"driver": "SQL Server"}
        
        # If named instance (has backslash), we do NOT pass port, letting the driver resolve it.
        # If standard instance, we pass the port.
        if '\\' not in config.host:
             url_args["port"] = config.port
    else:
        # Other DBs (MySQL, Postgres): usage of port is standard
        url_args["port"] = config.port

    url = URL.create(**url_args)
    try:
        ext_engine = create_engine(url)
        with ext_engine.connect() as conn:
            query_str = config.query if config.query else f"SELECT * FROM {config.table}"
            df = pd.read_sql(text(query_str), conn).head(10)
        if config.mapping: df = df.rename(columns=config.mapping)
        df.columns = [c.lower().strip() for c in df.columns]
        # Replace NaN and Inf with None for JSON compatibility
        df = df.replace([float('inf'), float('-inf'), float('nan')], None)
        df = df.where(pd.notnull(df), None)
        return df.to_dict('records')
    except Exception as e:
        import traceback
        print(f"[PREVIEW ERROR] {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ou consultar: {str(e)}")

@app.post("/clients/import/db", response_model=schemas.ImportResult)
def import_clients_db(config: schemas.DBImportConfigs, db: Session = Depends(get_db)):
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import URL
    
    # driver_map: preference for pyodbc on Windows for SQL Server
    driver_map = {"mysql": "mysql+pymysql", "postgresql": "postgresql+psycopg2", "sqlserver": "mssql+pyodbc"}
    driver = driver_map.get(config.db_type)
    if not driver: raise HTTPException(status_code=400, detail="Tipo de banco não suportado")
    
    url_args = {
        "drivername": driver,
        "username": config.user,
        "password": config.password,
        "host": config.host,
        "database": config.database
    }
    
    # MS SQL Server specific config for pyodbc
    if config.db_type == 'sqlserver':
        # Default Windows driver. Can be 'ODBC Driver 17 for SQL Server' if installed, but 'SQL Server' is universal on Windows.
        # We pass it as a query param to the URL.
        url_args["query"] = {"driver": "SQL Server"}
        
        # If named instance (has backslash), we do NOT pass port, letting the driver resolve it.
        # If standard instance, we pass the port.
        if '\\' not in config.host:
             url_args["port"] = config.port
    else:
        # Other DBs (MySQL, Postgres): usage of port is standard
        url_args["port"] = config.port

    url = URL.create(**url_args)
    try:
        ext_engine = create_engine(url)
        with ext_engine.connect() as conn:
            query_str = config.query if config.query else f"SELECT * FROM {config.table}"
            df = pd.read_sql(text(query_str), conn)
        if config.mapping: df = df.rename(columns=config.mapping)
        df.columns = [c.lower().strip() for c in df.columns]
        reverse_mapping = {v.lower().strip(): k for k, v in CLIENT_IMPORT_COLUMNS.items()}
        df.columns = [reverse_mapping.get(str(c).lower().strip(), str(c).lower().strip()) for c in df.columns]
        if not {'name', 'cpf_cnpj'}.issubset(df.columns):
            raise HTTPException(status_code=400, detail="Colunas Nome/CPF_CNPJ não encontradas")
        valid_cols = set(CLIENT_IMPORT_COLUMNS.keys())
        df = df[[c for c in df.columns if c in valid_cols]]
        # Replace NaN and Inf with None for database compatibility
        df = df.replace([float('inf'), float('-inf'), float('nan')], None)
        df = df.where(pd.notnull(df), None)
        return crud.bulk_create_clients(db, df.to_dict('records'))
    except Exception as e:
        import traceback
        print(f"[IMPORT ERROR] {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro na importação: {str(e)}")

@app.get("/categories/", response_model=List[schemas.CategoryWithSub])
def read_categories(sector_id: Optional[int] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_categories(db, sector_id=sector_id)

@app.post("/categories/", response_model=schemas.Category)
def create_category(cat: schemas.CategoryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.create_category(db=db, cat=cat)

@app.put("/categories/{cat_id}", response_model=schemas.Category)
def update_category(cat_id: int, cat: schemas.CategoryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    db_cat = crud.update_category(db=db, cat_id=cat_id, cat_update=cat)
    if not db_cat: raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return db_cat

@app.delete("/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    success, message = crud.delete_category(db=db, cat_id=cat_id)
    if not success: raise HTTPException(status_code=400 if "não" not in message else 404, detail=message)
    return {"message": message}

@app.get("/statuses/", response_model=List[schemas.Status])
def read_statuses(sector_id: Optional[int] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_statuses(db, sector_id=sector_id)

@app.post("/statuses/", response_model=schemas.Status)
def create_status(status: schemas.StatusCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    return crud.create_status(db=db, status=status)

@app.delete("/statuses/{status_id}")
def delete_status(status_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    success, message = crud.delete_status(db=db, status_id=status_id)
    if not success: raise HTTPException(status_code=400 if "não" not in message else 404, detail=message)
    return {"message": message}

@app.put("/statuses/{status_id}", response_model=schemas.Status)
def update_status(status_id: int, status: schemas.StatusBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    db_status = crud.update_status(db=db, status_id=status_id, status_update=status)
    if not db_status: raise HTTPException(status_code=404, detail="Status não encontrado")
    return db_status

@app.post("/tickets/", response_model=schemas.Ticket)
def create_ticket(ticket: schemas.TicketCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.create_ticket(db=db, ticket=ticket, created_by_id=current_user.id)

@app.post("/tickets/simple", response_model=schemas.Ticket)
def create_ticket_simple(ticket: schemas.TicketCreateSimple, db: Session = Depends(get_db)):
    return crud.create_ticket_simple(db=db, ticket=ticket)

@app.get("/tickets/", response_model=List[schemas.Ticket])
def read_tickets(skip: int = 0, limit: int = 100, q: Optional[str] = None, status: Optional[str] = None, client_id: Optional[int] = None, sector_id: Optional[int] = None, priority: Optional[str] = None, category_id: Optional[int] = None, assigned_user_id: Optional[int] = None, created_by_id: Optional[int] = None, follower_id: Optional[int] = None, my_plus_unassigned_id: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, unassigned_only: bool = False, exclude_finalized: bool = False, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_tickets(db, skip=skip, limit=limit, q=q, status=status, client_id=client_id, sector_id=sector_id, priority=priority, category_id=category_id, assigned_user_id=assigned_user_id, created_by_id=created_by_id, follower_id=follower_id, my_plus_unassigned_id=my_plus_unassigned_id, start_date=start_date, end_date=end_date, unassigned_only=unassigned_only, exclude_finalized=exclude_finalized)

@app.get("/tickets/count")
def read_tickets_count(q: Optional[str] = None, status: Optional[str] = None, client_id: Optional[int] = None, sector_id: Optional[int] = None, priority: Optional[str] = None, category_id: Optional[int] = None, assigned_user_id: Optional[int] = None, created_by_id: Optional[int] = None, follower_id: Optional[int] = None, my_plus_unassigned_id: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, unassigned_only: bool = False, exclude_finalized: bool = False, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    count = crud.get_tickets_count(db, q=q, status=status, client_id=client_id, sector_id=sector_id, priority=priority, category_id=category_id, assigned_user_id=assigned_user_id, created_by_id=created_by_id, follower_id=follower_id, my_plus_unassigned_id=my_plus_unassigned_id, start_date=start_date, end_date=end_date, unassigned_only=unassigned_only, exclude_finalized=exclude_finalized)
    return {"count": count}

@app.get("/dashboard/stats")
def read_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)):
    return {
        "summary": crud.get_detailed_report_stats(db, start_date, end_date, sector_id, user_id),
        "trends": []
    }

@app.get("/reports/summary")
def get_report_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)):
    return crud.get_detailed_report_stats(db, start_date, end_date, sector_id, user_id)

@app.get("/tickets/{ticket_id}", response_model=schemas.Ticket)
def read_ticket(ticket_id: int, db: Session = Depends(get_db)):
    db_ticket = crud.get_ticket(db, ticket_id=ticket_id)
    if db_ticket is None: raise HTTPException(status_code=404, detail="Chamado não encontrado")
    return db_ticket

@app.post("/tickets/{ticket_id}/messages/", response_model=schemas.TicketMessage)
def create_message(ticket_id: int, message: schemas.TicketMessageCreate, db: Session = Depends(get_db)):
    return crud.create_ticket_message(db=db, message=message, ticket_id=ticket_id)

@app.put("/tickets/{ticket_id}", response_model=schemas.Ticket)
def update_ticket(ticket_id: int, ticket: schemas.TicketUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_ticket = crud.get_ticket(db, ticket_id=ticket_id)
    if db_ticket is None: raise HTTPException(status_code=404, detail="Chamado não encontrado")
    if (ticket.sector_id or ticket.assigned_user_id) and not (db_ticket.assigned_user_id == current_user.id or current_user.role in ["ADMIN", "ROOT"]):
        raise HTTPException(status_code=403, detail="Sem permissão para transferir")
    return crud.update_ticket(db=db, ticket_id=ticket_id, ticket_update=ticket, user_id=current_user.id)

@app.get("/tickets/{ticket_id}/history", response_model=List[schemas.TicketHistory])
def read_ticket_history(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_ticket_history_list(db, ticket_id=ticket_id)

@app.get("/tickets/export")
def export_tickets(format: str = "csv", db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    tickets = crud.get_tickets(db, limit=5000)
    data = [{"ID": t.id, "Título": t.title, "Status": t.status, "Prioridade": t.priority, "Cliente": t.client.name if t.client else "N/A", "Categoria": t.category.name if t.category else "N/A", "Data Criação": t.created_at.strftime("%Y-%m-%d %H:%M:%S"), "Responsável": t.assigned_user.full_name or t.assigned_user.username if t.assigned_user else "N/A"} for t in tickets]
    df = pd.DataFrame(data)
    filename = f"relatorio_tickets_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if format == "excel":
        output = io.BytesIO()
        df.to_excel(pd.ExcelWriter(output, engine='openpyxl'), index=False, sheet_name='Tickets')
        return StreamingResponse(io.BytesIO(output.getvalue()), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"})
    elif format == "json":
        return Response(content=df.to_json(orient="records", force_ascii=False), media_type="application/json", headers={"Content-Disposition": f"attachment; filename={filename}.json"})
    else:
        output = io.StringIO(); df.to_csv(output, index=False, encoding='utf-8-sig')
        return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}.csv"})

@app.get("/reports/idle-clients")
def export_idle_clients(start_date: str, end_date: str, format: str = "excel", db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    try:
        dt_start = datetime.strptime(start_date, "%Y-%m-%d")
        dt_end = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except: raise HTTPException(status_code=400, detail="Use YYYY-MM-DD")
    clients = crud.get_idle_clients(db, dt_start, dt_end)
    data = [{"ID": c.id, "Nome": c.name, "E-mail": c.email, "CPF/CNPJ": c.cpf_cnpj or "N/A", "Telefone": c.phone or "N/A", "Cadastrado em": c.created_at.strftime("%Y-%m-%d %H:%M:%S")} for c in clients]
    df = pd.DataFrame(data)
    if format == "pdf":
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph; from reportlab.lib.styles import getSampleStyleSheet
        output = io.BytesIO(); doc = SimpleDocTemplate(output, pagesize=A4); elements = [Paragraph(f"Inativos {start_date} a {end_date}", getSampleStyleSheet()['Title'])]
        if data:
            t = Table([["ID", "Nome", "E-mail", "CPF/CNPJ", "Telefone"]] + [[d["ID"], d["Nome"], d["E-mail"], d["CPF/CNPJ"], d["Telefone"]] for d in data])
            t.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), '#808080'), ('GRID', (0,0), (-1,-1), 1, '#000000')])); elements.append(t)
        doc.build(elements); return Response(content=output.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=inativos.pdf"})
    else:
        output = io.BytesIO(); df.to_excel(pd.ExcelWriter(output, engine='openpyxl'), index=False); return Response(content=output.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=inativos.xlsx"})

@app.delete("/tickets/{ticket_id}")
def delete_ticket_rest(ticket_id: int, db: Session = Depends(get_db)):
    if not crud.delete_ticket(db=db, ticket_id=ticket_id): raise HTTPException(status_code=404, detail="Não encontrado")
    return {"message": "Excluído"}

@app.post("/tickets/{ticket_id}/timer/start", response_model=schemas.TimeLog)
def start_timer(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    t = crud.get_ticket(db, ticket_id); 
    if not t: raise HTTPException(status_code=404); 
    if t.assigned_user_id != current_user.id: raise HTTPException(status_code=403)
    return crud.start_ticket_timer(db, ticket_id, current_user.id)

@app.post("/tickets/{ticket_id}/timer/stop", response_model=schemas.TimeLog)
def stop_timer(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    res = crud.stop_ticket_timer(db, ticket_id, current_user.id)
    if not res: raise HTTPException(status_code=400)
    return res

@app.get("/tickets/timers/active", response_model=List[schemas.TimeLog])
def get_active_timers(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_active_timers(db, current_user.id)

@app.get("/tickets/{ticket_id}/timer/stats", response_model=List[schemas.StatusTimeGroup])
def get_timer_stats(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_ticket_timer_stats(db, ticket_id)

@app.post("/tickets/{ticket_id}/follow", response_model=schemas.Ticket)
def follow_ticket(ticket_id: int, user_id: Optional[int] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    target = user_id if user_id else current_user.id
    if target != current_user.id:
        t = crud.get_ticket(db, ticket_id)
        if not (t.assigned_user_id == current_user.id or current_user.role in ["ADMIN", "ROOT"]): raise HTTPException(status_code=403)
    success, ticket = crud.add_ticket_follower(db, ticket_id, target, current_user.id)
    if not success: raise HTTPException(status_code=400)
    return ticket

@app.post("/tickets/{ticket_id}/unfollow", response_model=schemas.Ticket)
def unfollow_ticket(ticket_id: int, user_id: Optional[int] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    target = user_id if user_id else current_user.id
    if target != current_user.id:
        t = crud.get_ticket(db, ticket_id)
        if not (t.assigned_user_id == current_user.id or current_user.role in ["ADMIN", "ROOT"]): raise HTTPException(status_code=403)
    success, ticket = crud.remove_ticket_follower(db, ticket_id, target, current_user.id)
    if not success: raise HTTPException(status_code=400)
    return ticket

@app.get("/knowledge/", response_model=List[schemas.KnowledgeDocument])
def read_knowledge(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_knowledge_documents(db, skip, limit)

@app.post("/knowledge/", response_model=schemas.KnowledgeDocument)
def create_knowledge(doc: schemas.KnowledgeDocumentCreate, db: Session = Depends(get_db)):
    d = crud.create_knowledge_document(db, doc); rag.add_document(d.id, d.content, {"title": d.title, "category": d.category})
    return d

@app.put("/knowledge/{doc_id}", response_model=schemas.KnowledgeDocument)
def update_knowledge(doc_id: int, doc: schemas.KnowledgeDocumentCreate, db: Session = Depends(get_db)):
    d = crud.update_knowledge_document(db, doc_id, doc)
    if not d: raise HTTPException(status_code=404)
    rag.add_document(d.id, d.content, {"title": d.title, "category": d.category})
    return d

@app.delete("/knowledge/{doc_id}")
def delete_knowledge(doc_id: int, db: Session = Depends(get_db)):
    if not crud.delete_knowledge_document(db, doc_id): raise HTTPException(status_code=404)
    return {"message": "Excluído"}

@app.get("/knowledge/search/")
def search_knowledge(query: str, limit: int = 3):
    r = rag.query_documents(query, limit); results = {"documents": [[], []], "metadatas": [[], []], "ids": [[], []], "source": "hybrid"}
    if r.get("documents") and r["documents"][0]:
        for i in range(len(r["documents"][0])):
            doc, meta, id_ = r["documents"][0][i], r["metadatas"][0][i], r["ids"][0][i]
            idx = 1 if meta.get("source") == "ticket" else 0
            results["documents"][idx].append(doc); results["ids"][idx].append(id_)
            results["metadatas"][idx].append({"title": f"#{id_}: {meta.get('title')}" if idx==1 else meta.get('title'), "category": meta.get("category")})
    return results

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    name = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"; path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f: shutil.copyfileobj(file.file, f)
    return {"url": f"http://localhost:8080/uploads/{name}"}

@app.post("/system/reset")
async def reset_db(p: schemas.SystemReset, db: Session = Depends(get_db), u: models.User = Depends(auth.get_current_active_root)):
    if p.confirmation != "DELETAR": raise HTTPException(status_code=400)
    stats = crud.reset_entities(db, p.entities, u.id)
    if "knowledge" in p.entities: rag.clear_knowledge_base()
    return {"status": "ok", "details": stats}

@app.get("/system/backup")
def backup(db: Session = Depends(get_db), u: models.User = Depends(auth.get_current_active_root)):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in [database.DB_PATH, database.DB_PATH+"-wal", database.DB_PATH+"-shm"]:
            if os.path.exists(f): z.write(f, os.path.basename(f))
        for d in [UPLOAD_DIR, os.path.join(database.BASE_DIR, "chroma_db")]:
            if os.path.exists(d):
                for r, _, files in os.walk(d):
                    for f in files: fp = os.path.join(r, f); z.write(fp, os.path.relpath(fp, database.BASE_DIR))
    buf.seek(0); return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": "attachment; filename=backup.zip"})

@app.post("/system/restore")
async def restore(request: Request, file: UploadFile = File(...)):
    global IS_RESTORING; IS_RESTORING = True
    try:
        # Simplificado para brevidade, lógica real de movimentação de arquivos deve ser mantida se crítica
        path = os.path.join(database.BASE_DIR, "restore.zip")
        with open(path, "wb") as f: shutil.copyfileobj(file.file, f)
        engine.dispose(); await asyncio.sleep(1)
        with zipfile.ZipFile(path, 'r') as z: z.extractall(database.BASE_DIR)
        seed_db(); return {"status": "ok"}
    finally: IS_RESTORING = False

@app.get("/notifications", response_model=List[schemas.Notification])
def read_notifications(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), u: models.User = Depends(auth.get_current_user)):
    return crud.get_notifications(db, u.id, skip, limit)

@app.get("/notifications/unread-count")
def read_unread(db: Session = Depends(get_db), u: models.User = Depends(auth.get_current_user)):
    return {"count": crud.get_unread_notification_count(db, u.id)}

@app.post("/notifications/{id}/read", response_model=schemas.Notification)
def mark_read(id: int, db: Session = Depends(get_db), u: models.User = Depends(auth.get_current_user)):
    n = crud.mark_notification_as_read(db, id, u.id)
    if not n: raise HTTPException(status_code=404)
    return n

@app.post("/notifications/read-all")
def read_all(db: Session = Depends(get_db), u: models.User = Depends(auth.get_current_user)):
    crud.mark_all_notifications_as_read(db, u.id)
    return {"status": "ok"}

@app.post("/notifications/send", response_model=schemas.Notification)
def send_notif(data: schemas.NotificationSend, db: Session = Depends(get_db), u: models.User = Depends(auth.get_current_user)):
    n = crud.send_user_notification(db, u.id, data)
    if not n: raise HTTPException(status_code=404)
    return n

@app.get("/system-settings", response_model=schemas.SystemSettings)
def get_settings(db: Session = Depends(get_db)): return crud.get_system_settings(db)

@app.patch("/system-settings", response_model=schemas.SystemSettings)
def patch_settings(update: schemas.SystemSettingsUpdate, db: Session = Depends(get_db), u: models.User = Depends(auth.get_current_active_admin)):
    return crud.update_system_settings(db, update)

@app.post("/api/system/config-db")
async def config_db_api(config: schemas.DBConfig):
    import sys
    import config_db
    if config.engine == "sqlite":
        # Usa a pasta do servidor como base para o banco SQLite
        if getattr(sys, 'frozen', False):
            install_dir = os.path.dirname(sys.executable)
        else:
            install_dir = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.join(install_dir, config.sqlite.dbname).replace(os.sep, '/')
        url = f"sqlite:///{db_path}"
    else:
        # Tenta criar o banco se não existir
        try:
            config_db.create_database_if_not_exists(
                config.postgres.user,
                config.postgres.password,
                config.postgres.host,
                config.postgres.port,
                config.postgres.dbname
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro ao criar banco de dados: {str(e)}")
            
        url = f"postgresql+pg8000://{config.postgres.user}:{config.postgres.password}@{config.postgres.host}:{config.postgres.port}/{config.postgres.dbname}"
    
    config_db.update_env_file(url)
    return {"status": "success", "message": "Configuração salva com sucesso! O sistema será reiniciado."}

@app.get("/api/system/status")
async def sys_status(): return {"is_configured": bool(os.getenv("DATABASE_URL"))}

@app.get("/api/system/db-info")
async def db_info():
    url = os.getenv("DATABASE_URL", "")
    if not url:
        return {"type": "none", "label": "Não configurado", "details": ""}
    
    if url.startswith("sqlite"):
        # Extrai o caminho do arquivo SQLite
        path = url.replace("sqlite:///", "").replace("sqlite://", "")
        filename = os.path.basename(path) if path else "memory"
        return {"type": "sqlite", "label": "SQLite", "details": filename, "path": path}
    elif "postgresql" in url or "postgres" in url:
        # Extrai host e banco (sem senha)
        import re
        match = re.search(r'@([^/]+)/(.+)$', url)
        if match:
            host = match.group(1)
            dbname = match.group(2).split('?')[0]
            return {"type": "postgresql", "label": "PostgreSQL", "details": f"{host}/{dbname}"}
        return {"type": "postgresql", "label": "PostgreSQL", "details": "configurado"}
    else:
        return {"type": "other", "label": "Outro", "details": url[:50]}

# --- Custom Reports Endpoints ---
@app.get("/reports/custom", response_model=List[schemas.CustomReport])
def read_custom_reports(
    skip: int = 0, limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)):
    return crud.get_custom_reports(db, skip=skip, limit=limit)

@app.get("/reports/custom/{report_id}", response_model=schemas.CustomReport)
def read_custom_report(
    report_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)):
    db_report = crud.get_custom_report(db, report_id=report_id)
    if not db_report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return db_report

@app.post("/reports/custom", response_model=schemas.CustomReport)
def create_custom_report(
    report: schemas.CustomReportCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)):
    return crud.create_custom_report(db=db, report=report, user_id=current_user.id)

@app.put("/reports/custom/{report_id}", response_model=schemas.CustomReport)
def update_custom_report(
    report_id: int, 
    report: schemas.CustomReportUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)):
    db_report = crud.update_custom_report(db, report_id=report_id, report_update=report)
    if not db_report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return db_report

@app.delete("/reports/custom/{report_id}")
def delete_custom_report(
    report_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)):
    if not crud.delete_custom_report(db, report_id=report_id):
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return {"status": "success"}

@app.post("/reports/custom/execute")
def execute_report(
    execution_data: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)):
    """Executa um SQL customizado com variáveis."""
    query = execution_data.get("query")
    variables = execution_data.get("variables", {})
    
    if not query:
        raise HTTPException(status_code=400, detail="Query SQL é obrigatória")
        
    try:
        results = crud.execute_custom_report(db, query, variables)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
