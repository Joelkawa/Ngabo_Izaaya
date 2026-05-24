from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from typing import Optional

from apps.announcements.schemas import (
    AnnouncementCreate,
    AnnouncementListResponse,
    AnnouncementResponse,
)
from apps.announcements.services import (
    create_announcement,
    get_all_announcements,
    get_current_month_announcements,
)
from apps.auth.models import UserModel
from apps.auth.services import get_current_user, get_db

router = APIRouter()


@router.post(
    "/",
    response_model=AnnouncementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new announcement",
    description="Create a new announcement (logged in users only)"
)
def create_new_announcement(
    announcement_data: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    announcement = create_announcement(db, announcement_data, current_user.id)

    response_data = AnnouncementResponse.model_validate(announcement)
    response_data.creator_name = current_user.name
    return response_data


@router.get(
    "/",
    response_model=AnnouncementListResponse,
    summary="Get announcements",
    description="Retrieve announcements with optional filtering"
)
def list_announcements(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=200, description="Number of records to return"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Filter by year"),
    published_only: bool = Query(True, description="Return only published announcements"),
    db: Session = Depends(get_db)
):
    announcements, total = get_all_announcements(
        db,
        skip=skip,
        limit=limit,
        month=month,
        year=year,
        published_only=published_only,
    )

    items = []
    for announcement in announcements:
        response_data = AnnouncementResponse.model_validate(announcement)
        response_data.creator_name = announcement.creator.name if announcement.creator else "Unknown"
        items.append(response_data)

    return AnnouncementListResponse(
        items=items,
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        size=limit,
    )


@router.get(
    "/current-month",
    response_model=AnnouncementListResponse,
    summary="Get current month announcements",
    description="Retrieve published announcements for the current month"
)
def list_current_month_announcements(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(10, ge=1, le=50, description="Number of records to return"),
    db: Session = Depends(get_db)
):
    announcements, total = get_current_month_announcements(db, skip=skip, limit=limit)

    items = []
    for announcement in announcements:
        response_data = AnnouncementResponse.model_validate(announcement)
        response_data.creator_name = announcement.creator.name if announcement.creator else "Unknown"
        items.append(response_data)

    return AnnouncementListResponse(
        items=items,
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        size=limit,
    )
