from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AnnouncementBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Announcement title")
    content: str = Field(..., min_length=1, description="Announcement content")


class AnnouncementCreate(AnnouncementBase):
    announcement_date: Optional[datetime] = Field(None, description="When the announcement should appear")


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = Field(None, min_length=1)
    announcement_date: Optional[datetime] = None
    is_published: Optional[bool] = None


class AnnouncementResponse(AnnouncementBase):
    id: int
    announcement_date: datetime
    is_published: bool
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    creator_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AnnouncementListResponse(BaseModel):
    items: List[AnnouncementResponse]
    total: int
    page: int
    size: int

