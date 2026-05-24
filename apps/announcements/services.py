from datetime import datetime
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from apps.announcements.models import Announcement
from apps.announcements.schemas import AnnouncementCreate


def create_announcement(
    db: Session,
    announcement_data: AnnouncementCreate,
    user_id: int
) -> Announcement:
    """Create a new announcement."""
    try:
        db_announcement = Announcement(
            title=announcement_data.title,
            content=announcement_data.content,
            announcement_date=announcement_data.announcement_date or datetime.now(),
            created_by=user_id,
            is_published=True,
        )

        db.add(db_announcement)
        db.commit()
        db.refresh(db_announcement)
        return db_announcement
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating announcement: {str(exc)}"
        )


def get_announcement(db: Session, announcement_id: int) -> Optional[Announcement]:
    return db.query(Announcement).filter(Announcement.id == announcement_id).first()


def get_all_announcements(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    month: Optional[int] = None,
    year: Optional[int] = None,
    published_only: bool = True
) -> Tuple[List[Announcement], int]:
    query = db.query(Announcement)

    if published_only:
        query = query.filter(Announcement.is_published == True)

    if month and year:
        start_of_period = datetime(year, month, 1)
        if month == 12:
            end_of_period = datetime(year + 1, 1, 1)
        else:
            end_of_period = datetime(year, month + 1, 1)

        query = query.filter(
            Announcement.announcement_date >= start_of_period,
            Announcement.announcement_date < end_of_period,
        )
    elif year:
        start_of_year = datetime(year, 1, 1)
        end_of_year = datetime(year + 1, 1, 1)
        query = query.filter(
            Announcement.announcement_date >= start_of_year,
            Announcement.announcement_date < end_of_year,
        )

    query = query.order_by(Announcement.announcement_date.desc())
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return items, total


def get_current_month_announcements(
    db: Session,
    skip: int = 0,
    limit: int = 10
) -> Tuple[List[Announcement], int]:
    now = datetime.now()
    start_of_month = datetime(now.year, now.month, 1)
    if now.month == 12:
        start_of_next_month = datetime(now.year + 1, 1, 1)
    else:
        start_of_next_month = datetime(now.year, now.month + 1, 1)

    query = db.query(Announcement).filter(
        Announcement.is_published == True,
        Announcement.announcement_date >= start_of_month,
        Announcement.announcement_date < start_of_next_month,
    ).order_by(Announcement.announcement_date.desc())

    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return items, total

