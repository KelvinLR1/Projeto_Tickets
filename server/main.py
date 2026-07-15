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

# ==============================================================================
# CONFIGURAÇÕES INICIAIS E IMPORTS
# ==============================================================================

# Drivers de banco de dados para garantir inclusão no executável gerado pelo PyInstaller
# Isso evita erros de "módulo não encontrado" quando o sistema é compilado
try:
    import pyodbc
    import pymysql
    import pymssql
except ImportError:
    pass

# Importando módulos internos do projeto para lógica de banco, esquemas e autenticação
try:
    from . import models, database, schemas, crud, rag, auth
except ImportError:
    import models, database, schemas, crud, rag, auth

from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, text

# ==============================================================================
# INICIALIZAÇÃO DO BANCO DE DADOS E MIGRAÇÕES
# ==============================================================================

def init_db_schema():
    """
    Inicializa o esquema do banco de dados utilizando Alembic Migrations.
    Garante que a estrutura esteja sempre atualizada sem redundância.
    """
    # Executa as migrações automáticas para tratar novos campos ou criar o banco do zero
    _run_migrations()

def _run_migrations():
    """
    Utiliza o Alembic para aplicar migrações pendentes no banco de dados.
    Garante que a estrutura física do BD esteja sincronizada com os modelos.
    Se o banco já existir mas for pré-Alembic, realiza o 'stamp' para a versão atual.
    """
    try:
        from alembic.config import Config
        from alembic import command
        
        # Define o caminho do arquivo de configuração do Alembic (alembic.ini)
        alembic_ini_path = os.path.join(os.path.dirname(__file__), "alembic.ini")
        alembic_cfg = Config(alembic_ini_path)
        
        # Configura explicitamente onde estão os scripts de migração
        alembic_dir_path = os.path.join(os.path.dirname(__file__), "alembic")
        alembic_cfg.set_main_option("script_location", alembic_dir_path)

        print("🔄 Executando migrações automáticas do banco de dados via Alembic...")
        try:
            # Tenta atualizar o banco para a última versão disponível ("head")
            command.upgrade(alembic_cfg, "head")
            print("✅ Migrações concluídas com sucesso. Banco de dados atualizado.")
        except Exception as e:
            # Caso o erro seja de tabela existente (banco já criado via create_all no passado)
            # Nós marcamos o banco como atualizado (stamp head) para sincronizar o Alembic
            if "already exists" in str(e).lower():
                print("ℹ️ Banco de dados já possui tabelas mas não está versionado. Sincronizando com Alembic...")
                command.stamp(alembic_cfg, "head")
                print("✅ Sincronização concluída. O banco agora está sob controle do Alembic.")
            else:
                raise e
    except Exception as e:
        import traceback
        print(f"⚠️ Erro ao executar migrações do Alembic: {e}")
        traceback.print_exc()

# Chama a função de inicialização logo na carga do módulo
init_db_schema()

def seed_db():
    """
    Popula o banco de dados com dados iniciais essenciais caso eles não existam,
    como Setores, Perfis e o Usuário Administrador padrão.
    """
    db = database.SessionLocal()
    try:
        # Garante a existência do setor "Suporte"
        support_sector = db.query(models.Sector).filter(func.lower(models.Sector.name) == "suporte").first()
        if not support_sector:
            support_sector = models.Sector(name="Suporte", description="Setor padrão de atendimento")
            db.add(support_sector)
            db.commit()
            db.refresh(support_sector)

        # Garante a existência do perfil "Master" (acesso total)
        master_profile = db.query(models.Profile).filter(models.Profile.name == "Master").first()
        if not master_profile:
            master_profile = models.Profile(name="Master", description="Acesso total ao sistema", permissions={"menus": ["*"], "actions": ["*"]})
            db.add(master_profile)
            db.commit()
            db.refresh(master_profile)

        # Garante a existência do perfil de "Técnico"
        if not db.query(models.Profile).filter(models.Profile.name == "Técnico").first():
            tech_profile = models.Profile(name="Técnico", description="Atendimento e gestão de chamados", permissions={"menus": ["dashboard", "tickets", "clients", "knowledge", "whatsapp"], "actions": ["create_ticket", "edit_ticket"]})
            db.add(tech_profile)
            db.commit()

        # Garante a existência do perfil de "Leitor"
        if not db.query(models.Profile).filter(models.Profile.name == "Leitor").first():
            reader_profile = models.Profile(name="Leitor", description="Apenas visualização", permissions={"menus": ["dashboard", "tickets"], "actions": []})
            db.add(reader_profile)
            db.commit()

        # Criação do usuário ROOT padrão (username: admin / senha: admin)
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
            # Atualiza permissões do admin existente para garantir nível ROOT
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

        # Garante que existam Categoria e Status padrão
        crud.get_or_create_default_category(db, sector_id=support_sector.id)
        crud.get_or_create_default_status(db, sector_id=support_sector.id)
        
    except Exception as e:
        # Caso o banco ainda não exista fisicamente, o erro é ignorado para ser tratado na primeira execução
        if "não existe" in str(e).lower() or "not exist" in str(e).lower():
            print(f"ℹ️ seed_db: Banco de dados ainda não existe. Ignorando população inicial.")
        else:
            print(f"⚠️ Erro ao popular banco de dados: {e}")
        db.rollback()
    finally:
        db.close()

# Instância principal do FastAPI
app = FastAPI(title="Sistema de Tickets Offline")

@app.on_event("startup")
async def startup_event():
    """Evento executado quando o servidor inicia. Popula o banco."""
    seed_db()

# Flag para indicar se o sistema está em processo de restauração de backup
IS_RESTORING = False

@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    """Bloqueia acesso a rotas do sistema durante a restauração de backup."""
    if IS_RESTORING and request.url.path != "/system/restore":
        return Response(content='{"detail": "Sistema em manutenção para restauração de backup."}', status_code=503, media_type="application/json")
    return await call_next(request)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Middleware para log de performance e monitoramento de requests."""
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

# Configuração de CORS (Cross-Origin Resource Sharing) para permitir acesso do frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuração do diretório de uploads
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Monta o diretório de uploads como arquivos estáticos acessíveis via URL
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# ==============================================================================
# ROTAS DE SISTEMA E AUTENTICAÇÃO
# ==============================================================================

@app.get("/")
def read_root():
    """Rota raiz apenas para conferência de status."""
    return {"status": "ok", "message": "Sistema de Tickets Offline Rodando"}

@app.get("/health")
def health_check(db: Session = Depends(database.get_db)):
    """Verifica a saúde do sistema e a conectividade com o banco de dados."""
    try:
        # Tenta uma consulta simples para validar o banco
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        return {"status": "degraded", "db": "error", "detail": str(e), "timestamp": datetime.now().isoformat()}

@app.post("/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    """Rota de login que retorna um token JWT de acesso."""
    db_user = crud.get_user_by_username(db, username=form_data.username)
    if not db_user or not auth.verify_password(form_data.password, db_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário ou senha incorretos", headers={"WWW-Authenticate": "Bearer"})
    access_token = auth.create_access_token(data={"sub": db_user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    """Retorna os dados do usuário logado e atualiza seu timestamp de atividade."""
    # Atualiza o last_seen do usuário logado para monitoramento de online
    current_user.last_seen = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return current_user

@app.get("/users/me/followed-tickets", response_model=List[schemas.Ticket])
def read_followed_tickets(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    """Retorna a lista de chamados que o usuário atual está seguindo."""
    return current_user.followed_tickets

# ==============================================================================
# GESTÃO DE USUÁRIOS E SETORES
# ==============================================================================

@app.get("/users/", response_model=List[schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Lista todos os usuários. Requer privilégios de Admin."""
    return crud.get_users(db, skip=skip, limit=limit)

@app.get("/users/attendants")
def read_attendants(sector_id: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Lista usuários curtos (ID/Nome) para seleção em formulários."""
    users = crud.get_users_short(db, sector_id=sector_id)
    return [{"id": u[0], "name": u[1] or u[2]} for u in users]

@app.get("/sectors/", response_model=List[schemas.Sector])
def read_sectors(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Lista todos os setores cadastrados."""
    return crud.get_sectors(db, skip=skip, limit=limit)

@app.post("/sectors/", response_model=schemas.Sector)
def create_sector(sector: schemas.SectorCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Cria um novo setor. Requer privilégios de Admin."""
    return crud.create_sector(db=db, sector=sector)

@app.put("/sectors/{sector_id}", response_model=schemas.Sector)
def update_sector(sector_id: int, sector: schemas.SectorUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Atualiza dados de um setor existente."""
    db_sector = crud.update_sector(db=db, sector_id=sector_id, sector_update=sector)
    if not db_sector:
        raise HTTPException(status_code=404, detail="Setor não encontrado")
    return db_sector

@app.delete("/sectors/{sector_id}")
def delete_sector(sector_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Remove um setor do sistema, se não houver vínculos impeditivos."""
    success, message = crud.delete_sector(db, sector_id)
    if not success:
        if "não encontrado" in message:
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}


@app.get("/users/online", response_model=List[schemas.User])
def get_online_users(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """
    Retorna a lista de usuários que estiveram ativos nos últimos 5 minutos.
    Utiliza o campo 'last_seen' para determinar o status online.
    """
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(minutes=5)
    users = db.query(models.User).filter(
        models.User.last_seen >= cutoff,
        models.User.is_active == True
    ).all()
    return users

@app.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Cria um novo usuário. Valida unicidade de username e e-mail."""
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user: raise HTTPException(status_code=400, detail="Nome de usuário já registrado")
    db_email = crud.get_user_by_email(db, email=user.email)
    if db_email: raise HTTPException(status_code=400, detail="E-mail já registrado")
    hashed_password = auth.get_password_hash(user.password)
    return crud.create_user(db=db, user=user, hashed_password=hashed_password)

@app.put("/users/{user_id}", response_model=schemas.User)
def update_user_endpoint(user_id: int, user: schemas.UserUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Atualiza dados do usuário. Somente ROOT pode promover outro para ROOT."""
    if user.role == "ROOT" and current_user.role != "ROOT":
         raise HTTPException(status_code=403, detail="Apenas usuários ROOT podem criar outros ROOT")
    hashed_password = auth.get_password_hash(user.password) if user.password else None
    db_user = crud.update_user(db=db, user_id=user_id, user_update=user, hashed_password=hashed_password)
    if db_user is None: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return db_user

@app.delete("/users/{user_id}")
def delete_user_endpoint(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    """Remove um usuário do sistema. Requer permissão ROOT."""
    success = crud.delete_user(db=db, user_id=user_id)
    if not success: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"message": "Usuário excluído com sucesso"}

@app.post("/users/{user_id}/avatar", response_model=schemas.User)
async def upload_user_avatar(user_id: int, file: UploadFile = File(...), db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """
    Realiza o upload de foto de perfil (avatar) para um usuário.
    Suporta PNG, JPG, WEBP e GIF. O arquivo é salvo localmente no servidor.
    """
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Validação de tipo MIME
    allowed_types = {"image/png", "image/jpeg", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo de arquivo inválido. Use PNG, JPG ou WEBP.")

    # Garante que o diretório de destino existe
    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads", "avatars")
    os.makedirs(uploads_dir, exist_ok=True)

    # Remove o arquivo do avatar antigo para não acumular lixo no storage
    if db_user.avatar_url:
        old_path = os.path.join(os.path.dirname(__file__), db_user.avatar_url.lstrip("/"))
        if os.path.exists(old_path):
            os.remove(old_path)

    # Gera um nome de arquivo único para o novo avatar
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"avatar_{user_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(uploads_dir, filename)

    # Salva o arquivo fisicamente
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Atualiza a URL no banco de dados
    avatar_url = f"/uploads/avatars/{filename}"
    db_user.avatar_url = avatar_url
    db.commit()
    db.refresh(db_user)
    return db_user

@app.delete("/users/{user_id}/avatar", response_model=schemas.User)
def remove_user_avatar(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Remove o avatar de um usuário e apaga o arquivo do servidor."""
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if db_user.avatar_url:
        old_path = os.path.join(os.path.dirname(__file__), db_user.avatar_url.lstrip("/"))
        if os.path.exists(old_path):
            os.remove(old_path)
    db_user.avatar_url = None
    db.commit()
    db.refresh(db_user)
    return db_user

# ==============================================================================
# GESTÃO DE PERFIS (PROFILES)
# ==============================================================================

@app.get("/profiles/", response_model=List[schemas.Profile])
def read_profiles(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Retorna todos os perfis de acesso (Master, Técnico, etc.)."""
    return crud.get_profiles(db, skip=skip, limit=limit)

@app.post("/profiles/", response_model=schemas.Profile)
def create_profile(profile: schemas.ProfileCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    """Cria um novo perfil de acesso. Somente usuários ROOT."""
    return crud.create_profile(db=db, profile=profile)

@app.put("/profiles/{profile_id}", response_model=schemas.Profile)
def update_profile(profile_id: int, profile: schemas.ProfileCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    """Atualiza as permissões ou descrição de um perfil."""
    db_profile = crud.update_profile(db=db, profile_id=profile_id, profile_update=profile)
    if not db_profile: raise HTTPException(status_code=404, detail="Perfil não encontrado")
    return db_profile

@app.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_root)):
    """Exclui um perfil se não estiver em uso por nenhum usuário ativo."""
    success = crud.delete_profile(db=db, profile_id=profile_id)
    if not success: raise HTTPException(status_code=400, detail="Perfil não encontrado ou em uso")
    return {"message": "Perfil excluído com sucesso"}

# ==============================================================================
# GESTÃO DE CLIENTES
# ==============================================================================

@app.post("/clients/", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(database.get_db)):
    """Cadastra um novo cliente no sistema. Valida se o e-mail já existe."""
    db_client = crud.get_client_by_email(db, email=client.email)
    if db_client: raise HTTPException(status_code=400, detail="E-mail já registrado")
    return crud.create_client(db=db, client=client)

@app.get("/clients/", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, q: Optional[str] = None, doc_type: Optional[str] = None, has_phone: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Lista clientes com suporte a paginação e diversos filtros (busca, tipo doc, data)."""
    return crud.get_clients(db, skip=skip, limit=limit, q=q, doc_type=doc_type, has_phone=has_phone, start_date=start_date, end_date=end_date)

@app.get("/clients/count")
def read_clients_count(q: Optional[str] = None, doc_type: Optional[str] = None, has_phone: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Retorna o total de clientes que atendem aos filtros especificados."""
    return {"count": crud.get_clients_count(db, q=q, doc_type=doc_type, has_phone=has_phone, start_date=start_date, end_date=end_date)}

@app.get("/clients/{client_id}", response_model=schemas.Client)
def read_client(client_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Busca detalhes de um cliente específico pelo ID."""
    db_client = crud.get_client(db, client_id=client_id)
    if db_client is None: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return db_client

@app.put("/clients/{client_id}", response_model=schemas.Client)
def update_client(client_id: int, client: schemas.ClientCreate, db: Session = Depends(database.get_db)):
    """Atualiza as informações de um cliente cadastrado."""
    db_client = crud.update_client(db=db, client_id=client_id, client_update=client)
    if db_client is None: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return db_client

@app.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(database.get_db)):
    """Exclui permanentemente um cliente do sistema."""
    success = crud.delete_client(db=db, client_id=client_id)
    if not success: raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return {"message": "Cliente excluído com sucesso"}

# Mapeamento de colunas amigáveis para importação de clientes via Excel/CSV
CLIENT_IMPORT_COLUMNS = {"name": "Nome Completo", "nickname": "Nome Fantasia", "email": "E-mail", "cpf_cnpj": "CPF_CNPJ", "phone": "Telefone", "cep": "CEP", "city": "Cidade", "uf": "UF", "street": "Logradouro", "number": "Número", "complement": "Complemento", "neighborhood": "Bairro", "state_registration": "Inscrição Estadual", "tax_regime": "Regime Tributário"}

@app.get("/clients/import/template")
def download_client_template():
    """Gera um arquivo Excel modelo para preenchimento e importação de clientes."""
    from io import BytesIO
    df = pd.DataFrame(columns=list(CLIENT_IMPORT_COLUMNS.values()))
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Modelo Importação')
    return Response(content=output.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=modelo_importacao_clientes.xlsx"})

@app.post("/clients/import/excel", response_model=schemas.ImportResult)
async def import_clients_excel(file: UploadFile = File(...), db: Session = Depends(database.get_db)):
    """Realiza a importação massiva de clientes a partir de um arquivo Excel ou CSV."""
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents)) if file.filename.endswith(('.xlsx', '.xls')) else pd.read_csv(io.BytesIO(contents))
        # Traduz as colunas do Excel para os campos do sistema
        reverse_mapping = {v.lower().strip(): k for k, v in CLIENT_IMPORT_COLUMNS.items()}
        df.columns = [reverse_mapping.get(str(c).lower().strip(), str(c).lower().strip()) for c in df.columns]
        
        # Validação mínima obrigatória
        if not {'name', 'cpf_cnpj'}.issubset(df.columns):
            raise HTTPException(status_code=400, detail="Arquivo deve conter ao menos Nome e CPF_CNPJ")
        
        valid_cols = set(CLIENT_IMPORT_COLUMNS.keys())
        df = df[[c for c in df.columns if c in valid_cols]]
        return crud.bulk_create_clients(db, df.to_dict('records'))
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/clients/import/db/preview")
def preview_clients_db(config: schemas.DBImportConfigs, db: Session = Depends(database.get_db)):
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
        # Validação de segurança básica na query
        query_str = config.query if config.query else f"SELECT * FROM {config.table}"
        crud.validate_sql_query(query_str)
        
        ext_engine = create_engine(url)
        with ext_engine.connect() as conn:
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
def import_clients_db(config: schemas.DBImportConfigs, db: Session = Depends(database.get_db)):
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
        # Validação de segurança básica na query
        query_str = config.query if config.query else f"SELECT * FROM {config.table}"
        crud.validate_sql_query(query_str)
        
        ext_engine = create_engine(url)
        with ext_engine.connect() as conn:
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

# ==============================================================================
# GESTÃO DE CATEGORIAS E STATUS
# ==============================================================================

@app.get("/categories/", response_model=List[schemas.CategoryWithSub])
def read_categories(sector_id: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Lista categorias de chamados, opcionalmente filtradas por setor."""
    return crud.get_categories(db, sector_id=sector_id)

@app.post("/categories/", response_model=schemas.Category)
def create_category(cat: schemas.CategoryCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Cria uma nova categoria. Requer Admin."""
    return crud.create_category(db=db, cat=cat)

@app.put("/categories/{cat_id}", response_model=schemas.Category)
def update_category(cat_id: int, cat: schemas.CategoryCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Atualiza uma categoria existente."""
    db_cat = crud.update_category(db=db, cat_id=cat_id, cat_update=cat)
    if not db_cat: raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return db_cat

@app.delete("/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Remove uma categoria. Impede exclusão se houver chamados vinculados."""
    success, message = crud.delete_category(db=db, cat_id=cat_id)
    if not success: raise HTTPException(status_code=400 if "não" not in message else 404, detail=message)
    return {"message": message}

@app.get("/statuses/", response_model=List[schemas.Status])
def read_statuses(sector_id: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Lista todos os status possíveis para os chamados."""
    return crud.get_statuses(db, sector_id=sector_id)

@app.post("/statuses/", response_model=schemas.Status)
def create_status(status: schemas.StatusCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Cria um novo status customizado."""
    return crud.create_status(db=db, status=status)

@app.delete("/statuses/{status_id}")
def delete_status(status_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Remove um status customizado."""
    success, message = crud.delete_status(db=db, status_id=status_id)
    if not success: raise HTTPException(status_code=400 if "não" not in message else 404, detail=message)
    return {"message": message}

@app.put("/statuses/{status_id}", response_model=schemas.Status)
def update_status(status_id: int, status: schemas.StatusBase, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Atualiza as propriedades de um status."""
    db_status = crud.update_status(db=db, status_id=status_id, status_update=status)
    if not db_status: raise HTTPException(status_code=404, detail="Status não encontrado")
    return db_status

# ==============================================================================
# GESTÃO DE CHAMADOS (TICKETS)
# ==============================================================================

@app.post("/tickets/", response_model=schemas.Ticket)
def create_ticket(ticket: schemas.TicketCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Cria um novo chamado detalhado vincuado ao usuário logado."""
    return crud.create_ticket(db=db, ticket=ticket, created_by_id=current_user.id)

@app.post("/tickets/simple", response_model=schemas.Ticket)
def create_ticket_simple(ticket: schemas.TicketCreateSimple, db: Session = Depends(database.get_db)):
    """Cria um chamado simplificado (útil para integrações rápidas)."""
    return crud.create_ticket_simple(db=db, ticket=ticket)

@app.get("/tickets/", response_model=List[schemas.Ticket])
def read_tickets(skip: int = 0, limit: int = 100, q: Optional[str] = None, status: Optional[str] = None, client_id: Optional[int] = None, sector_id: Optional[int] = None, priority: Optional[str] = None, category_id: Optional[int] = None, assigned_user_id: Optional[int] = None, created_by_id: Optional[int] = None, follower_id: Optional[int] = None, my_plus_unassigned_id: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, unassigned_only: bool = False, exclude_finalized: bool = False, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """
    Lista chamados com múltiplos filtros: busca textual, status, cliente, setor, 
    prioridade, categoria, responsável, criador, seguidor, etc.
    """
    return crud.get_tickets(db, skip=skip, limit=limit, q=q, status=status, client_id=client_id, sector_id=sector_id, priority=priority, category_id=category_id, assigned_user_id=assigned_user_id, created_by_id=created_by_id, follower_id=follower_id, my_plus_unassigned_id=my_plus_unassigned_id, start_date=start_date, end_date=end_date, unassigned_only=unassigned_only, exclude_finalized=exclude_finalized)

@app.get("/tickets/count")
def read_tickets_count(q: Optional[str] = None, status: Optional[str] = None, client_id: Optional[int] = None, sector_id: Optional[int] = None, priority: Optional[str] = None, category_id: Optional[int] = None, assigned_user_id: Optional[int] = None, created_by_id: Optional[int] = None, follower_id: Optional[int] = None, my_plus_unassigned_id: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, unassigned_only: bool = False, exclude_finalized: bool = False, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Retorna a contagem total de chamados baseada nos filtros aplicados."""
    count = crud.get_tickets_count(db, q=q, status=status, client_id=client_id, sector_id=sector_id, priority=priority, category_id=category_id, assigned_user_id=assigned_user_id, created_by_id=created_by_id, follower_id=follower_id, my_plus_unassigned_id=my_plus_unassigned_id, start_date=start_date, end_date=end_date, unassigned_only=unassigned_only, exclude_finalized=exclude_finalized)
    return {"count": count}

# ==============================================================================
# DASHBOARD E RELATÓRIOS
# ==============================================================================

@app.get("/dashboard/stats")
def read_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(database.get_db)):
    """Retorna estatísticas consolidadas para o dashboard principal."""
    return {
        "summary": crud.get_detailed_report_stats(db, start_date, end_date, sector_id, user_id),
        "trends": [] # Futura implementação de tendências temporais
    }

@app.get("/reports/summary")
def get_report_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)):
    """Gera um resumo detalhado de performance para relatórios."""
    return crud.get_detailed_report_stats(db, start_date, end_date, sector_id, user_id, current_user)

@app.get("/tickets/{ticket_id}", response_model=schemas.Ticket)
def read_ticket(ticket_id: int, db: Session = Depends(database.get_db)):
    """Busca um chamado específico pelo seu ID."""
    db_ticket = crud.get_ticket(db, ticket_id=ticket_id)
    if db_ticket is None: raise HTTPException(status_code=404, detail="Chamado não encontrado")
    return db_ticket

@app.post("/tickets/{ticket_id}/messages/", response_model=schemas.TicketMessage)
def create_message(ticket_id: int, message: schemas.TicketMessageCreate, db: Session = Depends(database.get_db)):
    """Adiciona uma nova interação (mensagem/comentário) a um chamado."""
    return crud.create_ticket_message(db=db, message=message, ticket_id=ticket_id)

@app.put("/tickets/{ticket_id}", response_model=schemas.Ticket)
def update_ticket(ticket_id: int, ticket: schemas.TicketUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Atualiza dados do chamado (status, responsável, setor, etc.)."""
    db_ticket = crud.get_ticket(db, ticket_id=ticket_id)
    if db_ticket is None: raise HTTPException(status_code=404, detail="Chamado não encontrado")
    
    # Valida permissão para transferência de setor ou responsável
    if (ticket.sector_id or ticket.assigned_user_id) and not (db_ticket.assigned_user_id == current_user.id or current_user.role in ["ADMIN", "ROOT"]):
        raise HTTPException(status_code=403, detail="Sem permissão para transferir")
    
    return crud.update_ticket(db=db, ticket_id=ticket_id, ticket_update=ticket, user_id=current_user.id)

@app.get("/tickets/{ticket_id}/history", response_model=List[schemas.TicketHistory])
def read_ticket_history(ticket_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Retorna o histórico de alterações (log) de um chamado específico."""
    return crud.get_ticket_history_list(db, ticket_id=ticket_id)

@app.get("/tickets/export")
def export_tickets(format: str = "csv", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Exporta a lista de chamados em formatos CSV, EXCEL ou JSON."""
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
def export_idle_clients(start_date: str, end_date: str, format: str = "excel", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Relatório de clientes inativos (sem chamados) em um determinado período."""
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
def delete_ticket_rest(ticket_id: int, db: Session = Depends(database.get_db)):
    """Exclui um chamado permanentemente."""
    if not crud.delete_ticket(db=db, ticket_id=ticket_id): raise HTTPException(status_code=404, detail="Não encontrado")
    return {"message": "Excluído"}

# ==============================================================================
# CONTROLE DE TEMPO (TIMER)
# ==============================================================================

@app.post("/tickets/{ticket_id}/timer/start", response_model=schemas.TimeLog)
def start_timer(ticket_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Inicia o cronômetro para contagem de horas em um chamado."""
    t = crud.get_ticket(db, ticket_id); 
    if not t: raise HTTPException(status_code=404); 
    if t.assigned_user_id != current_user.id: raise HTTPException(status_code=403)
    return crud.start_ticket_timer(db, ticket_id, current_user.id)

@app.post("/tickets/{ticket_id}/timer/stop", response_model=schemas.TimeLog)
def stop_timer(ticket_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Para o cronômetro ativo e registra o tempo total gasto na sessão."""
    res = crud.stop_ticket_timer(db, ticket_id, current_user.id)
    if not res: raise HTTPException(status_code=400)
    return res

@app.get("/tickets/timers/active", response_model=List[schemas.TimeLog])
def get_active_timers(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Retorna todos os cronômetros ativos do usuário logado."""
    return crud.get_active_timers(db, current_user.id)

@app.get("/tickets/{ticket_id}/timer/stats", response_model=List[schemas.StatusTimeGroup])
def get_timer_stats(ticket_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Retorna estatísticas de tempo agrupadas por status para um chamado."""
    return crud.get_ticket_timer_stats(db, ticket_id)

@app.post("/tickets/{ticket_id}/follow", response_model=schemas.Ticket)
def follow_ticket(ticket_id: int, user_id: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Permite que um usuário siga um chamado para receber notificações."""
    target = user_id if user_id else current_user.id
    if target != current_user.id:
        t = crud.get_ticket(db, ticket_id)
        if not (t.assigned_user_id == current_user.id or current_user.role in ["ADMIN", "ROOT"]): raise HTTPException(status_code=403)
    success, ticket = crud.add_ticket_follower(db, ticket_id, target, current_user.id)
    if not success: raise HTTPException(status_code=400)
    return ticket

@app.post("/tickets/{ticket_id}/unfollow", response_model=schemas.Ticket)
def unfollow_ticket(ticket_id: int, user_id: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Remove um usuário da lista de seguidores de um chamado."""
    target = user_id if user_id else current_user.id
    if target != current_user.id:
        t = crud.get_ticket(db, ticket_id)
        if not (t.assigned_user_id == current_user.id or current_user.role in ["ADMIN", "ROOT"]): raise HTTPException(status_code=403)
    success, ticket = crud.remove_ticket_follower(db, ticket_id, target, current_user.id)
    if not success: raise HTTPException(status_code=400)
    return ticket

# ==============================================================================
# BASE DE CONHECIMENTO (RAG)
# ==============================================================================

@app.get("/knowledge/", response_model=List[schemas.KnowledgeDocument])
def read_knowledge(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    """Lista documentos da base de conhecimento."""
    return crud.get_knowledge_documents(db, skip, limit)

@app.post("/knowledge/", response_model=schemas.KnowledgeDocument)
def create_knowledge(doc: schemas.KnowledgeDocumentCreate, db: Session = Depends(database.get_db)):
    """Cria documento de conhecimento e indexa no motor de busca (RAG)."""
    d = crud.create_knowledge_document(db, doc); rag.add_document(d.id, d.content, {"title": d.title, "category": d.category})
    return d

@app.put("/knowledge/{doc_id}", response_model=schemas.KnowledgeDocument)
def update_knowledge(doc_id: int, doc: schemas.KnowledgeDocumentCreate, db: Session = Depends(database.get_db)):
    """Atualiza documento e re-indexa no RAG."""
    d = crud.update_knowledge_document(db, doc_id, doc)
    if not d: raise HTTPException(status_code=404)
    rag.add_document(d.id, d.content, {"title": d.title, "category": d.category})
    return d

@app.delete("/knowledge/{doc_id}")
def delete_knowledge(doc_id: int, db: Session = Depends(database.get_db)):
    """Remove documento do banco. Nota: Deve-se tratar remoção no ChromaDB se necessário."""
    if not crud.delete_knowledge_document(db, doc_id): raise HTTPException(status_code=404)
    return {"message": "Excluído"}

@app.get("/knowledge/search/")
def search_knowledge(query: str, limit: int = 3):
    """Busca híbrida na base de conhecimento utilizando RAG."""
    r = rag.query_documents(query, limit); results: Dict[str, Any] = {"documents": [[], []], "metadatas": [[], []], "ids": [[], []], "source": "hybrid"}
    if r.get("documents") and r["documents"][0]:
        for i in range(len(r["documents"][0])):
            doc, meta, id_ = r["documents"][0][i], r["metadatas"][0][i], r["ids"][0][i]
            idx = 1 if meta.get("source") == "ticket" else 0
            results["documents"][idx].append(doc); results["ids"][idx].append(id_)
            results["metadatas"][idx].append({"title": f"#{id_}: {meta.get('title')}" if idx==1 else meta.get('title'), "category": meta.get("category")})
    return results

# ==============================================================================
# UPLOAD E MÍDIA
# ==============================================================================

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    """Upload genérico de arquivos (anexos)."""
    name = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"; path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f: shutil.copyfileobj(file.file, f)
    return {"url": f"http://localhost:8000/uploads/{name}"}

# ==============================================================================
# OPERAÇÕES DO SISTEMA (RESET, BACKUP, RESTORE)
# ==============================================================================

@app.post("/system/reset")
async def reset_db(p: schemas.SystemReset, db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_active_root)):
    """Reseta entidades específicas do banco de dados. Requer confirmação 'DELETAR'."""
    if p.confirmation != "DELETAR": raise HTTPException(status_code=400)
    stats = crud.reset_entities(db, p.entities, u.id)
    if "knowledge" in p.entities: rag.clear_knowledge_base()
    return {"status": "ok", "details": stats}

@app.get("/system/backup")
def backup(db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_active_root)):
    """Gera um backup completo (Banco SQLite + Uploads + ChromaDB) em formato ZIP."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        # Adiciona arquivos do banco SQLite
        for f in [database.DB_PATH, database.DB_PATH+"-wal", database.DB_PATH+"-shm"]:
            if os.path.exists(f): z.write(f, os.path.basename(f))
        # Adiciona pastas de uploads e banco de vetores
        for d in [UPLOAD_DIR, os.path.join(database.BASE_DIR, "chroma_db")]:
            if os.path.exists(d):
                for r, _, files in os.walk(d):
                    for f in files: fp = os.path.join(r, f); z.write(fp, os.path.relpath(fp, database.BASE_DIR))
    buf.seek(0); return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": "attachment; filename=backup.zip"})

@app.post("/system/restore")
async def restore(request: Request, file: UploadFile = File(...)):
    """Restaura o sistema a partir de um arquivo ZIP de backup."""
    global IS_RESTORING; IS_RESTORING = True
    try:
        path = os.path.join(database.BASE_DIR, "restore.zip")
        with open(path, "wb") as f: shutil.copyfileobj(file.file, f)
        database.engine.dispose() if hasattr(database, 'engine') and database.engine else None
        await asyncio.sleep(1) # Aguarda liberação de locks de arquivo
        with zipfile.ZipFile(path, 'r') as z: z.extractall(database.BASE_DIR)
        database.get_engine_and_session()
        init_db_schema()
        seed_db(); return {"status": "ok"}
    finally: IS_RESTORING = False

# ==============================================================================
# SISTEMA DE NOTIFICAÇÕES
# ==============================================================================

@app.get("/notifications", response_model=List[schemas.Notification])
def read_notifications(skip: int = 0, limit: int = 50, db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_user)):
    """Retorna a lista de notificações do usuário logado."""
    return crud.get_notifications(db, u.id, skip, limit)

@app.get("/notifications/unread-count")
def read_unread(db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_user)):
    """Retorna a quantidade de notificações não lidas."""
    return {"count": crud.get_unread_notification_count(db, u.id)}

@app.post("/notifications/{id}/read", response_model=schemas.Notification)
def mark_read(id: int, db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_user)):
    """Marca uma notificação específica como lida."""
    n = crud.mark_notification_as_read(db, id, u.id)
    if not n: raise HTTPException(status_code=404)
    return n

@app.post("/notifications/read-all")
def read_all(db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_user)):
    """Marca todas as notificações do usuário como lidas."""
    crud.mark_all_notifications_as_read(db, u.id)
    return {"status": "ok"}

@app.post("/notifications/send", response_model=schemas.Notification)
def send_notif(data: schemas.NotificationSend, db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_user)):
    """Envia uma notificação interna para outro usuário."""
    n = crud.send_user_notification(db, u.id, data)
    if not n: raise HTTPException(status_code=404)
    return n

# ==============================================================================
# CONFIGURAÇÕES VISUAIS E DE SISTEMA
# ==============================================================================

@app.get("/system-settings", response_model=schemas.SystemSettings)
def get_settings(db: Session = Depends(database.get_db)): 
    """Retorna as configurações globais do sistema (cores, logos, nome da empresa)."""
    return crud.get_system_settings(db)

@app.patch("/system-settings", response_model=schemas.SystemSettings)
def patch_settings(update: schemas.SystemSettingsUpdate, db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_active_admin)):
    """Atualiza as configurações globais do sistema."""
    return crud.update_system_settings(db, update)

@app.post("/system-settings/logo", response_model=schemas.SystemSettings)
async def upload_logo(theme: str, file: UploadFile = File(...), db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_active_admin)):
    """Faz o upload do logotipo para os temas claro ou escuro."""
    ext = os.path.splitext(file.filename)[1]
    name = f"logo_{theme}_{uuid.uuid4()}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    url = f"/uploads/{name}"
    update = schemas.SystemSettingsUpdate()
    if theme == "light":
        update.logo_url_light = url
    else:
        update.logo_url_dark = url
    
    return crud.update_system_settings(db, update)

@app.post("/system-settings/favicon", response_model=schemas.SystemSettings)
async def upload_favicon(file: UploadFile = File(...), db: Session = Depends(database.get_db), u: models.User = Depends(auth.get_current_active_admin)):
    """Faz o upload do favicon (ícone da aba do navegador)."""
    ext = os.path.splitext(file.filename)[1]
    name = f"favicon_{uuid.uuid4()}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    url = f"/uploads/{name}"
    update = schemas.SystemSettingsUpdate(favicon_url=url)
    return crud.update_system_settings(db, update)

# ==============================================================================
# CONFIGURAÇÃO DE INFRAESTRUTURA (BANCO DE DADOS)
# ==============================================================================

@app.post("/api/system/config-db")
async def config_db_api(config: schemas.DBConfig):
    """
    Endpoint para configuração dinâmica do banco de dados (SQLite ou PostgreSQL).
    Atualiza o arquivo .env e reinicializa a conexão.
    """
    import sys
    import config_db
    if config.engine == "sqlite":
        # Define diretório de instalação baseado se está rodando via executável ou script
        if getattr(sys, 'frozen', False):
            install_dir = os.path.dirname(sys.executable)
        else:
            install_dir = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.join(install_dir, config.sqlite.dbname).replace(os.sep, '/')
        url = f"sqlite:///{db_path}"
    else:
        # Tenta criar o banco PostgreSQL se ele ainda não existir
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
    
    # Atualiza arquivo físico .env
    config_db.update_env_file(url)
    
    # Hot-Reload: Atualiza conexão do banco em tempo de execução
    database.get_engine_and_session()
    init_db_schema()
    seed_db()
    
    return {"status": "success", "message": "Configuração salva com sucesso!"}

@app.get("/api/system/status")
async def sys_status(): 
    """Verifica se o sistema já possui uma string de conexão configurada."""
    return {"is_configured": bool(os.getenv("DATABASE_URL"))}

@app.get("/api/system/db-info")
async def db_info():
    """Retorna informações amigáveis sobre o banco de dados atual (ocultando senhas)."""
    url = os.getenv("DATABASE_URL", "")
    if not url:
        return {"type": "none", "label": "Não configurado", "details": ""}
    
    if url.startswith("sqlite"):
        path = url.replace("sqlite:///", "").replace("sqlite://", "")
        filename = os.path.basename(path) if path else "memory"
        return {"type": "sqlite", "label": "SQLite", "details": filename, "path": path}
    elif "postgresql" in url or "postgres" in url:
        import re
        match = re.search(r'@([^/]+)/(.+)$', url)
        if match:
            host = match.group(1); dbname = match.group(2).split('?')[0]
            return {"type": "postgresql", "label": "PostgreSQL", "details": f"{host}/{dbname}"}
        return {"type": "postgresql", "label": "PostgreSQL", "details": "configurado"}
    else:
        return {"type": "other", "label": "Outro", "details": url[:50]}

# ==============================================================================
# RELATÓRIOS CUSTOMIZADOS (SQL DIRETO)
# ==============================================================================

@app.get("/reports/custom", response_model=List[schemas.CustomReport])
def read_custom_reports(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Lista modelos de relatórios customizados salvos."""
    return crud.get_custom_reports(db, skip=skip, limit=limit)

@app.get("/reports/custom/{report_id}", response_model=schemas.CustomReport)
def read_custom_report(report_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Busca um modelo de relatório específico."""
    db_report = crud.get_custom_report(db, report_id=report_id)
    if not db_report: raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return db_report

@app.post("/reports/custom", response_model=schemas.CustomReport)
def create_custom_report(report: schemas.CustomReportCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Salva um novo modelo de relatório customizado."""
    return crud.create_custom_report(db=db, report=report, user_id=current_user.id)

@app.put("/reports/custom/{report_id}", response_model=schemas.CustomReport)
def update_custom_report(report_id: int, report: schemas.CustomReportUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Atualiza um modelo de relatório existente."""
    db_report = crud.update_custom_report(db, report_id=report_id, report_update=report)
    if not db_report: raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return db_report

@app.delete("/reports/custom/{report_id}")
def delete_custom_report(report_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Remove um modelo de relatório."""
    if not crud.delete_custom_report(db, report_id=report_id): raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return {"status": "success"}

@app.post("/reports/custom/execute")
def execute_report(execution_data: Dict[str, Any], db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Executa uma consulta SQL customizada no banco de dados e retorna os dados brutos."""
    query = execution_data.get("query")
    variables = execution_data.get("variables", {})
    if not query: raise HTTPException(status_code=400, detail="Query SQL é obrigatória")
    try:
        return crud.execute_custom_report(db, query, variables)
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# ROTAS DO CATÁLOGO DE SERVIÇOS
# ==============================================================================

@app.get("/catalog-items/", response_model=List[schemas.CatalogItem])
def read_catalog_items(active_only: bool = False, skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Lista itens do catálogo cadastrados."""
    return crud.get_catalog_items(db, skip=skip, limit=limit, active_only=active_only)

@app.post("/catalog-items/", response_model=schemas.CatalogItem)
def create_catalog_item(item: schemas.CatalogItemCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Cria um novo item no catálogo. Requer Admin."""
    return crud.create_catalog_item(db=db, item=item)

@app.put("/catalog-items/{item_id}", response_model=schemas.CatalogItem)
def update_catalog_item(item_id: int, item: schemas.CatalogItemBase, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Atualiza um item do catálogo."""
    # Note: Using StatusBase pattern here as update
    db_item = crud.update_catalog_item(db=db, item_id=item_id, item_update=item)
    if not db_item: raise HTTPException(status_code=404, detail="Item não encontrado")
    return db_item

@app.delete("/catalog-items/{item_id}")
def delete_catalog_item(item_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_admin)):
    """Remove um item do catálogo."""
    if not crud.delete_catalog_item(db=db, item_id=item_id):
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return {"message": "Item removido com sucesso"}
