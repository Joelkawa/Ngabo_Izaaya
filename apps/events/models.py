from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    details = Column(Text, nullable=False)
    date_of_happening = Column(DateTime(timezone=True), nullable=False, index=True)
    location = Column(String(255))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship to user who created the event
    owner = relationship("UserModel", foreign_keys=[created_by])
    # Relationship to event pictures
    pictures = relationship("EventPicture", back_populates="event", cascade="all, delete-orphan")

class EventPicture(Base):
    __tablename__ = "event_pictures"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer)  # Size in bytes
    description = Column(Text)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to the event
    event = relationship("Event", back_populates="pictures")