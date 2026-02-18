from database import SessionLocal
from models import User
from auth import get_password_hash

db = SessionLocal()
try:
    user = db.query(User).filter(User.username == "admin").first()
    if user:
        user.hashed_password = get_password_hash("admin123")
        db.commit()
        print("Password reset for admin")
    else:
        print("User admin not found")
except Exception as e:
    print(e)
finally:
    db.close()
