from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os
import sys
from dotenv import load_dotenv

# Determinar o diretório base de forma robusta para ambientes de serviço
# Quando rodando como EXE do PyInstaller: sys.executable = C:\TicketFlow\TicketFlow_Backend_Service.exe
# Quando rodando como script normal: __file__ = .../server/database.py
if getattr(sys, 'frozen', False):
    # Executando como EXE PyInstaller - base é a pasta do EXE
    _base_dir = os.path.dirname(sys.executable)
else:
    # Executando como script Python - base é a pasta server
    _base_dir = os.path.dirname(os.path.abspath(__file__))

# Tentar carregar .env de várias localizações possíveis
_env_locations = [
    os.path.join(_base_dir, ".env"),           # C:\TicketFlow\.env (EXE)
    os.path.join(_base_dir, "server", ".env"), # C:\TicketFlow\server\.env (EXE)
    os.path.join(_base_dir, ".env"),           # .../server/.env (script)
    os.path.join(os.path.dirname(_base_dir), ".env"),  # pasta pai
]

for _env_path in _env_locations:
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
        break
else:
    load_dotenv()  # fallback padrão

# Usar PostgreSQL se DATABASE_URL estiver definida, senão SQLite local
engine = None
SessionLocal = None
Base = declarative_base()

def get_engine_and_session():
    global engine, SessionLocal
    
    # Recarrega variáveis de ambiente
    for _env_path in _env_locations:
        if os.path.exists(_env_path):
            load_dotenv(_env_path, override=True)
            break
    else:
        load_dotenv(override=True)

    db_url = os.getenv("DATABASE_URL")

    if db_url and db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+pg8000://")

    if not db_url:
        print("\n" + "!"*60)
        print(" ATENÇÃO: DATABASE_URL não configurada no arquivo .env!")
        print("!"*60 + "\n")
        db_url = "sqlite:///:memory:"

    connect_args = {}
    if db_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}

    new_engine = create_engine(
        db_url,
        connect_args={**connect_args, "timeout": 10},
        pool_pre_ping=True,
        pool_recycle=3600,
        **({
            "pool_size": 20,
            "max_overflow": 0
        } if not db_url.startswith("sqlite") else {})
    )

    if db_url.startswith("sqlite"):
        from sqlalchemy import event
        @event.listens_for(new_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()

    engine = new_engine
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, SessionLocal

# Inicialização inicial
get_engine_and_session()

def get_db():
    global SessionLocal
    if SessionLocal is None:
        get_engine_and_session()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
