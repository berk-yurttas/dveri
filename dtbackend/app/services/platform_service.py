"""
Platform Service

Handles all platform-related business logic including CRUD operations,
statistics, and database connection testing.
"""


from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.postgres_models import Dashboard, Platform, Report, UserPlatform
from app.schemas.platform import (
    PlatformCreate,
    PlatformStats,
    PlatformUpdate,
)


class PlatformService:
    """Service for managing platforms"""

    @staticmethod
    async def create_platform(
        db: AsyncSession,
        platform_data: PlatformCreate
    ) -> Platform:
        """
        Create a new platform

        Args:
            db: Database session
            platform_data: Platform creation data

        Returns:
            Created platform

        Raises:
            HTTPException: If platform code already exists
        """
        # Check if platform code already exists
        existing = await db.execute(
            select(Platform).where(Platform.code == platform_data.code)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Platform with code '{platform_data.code}' already exists"
            )

        # Create platform
        platform = Platform(**platform_data.model_dump())
        db.add(platform)
        await db.commit()
        await db.refresh(platform)

        return platform

    @staticmethod
    async def get_platforms(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        include_inactive: bool = False,
        search: str | None = None
    ) -> list[Platform]:
        """
        Get list of platforms with optional filtering

        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return
            include_inactive: Whether to include inactive platforms
            search: Search term for name or code

        Returns:
            List of platforms
        """
        query = select(Platform)

        # Filter by active status
        if not include_inactive:
            query = query.where(Platform.is_active == True)

        # Search filter
        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    Platform.code.ilike(search_term),
                    Platform.name.ilike(search_term),
                    Platform.display_name.ilike(search_term)
                )
            )

        # Pagination
        query = query.offset(skip).limit(limit)

        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_platform_by_id(
        db: AsyncSession,
        platform_id: int
    ) -> Platform | None:
        """
        Get platform by ID

        Args:
            db: Database session
            platform_id: Platform ID

        Returns:
            Platform or None
        """
        result = await db.execute(
            select(Platform).where(Platform.id == platform_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_platform_by_code(
        db: AsyncSession,
        platform_code: str
    ) -> Platform | None:
        """
        Get platform by code

        Args:
            db: Database session
            platform_code: Platform code

        Returns:
            Platform or None
        """
        result = await db.execute(
            select(Platform).where(Platform.code == platform_code.lower())
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def update_platform(
        db: AsyncSession,
        platform_id: int,
        platform_data: PlatformUpdate
    ) -> Platform | None:
        """
        Update platform

        Args:
            db: Database session
            platform_id: Platform ID
            platform_data: Platform update data

        Returns:
            Updated platform or None if not found
        """
        platform = await PlatformService.get_platform_by_id(db, platform_id)
        if not platform:
            return None

        # Update only provided fields
        update_data = platform_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(platform, field, value)

        await db.commit()
        await db.refresh(platform)

        return platform

    @staticmethod
    async def delete_platform(
        db: AsyncSession,
        platform_id: int,
        soft_delete: bool = True
    ) -> bool:
        """
        Delete platform (soft or hard delete)

        Args:
            db: Database session
            platform_id: Platform ID
            soft_delete: If True, set is_active=False; if False, delete from DB

        Returns:
            True if deleted, False if not found

        Raises:
            HTTPException: If platform has associated data and hard delete is attempted
        """
        platform = await PlatformService.get_platform_by_id(db, platform_id)
        if not platform:
            return False

        if soft_delete:
            # Soft delete - just deactivate
            platform.is_active = False
            await db.commit()
        else:
            # Hard delete - check for associated data
            # Check dashboards
            dashboard_count = await db.execute(
                select(func.count(Dashboard.id)).where(Dashboard.platform_id == platform_id)
            )
            if dashboard_count.scalar() > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete platform with existing dashboards. Use soft delete instead."
                )

            # Check reports
            report_count = await db.execute(
                select(func.count(Report.id)).where(Report.platform_id == platform_id)
            )
            if report_count.scalar() > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete platform with existing reports. Use soft delete instead."
                )

            # Delete platform
            await db.delete(platform)
            await db.commit()

        return True

    @staticmethod
    async def get_platform_stats(
        db: AsyncSession,
        platform_id: int
    ) -> PlatformStats | None:
        """
        Get platform statistics

        Args:
            db: Database session
            platform_id: Platform ID

        Returns:
            Platform statistics or None if platform not found
        """
        platform = await PlatformService.get_platform_by_id(db, platform_id)
        if not platform:
            return None

        # Count dashboards
        dashboard_count = await db.execute(
            select(func.count(Dashboard.id)).where(Dashboard.platform_id == platform_id)
        )

        # Count reports
        report_count = await db.execute(
            select(func.count(Report.id)).where(Report.platform_id == platform_id)
        )

        # Count users
        user_count = await db.execute(
            select(func.count(UserPlatform.user_id.distinct())).where(
                UserPlatform.platform_id == platform_id
            )
        )

        return PlatformStats(
            platform_id=platform.id,
            platform_code=platform.code,
            platform_name=platform.name,
            dashboard_count=dashboard_count.scalar() or 0,
            report_count=report_count.scalar() or 0,
            user_count=user_count.scalar() or 0
        )

    @staticmethod
    async def get_active_platform_count(db: AsyncSession) -> int:
        """
        Get count of active platforms

        Args:
            db: Database session

        Returns:
            Number of active platforms
        """
        result = await db.execute(
            select(func.count(Platform.id)).where(Platform.is_active == True)
        )
        return result.scalar() or 0

