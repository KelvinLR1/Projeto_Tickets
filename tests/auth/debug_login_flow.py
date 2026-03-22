import sys
import os

# Ensure we can import from current directory
sys.path.append(os.getcwd())

try:
    from database import SessionLocal
    import crud
    import auth
    import schemas
    from models import User
    
    db = SessionLocal()
    print("Database connection successful.")
    
    username = "admin"
    password = "admin123"
    
    print(f"Attempting to get user '{username}'...")
    user = crud.get_user_by_username(db, username=username)
    
    if not user:
        print("User NOT FOUND via crud.")
    else:
        print(f"User found: {user.username}, ID: {user.id}")
        
        print("Verifying password...")
        is_valid = auth.verify_password(password, user.hashed_password)
        print(f"Password valid: {is_valid}")
        
        if is_valid:
            print("Creating access token...")
            try:
                token = auth.create_access_token(data={"sub": user.username})
                print(f"Token created: {token[:20]}...")
                
                # Verify schema validation
                print("Validating response schema...")
                token_schema = schemas.Token(access_token=token, token_type="bearer")
                print("Schema validation successful.")
                
            except Exception as e:
                print(f"Error creating/validating token: {e}")
                import traceback
                traceback.print_exc()

    db.close()
    
except Exception as e:
    print(f"Critical Error: {e}")
    import traceback
    traceback.print_exc()
