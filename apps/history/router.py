from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
import os

from apps.history.schemas import (
    FamilyHistoryCreate, FamilyHistoryUpdate, FamilyHistoryResponse, FamilyHistoryListResponse,
    FamilyTimelineCreate, FamilyTimelineUpdate, FamilyTimelineResponse, FamilyTimelineListResponse,
    HistoricalDocumentResponse, HistoricalDocumentListResponse
)
from apps.history.services import (
    create_family_history, get_family_history, get_all_family_histories,
    update_family_history, delete_family_history,
    create_timeline_event, get_timeline_event, get_all_timeline_events,
    update_timeline_event, delete_timeline_event,
    save_historical_document, get_history_documents, delete_historical_document,
    get_history_categories, get_timeline_event_types, get_history_statistics
)
from apps.auth.services import get_db, get_current_admin, get_current_user
from apps.auth.models import UserModel

router = APIRouter()

# Family History Endpoints
@router.post(
    "/histories",
    response_model=FamilyHistoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new family history entry",
    description="Create a new family history entry (Admin only)"
)
def create_history(
    history_data: FamilyHistoryCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Create a new family history entry.
    
    - **title**: Title of the historical event (required)
    - **content**: Detailed content of the history (required)
    - **year**: Year of the historical event (optional)
    - **location**: Location where the event occurred (optional)
    - **category**: Category of the history (required)
    - **is_published**: Whether the history is published (default: false)
    """
    history = create_family_history(db, history_data, admin.id)
    
    # Add creator name to response
    response_data = FamilyHistoryResponse.model_validate(history)
    response_data.creator_name = admin.name
    
    return response_data

@router.get(
    "/histories",
    response_model=FamilyHistoryListResponse,
    summary="Get all family histories",
    description="Retrieve all family histories with optional filtering and pagination"
)
def get_histories(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Number of records to return"),
    category: Optional[str] = Query(None, description="Filter by category"),
    year: Optional[int] = Query(None, ge=1000, le=2100, description="Filter by year"),
    published_only: bool = Query(False, description="Return only published histories"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Retrieve all family histories with optional filtering.
    
    - Regular users can only see published histories
    - Admins can see all histories
    """
    # For non-admin users, force published_only to True
    if current_user.role.name != "admin":
        published_only = True
    
    histories, total = get_all_family_histories(
        db, skip=skip, limit=limit, 
        category=category, year=year, 
        published_only=published_only
    )
    
    # Add creator names to responses
    history_responses = []
    for history in histories:
        response_data = FamilyHistoryResponse.model_validate(history)
        response_data.creator_name = history.creator.name if history.creator else "Unknown"
        history_responses.append(response_data)
    
    return FamilyHistoryListResponse(
        items=history_responses,
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        size=limit
    )

@router.get(
    "/histories/{history_id}",
    response_model=FamilyHistoryResponse,
    summary="Get a specific family history",
    description="Retrieve a specific family history by ID"
)
def get_history(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Retrieve a specific family history by ID.
    
    - Regular users can only access published histories
    - Admins can access all histories
    """
    history = get_family_history(db, history_id)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="History entry not found"
        )
    
    # Check if non-admin user is trying to access unpublished history
    if current_user.role.name != "admin" and not history.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to unpublished history denied"
        )
    
    response_data = FamilyHistoryResponse.model_validate(history)
    response_data.creator_name = history.creator.name if history.creator else "Unknown"
    
    return response_data

@router.put(
    "/histories/{history_id}",
    response_model=FamilyHistoryResponse,
    summary="Update a family history entry",
    description="Update an existing family history entry (Admin only)"
)
def update_history(
    history_id: int,
    history_data: FamilyHistoryUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Update an existing family history entry.
    """
    history = update_family_history(db, history_id, history_data)
    
    response_data = FamilyHistoryResponse.model_validate(history)
    response_data.creator_name = history.creator.name if history.creator else "Unknown"
    
    return response_data

@router.delete(
    "/histories/{history_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a family history entry",
    description="Delete a family history entry and its associated documents (Admin only)"
)
def delete_history(
    history_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Delete a family history entry and all its associated documents.
    """
    return delete_family_history(db, history_id)

# Family Timeline Endpoints
@router.post(
    "/timeline",
    response_model=FamilyTimelineResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new timeline event",
    description="Create a new family timeline event (Admin only)"
)
def create_timeline(
    timeline_data: FamilyTimelineCreate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Create a new family timeline event.
    
    - **year**: Year of the timeline event (required)
    - **title**: Title of the timeline event (required)
    - **description**: Description of the event (optional)
    - **event_type**: Type of event (required)
    - **importance_level**: Importance level (low, medium, high, milestone)
    """
    timeline_event = create_timeline_event(db, timeline_data, admin.id)
    
    response_data = FamilyTimelineResponse.model_validate(timeline_event)
    response_data.creator_name = admin.name
    
    return response_data

@router.get(
    "/timeline",
    response_model=FamilyTimelineListResponse,
    summary="Get all timeline events",
    description="Retrieve all timeline events with optional filtering"
)
def get_timeline_events(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Number of records to return"),
    year: Optional[int] = Query(None, ge=1000, le=2100, description="Filter by year"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    importance_level: Optional[str] = Query(None, description="Filter by importance level"),
    db: Session = Depends(get_db)
):
    """
    Retrieve all timeline events with optional filtering and pagination.
    """
    events, total = get_all_timeline_events(
        db, skip=skip, limit=limit,
        year=year, event_type=event_type, importance_level=importance_level
    )
    
    # Add creator names to responses
    event_responses = []
    for event in events:
        response_data = FamilyTimelineResponse.model_validate(event)
        response_data.creator_name = event.creator.name if event.creator else "Unknown"
        event_responses.append(response_data)
    
    return FamilyTimelineListResponse(
        items=event_responses,
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        size=limit
    )

@router.put(
    "/timeline/{event_id}",
    response_model=FamilyTimelineResponse,
    summary="Update a timeline event",
    description="Update an existing timeline event (Admin only)"
)
def update_timeline_event(
    event_id: int,
    timeline_data: FamilyTimelineUpdate,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Update an existing timeline event.
    """
    timeline_event = update_timeline_event(db, event_id, timeline_data)
    
    response_data = FamilyTimelineResponse.model_validate(timeline_event)
    response_data.creator_name = timeline_event.creator.name if timeline_event.creator else "Unknown"
    
    return response_data

@router.delete(
    "/timeline/{event_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a timeline event",
    description="Delete a timeline event (Admin only)"
)
def delete_timeline_event(
    event_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Delete a timeline event.
    """
    return delete_timeline_event(db, event_id)

# Historical Document Endpoints
@router.post(
    "/histories/{history_id}/documents",
    response_model=HistoricalDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a historical document",
    description="Upload a document for a family history entry (Admin only)"
)
def upload_document(
    history_id: int,
    document_type: str = Form(..., description="Type of document"),
    description: Optional[str] = Form(None, description="Description of the document"),
    file: UploadFile = File(..., description="Document file to upload"),
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Upload a document for a family history entry.
    
    Supported file types:
    - Images: .jpg, .jpeg, .png, .gif, .bmp, .webp
    - Documents: .pdf, .doc, .docx, .txt, .rtf
    - Archives: .zip, .rar
    
    Maximum file size: 50MB
    """
    document = save_historical_document(
        db, history_id, file, document_type, description
    )
    
    return HistoricalDocumentResponse.model_validate(document)

@router.get(
    "/histories/{history_id}/documents",
    response_model=HistoricalDocumentListResponse,
    summary="Get documents for a history entry",
    description="Retrieve all documents for a specific family history entry"
)
def get_documents(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Retrieve all documents for a specific family history entry.
    
    - Regular users can only access documents for published histories
    - Admins can access all documents
    """
    # Verify history exists and check permissions
    history = get_family_history(db, history_id)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="History entry not found"
        )
    
    if current_user.role.name != "admin" and not history.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to documents for unpublished history denied"
        )
    
    documents = get_history_documents(db, history_id)
    
    return HistoricalDocumentListResponse(
        items=[HistoricalDocumentResponse.model_validate(doc) for doc in documents],
        total=len(documents)
    )

@router.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a historical document",
    description="Delete a historical document (Admin only)"
)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_admin)
):
    """
    Delete a historical document.
    """
    return delete_historical_document(db, document_id)

# Utility Endpoints
@router.get(
    "/categories",
    response_model=List[str],
    summary="Get all history categories",
    description="Retrieve all unique history categories"
)
def get_categories(db: Session = Depends(get_db)):
    """
    Retrieve all unique history categories.
    """
    return get_history_categories(db)

@router.get(
    "/timeline/event-types",
    response_model=List[str],
    summary="Get all timeline event types",
    description="Retrieve all unique timeline event types"
)
def get_event_types(db: Session = Depends(get_db)):
    """
    Retrieve all unique timeline event types.
    """
    return get_timeline_event_types(db)

@router.get(
    "/statistics",
    summary="Get history statistics",
    description="Retrieve statistics about family history data"
)
def get_statistics(db: Session = Depends(get_db)):
    """
    Retrieve statistics about family history data.
    """
    return get_history_statistics(db)