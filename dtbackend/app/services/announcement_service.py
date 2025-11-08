"""
Announcement Service

Handles all announcement-related business logic including CRUD operations.
"""

from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException
from datetime import datetime

from app.models.postgres_models import Announcement, Platform
from app.schemas.announcement import (
    AnnouncementCreate, 
    AnnouncementUpdate
)


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
        platform_id: Optional[int] = None,
        active_only: bool = True
    ) -> List[Announcement]:
        """
        Get list of announcements with optional filtering
        
        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return
            platform_id: Filter by platform ID (None for general announcements)
            active_only: If True, only return announcements that are currently active
            
        Returns:
            List of announcements
        """
        query = select(Announcement).options(selectinload(Announcement.platform))
        
        # Filter by platform
        # Note: We always apply platform filter to prevent showing all announcements
        if platform_id is not None:
            # Get announcements for specific platform or general announcements
            query = query.where(
                or_(
                    Announcement.platform_id == platform_id,
                    Announcement.platform_id.is_(None)
                )
            )
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
        
        # Order by creation_date descending
        query = query.order_by(Announcement.creation_date.desc())
        
        # Pagination
        query = query.offset(skip).limit(limit)
        
        result = await db.execute(query)
        return result.scalars().all()
    
    @staticmethod
    async def get_announcement_by_id(
        db: AsyncSession,
        announcement_id: int
    ) -> Optional[Announcement]:
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
    ) -> Optional[Announcement]:
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
        
        await db.delete(announcement)
        await db.commit()
        
        return True
    
    @staticmethod
    async def get_announcement_count(
        db: AsyncSession,
        platform_id: Optional[int] = None,
        active_only: bool = True
    ) -> int:
        """
        Get count of announcements
        
        Args:
            db: Database session
            platform_id: Filter by platform ID
            active_only: If True, only count active announcements
            
        Returns:
            Number of announcements
        """
        query = select(func.count(Announcement.id))
        
        # Filter by platform
        if platform_id is not None:
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

