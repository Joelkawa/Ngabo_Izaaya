from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

# Base schemas for Family History
class FamilyHistoryBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Title of the historical event")
    content: str = Field(..., min_length=1, description="Detailed content of the history")
    year: Optional[int] = Field(None, ge=1000, le=2100, description="Year of the historical event")
    location: Optional[str] = Field(None, max_length=255, description="Location where the event occurred")
    category: str = Field(..., max_length=100, description="Category of the history")
    is_published: bool = Field(False, description="Whether the history is published and visible to users")

class FamilyHistoryCreate(FamilyHistoryBase):
    pass

class FamilyHistoryUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = Field(None, min_length=1)
    year: Optional[int] = Field(None, ge=1000, le=2100)
    location: Optional[str] = Field(None, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    is_published: Optional[bool] = None

class FamilyHistoryResponse(FamilyHistoryBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    creator_name: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

# Schemas for Historical Documents
class HistoricalDocumentBase(BaseModel):
    document_type: str = Field(..., max_length=100, description="Type of document")
    file_name: str = Field(..., max_length=255, description="Original file name")
    description: Optional[str] = Field(None, description="Description of the document")

class HistoricalDocumentCreate(HistoricalDocumentBase):
    history_id: int = Field(..., description="ID of the associated history entry")
    file_path: str = Field(..., description="Server path to the stored file")
    file_size: int = Field(..., ge=0, description="File size in bytes")

class HistoricalDocumentResponse(HistoricalDocumentBase):
    id: int
    history_id: int
    file_path: str
    file_size: int
    uploaded_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Schemas for Family Timeline
class FamilyTimelineBase(BaseModel):
    year: int = Field(..., ge=1000, le=2100, description="Year of the timeline event")
    title: str = Field(..., min_length=1, max_length=255, description="Title of the timeline event")
    description: Optional[str] = Field(None, description="Description of the event")
    event_type: str = Field(..., max_length=100, description="Type of event")
    importance_level: str = Field("medium", pattern="^(low|medium|high|milestone)$", description="Importance level")

class FamilyTimelineCreate(FamilyTimelineBase):
    pass

class FamilyTimelineUpdate(BaseModel):
    year: Optional[int] = Field(None, ge=1000, le=2100)
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    event_type: Optional[str] = Field(None, max_length=100)
    importance_level: Optional[str] = Field(None, pattern="^(low|medium|high|milestone)$")

class FamilyTimelineResponse(FamilyTimelineBase):
    id: int
    created_by: int
    created_at: datetime
    creator_name: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

# Response schemas for lists
class FamilyHistoryListResponse(BaseModel):
    items: List[FamilyHistoryResponse]
    total: int
    page: int
    size: int

class FamilyTimelineListResponse(BaseModel):
    items: List[FamilyTimelineResponse]
    total: int
    page: int
    size: int

class HistoricalDocumentListResponse(BaseModel):
    items: List[HistoricalDocumentResponse]
    total: int
