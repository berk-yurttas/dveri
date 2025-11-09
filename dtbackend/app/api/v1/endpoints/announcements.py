"""
Announcement API Endpoints

CRUD operations for managing announcements.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_postgres_db
from app.models.postgres_models import User
from app.schemas.announcement import (
    Announcement as AnnouncementSchema,
    AnnouncementList,
    AnnouncementCreate,
    AnnouncementUpdate,
    AnnouncementWithPlatform
)
from app.services.announcement_service import AnnouncementService
from app.core.auth import check_authenticated

router = APIRouter()


@router.get("/", response_model=List[AnnouncementSchema])
async def get_announcements(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records to return"),
    platform_id: Optional[int] = Query(None, description="Filter by platform ID (null for general announcements)"),
    active_only: bool = Query(True, description="Only return currently active announcements"),
    all_platforms: bool = Query(False, description="Return announcements from all platforms (for admin)"),
    include_general: bool = Query(True, description="Include general announcements with platform-specific ones"),
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get list of announcements
    
    - **skip**: Number of records to skip (pagination)
    - **limit**: Maximum number of records to return
    - **platform_id**: Filter by platform ID (null for general announcements)
    - **active_only**: Only return announcements that are currently active (based on creation_date and expire_date)
    - **all_platforms**: Return announcements from all platforms (for admin panel)
    - **include_general**: Include general announcements with platform-specific ones (default True for frontend)
    """
    announcements = await AnnouncementService.get_announcements(
        db=db,
        skip=skip,
        limit=limit,
        platform_id=platform_id,
        active_only=active_only,
        all_platforms=all_platforms,
        include_general=include_general
    )
    return announcements


@router.get("/count")
async def get_announcement_count(
    platform_id: Optional[int] = Query(None, description="Filter by platform ID"),
    active_only: bool = Query(True, description="Only count active announcements"),
    all_platforms: bool = Query(False, description="Count announcements from all platforms"),
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get total count of announcements
    """
    count = await AnnouncementService.get_announcement_count(
        db=db,
        platform_id=platform_id,
        active_only=active_only,
        all_platforms=all_platforms
    )
    return {"total": count, "platform_id": platform_id, "active_only": active_only}


@router.get("/{announcement_id}", response_model=AnnouncementSchema)
async def get_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get announcement by ID
    
    - **announcement_id**: Announcement ID
    """
    announcement = await AnnouncementService.get_announcement_by_id(db, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return announcement


@router.post("/", response_model=AnnouncementSchema, status_code=201)
async def create_announcement(
    announcement_data: AnnouncementCreate,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Create a new announcement
    
    - **title**: Announcement title (required)
    - **month_title**: Month label (optional)
    - **content_summary**: Short summary (optional)
    - **content_detail**: Detailed content (optional)
    - **content_image**: Image data as base64 or URL (optional)
    - **creation_date**: When announcement becomes visible (optional, defaults to now)
    - **expire_date**: When announcement should be hidden (optional)
    - **platform_id**: Platform ID (optional, null for general announcements)
    """
    announcement = await AnnouncementService.create_announcement(
        db=db,
        announcement_data=announcement_data
    )
    return announcement


@router.put("/{announcement_id}", response_model=AnnouncementSchema)
async def update_announcement(
    announcement_id: int,
    announcement_data: AnnouncementUpdate,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Update an existing announcement
    
    - **announcement_id**: Announcement ID
    - All fields are optional and only provided fields will be updated
    """
    announcement = await AnnouncementService.update_announcement(
        db=db,
        announcement_id=announcement_id,
        announcement_data=announcement_data
    )
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return announcement


@router.delete("/{announcement_id}", status_code=204)
async def delete_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Delete an announcement
    
    - **announcement_id**: Announcement ID
    """
    deleted = await AnnouncementService.delete_announcement(
        db=db,
        announcement_id=announcement_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return None

