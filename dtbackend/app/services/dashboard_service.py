from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.postgres_models import Dashboard, DashboardUser, Platform, User
from app.schemas.dashboard import DashboardCreate, DashboardUpdate
from app.services.user_service import UserService
from app.schemas.user import User as UserSchema


class DashboardService:

    @staticmethod
    async def create_dashboard(
        db: AsyncSession,
        dashboard_data: DashboardCreate,
        username: str,
        platform: Platform
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
            platform_id=platform.id if platform else None,
            owner_id=user.id,
            tags=dashboard_data.tags,
            is_public=dashboard_data.is_public,
            layout_config=dashboard_data.layout_config,
            widgets=widgets_data,
            allowed_departments=dashboard_data.allowed_departments or [],
            allowed_users=dashboard_data.allowed_users or []
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
        username: str,
        user_role: list[str] = []
    ) -> Dashboard | None:
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

        # Check if user is admin
        is_admin = user_role and "miras:admin" in user_role

        # Check access: admin can access all dashboards
        if not is_admin:
            # Access logic:
            # 1. Owner
            # 2. Public
            # 3. In allowed_users
            # 4. In allowed_departments (checking all parent departments of user's department)
            
            has_access = dashboard.owner_id == user.id or dashboard.is_public
            
            if not has_access:
                # Check allowed users
                if dashboard.allowed_users and user.username in dashboard.allowed_users:
                    has_access = True
                
                # Check allowed departments
                if not has_access and dashboard.allowed_departments and user.department:
                    # Check if user's department or any of its parents are in allowed_departments
                    user_dept_parts = user.department.split('_')
                    current_dept = ""
                    for part in user_dept_parts:
                        current_dept = f"{current_dept}_{part}" if current_dept else part
                        if current_dept in dashboard.allowed_departments:
                            has_access = True
                            break
            
            if not has_access:
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
        user: UserSchema,
        skip: int = 0,
        limit: int = 100,
        platform: Platform = None,
        subplatform: str = None,
        user_role: list[str] = []
    ) -> list[dict]:
        """Get all dashboards by username"""
        db_user = await UserService.get_user_by_username(db, username)
        if not db_user:
            return []

        # Get dashboards where user is in the users relationship OR dashboard is public
        from sqlalchemy import and_, cast, literal, or_, String
        from sqlalchemy.dialects.postgresql import ARRAY

        # Check if user is admin
        is_admin = user_role and "miras:admin" in user_role

        if is_admin:
            # Admin sees all dashboards - no access restriction
            base_conditions = literal(True)
        else:
            # Generate all parent departments for the user (e.g. "A_B_C" -> ["A_B_C", "A_B", "A"])
            user_dept = user.department or ""
            dept_prefixes = []
            if user_dept:
                parts = user_dept.split('_')
                current_dept = ""
                for part in parts:
                    current_dept = f"{current_dept}_{part}" if current_dept else part
                    dept_prefixes.append(current_dept)
            
            # Convert to PostgreSQL array format
            dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            # Build base conditions:
            # 1. Owner
            # 2. Public
            # 3. In allowed_users
            # 4. In allowed_departments (checking all parent departments)
            base_conditions = or_(
                Dashboard.owner_id == db_user.id,
                Dashboard.is_public == True,
                Dashboard.allowed_users.op('@>')(cast([user.username], ARRAY(String))),
                Dashboard.allowed_departments.op('&&')(dept_prefixes_array)
            )

        # Build filter conditions
        filters = [base_conditions]
        if platform:
            filters.append(Dashboard.platform_id == platform.id)
        if subplatform:
            # Use PostgreSQL array @> operator (contains) with proper type casting
            filters.append(Dashboard.tags.op('@>')(cast([subplatform], ARRAY(String))))

        # Select list-safe columns only. Avoid selecting optional columns that can
        # be missing in some local DB schemas (causes runtime 500).
        query = select(
            Dashboard.id,
            Dashboard.title,
            Dashboard.is_public,
            Dashboard.owner_id,
            Dashboard.layout_config,
            Dashboard.widgets,
            Dashboard.created_at,
            Dashboard.updated_at,
            User.name.label("owner_name")
        ).outerjoin(
            User, User.id == Dashboard.owner_id
        ).where(
            and_(*filters)
        ).offset(skip).limit(limit)

        result = await db.execute(query)
        dashboards = result.mappings().all()

        dashboard_list: list[dict] = []
        for dashboard in dashboards:
            is_favorite_query = select(DashboardUser).where(
                DashboardUser.dashboard_id == dashboard["id"],
                DashboardUser.user_id == db_user.id
            )
            is_favorite_result = await db.execute(is_favorite_query)
            dashboard_user = is_favorite_result.scalar_one_or_none()
            dashboard_data = dict(dashboard)
            dashboard_data["is_favorite"] = dashboard_user.is_favorite if dashboard_user else False
            # Keep response schema-compatible defaults for optional ACL fields.
            dashboard_data["allowed_departments"] = []
            dashboard_data["allowed_users"] = []
            dashboard_data["tags"] = []
            dashboard_list.append(dashboard_data)

        return dashboard_list

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
    ) -> list[Dashboard]:
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
    ) -> Dashboard | None:
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

