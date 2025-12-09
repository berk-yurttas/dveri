"""
Announcement Service

Handles all announcement-related business logic including CRUD operations.
"""

import re
from datetime import datetime
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.postgres_models import Announcement, Platform
from app.schemas.announcement import AnnouncementCreate, AnnouncementUpdate


class AnnouncementService:
    """Service for managing announcements"""

    @staticmethod
    async def create_announcement(
        db: AsyncSession,
        announcement_data: AnnouncementCreate
    ) -> Announcement:
        """
        Create a new announcement

        Args:
            db: Database session
            announcement_data: Announcement creation data

        Returns:
            Created announcement

        Raises:
            HTTPException: If platform_id is provided but doesn't exist
        """
        # Validate platform if provided
        if announcement_data.platform_id:
            platform = await db.execute(
                select(Platform).where(Platform.id == announcement_data.platform_id)
            )
            if not platform.scalar_one_or_none():
                raise HTTPException(
                    status_code=404,
                    detail=f"Platform with ID {announcement_data.platform_id} not found"
                )

        # Create announcement
        announcement = Announcement(**announcement_data.model_dump())
        db.add(announcement)
        await db.commit()
        await db.refresh(announcement)

        return announcement

    @staticmethod
    async def get_announcements(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        platform_id: int | None = None,
        active_only: bool = True,
        all_platforms: bool = False,
        include_general: bool = True
    ) -> list[Announcement]:
        """
        Get list of announcements with optional filtering

        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return
            platform_id: Filter by platform ID (None for general announcements)
            active_only: If True, only return announcements that are currently active
            all_platforms: If True, return announcements from all platforms (for admin)
            include_general: If True, include general announcements with platform-specific ones

        Returns:
            List of announcements
        """
        query = select(Announcement).options(selectinload(Announcement.platform))

        # Filter by platform
        if all_platforms:
            # Admin mode: Don't filter by platform, show all announcements
            pass
        elif platform_id is not None:
            # Get announcements for specific platform
            if include_general:
                # Include general announcements (for frontend display)
                query = query.where(
                    or_(
                        Announcement.platform_id == platform_id,
                        Announcement.platform_id.is_(None)
                    )
                )
            else:
                # Only specific platform (for admin management)
                query = query.where(Announcement.platform_id == platform_id)
        else:
            # For main page (platform_id=None): Only show general announcements
            query = query.where(Announcement.platform_id.is_(None))

        # Filter by active status (creation_date <= now and (expire_date is null or expire_date > now))
        if active_only:
            now = datetime.now()
            query = query.where(
                and_(
                    Announcement.creation_date <= now,
                    or_(
                        Announcement.expire_date.is_(None),
                        Announcement.expire_date > now
                    )
                )
            )

        # Order by creation_date descending, then by id descending (for consistent ordering)
        query = query.order_by(Announcement.creation_date.desc(), Announcement.id.desc())

        # Pagination
        query = query.offset(skip).limit(limit)

        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_announcement_by_id(
        db: AsyncSession,
        announcement_id: int
    ) -> Announcement | None:
        """
        Get announcement by ID

        Args:
            db: Database session
            announcement_id: Announcement ID

        Returns:
            Announcement or None
        """
        result = await db.execute(
            select(Announcement)
            .options(selectinload(Announcement.platform))
            .where(Announcement.id == announcement_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def update_announcement(
        db: AsyncSession,
        announcement_id: int,
        announcement_data: AnnouncementUpdate
    ) -> Announcement | None:
        """
        Update announcement

        Args:
            db: Database session
            announcement_id: Announcement ID
            announcement_data: Announcement update data

        Returns:
            Updated announcement or None if not found

        Raises:
            HTTPException: If platform_id is provided but doesn't exist
        """
        announcement = await AnnouncementService.get_announcement_by_id(db, announcement_id)
        if not announcement:
            return None

        # Preserve old media references for cleanup after update
        old_content_image = announcement.content_image
        old_content_detail = announcement.content_detail

        # Validate platform if provided
        update_data = announcement_data.model_dump(exclude_unset=True)
        if 'platform_id' in update_data and update_data['platform_id'] is not None:
            platform = await db.execute(
                select(Platform).where(Platform.id == update_data['platform_id'])
            )
            if not platform.scalar_one_or_none():
                raise HTTPException(
                    status_code=404,
                    detail=f"Platform with ID {update_data['platform_id']} not found"
                )

        # Update only provided fields
        for field, value in update_data.items():
            setattr(announcement, field, value)

        await db.commit()
        await db.refresh(announcement)

        try:
            old_urls: set[str] = set()
            new_urls: set[str] = set()

            if old_content_image:
                old_urls.add(old_content_image)
            if announcement.content_image:
                new_urls.add(announcement.content_image)

            old_urls.update(AnnouncementService._extract_pocketbase_file_urls(old_content_detail or ""))
            new_urls.update(AnnouncementService._extract_pocketbase_file_urls(announcement.content_detail or ""))

            urls_to_delete = old_urls - new_urls
            for url in urls_to_delete:
                await AnnouncementService._delete_pocketbase_file(url)
        except Exception:
            # Do not block update if cleanup fails
            pass

        return announcement

    @staticmethod
    async def delete_announcement(
        db: AsyncSession,
        announcement_id: int
    ) -> bool:
        """
        Delete announcement

        Args:
            db: Database session
            announcement_id: Announcement ID

        Returns:
            True if deleted, False if not found
        """
        announcement = await AnnouncementService.get_announcement_by_id(db, announcement_id)
        if not announcement:
            return False

        pocketbase_urls: set[str] = set()
        if announcement.content_image:
            pocketbase_urls.add(announcement.content_image)

        if announcement.content_detail:
            pocketbase_urls.update(
                AnnouncementService._extract_pocketbase_file_urls(announcement.content_detail)
            )

        for file_url in pocketbase_urls:
            await AnnouncementService._delete_pocketbase_file(file_url)

        await db.delete(announcement)
        await db.commit()

        return True

    @staticmethod
    def _extract_pocketbase_file_urls(content: str) -> set[str]:
        """
        Extract PocketBase file URLs from rich text/HTML content.
        """
        if not content:
            return set()

        urls: set[str] = set()

        # Match src attributes (e.g., <img src="...">)
        for match in re.findall(r'src\s*=\s*["\']([^"\']+)["\']', content, flags=re.IGNORECASE):
            urls.add(match)

        # Also capture data-url attributes (commonly used by editors)
        for match in re.findall(r'data-url\s*=\s*["\']([^"\']+)["\']', content, flags=re.IGNORECASE):
            urls.add(match)

        return urls

    @staticmethod
    async def _delete_pocketbase_file(file_url: str | None) -> None:
        """
        Delete announcement image from PocketBase if it was stored there.
        Silently ignores any errors to avoid blocking announcement deletion.
        """
        if not file_url:
            return

        try:
            parsed_url = urlparse(file_url)
            path_parts = [part for part in parsed_url.path.split("/") if part]

            # Expected path: /api/files/files/{record_id}/{filename}
            if len(path_parts) < 5:
                return

            if path_parts[0] != "api" or path_parts[1] != "files" or path_parts[2] != "files":
                return

            # Validate PocketBase base URL
            pocketbase_base = urlparse(settings.POCKETBASE_URL)
            if pocketbase_base.netloc and pocketbase_base.netloc != parsed_url.netloc:
                return

            record_id = path_parts[3]

            if not record_id:
                return

            async with httpx.AsyncClient(timeout=30.0) as client:
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
                    except Exception:
                        # Ignore authentication errors
                        return

                headers = {}
                if auth_token:
                    headers["Authorization"] = auth_token

                await client.delete(
                    f"{settings.POCKETBASE_URL}/api/collections/files/records/{record_id}",
                    headers=headers
                )
        except Exception:
            # Swallow all errors to avoid breaking announcement deletion
            return

    @staticmethod
    async def get_announcement_count(
        db: AsyncSession,
        platform_id: int | None = None,
        active_only: bool = True,
        all_platforms: bool = False
    ) -> int:
        """
        Get count of announcements

        Args:
            db: Database session
            platform_id: Filter by platform ID
            active_only: If True, only count active announcements
            all_platforms: If True, count announcements from all platforms

        Returns:
            Number of announcements
        """
        query = select(func.count(Announcement.id))

        # Filter by platform
        if all_platforms:
            # Admin mode: Don't filter by platform
            pass
        elif platform_id is not None:
            query = query.where(
                or_(
                    Announcement.platform_id == platform_id,
                    Announcement.platform_id.is_(None)
                )
            )

        # Filter by active status
        if active_only:
            now = datetime.now()
            query = query.where(
                and_(
                    Announcement.creation_date <= now,
                    or_(
                        Announcement.expire_date.is_(None),
                        Announcement.expire_date > now
                    )
                )
            )

        result = await db.execute(query)
        return result.scalar() or 0

