from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, extract
from typing import List, Optional, Tuple
import os
import uuid
from fastapi import HTTPException, status, UploadFile, File
import shutil
from datetime import datetime, timedelta

from apps.events.models import Event, EventPicture
from apps.events.schemas import EventCreate, EventUpdate
from apps.auth.models import UserModel

# Constants
ALLOWED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Event Services
def create_event(
    db: Session, 
    event_data: EventCreate, 
    user_id: int
) -> Event:
    """
    Create a new event
    """
    try:
        db_event = Event(
            **event_data.model_dump(),
            created_by=user_id
        )
        
        db.add(db_event)
        db.commit()
        db.refresh(db_event)
        return db_event
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating event: {str(e)}"
        )

def get_event(db: Session, event_id: int) -> Optional[Event]:
    """
    Get a specific event by ID
    """
    return db.query(Event).filter(Event.id == event_id).first()

def get_all_events(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    owner_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> Tuple[List[Event], int]:
    """
    Get all events with optional filtering
    """
    query = db.query(Event)
    
    # Apply filters
    if owner_id:
        query = query.filter(Event.created_by == owner_id)
    
    if start_date:
        query = query.filter(Event.date_of_happening >= start_date)
    
    if end_date:
        query = query.filter(Event.date_of_happening <= end_date)
    
    # Order by date
    query = query.order_by(Event.date_of_happening.asc())
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    events = query.offset(skip).limit(limit).all()
    
    return events, total

def get_calendar_events(
    db: Session,
    year: int,
    month: int
) -> List[Event]:
    """
    Get events for a specific month for calendar view
    """
    query = db.query(Event).filter(
        and_(
            extract('year', Event.date_of_happening) == year,
            extract('month', Event.date_of_happening) == month
        )
    ).order_by(Event.date_of_happening.asc())
    
    return query.all()

def update_event(
    db: Session, 
    event_id: int, 
    event_data: EventUpdate,
    user_id: int
) -> Event:
    """
    Update an existing event (only by owner)
    """
    db_event = get_event(db, event_id)
    if not db_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    # Check if user is the owner
    if db_event.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own events"
        )
    
    try:
        update_data = event_data.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_event, field, value)
        
        db.commit()
        db.refresh(db_event)
        return db_event
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating event: {str(e)}"
        )

def delete_event(db: Session, event_id: int, user_id: int) -> dict:
    """
    Delete an event (only by owner)
    """
    db_event = get_event(db, event_id)
    if not db_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    # Check if user is the owner
    if db_event.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own events"
        )
    
    try:
        # Delete associated pictures
        pictures = db.query(EventPicture).filter(
            EventPicture.event_id == event_id
        ).all()
        
        for picture in pictures:
            # Delete physical file
            if picture.file_path and os.path.exists(picture.file_path):
                os.remove(picture.file_path)
            db.delete(picture)
        
        # Delete the event
        db.delete(db_event)
        db.commit()
        
        return {"message": "Event deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting event: {str(e)}"
        )

# Event Picture Services
def save_event_picture(
    db: Session,
    event_id: int,
    file: UploadFile,
    description: Optional[str] = None,
    user_id: int = None
) -> EventPicture:
    """
    Save an uploaded event picture
    """
    # Validate file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size too large. Maximum allowed is {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Validate file extension
    file_extension = os.path.splitext(file.filename)[1].lower()
    
    if file_extension not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )
    
    # Verify event exists and user is owner
    event = get_event(db, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    if event.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only add pictures to your own events"
        )
    
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = "uploads/event_pictures"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Create picture record
        db_picture = EventPicture(
            event_id=event_id,
            file_path=file_path,
            file_name=file.filename,
            file_size=file_size,
            description=description
        )
        
        db.add(db_picture)
        db.commit()
        db.refresh(db_picture)
        
        return db_picture
        
    except Exception as e:
        # Clean up file if it was created
        if 'file_path' in locals() and os.path.exists(file_path):
            os.remove(file_path)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving picture: {str(e)}"
        )

def get_event_pictures(db: Session, event_id: int) -> List[EventPicture]:
    """
    Get all pictures for a specific event
    """
    return db.query(EventPicture).filter(
        EventPicture.event_id == event_id
    ).all()

def delete_event_picture(db: Session, picture_id: int, user_id: int) -> dict:
    """
    Delete an event picture (only by event owner)
    """
    db_picture = db.query(EventPicture).filter(
        EventPicture.id == picture_id
    ).first()
    
    if not db_picture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Picture not found"
        )
    
    # Verify user is event owner
    event = get_event(db, db_picture.event_id)
    if event.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete pictures from your own events"
        )
    
    try:
        # Delete physical file
        if db_picture.file_path and os.path.exists(db_picture.file_path):
            os.remove(db_picture.file_path)
        
        # Delete database record
        db.delete(db_picture)
        db.commit()
        
        return {"message": "Picture deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting picture: {str(e)}"
        )

# Utility functions
def get_user_events_count(db: Session, user_id: int) -> int:
    """
    Get count of events created by a user
    """
    return db.query(Event).filter(Event.created_by == user_id).count()

def get_upcoming_events(db: Session, days: int = 30) -> List[Event]:
    """
    Get upcoming events within the next specified days
    """
    today = datetime.now()
    future_date = today + timedelta(days=days)
    
    return db.query(Event).filter(
        and_(
            Event.date_of_happening >= today,
            Event.date_of_happening <= future_date
        )
    ).order_by(Event.date_of_happening.asc()).all()