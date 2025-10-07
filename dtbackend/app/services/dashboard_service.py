from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.postgres_models import Dashboard, DashboardUser, User
from app.schemas.dashboard import DashboardCreate, DashboardUpdate
from app.services.user_service import UserService

class DashboardService:
    
    @staticmethod
    async def create_dashboard(
        db: AsyncSession,
        dashboard_data: DashboardCreate,
        username: str
    ) -> Dashboard:
        """Create a new dashboard and add owner to DashboardUser"""
        # Get the user by username
        user = await UserService.get_user_by_username(db, username)
        if not user:
            raise ValueError(f"User with username '{username}' not found")
        
        # Convert Pydantic Widget objects to dictionaries for JSON serialization
        widgets_data = [widget.model_dump() for widget in dashboard_data.widgets] if dashboard_data.widgets else []
        
        # Create the dashboard
        db_dashboard = Dashboard(
            title=dashboard_data.title,
            owner_id=user.id,
            is_public=dashboard_data.is_public,
            layout_config=dashboard_data.layout_config,
            widgets=widgets_data
        )
        db.add(db_dashboard)
        await db.commit()
        await db.refresh(db_dashboard)
        
        # Create DashboardUser record to link the owner to the dashboard
        dashboard_user = DashboardUser(
            dashboard_id=db_dashboard.id,
            user_id=user.id,
            is_favorite=False  # Owner can set this later if needed
        )
        db.add(dashboard_user)
        await db.commit()
        
        return db_dashboard
    
    @staticmethod
    async def get_dashboard_by_id(
        db: AsyncSession,
        dashboard_id: int,
        username: str
    ) -> Optional[Dashboard]:
        """Get dashboard by ID"""
        from sqlalchemy.orm import joinedload

        query = select(Dashboard).options(joinedload(Dashboard.owner)).where(Dashboard.id == dashboard_id)
        result = await db.execute(query)
        dashboard = result.scalar_one_or_none()

        if not dashboard:
            return None

        user = await UserService.get_user_by_username(db, username)
        if not user:
            return None

        # Check if dashboard is favorited by the user
        is_favorite_query = select(DashboardUser).where(
            DashboardUser.dashboard_id == dashboard_id,
            DashboardUser.user_id == user.id
        )
        is_favorite_result = await db.execute(is_favorite_query)
        dashboard_user = is_favorite_result.scalar_one_or_none()

        # Set the is_favorite field and owner_name on the dashboard object
        dashboard.is_favorite = dashboard_user.is_favorite if dashboard_user else False
        dashboard.owner_name = dashboard.owner.name if dashboard.owner else None

        return dashboard
    
    @staticmethod
    async def get_dashboards(
        db: AsyncSession,
        username: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dashboard]:
        """Get all dashboards by username"""
        user = await UserService.get_user_by_username(db, username)
        if not user:
            return []

        # Get dashboards where user is in the users relationship OR dashboard is public
        from sqlalchemy import or_
        from sqlalchemy.orm import joinedload

        # Subquery for dashboards where user is explicitly added
        user_dashboards_subquery = select(Dashboard.id).join(DashboardUser).where(
            DashboardUser.user_id == user.id
        )

        # Main query: dashboards where user is added OR dashboard is public
        query = select(Dashboard).options(joinedload(Dashboard.owner)).where(
            or_(
                Dashboard.id.in_(user_dashboards_subquery),
                Dashboard.is_public == True
            )
        ).offset(skip).limit(limit)

        result = await db.execute(query)
        dashboards = result.scalars().all()

        # Set is_favorite field and owner_name for each dashboard
        for dashboard in dashboards:
            is_favorite_query = select(DashboardUser).where(
                DashboardUser.dashboard_id == dashboard.id,
                DashboardUser.user_id == user.id
            )
            is_favorite_result = await db.execute(is_favorite_query)
            dashboard_user = is_favorite_result.scalar_one_or_none()
            dashboard.is_favorite = dashboard_user.is_favorite if dashboard_user else False
            dashboard.owner_name = dashboard.owner.name if dashboard.owner else None

        return dashboards
    
    @staticmethod
    async def get_favorite_dashboards(
        db: AsyncSession,
        username: str
    ) -> List[Dashboard]:
        """Get all favorite dashboards by username"""
        user = await UserService.get_user_by_username(db, username)
        if not user:
            return []

        from sqlalchemy.orm import joinedload

        query = select(Dashboard).options(joinedload(Dashboard.owner)).join(DashboardUser).where(
            DashboardUser.user_id == user.id, DashboardUser.is_favorite == True)
        result = await db.execute(query)
        dashboards = result.scalars().all()

        # Set owner_name for each dashboard
        for dashboard in dashboards:
            dashboard.owner_name = dashboard.owner.name if dashboard.owner else None

        return dashboards
    
    @staticmethod
    async def add_favorite_dashboard(
        db: AsyncSession,
        dashboard_id: int,
        username: str
    ) -> Dashboard:
        """Add a dashboard to favorites"""
        user = await UserService.get_user_by_username(db, username)
        if not user:
            return None
        
        dashboard = await DashboardService.get_dashboard_by_id(db, dashboard_id, username)
        if not dashboard:
            return None
        
        dashboard_user_query = select(DashboardUser).where(DashboardUser.dashboard_id == dashboard.id, DashboardUser.user_id == user.id)
        dashboard_user = await db.execute(dashboard_user_query)
        dashboard_user = dashboard_user.scalar_one_or_none()
        if not dashboard_user:
            dashboard_user = DashboardUser(
                dashboard_id=dashboard.id,
                user_id=user.id,
                is_favorite=True
            )
            db.add(dashboard_user)
        else:
            dashboard_user.is_favorite = True
        await db.commit()
        await db.refresh(dashboard_user)
        return True

    @staticmethod
    async def remove_from_favorite_dashboard(
        db: AsyncSession,
        dashboard_id: int,
        username: str
    ) -> Dashboard:
        """Remove a dashboard from favorites"""
        user = await UserService.get_user_by_username(db, username)
        if not user:
            return None
        
        dashboard = await DashboardService.get_dashboard_by_id(db, dashboard_id, username)
        if not dashboard:
            return None
        
        dashboard_user_query = select(DashboardUser).where(DashboardUser.dashboard_id == dashboard.id, DashboardUser.user_id == user.id)
        dashboard_user = await db.execute(dashboard_user_query)
        dashboard_user = dashboard_user.scalar_one_or_none()
        if not dashboard_user:
            return None
        dashboard_user.is_favorite = False
        await db.commit()
        await db.refresh(dashboard_user)
        return True


    @staticmethod
    async def get_dashboards_by_owner(
        db: AsyncSession,
        owner_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dashboard]:
        """Get all dashboards by owner ID"""
        query = select(Dashboard).where(Dashboard.owner_id == owner_id).offset(skip).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()
    
    @staticmethod
    async def update_dashboard(
        db: AsyncSession,
        username: str,
        dashboard_id: int,
        dashboard_update: DashboardUpdate
    ) -> Optional[Dashboard]:
        """Update dashboard"""
        dashboard = await DashboardService.get_dashboard_by_id(db, dashboard_id, username)
        if not dashboard:
            return None
        
        update_data = dashboard_update.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(dashboard, field, value)
        
        await db.commit()
        await db.refresh(dashboard)
        return dashboard
    
    @staticmethod
    async def delete_dashboard(db: AsyncSession, dashboard_id: int, username: str) -> bool:
        """Delete dashboard"""
        dashboard = await DashboardService.get_dashboard_by_id(db, dashboard_id, username)
        if not dashboard:
            return False
        
        await db.delete(dashboard)
        await db.commit()
        return True
    
    @staticmethod
    async def get_public_dashboards(
        db: AsyncSession,
        username: str,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dashboard]:
        """Get all public dashboards"""
        from sqlalchemy.orm import joinedload

        query = select(Dashboard).options(joinedload(Dashboard.owner)).where(Dashboard.is_public == True).offset(skip).limit(limit)
        result = await db.execute(query)
        dashboards = result.scalars().all()

        # Get user for favorite status
        user = await UserService.get_user_by_username(db, username)
        if user:
            # Set is_favorite field and owner_name for each dashboard
            for dashboard in dashboards:
                is_favorite_query = select(DashboardUser).where(
                    DashboardUser.dashboard_id == dashboard.id,
                    DashboardUser.user_id == user.id
                )
                is_favorite_result = await db.execute(is_favorite_query)
                dashboard_user = is_favorite_result.scalar_one_or_none()
                dashboard.is_favorite = dashboard_user.is_favorite if dashboard_user else False
                dashboard.owner_name = dashboard.owner.name if dashboard.owner else None
        else:
            # If user not found, set all to False
            for dashboard in dashboards:
                dashboard.is_favorite = False
                dashboard.owner_name = dashboard.owner.name if dashboard.owner else None

        return dashboards
