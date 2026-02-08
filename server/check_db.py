from sqlalchemy import create_engine, inspect
import database

engine = create_engine(database.SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
inspector = inspect(engine)
columns = inspector.get_columns("tickets")
print("Columns in 'tickets' table:")
for column in columns:
    print(f"- {column['name']} ({column['type']})")

try:
    columns_status = inspector.get_columns("statuses")
    print("\nColumns in 'statuses' table:")
    for column in columns_status:
        print(f"- {column['name']} ({column['type']})")
except Exception as e:
    print("\n'statuses' table might not exist or other error:")
    print(e)
