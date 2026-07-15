from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, JSON, Table
from sqlalchemy.orm import relationship
from typing import Optional
from datetime import datetime
try:
    from .database import Base
except ImportError:
    from database import Base

# ==============================================================================
# MODELO: CLIENTE (CLIENT)
# ==============================================================================

class Client(Base):
    """
    Representa um cliente (empresa ou pessoa física) que solicita suporte.
    Armazena dados cadastrais, endereço e informações tributárias.
    """
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)  # Nome completo / Razão Social
    nickname = Column(String, index=True, nullable=True)  # Nome Fantasia
    email = Column(String, index=True, nullable=True)
    cpf_cnpj = Column(String, unique=True, index=True, nullable=True)
    phone = Column(String, index=True, nullable=True)
    responsible_name = Column(String, index=True, nullable=True) # Nome do Consultor / Responsável Direto
    
    # Endereço
    cep = Column(String, nullable=True)
    city = Column(String, nullable=True)
    uf = Column(String, nullable=True)
    street = Column(String, nullable=True)
    number = Column(String, nullable=True)
    complement = Column(String, nullable=True)
    neighborhood = Column(String, nullable=True)
    
    # Tributário
    state_registration = Column(String, nullable=True)  # Inscrição Estadual
    tax_regime = Column(String, nullable=True)        # Regime Tributário
    
    # Campos dinâmicos armazenados em JSON
    extra_contacts = Column(JSON, default=[]) # Lista de {type: 'phone'|'email', value: ''}
    contracted_items = Column(JSON, default=[]) # Lista de {name: '', description: ''}
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relacionamentos
    tickets = relationship("Ticket", back_populates="client")

# ==============================================================================
# MODELO: SETOR (SECTOR)
# ==============================================================================

class Sector(Base):
    """
    Representa os departamentos da empresa (ex: TI, Comercial, RH).
    Controla o fluxo de chamados e permissões de usuários.
    """
    __tablename__ = "sectors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, unique=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    # Relacionamentos
    tickets = relationship("Ticket", back_populates="sector")
    users = relationship("User", secondary="user_sectors", back_populates="sectors")

# ==============================================================================
# MODELO: CATEGORIA (CATEGORY)
# ==============================================================================

class Category(Base):
    """
    Classificação dos chamados (ex: Hardware, Software, Dúvida).
    Suporta hierarquia (subcategorias) e vínculo com setores.
    """
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)
    
    # Auto-relacionamento para subcategorias
    parent = relationship("Category", remote_side=[id], back_populates="subcategories")
    subcategories = relationship("Category", back_populates="parent", cascade="all, delete-orphan")
    
    tickets = relationship("Ticket", back_populates="category")
    sector = relationship("Sector")
    
# ==============================================================================
# MODELO: STATUS
# ==============================================================================

class Status(Base):
    """
    Define os estados possíveis de um chamado (ex: Aberto, Em Atendimento, Concluído).
    Inclui flags para identificar status finais (que encerram o fluxo).
    """
    __tablename__ = "statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, unique=True)
    color = Column(String, default="#3b82f6") # Cor em Hexadecimal (padrão Tailwind)
    is_final = Column(Boolean, default=False)  # Indica se este status finaliza o ticket
    is_active = Column(Boolean, default=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)
    
    tickets = relationship("Ticket", back_populates="status_obj")
    sector = relationship("Sector")

# Tabela associativa para seguidores de chamados
ticket_followers = Table(
    "ticket_followers",
    Base.metadata,
    Column("ticket_id", Integer, ForeignKey("tickets.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True)
)

# ==============================================================================
# MODELO: CHAMADO (TICKET)
# ==============================================================================

class Ticket(Base):
    """
    Entidade central do sistema. Registra a solicitação do cliente,
    quem está atendendo, setor responsável e histórico de alterações.
    """
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    title = Column(String, index=True)
    description = Column(Text)
    
    # Status e Fluxo
    status = Column(String, default="Aberto") # Mantido para compatibilidade legado
    status_id = Column(Integer, ForeignKey("statuses.id"), nullable=True)
    priority = Column(String, default="Média") # Baixa, Média, Alta, Crítica
    
    # Vínculos
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Técnico responsável
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)     # Usuário que abriu o ticket
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos ORM
    client = relationship("Client", back_populates="tickets")
    category = relationship("Category", back_populates="tickets")
    sector = relationship("Sector", back_populates="tickets")
    status_obj = relationship("Status", back_populates="tickets")
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    messages = relationship("TicketMessage", back_populates="ticket")
    time_logs = relationship("TicketTimeLog", back_populates="ticket")
    followers = relationship("User", secondary=ticket_followers, back_populates="followed_tickets")

    @property
    def total_duration(self) -> int:
        """Calcula a soma de tempo (em segundos) de todos os logs finalizados."""
        return sum(log.duration for log in self.time_logs if not log.is_active)

    @property
    def active_timer(self):
        """Retorna o cronômetro que está rodando no momento, se houver."""
        for log in self.time_logs:
            if log.is_active:
                return log
        return None

# ==============================================================================
# MODELO: MENSAGEM DO CHAMADO (TICKET MESSAGE)
# ==============================================================================

class TicketMessage(Base):
    """Interações e comentários dentro de um chamado."""
    __tablename__ = "ticket_messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    sender = Column(String)  # Tipo: "user", "agent", "system", "ai"
    content = Column(Text)
    image_path = Column(String, nullable=True) # URL ou caminho do anexo se houver
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="messages")

# ==============================================================================
# MODELO: BASE DE CONHECIMENTO (KNOWLEDGE DOCUMENT)
# ==============================================================================

class KnowledgeDocument(Base):
    """Artigos e FAQs para auxílio no suporte (RAG)."""
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    category = Column(String, index=True, nullable=True) # ex: Manual, FAQ, Tutorial
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# ==============================================================================
# MODELO: PERFIL DE ACESSO (PROFILE)
# ==============================================================================

class Profile(Base):
    """Perfis que definem permissões granulares no sistema (Admin, Técnico, etc)."""
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    permissions = Column(JSON, default={}) # Ex: {"menus": ["tickets", "reports"], "actions": ["edit_user"]}
    created_at = Column(DateTime, default=datetime.utcnow)
    
    users = relationship("User", back_populates="profile")

# Tabela associativa entre Usuários e Setores
user_sectors = Table(
    "user_sectors",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("sector_id", Integer, ForeignKey("sectors.id"), primary_key=True)
)

# ==============================================================================
# MODELO: USUÁRIO (USER)
# ==============================================================================

class User(Base):
    """Operadores e administradores do sistema."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String, nullable=True)
    role = Column(String, default="AGENT") # Legado: Preferencialmente usar profile_id
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    avatar_url = Column(String, nullable=True)
    last_seen = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    profile = relationship("Profile", back_populates="users")
    sectors = relationship("Sector", secondary="user_sectors", back_populates="users")
    time_logs = relationship("TicketTimeLog", back_populates="user")
    followed_tickets = relationship("Ticket", secondary=ticket_followers, back_populates="followers")

# ==============================================================================
# MODELO: LOG DE TEMPO (TIME LOG)
# ==============================================================================

class TicketTimeLog(Base):
    """Registra o tempo gasto em cada etapa do atendimento."""
    __tablename__ = "ticket_time_logs"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    status_id = Column(Integer, ForeignKey("statuses.id"), nullable=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Integer, default=0) # Tempo total em segundos
    is_active = Column(Boolean, default=True) # Indica se o cronômetro está rodando

    ticket = relationship("Ticket", back_populates="time_logs")
    user = relationship("User", back_populates="time_logs")
    status = relationship("Status")

# ==============================================================================
# MODELO: HISTÓRICO DE ALTERAÇÕES (TICKET HISTORY)
# ==============================================================================

class TicketHistory(Base):
    """Auditoria de todas as ações realizadas em um chamado."""
    __tablename__ = "ticket_history"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # null se for ação do sistema
    event_type = Column(String) # ex: status_change, priority_change, sector_transfer
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket")
    user = relationship("User")

# ==============================================================================
# MODELO: NOTIFICAÇÃO (NOTIFICATION)
# ==============================================================================

class Notification(Base):
    """Notificações enviadas aos usuários sobre eventos (novos chamados, menções)."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))  # Usuário destinatário
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Criador (null se sistema)
    title = Column(String)
    message = Column(String)
    type = Column(String, default="info") # Categorias: info, warning, success, error
    read = Column(Boolean, default=False)
    link = Column(String, nullable=True) # Link opcional para redirecionamento
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id], back_populates="notifications")
    created_by = relationship("User", foreign_keys=[created_by_user_id])

# ==============================================================================
# MODELO: CONFIGURAÇÕES DO SISTEMA (SYSTEM SETTINGS)
# ==============================================================================

class SystemSettings(Base):
    """Configurações visuais e de identidade visual da plataforma."""
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    system_name = Column(String, default="TicketFlow")
    logo_url_light = Column(String, nullable=True)
    logo_url_dark = Column(String, nullable=True)
    custom_colors = Column(JSON, nullable=True)    # Esquemas de cores personalizados
    favicon_url = Column(String, nullable=True)
    whatsapp_warn_new_number = Column(Boolean, default=True, nullable=False)
    whatsapp_limit_active_chats = Column(Boolean, default=True, nullable=False)
    whatsapp_limit_count = Column(Integer, default=10, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Atualização de relacionamento tardio para evitar dependência circular
User.notifications = relationship("Notification", foreign_keys="Notification.user_id", back_populates="user", order_by="desc(Notification.created_at)")

# ==============================================================================
# MODELO: RELATÓRIOS CUSTOMIZADOS (CUSTOM REPORT)
# ==============================================================================

class CustomReport(Base):
    """Modelos de relatórios gerados via consultas SQL customizadas."""
    __tablename__ = "custom_reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String, nullable=True)
    query = Column(Text) # Comando SQL bruto
    variables = Column(JSON, default=[]) # Variáveis do relatório [{name: '', type: ''}]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_by = relationship("User")

# ==============================================================================
# MODELO: ITEM DO CATÁLOGO (CATALOG ITEM)
# ==============================================================================

class CatalogItem(Base):
    """
    Representa um serviço ou produto disponível no catálogo para contratação.
    Permite padronizar a seleção de itens no cadastro do cliente.
    """
    __tablename__ = "catalog_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, unique=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
