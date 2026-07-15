from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

# ==============================================================================
# SCHEMAS: CATEGORIAS (CATEGORIES)
# ==============================================================================

class CategoryBase(BaseModel):
    """Atributos básicos de uma categoria."""
    name: str
    parent_id: Optional[int] = None
    sector_id: Optional[int] = None
    is_active: bool = True

class CategoryCreate(CategoryBase):
    """Schema para criação de nova categoria."""
    pass

class Category(CategoryBase):
    """Schema completo de categoria retornado pela API."""
    id: int

    class Config:
        from_attributes = True

class CategoryWithSub(Category):
    """Schema de categoria que inclui recursivamente suas subcategorias."""
    subcategories: List['CategoryWithSub'] = []

# Atualiza referências para permitir recursividade no Pydantic
CategoryWithSub.update_forward_refs()

# ==============================================================================
# SCHEMAS: STATUS
# ==============================================================================

class StatusBase(BaseModel):
    """Atributos básicos de um status de chamado."""
    name: str
    color: str = "#3b82f6"
    is_final: bool = False
    sector_id: Optional[int] = None
    is_active: bool = True

class StatusCreate(StatusBase):
    """Schema para criação de novo status."""
    pass

class Status(StatusBase):
    """Schema completo de status retornado pela API."""
    id: int

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: SETORES (SECTORS)
# ==============================================================================

class SectorBase(BaseModel):
    """Atributos básicos de um setor (departamento)."""
    name: str
    description: Optional[str] = None
    is_active: bool = True

class SectorCreate(SectorBase):
    """Schema para criação de novo setor."""
    pass

class SectorUpdate(BaseModel):
    """Schema para atualização parcial de um setor."""
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class Sector(SectorBase):
    """Schema completo de setor retornado pela API."""
    id: int

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: CLIENTES (CLIENTS)
# ==============================================================================

class ClientBase(BaseModel):
    """Atributos básicos e dados cadastrais de um cliente."""
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
    
    # Dados Tributários
    state_registration: Optional[str] = None
    tax_regime: Optional[str] = None
    
    # Listas dinâmicas (contatos extras, serviços contratados)
    extra_contacts: Optional[List[dict]] = []
    contracted_items: Optional[List[dict]] = []

class ClientCreate(ClientBase):
    """Schema para cadastro de novo cliente."""
    pass

class Client(ClientBase):
    """Schema completo de cliente com metadados de sistema."""
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: MENSAGENS E INTERAÇÕES (TICKET MESSAGES)
# ==============================================================================

class TicketMessageBase(BaseModel):
    """Atributos básicos de uma interação no chamado."""
    sender: str # "user", "agent", "system", "ai"
    content: str
    image_path: Optional[str] = None

class TicketMessageCreate(TicketMessageBase):
    """Schema para envio de nova mensagem."""
    pass

class TicketMessage(TicketMessageBase):
    """Schema de mensagem retornada pela API."""
    id: int
    ticket_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: CHAMADOS (TICKETS)
# ==============================================================================

class TicketBase(BaseModel):
    """Atributos fundamentais de um chamado (Ticket)."""
    title: str
    description: str
    priority: str = "Média"

class TicketCreate(TicketBase):
    """Schema para abertura de novo chamado detalhado."""
    client_id: int
    category_id: int
    status_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    sector_id: Optional[int] = None

class TicketCreateSimple(TicketBase):
    """Schema para abertura rápida de chamado."""
    client_name: str
    category: Optional[str] = "Suporte"
    category_id: int
    sector_id: Optional[int] = None
    assigned_user_id: Optional[int] = None

class TicketUpdate(BaseModel):
    """Schema para atualização de dados do chamado."""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None 
    status_id: Optional[int] = None
    priority: Optional[str] = None
    category_id: Optional[int] = None
    sector_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    cpf_cnpj: Optional[str] = None

class Ticket(TicketBase):
    """Schema completo do chamado com todos os relacionamentos."""
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
    """Versão resumida do chamado (usada em listagens ou referências)."""
    id: int
    status: str
    client: Optional[Client] = None
    total_duration: int = 0

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: BASE DE CONHECIMENTO (KNOWLEDGE BASE)
# ==============================================================================

class KnowledgeDocumentBase(BaseModel):
    """Atributos fundamentais do documento de conhecimento."""
    title: str
    content: str
    category: Optional[str] = "Manual"

class KnowledgeDocumentCreate(KnowledgeDocumentBase):
    """Schema para novo documento de conhecimento."""
    pass

class KnowledgeDocument(KnowledgeDocumentBase):
    """Schema de documento retornado pela API."""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: IMPORTAÇÃO E RESULTADOS (IMPORT)
# ==============================================================================

class DBImportConfigs(BaseModel):
    """Configurações de conexão para importação de bancos externos."""
    db_type: str # mysql, postgresql, sqlserver
    host: str
    port: int
    user: str
    password: str
    database: str
    table: Optional[str] = None
    query: Optional[str] = None
    mapping: Optional[dict] = None # Mapeamento {coluna_remota: campo_sistema}

class ImportResult(BaseModel):
    """Resumo estatístico do processo de importação massiva."""
    total: int
    imported: int
    updated: int = 0
    duplicates: int = 0
    errors: List[str] = []

# ==============================================================================
# SCHEMAS: PERFIS DE ACESSO (PROFILES)
# ==============================================================================

class ProfileBase(BaseModel):
    """Atributos básicos de um perfil de acesso."""
    name: str
    description: Optional[str] = None
    permissions: Optional[dict] = {} # {"menus": [], "actions": []}

class ProfileCreate(ProfileBase):
    """Schema para criação de perfil."""
    pass

class Profile(ProfileBase):
    """Schema de perfil retornado pela API."""
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: USUÁRIOS E AUTENTICAÇÃO (USER & AUTH)
# ==============================================================================

class UserBase(BaseModel):
    """Atributos básicos do usuário do sistema."""
    username: str
    email: str
    full_name: Optional[str] = None
    role: str = "AGENT"
    profile_id: Optional[int] = None
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    """Schema para cadastro de novo usuário (exige senha)."""
    password: str
    sector_ids: Optional[List[int]] = []

class UserUpdate(BaseModel):
    """Schema para atualização parcial de dados do usuário."""
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    profile_id: Optional[int] = None
    sector_ids: Optional[List[int]] = None
    avatar_url: Optional[str] = None

class User(UserBase):
    """Schema completo do usuário retornado pela API."""
    id: int
    is_active: bool
    created_at: datetime
    last_seen: Optional[datetime] = None
    profile: Optional[Profile] = None
    sectors: List[Sector] = []

    class Config:
        from_attributes = True

class Token(BaseModel):
    """Schema do token de acesso JWT."""
    access_token: str
    token_type: str

class TokenData(BaseModel):
    """Dados extraídos (payload) do token decodificado."""
    username: Optional[str] = None

# ==============================================================================
# SCHEMAS: CONTROLE DE TEMPO (TIME TRACKING)
# ==============================================================================

class TimeLogBase(BaseModel):
    """Atributos básicos do log de tempo."""
    ticket_id: int

class TimeLogCreate(TimeLogBase):
    """Schema para iniciar um novo log."""
    pass

class TimeLog(TimeLogBase):
    """Schema detalhado do log de tempo (ativo ou finalizado)."""
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
    """Tempo consolidado de um usuário."""
    user_id: int
    full_name: str
    duration: int

class StatusTimeGroup(BaseModel):
    """Agrupamento de tempo por status e usuários envolvidos."""
    status_id: int
    status_name: str
    status_color: str
    total_duration: int
    users: List[UserTime]

class TicketTimerStatus(BaseModel):
    """Estado atual do cronômetro de um chamado."""
    ticket_id: int
    ticket_title: str
    is_active: bool
    start_time: datetime
    elapsed_seconds: int

# ==============================================================================
# SCHEMAS: HISTÓRICO DE AUDITORIA (TICKET HISTORY)
# ==============================================================================

class TicketHistoryBase(BaseModel):
    """Log de evento ocorrido no chamado."""
    ticket_id: int
    event_type: str
    description: str

class TicketHistoryCreate(TicketHistoryBase):
    """Schema para registro de novo evento no histórico."""
    user_id: Optional[int] = None

class TicketHistory(TicketHistoryBase):
    """Schema de histórico retornado pela API."""
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    user: Optional['User'] = None

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: CONFIGURAÇÕES E OPERAÇÕES DO SISTEMA
# ==============================================================================

class SystemReset(BaseModel):
    """Confirmação para exclusão de dados do sistema."""
    confirmation: str # Deve ser "DELETAR"
    entities: List[str] # Lista de tabelas/entidades para resetar

# ==============================================================================
# SCHEMAS: NOTIFICAÇÕES (NOTIFICATIONS)
# ==============================================================================

class NotificationBase(BaseModel):
    """Atributos básicos de uma notificação."""
    title: str
    message: str
    type: str = "info" # info, warning, success, error
    link: Optional[str] = None

class NotificationCreate(NotificationBase):
    """Schema interno para criação de notificação."""
    user_id: int
    created_by_user_id: Optional[int] = None

class NotificationSend(BaseModel):
    """Schema para envio manual de notificações entre usuários/setores."""
    recipient_user_id: Optional[int] = None 
    recipient_ids: Optional[List[int]] = None
    sector_ids: Optional[List[int]] = None
    title: str
    message: str
    type: str = "info"
    ticket_id: Optional[int] = None 

class Notification(NotificationBase):
    """Schema de notificação retornada pela API."""
    id: int
    user_id: int
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class SystemSettingsBase(BaseModel):
    """Configurações globais de identidade visual."""
    system_name: str = "TicketFlow"
    logo_url_light: Optional[str] = None
    logo_url_dark: Optional[str] = None
    custom_colors: Optional[dict] = None
    favicon_url: Optional[str] = None
    whatsapp_warn_new_number: bool = True
    whatsapp_limit_active_chats: bool = True
    whatsapp_limit_count: int = 10

class SystemSettingsUpdate(BaseModel):
    """Schema para alteração das configurações visuais."""
    system_name: Optional[str] = None
    logo_url_light: Optional[str] = None
    logo_url_dark: Optional[str] = None
    custom_colors: Optional[dict] = None
    favicon_url: Optional[str] = None
    whatsapp_warn_new_number: Optional[bool] = None
    whatsapp_limit_active_chats: Optional[bool] = None
    whatsapp_limit_count: Optional[int] = None

class SystemSettings(SystemSettingsBase):
    """Schema completo das configurações do sistema."""
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: INFRAESTRUTURA (DATABASE CONFIG)
# ==============================================================================

class DBConfigSQLite(BaseModel):
    """Configurações para banco de dados SQLite."""
    dbname: str = "tickets.db"

class DBConfigPostgres(BaseModel):
    """Configurações para banco de dados PostgreSQL."""
    host: str = "localhost"
    port: int = 5432
    user: str = "postgres"
    password: str
    dbname: str = "ticketflow_db"

class DBConfig(BaseModel):
    """Schema para alternar motor de banco de dados."""
    engine: str # "sqlite" ou "postgres"
    sqlite: Optional[DBConfigSQLite] = None
    postgres: Optional[DBConfigPostgres] = None

# ==============================================================================
# SCHEMAS: RELATÓRIOS CUSTOMIZADOS (CUSTOM REPORTS)
# ==============================================================================

class CustomReportVariable(BaseModel):
    """Definição de variável dinâmica para query SQL."""
    name: str
    label: str
    type: str # string, number, date

class CustomReportBase(BaseModel):
    """Atributos básicos do modelo de relatório customizado."""
    title: str
    description: Optional[str] = None
    query: str
    variables: Optional[List[CustomReportVariable]] = []

class CustomReportCreate(CustomReportBase):
    """Schema para salvar novo modelo de relatório."""
    pass

class CustomReportUpdate(BaseModel):
    """Schema para atualizar modelo de relatório existente."""
    title: Optional[str] = None
    description: Optional[str] = None
    query: Optional[str] = None
    variables: Optional[List[CustomReportVariable]] = None

class CustomReport(CustomReportBase):
    """Schema completo de relatório customizado retornado pela API."""
    id: int
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[int] = None
    created_by: Optional[User] = None

    class Config:
        from_attributes = True

# ==============================================================================
# SCHEMAS: CATÁLOGO DE SERVIÇOS (CATALOG ITEMS)
# ==============================================================================

class CatalogItemBase(BaseModel):
    """Atributos básicos de um item do catálogo."""
    name: str
    description: Optional[str] = None
    is_active: bool = True

class CatalogItemCreate(CatalogItemBase):
    """Schema para criação de item no catálogo."""
    pass

class CatalogItemUpdate(BaseModel):
    """Schema para atualização parcial de item no catálogo."""
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class CatalogItem(CatalogItemBase):
    """Schema completo do item do catálogo retornado pela API."""
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Resolve referências circulares finais
Ticket.update_forward_refs()
TicketHistory.update_forward_refs()
