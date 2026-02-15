from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship
from typing import Optional
from datetime import datetime
try:
    from .database import Base
except ImportError:
    from database import Base

class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    cpf_cnpj = Column(String, unique=True, index=True, nullable=True) # Verificação principal
    phone = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    tickets = relationship("Ticket", back_populates="client")

class Sector(Base):
    __tablename__ = "sectors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, unique=True)
    description = Column(String, nullable=True)

    tickets = relationship("Ticket", back_populates="sector")
    users = relationship("User", secondary="user_sectors", back_populates="sectors")

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    
    parent = relationship("Category", remote_side=[id], back_populates="subcategories")
    subcategories = relationship("Category", back_populates="parent", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="category")
    
class Status(Base):
    __tablename__ = "statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, unique=True)
    color = Column(String, default="#3b82f6") # Tailwind color Hex
    is_final = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    
    tickets = relationship("Ticket", back_populates="status_obj")

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    title = Column(String, index=True)
    description = Column(Text)
    status = Column(String, default="Aberto") # Mantido como string para compatibilidade, mas status_id é preferido
    status_id = Column(Integer, ForeignKey("statuses.id"), nullable=True)
    priority = Column(String, default="Média") # Baixa, Média, Alta, Crítica
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = relationship("Client", back_populates="tickets")
    category = relationship("Category", back_populates="tickets")
    sector = relationship("Sector", back_populates="tickets")
    status_obj = relationship("Status", back_populates="tickets")
    assigned_user = relationship("User", foreign_keys=[assigned_user_id])
    
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = relationship("User", foreign_keys=[created_by_id])
    messages = relationship("TicketMessage", back_populates="ticket")
    time_logs = relationship("TicketTimeLog", back_populates="ticket")

    @property
    def total_duration(self) -> int:
        """Soma total de todos os logs de tempo finalizados deste ticket."""
        return sum(log.duration for log in self.time_logs if not log.is_active)

    @property
    def active_timer(self):
        """Retorna o log de tempo ativo se houver."""
        for log in self.time_logs:
            if log.is_active:
                return log
        return None

class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    sender = Column(String) # "user", "agent", "system", "ai"
    content = Column(Text)
    image_path = Column(String, nullable=True) # Caminho para arquivo de imagem se houver
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="messages")

class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    category = Column(String, index=True, nullable=True) # Manual, FAQ, Tutorial, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    permissions = Column(JSON, default={}) # Estrutura: {"menus": [], "actions": []}
    created_at = Column(DateTime, default=datetime.utcnow)
    
    users = relationship("User", back_populates="profile")

from sqlalchemy import Table
user_sectors = Table(
    "user_sectors",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("sector_id", Integer, ForeignKey("sectors.id"), primary_key=True)
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String, nullable=True)
    role = Column(String, default="AGENT") # Depreciado: Usar profile_id
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    profile = relationship("Profile", back_populates="users")
    sectors = relationship("Sector", secondary="user_sectors", back_populates="users")
    time_logs = relationship("TicketTimeLog", back_populates="user")

class TicketTimeLog(Base):
    __tablename__ = "ticket_time_logs"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Integer, default=0) # Duração em segundos
    is_active = Column(Boolean, default=True)

    ticket = relationship("Ticket", back_populates="time_logs")
    user = relationship("User", back_populates="time_logs")

class TicketHistory(Base):
    __tablename__ = "ticket_history"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # null if system/ai
    event_type = Column(String) # "status_change", "priority_change", "assignment", "sector_transfer", etc.
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket")
    user = relationship("User")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))  # Recipient
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Creator (null for system notifications)
    title = Column(String)
    message = Column(String)
    type = Column(String, default="info") # info, warning, success, error
    read = Column(Boolean, default=False)
    link = Column(String, nullable=True) # Optional link to resource
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id], back_populates="notifications")
    created_by = relationship("User", foreign_keys=[created_by_user_id])

class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    system_name = Column(String, default="TicketFlow")
    logo_url_light = Column(String, nullable=True) # Logo para tema claro
    logo_url_dark = Column(String, nullable=True)  # Logo para tema escuro
    custom_colors = Column(JSON, nullable=True)    # Cores personalizadas para o tema "custom"
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Update User relationship
User.notifications = relationship("Notification", foreign_keys="Notification.user_id", back_populates="user", order_by="desc(Notification.created_at)")
