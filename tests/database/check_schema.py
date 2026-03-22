from sqlalchemy import create_engine, inspect
import os

# Use the same database URL as in database.py
# Assuming it defaults to sqlite:///./tickets_system.db or similar
# I need to check database.py to be sure of the file name.

from server.database import SQLALCHEMY_DATABASE_URL

print(f"Checking database at: {SQLALCHEMY_DATABASE_URL}")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
inspector = inspect(engine)

if inspector.has_table("tickets"):
    print("Table 'tickets' exists.")
    columns = inspector.get_columns("tickets")
    print("Columns:")
    for column in columns:
        print(f"- {column['name']} ({column['type']})")
else:
    print("Table 'tickets' does NOT exist.")

if inspector.has_table("clients"):
    print("Table 'clients' exists.")
    columns = inspector.get_columns("clients")
    print("Columns:")
    for column in columns:
        print(f"- {column['name']} ({column['type']})")
else:
    print("Table 'clients' does NOT exist.")
