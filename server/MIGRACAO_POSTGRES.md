# Guia de Migração: SQLite → PostgreSQL

## Por que migrar?

- **Escalabilidade:** PostgreSQL suporta muito mais conexões simultâneas
- **Concorrência:** Melhor gerenciamento de múltiplos usuários
- **Performance:** Otimizado para grandes volumes de dados
- **Recursos avançados:** Full-text search, JSON nativo, replicação

## Passo 1: Instalar PostgreSQL

### Windows
1. Baixe o instalador: https://www.postgresql.org/download/windows/
2. Durante a instalação, defina uma senha para o usuário `postgres`
3. Anote a porta (padrão: 5432)

### Ou use Docker (recomendado para desenvolvimento)
```powershell
docker run --name ticketflow-postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=ticketflow -p 5432:5432 -d postgres:15
```

## Passo 2: Instalar Driver Python

```powershell
cd server
.venv\Scripts\activate
pip install psycopg2-binary
pip freeze > requirements.txt
```

## Passo 3: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na pasta `server`:

```env
# Banco de Dados
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/ticketflow

# Ou para produção
# DATABASE_URL=postgresql://usuario:senha@host:5432/nome_banco
```

## Passo 4: Atualizar database.py

Modifique o arquivo [`database.py`](file:///c:/Code/Projeto_Tickets/server/database.py):

```python
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

# Usar PostgreSQL se DATABASE_URL estiver definida, senão SQLite
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "sqlite:///./tickets_system.db"
)

# Configuração específica para SQLite
connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

## Passo 5: Instalar python-dotenv

```powershell
pip install python-dotenv
pip freeze > requirements.txt
```

## Passo 6: Migrar Dados (Opcional)

Se você já tem dados no SQLite e quer migrá-los:

### Opção A: Usar pgloader (Recomendado)
```bash
# Instalar pgloader
# No Ubuntu/Debian: apt-get install pgloader
# No macOS: brew install pgloader

# Migrar
pgloader sqlite://tickets_system.db postgresql://postgres:postgres123@localhost/ticketflow
```

### Opção B: Script Python Manual
Crie `migrate_to_postgres.py`:

```python
from database import SessionLocal as SQLiteSession, engine as sqlite_engine
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

# Conectar ao PostgreSQL
POSTGRES_URL = os.getenv("DATABASE_URL")
pg_engine = create_engine(POSTGRES_URL)
PostgresSession = sessionmaker(bind=pg_engine)

# Criar tabelas no PostgreSQL
from models import Base
Base.metadata.create_all(bind=pg_engine)

# Migrar dados
sqlite_db = SQLiteSession()
postgres_db = PostgresSession()

try:
    # Exemplo: Migrar usuários
    from models import User, Client, Ticket, Category, Status, Profile
    
    for model in [Profile, User, Client, Category, Status, Ticket]:
        items = sqlite_db.query(model).all()
        for item in items:
            postgres_db.merge(item)
        postgres_db.commit()
        print(f"✓ {model.__tablename__} migrado: {len(items)} registros")
        
    print("✅ Migração concluída!")
except Exception as e:
    print(f"❌ Erro: {e}")
    postgres_db.rollback()
finally:
    sqlite_db.close()
    postgres_db.close()
```

## Passo 7: Criar Usuário ROOT no PostgreSQL

```powershell
.venv\Scripts\python.exe create_root_user.py
```

## Passo 8: Reiniciar o Servidor

```powershell
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Verificação

Teste se está usando PostgreSQL:
```powershell
.venv\Scripts\python.exe -c "from database import engine; print(engine.url)"
```

Deve mostrar: `postgresql://postgres:***@localhost:5432/ticketflow`

## Configuração para Produção

### Usando Railway/Render/Heroku
Esses serviços fornecem automaticamente a variável `DATABASE_URL`. Basta fazer deploy!

### Usando servidor próprio
1. Instale PostgreSQL no servidor
2. Crie o banco: `createdb ticketflow`
3. Configure `.env` com credenciais seguras
4. Execute migrations: `python create_root_user.py`

## Rollback para SQLite

Se precisar voltar para SQLite, basta:
1. Remover/comentar a variável `DATABASE_URL` no `.env`
2. Reiniciar o servidor

## Performance Tips

### Índices (já configurados nos models)
Os índices já estão definidos com `index=True` nos models.

### Connection Pooling
Para produção, adicione em `database.py`:
```python
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=20,
    max_overflow=0,
    pool_pre_ping=True  # Verifica conexões antes de usar
)
```

### Backup Automático
```bash
# Cron job diário
0 2 * * * pg_dump ticketflow > /backups/ticketflow_$(date +\%Y\%m\%d).sql
```

## Troubleshooting

### Erro: "role does not exist"
```sql
CREATE USER postgres WITH PASSWORD 'postgres123';
ALTER USER postgres CREATEDB;
```

### Erro: "database does not exist"
```bash
createdb -U postgres ticketflow
```

### Erro de conexão
Verifique se PostgreSQL está rodando:
```powershell
# Windows
Get-Service postgresql*

# Docker
docker ps | grep postgres
```

## Resumo

✅ **Vantagens do PostgreSQL:**
- Suporta milhares de usuários simultâneos
- Melhor para dados > 100GB
- Recursos avançados (JSON, Full-text search)
- Replicação e alta disponibilidade

✅ **Quando usar SQLite:**
- Desenvolvimento local
- Aplicações pequenas (< 100 usuários)
- Sem necessidade de múltiplos servidores
- Simplicidade (zero configuração)

**Recomendação:** Use SQLite para desenvolvimento e PostgreSQL para produção! 🚀
