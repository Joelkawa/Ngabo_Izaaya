from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class FamilyHistory(Base):
    __tablename__ = "family_histories"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    content = Column(Text, nullable=False)
    year = Column(Integer, index=True)  # Historical year or period
    location = Column(String(255))  # Where this history took place
    category = Column(String(100), index=True)  # e.g., "origin", "migration", "achievement", "tradition"
    is_published = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship to user who created the history entry
    creator = relationship("UserModel", foreign_keys=[created_by])

class HistoricalDocument(Base):
    __tablename__ = "historical_documents"

    id = Column(Integer, primary_key=True, index=True)
    history_id = Column(Integer, ForeignKey("family_histories.id"), nullable=False)
    document_type = Column(String(100))  # e.g., "photo", "certificate", "letter", "map"
    file_path = Column(String(500))  # Path to stored file
    file_name = Column(String(255))
    file_size = Column(Integer)  # Size in bytes
    description = Column(Text)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to the history entry
    history = relationship("FamilyHistory", backref="documents")

class FamilyTimeline(Base):
    __tablename__ = "family_timeline"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    event_type = Column(String(100))  # e.g., "birth", "marriage", "migration", "achievement"
    importance_level = Column(String(50), default="medium")  # low, medium, high, milestone
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to user who created the timeline entry
    creator = relationship("UserModel", foreign_keys=[created_by])
