from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Tuple
import os
import uuid
from fastapi import HTTPException, status, UploadFile, File
import shutil

from apps.history.models import FamilyHistory, HistoricalDocument, FamilyTimeline
from apps.history.schemas import (
    FamilyHistoryCreate, FamilyHistoryUpdate, 
    FamilyTimelineCreate, FamilyTimelineUpdate,
    HistoricalDocumentCreate
)
from apps.auth.models import UserModel

# Constants
ALLOWED_DOCUMENT_TYPES = {
    'image': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
    'document': ['.pdf', '.doc', '.docx', '.txt', '.rtf'],
    'archive': ['.zip', '.rar']
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Family History Services
def create_family_history(
    db: Session, 
    history_data: FamilyHistoryCreate, 
    user_id: int
) -> FamilyHistory:
    """
    Create a new family history entry
    """
    try:
        # Check if history with same title already exists
        existing_history = db.query(FamilyHistory).filter(
            FamilyHistory.title == history_data.title
        ).first()
        
        if existing_history:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="History entry with this title already exists"
            )
        
        db_history = FamilyHistory(
            **history_data.model_dump(),
            created_by=user_id
        )
        
        db.add(db_history)
        db.commit()
        db.refresh(db_history)
        return db_history
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating history entry: {str(e)}"
        )

def get_family_history(
    db: Session, 
    history_id: int
) -> Optional[FamilyHistory]:
    """
    Get a specific family history entry by ID
    """
    return db.query(FamilyHistory).filter(FamilyHistory.id == history_id).first()

def get_all_family_histories(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    category: Optional[str] = None,
    year: Optional[int] = None,
    published_only: bool = False
) -> Tuple[List[FamilyHistory], int]:
    """
    Get all family histories with optional filtering
    """
    query = db.query(FamilyHistory)
    
    # Apply filters
    if category:
        query = query.filter(FamilyHistory.category == category)
    
    if year:
        query = query.filter(FamilyHistory.year == year)
    
    if published_only:
        query = query.filter(FamilyHistory.is_published == True)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    histories = query.offset(skip).limit(limit).all()
    
    return histories, total

def update_family_history(
    db: Session, 
    history_id: int, 
    history_data: FamilyHistoryUpdate
) -> FamilyHistory:
    """
    Update an existing family history entry
    """
    db_history = get_family_history(db, history_id)
    if not db_history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="History entry not found"
        )
    
    try:
        update_data = history_data.model_dump(exclude_unset=True)
        
        # Check for duplicate title if title is being updated
        if 'title' in update_data and update_data['title'] != db_history.title:
            existing_history = db.query(FamilyHistory).filter(
                and_(
                    FamilyHistory.title == update_data['title'],
                    FamilyHistory.id != history_id
                )
            ).first()
            
            if existing_history:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="History entry with this title already exists"
                )
        
        # Update fields
        for field, value in update_data.items():
            setattr(db_history, field, value)
        
        db.commit()
        db.refresh(db_history)
        return db_history
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating history entry: {str(e)}"
        )

def delete_family_history(db: Session, history_id: int) -> dict:
    """
    Delete a family history entry and its associated documents
    """
    db_history = get_family_history(db, history_id)
    if not db_history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="History entry not found"
        )
    
    try:
        # Delete associated documents
        documents = db.query(HistoricalDocument).filter(
            HistoricalDocument.history_id == history_id
        ).all()
        
        for document in documents:
            # Delete physical file
            if document.file_path and os.path.exists(document.file_path):
                os.remove(document.file_path)
            db.delete(document)
        
        # Delete the history entry
        db.delete(db_history)
        db.commit()
        
        return {"message": "History entry deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting history entry: {str(e)}"
        )

# Family Timeline Services
def create_timeline_event(
    db: Session, 
    timeline_data: FamilyTimelineCreate, 
    user_id: int
) -> FamilyTimeline:
    """
    Create a new timeline event
    """
    try:
        db_timeline = FamilyTimeline(
            **timeline_data.model_dump(),
            created_by=user_id
        )
        
        db.add(db_timeline)
        db.commit()
        db.refresh(db_timeline)
        return db_timeline
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating timeline event: {str(e)}"
        )

def get_timeline_event(db: Session, event_id: int) -> Optional[FamilyTimeline]:
    """
    Get a specific timeline event by ID
    """
    return db.query(FamilyTimeline).filter(FamilyTimeline.id == event_id).first()

def get_all_timeline_events(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    year: Optional[int] = None,
    event_type: Optional[str] = None,
    importance_level: Optional[str] = None
) -> Tuple[List[FamilyTimeline], int]:
    """
    Get all timeline events with optional filtering
    """
    query = db.query(FamilyTimeline)
    
    # Apply filters
    if year:
        query = query.filter(FamilyTimeline.year == year)
    
    if event_type:
        query = query.filter(FamilyTimeline.event_type == event_type)
    
    if importance_level:
        query = query.filter(FamilyTimeline.importance_level == importance_level)
    
    # Order by year and importance
    query = query.order_by(FamilyTimeline.year.desc(), FamilyTimeline.importance_level)
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    events = query.offset(skip).limit(limit).all()
    
    return events, total

def update_timeline_event(
    db: Session, 
    event_id: int, 
    timeline_data: FamilyTimelineUpdate
) -> FamilyTimeline:
    """
    Update an existing timeline event
    """
    db_timeline = get_timeline_event(db, event_id)
    if not db_timeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Timeline event not found"
        )
    
    try:
        update_data = timeline_data.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_timeline, field, value)
        
        db.commit()
        db.refresh(db_timeline)
        return db_timeline
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating timeline event: {str(e)}"
        )

def delete_timeline_event(db: Session, event_id: int) -> dict:
    """
    Delete a timeline event
    """
    db_timeline = get_timeline_event(db, event_id)
    if not db_timeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Timeline event not found"
        )
    
    try:
        db.delete(db_timeline)
        db.commit()
        
        return {"message": "Timeline event deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting timeline event: {str(e)}"
        )

# Historical Document Services
def save_historical_document(
    db: Session,
    history_id: int,
    file: UploadFile,
    document_type: str,
    description: Optional[str] = None
) -> HistoricalDocument:
    """
    Save an uploaded historical document
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
    allowed_extensions = []
    for extensions in ALLOWED_DOCUMENT_TYPES.values():
        allowed_extensions.extend(extensions)
    
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    # Verify history exists
    history = get_family_history(db, history_id)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="History entry not found"
        )
    
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = "uploads/historical_documents"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Create document record
        db_document = HistoricalDocument(
            history_id=history_id,
            document_type=document_type,
            file_path=file_path,
            file_name=file.filename,
            file_size=file_size,
            description=description
        )
        
        db.add(db_document)
        db.commit()
        db.refresh(db_document)
        
        return db_document
        
    except Exception as e:
        # Clean up file if it was created
        if 'file_path' in locals() and os.path.exists(file_path):
            os.remove(file_path)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving document: {str(e)}"
        )

def get_history_documents(db: Session, history_id: int) -> List[HistoricalDocument]:
    """
    Get all documents for a specific history entry
    """
    return db.query(HistoricalDocument).filter(
        HistoricalDocument.history_id == history_id
    ).all()

def delete_historical_document(db: Session, document_id: int) -> dict:
    """
    Delete a historical document
    """
    db_document = db.query(HistoricalDocument).filter(
        HistoricalDocument.id == document_id
    ).first()
    
    if not db_document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    try:
        # Delete physical file
        if db_document.file_path and os.path.exists(db_document.file_path):
            os.remove(db_document.file_path)
        
        # Delete database record
        db.delete(db_document)
        db.commit()
        
        return {"message": "Document deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting document: {str(e)}"
        )

# Utility functions
def get_history_categories(db: Session) -> List[str]:
    """
    Get all unique history categories
    """
    categories = db.query(FamilyHistory.category).distinct().all()
    return [category[0] for category in categories if category[0]]

def get_timeline_event_types(db: Session) -> List[str]:
    """
    Get all unique timeline event types
    """
    event_types = db.query(FamilyTimeline.event_type).distinct().all()
    return [event_type[0] for event_type in event_types if event_type[0]]

def get_history_statistics(db: Session) -> dict:
    """
    Get statistics about family history data
    """
    total_histories = db.query(FamilyHistory).count()
    published_histories = db.query(FamilyHistory).filter(
        FamilyHistory.is_published == True
    ).count()
    total_documents = db.query(HistoricalDocument).count()
    total_timeline_events = db.query(FamilyTimeline).count()
    
    return {
        "total_histories": total_histories,
        "published_histories": published_histories,
        "total_documents": total_documents,
        "total_timeline_events": total_timeline_events
    }