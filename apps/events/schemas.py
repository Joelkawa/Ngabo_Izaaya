from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

# Base schemas for Event
class EventBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Name of the event")
    details: str = Field(..., min_length=1, description="Detailed description of the event")
    date_of_happening: datetime = Field(..., description="When the event is happening")
    location: Optional[str] = Field(None, max_length=255, description="Location of the event")

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    details: Optional[str] = Field(None, min_length=1)
    date_of_happening: Optional[datetime] = None
    location: Optional[str] = Field(None, max_length=255)

class EventResponse(EventBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    owner_name: Optional[str] = None
    pictures: List['EventPictureResponse'] = []
    
    model_config = ConfigDict(from_attributes=True)

# Schemas for Event Pictures
class EventPictureBase(BaseModel):
    description: Optional[str] = Field(None, description="Description of the picture")

class EventPictureCreate(EventPictureBase):
    event_id: int = Field(..., description="ID of the associated event")
    file_path: str = Field(..., description="Server path to the stored file")
    file_name: str = Field(..., description="Original file name")
    file_size: int = Field(..., ge=0, description="File size in bytes")

class EventPictureResponse(EventPictureBase):
    id: int
    event_id: int
    file_path: str
    file_name: str
    file_size: int
    uploaded_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Calendar view schemas
class CalendarEventResponse(BaseModel):
    id: int
    name: str
    details: Optional[str] = None
    date_of_happening: datetime
    location: Optional[str] = None
    owner_name: Optional[str] = None
    pictures: List['EventPictureResponse'] = []
    
    model_config = ConfigDict(from_attributes=True)

class CalendarMonthResponse(BaseModel):
    year: int
    month: int
    events: List[CalendarEventResponse]

# Response schemas for lists
class EventListResponse(BaseModel):
    items: List[EventResponse]
    total: int
    page: int
    size: int

class EventPictureListResponse(BaseModel):
    items: List[EventPictureResponse]
    total: int

# Forward reference resolution
EventResponse.model_rebuild()
CalendarEventResponse.model_rebuild()
