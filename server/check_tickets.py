
from database import SessionLocal
import models

def check():
    db = SessionLocal()
    print("--- START ---")
    tickets = db.query(models.Ticket).all()
    for t in tickets:
        status_name = t.status_obj.name if t.status_obj else t.status
        is_final = t.status_obj.is_final if t.status_obj else False
        print(f"ID:{t.id},CB:{t.created_by_id},AS:{t.assigned_user_id},ST:{status_name},FIN:{is_final}")
    print("--- END ---")
    db.close()

if __name__ == "__main__":
    check()
