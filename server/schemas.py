from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- Category Schemas ---
class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: int

    class Config:
        orm_mode = True

class CategoryWithSub(Category):
    subcategories: List['CategoryWithSub'] = []

# Necessário para recursive schemas
CategoryWithSub.update_forward_refs()

# --- Client Schemas ---
class ClientBase(BaseModel):
    name: str
    email: str
    cpf_cnpj: Optional[str] = None
    phone: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class Client(ClientBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

# --- Ticket Message Schemas ---
class TicketMessageBase(BaseModel):
    sender: str # "user", "agent", "system", "ai"
    content: str
    image_path: Optional[str] = None

class TicketMessageCreate(TicketMessageBase):
    pass

class TicketMessage(TicketMessageBase):
    id: int
    ticket_id: int
    created_at: datetime

    class Config:
        orm_mode = True

# --- Ticket Schemas ---
class TicketBase(BaseModel):
    title: str
    description: str
    priority: str = "medium" # low, medium, high, critical

class TicketCreate(TicketBase):
    client_id: int
    category_id: Optional[int] = None

class TicketCreateSimple(TicketBase):
    client_name: str
    category: Optional[str] = "Suporte"

class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None # open, in_progress, closed
    priority: Optional[str] = None
    category_id: Optional[int] = None
    cpf_cnpj: Optional[str] = None

class Ticket(TicketBase):
    id: int
    client_id: int
    category_id: Optional[int] = None
    status: str
    created_at: datetime
    updated_at: datetime
    client: Optional[Client] = None
    category: Optional[Category] = None
    messages: List[TicketMessage] = []

    class Config:
        orm_mode = True

# --- Knowledge Base Schemas ---
class KnowledgeDocumentBase(BaseModel):
    title: str
    content: str
    category: Optional[str] = "Manual"

class KnowledgeDocumentCreate(KnowledgeDocumentBase):
    pass

class KnowledgeDocument(KnowledgeDocumentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

# --- Import Schemas ---
class DBImportConfigs(BaseModel):
    db_type: str # mysql, postgresql, sqlserver
    host: str
    port: int
    user: str
    password: str
    database: str
    table: str
    mapping: Optional[dict] = None # Mapping from DB columns to Client fields {"remote_col": "name"}

class ImportResult(BaseModel):
    total: int
    imported: int
    duplicates: int
    errors: List[str] = []
