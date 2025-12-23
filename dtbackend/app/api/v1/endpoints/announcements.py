"""
Announcement API Endpoints

CRUD operations for managing announcements.
"""


import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import check_authenticated
from app.core.config import settings
from app.core.database import get_postgres_db
from app.models.postgres_models import User
from app.schemas.announcement import (
    Announcement as AnnouncementSchema,
)
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementUpdate,
)
from app.services.announcement_service import AnnouncementService

router = APIRouter()


@router.get("/", response_model=list[AnnouncementSchema])
async def get_announcements(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records to return"),
    platform_id: int | None = Query(None, description="Filter by platform ID (null for general announcements)"),
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
    platform_id: int | None = Query(None, description="Filter by platform ID"),
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


@router.post("/upload-image")
async def upload_announcement_image(
    file: UploadFile = File(...),
    current_user: User = Depends(check_authenticated)
):
    """
    Upload an image to PocketBase files collection and return the URL

    - **file**: Image file to upload

    Returns:
        - **url**: Full URL to access the uploaded image
        - **record_id**: PocketBase record ID
        - **filename**: Uploaded filename
    """
    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            # 1. Admin authentication (if credentials provided)
            auth_token = None
            if settings.POCKETBASE_ADMIN_EMAIL and settings.POCKETBASE_ADMIN_PASSWORD:
                try:
                    auth_response = await client.post(
                        f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
                        json={
                            "identity": settings.POCKETBASE_ADMIN_EMAIL,
                            "password": settings.POCKETBASE_ADMIN_PASSWORD
                        }
                    )
                    if auth_response.status_code == 200:
                        auth_token = auth_response.json().get("token")
                except Exception as auth_error:
                    print(f"PocketBase auth warning: {auth_error}")

            # 2. Upload file to PocketBase
            file_content = await file.read()

            # Prepare file for upload (document field in files collection)
            files = {
                "document": (file.filename, file_content, file.content_type or "image/jpeg")
            }

            headers = {}
            if auth_token:
                headers["Authorization"] = auth_token

            # Upload to PocketBase files collection
            upload_response = await client.post(
                f"{settings.POCKETBASE_URL}/api/collections/files/records",
                files=files,
                headers=headers
            )

            if upload_response.status_code in [200, 201]:
                data = upload_response.json()

                # Construct file URL: /api/files/{collectionName}/{recordId}/{filename}
                file_url = f"{settings.POCKETBASE_URL}/api/files/files/{data['id']}/{data['document']}"

                return {
                    "url": file_url,
                    "record_id": data['id'],
                    "filename": data['document']
                }
            else:
                error_detail = upload_response.text
                raise HTTPException(
                    status_code=upload_response.status_code,
                    detail=f"PocketBase upload failed: {error_detail}"
                )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error uploading image: {e!s}"
        )

