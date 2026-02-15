from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- Category Schemas ---
class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None
    is_active: bool = True

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: int

    class Config:
        from_attributes = True

class CategoryWithSub(Category):
    subcategories: List['CategoryWithSub'] = []

# Necessário para recursive schemas
CategoryWithSub.update_forward_refs()

# --- Status Schemas ---
class StatusBase(BaseModel):
    name: str
    color: str = "#3b82f6"
    is_final: bool = False
    is_active: bool = True

class StatusCreate(StatusBase):
    pass

class Status(StatusBase):
    id: int

    class Config:
        from_attributes = True

# --- Sector Schemas ---
class SectorBase(BaseModel):
    name: str
    description: Optional[str] = None

class SectorCreate(SectorBase):
    pass

class Sector(SectorBase):
    id: int

    class Config:
        from_attributes = True

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
        from_attributes = True

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
        from_attributes = True

# --- Ticket Schemas ---
class TicketBase(BaseModel):
    title: str
    description: str
    priority: str = "Média"

class TicketCreate(TicketBase):
    client_id: int
    category_id: Optional[int] = None
    status_id: Optional[int] = None
    assigned_user_id: Optional[int] = None

class TicketCreateSimple(TicketBase):
    client_name: str
    category: Optional[str] = "Suporte"
    category_id: Optional[int] = None

class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None # open, in_progress, closed
    status_id: Optional[int] = None
    priority: Optional[str] = None
    category_id: Optional[int] = None
    sector_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    cpf_cnpj: Optional[str] = None

class Ticket(TicketBase):
    id: int
    client_id: int
    category_id: Optional[int] = None
    status_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    status: str
    status_obj: Optional[Status] = None
    assigned_user: Optional['User'] = None
    created_at: datetime
    updated_at: datetime
    client: Optional[Client] = None
    category: Optional[Category] = None
    sector_id: Optional[int] = None
    sector: Optional[Sector] = None
    created_by_id: Optional[int] = None
    created_by: Optional['User'] = None
    messages: List[TicketMessage] = []
    total_duration: int = 0
    active_timer: Optional['TimeLog'] = None

    class Config:
        from_attributes = True

class TicketShort(TicketBase):
    id: int
    status: str
    client: Optional[Client] = None
    total_duration: int = 0

    class Config:
        from_attributes = True

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
        from_attributes = True

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

# --- Profile Schemas ---
class ProfileBase(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: Optional[dict] = {} # {"menus": [], "actions": []}

class ProfileCreate(ProfileBase):
    pass

class Profile(ProfileBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- User & Auth Schemas ---
class UserBase(BaseModel):
    username: str
    email: str
    full_name: Optional[str] = None
    role: str = "AGENT"
    profile_id: Optional[int] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    profile_id: Optional[int] = None

class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    profile: Optional[Profile] = None
    sectors: List[Sector] = []

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# --- Time Track Schemas ---
class TimeLogBase(BaseModel):
    ticket_id: int

class TimeLogCreate(TimeLogBase):
    pass

class TimeLog(TimeLogBase):
    id: int
    user_id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: int
    is_active: bool
    ticket: Optional[TicketShort] = None

    class Config:
        from_attributes = True

class TicketTimerStatus(BaseModel):
    ticket_id: int
    ticket_title: str
    is_active: bool
    start_time: datetime
    elapsed_seconds: int

# --- Ticket History Schemas ---
class TicketHistoryBase(BaseModel):
    ticket_id: int
    event_type: str
    description: str

class TicketHistoryCreate(TicketHistoryBase):
    user_id: Optional[int] = None

class TicketHistory(TicketHistoryBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    user: Optional['User'] = None

    class Config:
        from_attributes = True

# --- System Schemas ---
class SystemReset(BaseModel):
    confirmation: str
    entities: List[str]

# Update Ticket schema to include time info if needed
# (Will be populated via crud or computed property)
Ticket.update_forward_refs()
TicketHistory.update_forward_refs()

# --- Notification Schemas ---
class NotificationBase(BaseModel):
    title: str
    message: str
    type: str = "info"
    link: Optional[str] = None

class NotificationCreate(NotificationBase):
    user_id: int
    created_by_user_id: Optional[int] = None

class NotificationSend(BaseModel):
    """Schema for users sending notifications to each other"""
    recipient_user_id: int
    title: str
    message: str
    type: str = "info"
    ticket_id: Optional[int] = None  # Optional ticket to link

class Notification(NotificationBase):
    id: int
    user_id: int
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class SystemSettingsBase(BaseModel):
    system_name: str = "TicketFlow"
    logo_url_light: Optional[str] = None
    logo_url_dark: Optional[str] = None
    custom_colors: Optional[dict] = None

class SystemSettingsUpdate(BaseModel):
    system_name: Optional[str] = None
    logo_url_light: Optional[str] = None
    logo_url_dark: Optional[str] = None
    custom_colors: Optional[dict] = None

class SystemSettings(SystemSettingsBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True
