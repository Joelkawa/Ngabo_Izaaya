from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form, Path
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from apps.events.schemas import (
    EventCreate, EventUpdate, EventResponse, EventListResponse,
    EventPictureResponse, EventPictureListResponse,
    CalendarEventResponse, CalendarMonthResponse
)
from apps.events.services import (
    create_event, get_event, get_all_events, get_calendar_events,
    update_event, delete_event,
    save_event_picture, get_event_pictures, delete_event_picture,
    get_user_events_count, get_upcoming_events
)
from apps.auth.services import get_db, get_current_user
from apps.auth.models import UserModel

router = APIRouter()

# Event Endpoints
@router.post(
    "/events",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new event",
    description="Create a new event (Logged in users only)"
)
def create_new_event(
    event_data: EventCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Create a new event.
    
    - **name**: Name of the event (required)
    - **details**: Detailed description of the event (required)
    - **date_of_happening**: When the event is happening (required)
    - **location**: Location of the event (optional)
    """
    event = create_event(db, event_data, current_user.id)
    
    # Add owner name to response
    response_data = EventResponse.model_validate(event)
    response_data.owner_name = current_user.name
    
    return response_data

@router.get(
    "/events",
    response_model=EventListResponse,
    summary="Get all events",
    description="Retrieve all events with optional filtering and pagination"
)
def get_events(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Number of records to return"),
    owner_id: Optional[int] = Query(None, description="Filter by owner ID"),
    start_date: Optional[datetime] = Query(None, description="Filter by start date"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date"),
    db: Session = Depends(get_db)
):
    """
    Retrieve all events with optional filtering.
    
    - All logged in users can see all events
    """
    events, total = get_all_events(
        db, skip=skip, limit=limit, 
        owner_id=owner_id, start_date=start_date, end_date=end_date
    )
    
    # Add owner names and pictures to responses
    event_responses = []
    for event in events:
        response_data = EventResponse.model_validate(event)
        response_data.owner_name = event.owner.name if event.owner else "Unknown"
        response_data.pictures = [EventPictureResponse.model_validate(pic) for pic in event.pictures]
        event_responses.append(response_data)
    
    return EventListResponse(
        items=event_responses,
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        size=limit
    )

@router.get(
    "/events/{event_id}",
    response_model=EventResponse,
    summary="Get a specific event",
    description="Retrieve a specific event by ID"
)
def get_specific_event(
    event_id: int,
    db: Session = Depends(get_db)
):
    """
    Retrieve a specific event by ID.
    """
    event = get_event(db, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    response_data = EventResponse.model_validate(event)
    response_data.owner_name = event.owner.name if event.owner else "Unknown"
    response_data.pictures = [EventPictureResponse.model_validate(pic) for pic in event.pictures]
    
    return response_data

@router.put(
    "/events/{event_id}",
    response_model=EventResponse,
    summary="Update an event",
    description="Update an existing event (Owner only)"
)
def update_existing_event(
    event_id: int,
    event_data: EventUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Update an existing event.
    - Only the event owner can update the event
    """
    event = update_event(db, event_id, event_data, current_user.id)
    
    response_data = EventResponse.model_validate(event)
    response_data.owner_name = event.owner.name if event.owner else "Unknown"
    response_data.pictures = [EventPictureResponse.model_validate(pic) for pic in event.pictures]
    
    return response_data

@router.delete(
    "/events/{event_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete an event",
    description="Delete an event (Owner only)"
)
def delete_existing_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Delete an event and all its associated pictures.
    - Only the event owner can delete the event
    """
    return delete_event(db, event_id, current_user.id)

# Calendar Endpoints
@router.get(
    "/calendar/{year}/{month}",
    response_model=CalendarMonthResponse,
    summary="Get calendar events for a month",
    description="Retrieve all events for a specific month in calendar view"
)
def get_calendar_month_events(
    year: int = Path(..., ge=2000, le=2100, description="Year"),
    month: int = Path(..., ge=1, le=12, description="Month"),
    db: Session = Depends(get_db)
):
    """
    Retrieve all events for a specific month in calendar view.
    """
    events = get_calendar_events(db, year, month)
    
    event_responses = []
    for event in events:
        response_data = CalendarEventResponse.model_validate(event)
        response_data.owner_name = event.owner.name if event.owner else "Unknown"
        response_data.pictures = [EventPictureResponse.model_validate(pic) for pic in event.pictures]
        event_responses.append(response_data)
    
    return CalendarMonthResponse(
        year=year,
        month=month,
        events=event_responses
    )

@router.get(
    "/calendar/upcoming",
    response_model=List[CalendarEventResponse],
    summary="Get upcoming events",
    description="Retrieve upcoming events within the requested time window"
)
def get_upcoming_calendar_events(
    days: int = Query(30, ge=1, le=3650, description="Number of days to look ahead"),
    limit: Optional[int] = Query(None, ge=1, le=20, description="Maximum number of upcoming events to return"),
    db: Session = Depends(get_db)
):
    """
    Retrieve upcoming events within the specified number of days.
    """
    events = get_upcoming_events(db, days, limit)
    
    event_responses = []
    for event in events:
        response_data = CalendarEventResponse.model_validate(event)
        response_data.owner_name = event.owner.name if event.owner else "Unknown"
        response_data.pictures = [EventPictureResponse.model_validate(pic) for pic in event.pictures]
        event_responses.append(response_data)
    
    return event_responses

# Event Picture Endpoints
@router.post(
    "/events/{event_id}/pictures",
    response_model=EventPictureResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an event picture",
    description="Upload a picture for an event (Event owner only)"
)
def upload_event_picture(
    event_id: int,
    description: Optional[str] = Form(None, description="Description of the picture"),
    file: UploadFile = File(..., description="Picture file to upload"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Upload a picture for an event.
    
    Supported file types:
    - Images: .jpg, .jpeg, .png, .gif, .bmp, .webp
    
    Maximum file size: 10MB
    
    - Only the event owner can upload pictures
    """
    picture = save_event_picture(
        db, event_id, file, description, current_user.id
    )
    
    return EventPictureResponse.model_validate(picture)

@router.get(
    "/events/{event_id}/pictures",
    response_model=EventPictureListResponse,
    summary="Get pictures for an event",
    description="Retrieve all pictures for a specific event"
)
def get_event_pictures_list(
    event_id: int,
    db: Session = Depends(get_db),
):
    """
    Retrieve all pictures for a specific event.
    """
    # Verify event exists
    event = get_event(db, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found"
        )
    
    pictures = get_event_pictures(db, event_id)
    
    return EventPictureListResponse(
        items=[EventPictureResponse.model_validate(pic) for pic in pictures],
        total=len(pictures)
    )

@router.delete(
    "/pictures/{picture_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete an event picture",
    description="Delete an event picture (Event owner only)"
)
def delete_event_picture_endpoint(
    picture_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Delete an event picture.
    - Only the event owner can delete pictures
    """
    return delete_event_picture(db, picture_id, current_user.id)

# Utility Endpoints
@router.get(
    "/user/stats",
    summary="Get user event statistics",
    description="Retrieve statistics about the current user's events"
)
def get_user_event_stats(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Retrieve statistics about the current user's events.
    """
    event_count = get_user_events_count(db, current_user.id)
    upcoming_events = get_upcoming_events(db, 30)
    
    user_upcoming_count = len([e for e in upcoming_events if e.created_by == current_user.id])
    
    return {
        "total_events": event_count,
        "upcoming_events": user_upcoming_count
    }
