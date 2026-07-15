from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os
import sys
from dotenv import load_dotenv

# Determinar o diretório base de forma robusta para ambientes de serviço e executáveis
# Quando rodando como EXE do PyInstaller: sys.executable aponta para o caminho do executável
# Quando rodando como script normal: __file__ aponta para o diretório de origem
if getattr(sys, 'frozen', False):
    # Executando como binário congelado (PyInstaller)
    _base_dir = os.path.dirname(sys.executable)
else:
    # Executando em ambiente de desenvolvimento (Python script)
    _base_dir = os.path.dirname(os.path.abspath(__file__))

# Localizações possíveis para o arquivo .env (configurações do sistema)
_env_locations = [
    os.path.join(_base_dir, ".env"),           # Diretório do executável
    os.path.join(_base_dir, "server", ".env"), # Subdiretório server
    os.path.join(_base_dir, ".env"),           # Diretório atual do script
    os.path.join(os.path.dirname(_base_dir), ".env"),  # Pasta pai (root do projeto)
]

# Tenta carregar o primeiro .env encontrado
for _env_path in _env_locations:
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
        break
else:
    load_dotenv()  # Fallback para variáveis de ambiente do sistema

# Variáveis globais para o motor e a fábrica de sessões do SQLAlchemy
engine = None
SessionLocal = None # type: ignore
Base = declarative_base()

def get_engine_and_session():
    """
    Configura e inicializa a conexão com o banco de dados.
    Suporta PostgreSQL (via pg8000) e SQLite (local).
    """
    global engine, SessionLocal
    
    # Recarrega variáveis de ambiente para refletir alterações em tempo de execução
    for _env_path in _env_locations:
        if os.path.exists(_env_path):
            load_dotenv(_env_path, override=True)
            break
    else:
        load_dotenv(override=True)

    db_url = os.getenv("DATABASE_URL")

    # Ajuste para compatibilidade com o driver pg8000 no PostgreSQL
    if db_url and db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+pg8000://")

    if not db_url:
        print("\n" + "!"*60)
        print(" ATENÇÃO: DATABASE_URL não configurada no arquivo .env!")
        print(" O sistema utilizará o banco de dados SQLite local (ticketflow.db).")
        print("!"*60 + "\n")
        # Define o caminho relativo à pasta pai da pasta do script (server/) para alinhar com o Alembic
        db_path = os.path.abspath(os.path.join(_base_dir, "..", "ticketflow.db"))
        db_path = db_path.replace("\\", "/")
        db_url = f"sqlite:///{db_path}"
        os.environ["DATABASE_URL"] = db_url

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
    """
    Dependency para injeção de dependência do FastAPI.
    Garante que cada requisição tenha sua própria sessão e que ela seja fechada ao final.
    """
    global SessionLocal
    if SessionLocal is None:
        get_engine_and_session()
    
    if SessionLocal is None:
        raise RuntimeError("Erro crítico: SessionLocal não foi inicializada. Verifique a conexão com o banco de dados.")
        
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
