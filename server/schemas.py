from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- Category Schemas ---
class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None
    sector_id: Optional[int] = None
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
    sector_id: Optional[int] = None
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
    is_active: bool = True

class SectorCreate(SectorBase):
    pass

class SectorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class Sector(SectorBase):
    id: int

    class Config:
        from_attributes = True

# --- Client Schemas ---
class ClientBase(BaseModel):
    name: str
    nickname: Optional[str] = None
    email: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    phone: Optional[str] = None
    
    # Endereço
    cep: Optional[str] = None
    city: Optional[str] = None
    uf: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    
    # Tributário
    state_registration: Optional[str] = None
    tax_regime: Optional[str] = None
    
    # Listas
    extra_contacts: Optional[List[dict]] = []
    contracted_items: Optional[List[dict]] = []

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
    category_id: int
    status_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    sector_id: Optional[int] = None

class TicketCreateSimple(TicketBase):
    client_name: str
    category: Optional[str] = "Suporte"
    category_id: int
    sector_id: Optional[int] = None
    assigned_user_id: Optional[int] = None

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
    followers: List['User'] = []
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
    table: Optional[str] = None
    query: Optional[str] = None
    mapping: Optional[dict] = None # Mapping from DB columns to Client fields {"remote_col": "name"}

class ImportResult(BaseModel):
    total: int
    imported: int
    updated: int = 0
    duplicates: int = 0
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
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    password: str
    sector_ids: Optional[List[int]] = []

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    profile_id: Optional[int] = None
    sector_ids: Optional[List[int]] = None
    avatar_url: Optional[str] = None

class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    last_seen: Optional[datetime] = None
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
    status_id: Optional[int] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: int
    is_active: bool
    ticket: Optional[TicketShort] = None

    class Config:
        from_attributes = True

class UserTime(BaseModel):
    user_id: int
    full_name: str
    duration: int

class StatusTimeGroup(BaseModel):
    status_id: int
    status_name: str
    status_color: str
    total_duration: int
    users: List[UserTime]

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
    recipient_user_id: Optional[int] = None # Deprecated in favor of recipient_ids, kept for backward compatibility
    recipient_ids: Optional[List[int]] = None
    sector_ids: Optional[List[int]] = None
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
    favicon_url: Optional[str] = None

class SystemSettingsUpdate(BaseModel):
    system_name: Optional[str] = None
    logo_url_light: Optional[str] = None
    logo_url_dark: Optional[str] = None
    custom_colors: Optional[dict] = None
    favicon_url: Optional[str] = None

class SystemSettings(SystemSettingsBase):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True

# --- New: DB Configuration Schemas ---
class DBConfigSQLite(BaseModel):
    dbname: str = "tickets.db"

class DBConfigPostgres(BaseModel):
    host: str = "localhost"
    port: int = 5432
    user: str = "postgres"
    password: str
    dbname: str = "ticketflow_db"

class DBConfig(BaseModel):
    engine: str # "sqlite" ou "postgres"
    sqlite: Optional[DBConfigSQLite] = None
    postgres: Optional[DBConfigPostgres] = None

# --- Custom Report Schemas ---
class CustomReportVariable(BaseModel):
    name: str
    label: str
    type: str # string, number, date

class CustomReportBase(BaseModel):
    title: str
    description: Optional[str] = None
    query: str
    variables: Optional[List[CustomReportVariable]] = []

class CustomReportCreate(CustomReportBase):
    pass

class CustomReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    query: Optional[str] = None
    variables: Optional[List[CustomReportVariable]] = None

class CustomReport(CustomReportBase):
    id: int
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[int] = None
    created_by: Optional[User] = None

    class Config:
        from_attributes = True
