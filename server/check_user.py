
from database import SessionLocal
import models

def check():
    db = SessionLocal()
    user = db.query(models.User).filter(models.User.id == 1).first()
    if user:
        print(f"USER_1: {user.username} ({user.full_name}), Role: {user.role}")
    else:
        print("USER_1 NOT FOUND")
    db.close()

if __name__ == "__main__":
    check()
