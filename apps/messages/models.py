from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Enum, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
from .enums import *


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=True)  # For group chats
    conversation_type = Column(Enum(ConversationType), default=ConversationType.DIRECT, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    creator = relationship("UserModel", foreign_keys=[created_by])
    participants = relationship("ConversationParticipant", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    is_admin = Column(Boolean, default=False)
    
    # Relationships
    conversation = relationship("Conversation", back_populates="participants")
    user = relationship("UserModel", foreign_keys=[user_id])

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message_type = Column(Enum(MessageType), nullable=False, default=MessageType.TEXT)
    content = Column(Text)  # For text messages or status text
    media_data = Column(LargeBinary)  # Store images/voice messages as binary data
    media_url = Column(String(500))
    media_mime_type = Column(String(100))
    media_filename = Column(String(255))
    media_size = Column(Integer)  # Size in bytes
    media_duration = Column(Integer)  # For voice messages in seconds
    
    # Message status and metadata
    status = Column(Enum(MessageStatus), default=MessageStatus.SENT)
    replied_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True)  # For reply functionality
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("UserModel", foreign_keys=[sender_id])
    replied_to = relationship("Message", remote_side=[id], backref="replies")
    read_receipts = relationship("ReadReceipt", back_populates="message", cascade="all, delete-orphan")

class UserStatusUpdate(Base):
    __tablename__ = "user_status_updates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(UserStatus), default=UserStatus.ONLINE)
    custom_status = Column(String(255), nullable=True)  # Custom status message
    is_typing = Column(Boolean, default=False)
    typing_conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("UserModel", foreign_keys=[user_id])
    typing_conversation = relationship("Conversation", foreign_keys=[typing_conversation_id])

class ReadReceipt(Base):
    __tablename__ = "read_receipts"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    read_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    message = relationship("Message", foreign_keys=[message_id], back_populates="read_receipts")
    user = relationship("UserModel", foreign_keys=[user_id])
