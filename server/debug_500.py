from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import models, crud, schemas

SQLALCHEMY_DATABASE_URL = "sqlite:///./sql_app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

db = SessionLocal()
try:
    ticket = crud.get_ticket(db, 1)
    if ticket:
        print(f"Ticket found: {ticket.id}")
        # Tenta serializar
        ticket_schema = schemas.Ticket.from_orm(ticket)
        print("Serialization success!")
        print(ticket_schema.dict())
    else:
        print("Ticket 1 not found")
except Exception as e:
    import traceback
    print("Error detected:")
    traceback.print_exc()
finally:
    db.close()
