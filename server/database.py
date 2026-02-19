from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# Usar PostgreSQL se DATABASE_URL estiver definida, senão SQLite local
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    f"sqlite:///{os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tickets_system.db').replace(os.sep, '/')}"
)

# Configuração específica para drivers
connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

# Criação do engine com suporte a pooling para PostgreSQL
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args=connect_args,
    pool_pre_ping=True,
    # Configurações de pool apenas se não for SQLite
    **({
        "pool_size": 20,
        "max_overflow": 0
    } if not SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {})
)

# Configurações extras para robustez apenas se for SQLite
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
