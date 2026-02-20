from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# Usar PostgreSQL se DATABASE_URL estiver definida, senão SQLite local
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgresql://"):
    # Forçamos o uso do pg8000 no Windows para evitar o erro de UnicodeDecodeError do psycopg2
    # que ocorre ao receber mensagens de erro localizadas do PostgreSQL (ex: em Português).
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgresql://", "postgresql+pg8000://")

if not SQLALCHEMY_DATABASE_URL:
    # Se não houver configuração, não criamos nada e emitimos aviso
    print("\n" + "!"*60)
    print(" ATENÇÃO: DATABASE_URL não configurada no arquivo .env!")
    print(" Execute o configurador (config_db.exe) para definir o banco.")
    print("!"*60 + "\n")
    # Retornamos None ou uma URL temporária inválida para evitar crash imediato 
    # mas impedir que o SQLAlchemy crie arquivos. 
    # Usaremos uma string que forçará o erro apenas se tentarem usar o banco.
    SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:" 

# Configuração específica para drivers
connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

# Criação do engine com suporte a pooling para PostgreSQL
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={**connect_args, "timeout": 10}, # 10 segundos de timeout para pg8000
    pool_pre_ping=True,
    pool_recycle=3600,
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
