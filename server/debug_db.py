import sys
try:
    from database import SessionLocal
    from models import User, Notification
    db = SessionLocal()
    print("Database connection successful.")
    
    try:
        user = db.query(User).first()
        print(f"User query successful: {user.username if user else 'No users found'}")
    except Exception as e:
        print(f"Error querying User: {e}")

    try:
        notif = db.query(Notification).first()
        print(f"Notification query successful: {notif.id if notif else 'No notifications found'}")
    except Exception as e:
        print(f"Error querying Notification: {e}")
        
    db.close()
    
except Exception as e:
    print(f"Critical Error: {e}")
    import traceback
    traceback.print_exc()
