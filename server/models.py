from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
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

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    
    parent = relationship("Category", remote_side=[id], back_populates="subcategories")
    subcategories = relationship("Category", back_populates="parent", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="category")
    
class Status(Base):
    __tablename__ = "statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, unique=True)
    color = Column(String, default="#3b82f6") # Tailwind color Hex
    
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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = relationship("Client", back_populates="tickets")
    category = relationship("Category", back_populates="tickets")
    status_obj = relationship("Status", back_populates="tickets")
    messages = relationship("TicketMessage", back_populates="ticket")

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
