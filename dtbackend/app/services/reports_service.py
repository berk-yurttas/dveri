import re
import time
from threading import Lock
from typing import Any

from clickhouse_driver import Client
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.platform_db import DatabaseConnectionFactory
from app.models.postgres_models import (
    Platform,
    Report,
    ReportQuery,
    ReportQueryFilter,
    ReportUser,
    User,
)
from app.schemas.reports import (
    FilterValue,
    QueryExecutionResult,
    ReportCreate,
    ReportExecutionRequest,
    ReportExecutionResponse,
    ReportFullUpdate,
    ReportList,
    ReportUpdate,
)
from app.schemas.user import User as UserSchema
from app.services.user_service import UserService


class ConnectionPool:
    """Singleton connection pool for database connections"""
    _instance = None
    _lock = Lock()
    _pools: dict[str, Any] = {}
    _clickhouse_clients: dict[str, Client] = {}

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def _get_pool_key(self, db_config: dict[str, Any], db_type: str, platform_id: int | None = None) -> str:
        """Generate a unique key for connection pool based on db_config or platform"""
        if platform_id:
            return f"{db_type}_{platform_id}"
        
        # Create hash from db_config for custom configs
        import hashlib
        import json
        config_str = json.dumps({
            'host': db_config.get('host'),
            'port': db_config.get('port'),
            'database': db_config.get('database'),
            'user': db_config.get('user'),
            'db_type': db_type
        }, sort_keys=True)
        config_hash = hashlib.md5(config_str.encode()).hexdigest()[:8]
        return f"{db_type}_{config_hash}"

    def get_connection(self, db_config: dict[str, Any] | None = None, platform: Platform | None = None, db_type: str | None = None):
        """Get or create a connection from pool
        
        Args:
            db_config: Database configuration dict (takes priority)
            platform: Platform instance (fallback)
            db_type: Database type ('postgresql', 'mssql', 'clickhouse')
        
        Returns:
            Database connection from pool
        """
        # Determine db_type and config
        if db_config:
            actual_db_type = db_type or db_config.get('db_type', 'postgresql').lower()
            actual_config = db_config
            pool_key = self._get_pool_key(db_config, actual_db_type)
        elif platform:
            actual_db_type = db_type or platform.db_type.lower()
            actual_config = platform.db_config or {}
            pool_key = self._get_pool_key(actual_config, actual_db_type, platform.id)
        else:
            raise ValueError("Either db_config or platform must be provided")

        # Special handling for ClickHouse (keep persistent client)
        if actual_db_type == "clickhouse":
            if pool_key not in self._clickhouse_clients:
                with self._lock:
                    if pool_key not in self._clickhouse_clients:
                        self._clickhouse_clients[pool_key] = self._create_clickhouse_client(actual_config)
            return self._clickhouse_clients[pool_key]

        # For PostgreSQL and MSSQL, use connection pools
        if pool_key not in self._pools:
            with self._lock:
                if pool_key not in self._pools:
                    self._pools[pool_key] = self._create_pool(actual_config, actual_db_type)

        pool = self._pools[pool_key]
        
        if actual_db_type == "postgresql":
            return pool.getconn()
        elif actual_db_type == "mssql":
            # MSSQL doesn't have built-in pooling, create new connection
            # (We could implement a custom pool later if needed)
            return self._create_mssql_connection(actual_config)
        else:
            raise ValueError(f"Unsupported database type: {actual_db_type}")

    def return_connection(self, conn, db_config: dict[str, Any] | None = None, platform: Platform | None = None, db_type: str | None = None):
        """Return connection to pool
        
        Args:
            conn: Database connection to return
            db_config: Database configuration dict (takes priority)
            platform: Platform instance (fallback)
            db_type: Database type
        """
        # Determine db_type and pool_key
        if db_config:
            actual_db_type = db_type or db_config.get('db_type', 'postgresql').lower()
            pool_key = self._get_pool_key(db_config, actual_db_type)
        elif platform:
            actual_db_type = db_type or platform.db_type.lower()
            actual_config = platform.db_config or {}
            pool_key = self._get_pool_key(actual_config, actual_db_type, platform.id)
        else:
            # If we can't determine pool, just close the connection
            if hasattr(conn, 'close'):
                conn.close()
            return

        # Don't return ClickHouse clients - they stay persistent
        if actual_db_type == "clickhouse":
            return

        # Return PostgreSQL connections to pool
        if actual_db_type == "postgresql" and pool_key in self._pools:
            try:
                self._pools[pool_key].putconn(conn)
            except Exception:
                # If error returning to pool, just close it
                if hasattr(conn, 'close'):
                    conn.close()
        else:
            # For MSSQL and others, just close the connection
            if hasattr(conn, 'close'):
                conn.close()

    def _create_pool(self, db_config: dict[str, Any], db_type: str):
        """Create a connection pool based on database type"""
        if db_type == "postgresql":
            from psycopg2 import pool
            return pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=20,
                host=db_config.get("host", "localhost"),
                port=int(db_config.get("port", 5432)),
                database=db_config.get("database"),
                user=db_config.get("user"),
                password=db_config.get("password")
            )
        else:
            raise ValueError(f"Unsupported database type for pooling: {db_type}")

    def _create_clickhouse_client(self, db_config: dict[str, Any]) -> Client:
        """Create a ClickHouse client"""
        return Client(
            host=db_config.get("host", "localhost"),
            port=int(db_config.get("port", 9000)),
            user=db_config.get("user", "default"),
            password=db_config.get("password", ""),
            database=db_config.get("database", "default"),
            settings=db_config.get("settings", {})
        )

    def _create_mssql_connection(self, db_config: dict[str, Any]):
        """Create an MSSQL connection"""
        import pyodbc
        driver = db_config.get("driver", "{ODBC Driver 17 for SQL Server}")
        connection_string = (
            f"DRIVER={driver};"
            f"SERVER={db_config.get('host', 'localhost')},{db_config.get('port', 1433)};"
            f"DATABASE={db_config.get('database')};"
            f"UID={db_config.get('user')};"
            f"PWD={db_config.get('password')}"
        )
        return pyodbc.connect(connection_string)


class ReportsService:
    _connection_pool = ConnectionPool()

    def __init__(self, db: AsyncSession, clickhouse_client: Client | None = None):
        self.db = db
        self.clickhouse_client = clickhouse_client
    
    def _get_db_connection_from_config(self, db_config: dict[str, Any], db_type: str):
        """Get a database connection from db_config dict using connection pool"""
        return self._connection_pool.get_connection(db_config=db_config, db_type=db_type)
    
    def _return_connection_to_pool(self, conn, db_config: dict[str, Any] | None = None, platform: Platform | None = None, db_type: str | None = None):
        """Return a connection to the pool"""
        self._connection_pool.return_connection(conn, db_config=db_config, platform=platform, db_type=db_type)

    # Report CRUD Operations
    async def create_report(self, report_data: ReportCreate, user: UserSchema, platform: Platform | None = None) -> Report:
        """Create a new report with queries and filters"""
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        # Serialize global filters to JSON
        global_filters_json = []
        if report_data.global_filters:
            for filter_data in report_data.global_filters:
                filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type
                global_filters_json.append({
                    'fieldName': filter_data.field_name,
                    'displayName': filter_data.display_name,
                    'type': filter_type_value,
                    'dropdownQuery': filter_data.dropdown_query,
                    'required': filter_data.required,
                    'sqlExpression': filter_data.sql_expression,
                    'dependsOn': filter_data.depends_on
                })

        # Create the main report
        db_report = Report(
            name=report_data.name,
            description=report_data.description,
            owner_id=db_user.id,
            is_public=report_data.is_public,
            tags=report_data.tags or [],
            global_filters=global_filters_json,
            platform_id=platform.id if platform else None,
            color=report_data.color or "#3B82F6",
            allowed_departments=report_data.allowed_departments or [],
            allowed_users=report_data.allowed_users or [],
            is_direct_link=report_data.is_direct_link or False,
            direct_link=report_data.direct_link,
            db_config=report_data.db_config
        )
        self.db.add(db_report)
        await self.db.flush()  # Get the report ID

        # Create queries only if not a direct link report
        if not report_data.is_direct_link:
            for query_data in report_data.queries:
                db_query = ReportQuery(
                    report_id=db_report.id,
                    name=query_data.name,
                    sql=query_data.sql,
                    visualization_config=query_data.visualization.dict(),
                    order_index=query_data.order_index or 0
                )
                self.db.add(db_query)
                await self.db.flush()  # Get the query ID

                # Create filters for this query
                for filter_data in query_data.filters:
                    # Handle both enum and string types
                    filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type

                    db_filter = ReportQueryFilter(
                        query_id=db_query.id,
                        field_name=filter_data.field_name,
                        display_name=filter_data.display_name,
                        filter_type=filter_type_value,
                        dropdown_query=filter_data.dropdown_query,
                        required=filter_data.required,
                        sql_expression=filter_data.sql_expression,
                        depends_on=filter_data.depends_on
                    )
                    self.db.add(db_filter)

        await self.db.commit()

        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_report(self, report_id: int, user: UserSchema) -> Report | None:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Get a report by ID with all queries and filters (only if user owns it or it's public or has permission)"""
        from sqlalchemy.orm import joinedload
        from sqlalchemy import cast, String, literal
        from sqlalchemy.dialects.postgresql import ARRAY

        # Check if user is admin
        is_admin = user.role and "miras:admin" in user.role

        if is_admin:
            # Admin can access all reports
            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(and_(Report.id == report_id, Report.deleted_at.is_(None)))
        else:
            # Generate all parent departments for the user
            user_dept = user.department or ""
            dept_prefixes = []
            if user_dept:
                parts = user_dept.split('_')
                current = ""
                for part in parts:
                    current = f"{current}_{part}" if current else part
                    dept_prefixes.append(current)

            dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(
                and_(
                    Report.id == report_id,
                    Report.deleted_at.is_(None),  # Exclude deleted reports
                    or_(
                        Report.owner_id == db_user.id,
                        Report.is_public == True,
                        Report.allowed_users.op('@>')(cast([user.username], ARRAY(String))),
                        Report.allowed_departments.op('&&')(dept_prefixes_array)
                    )
                )
            )
        result = await self.db.execute(stmt)
        report = result.scalar_one_or_none()

        if report:
            report.owner_name = report.owner.name if report.owner else None

        return report

    async def get_reports(self, user: UserSchema, skip: int = 0, limit: int = 100, my_reports_only: bool = False) -> list[Report]:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Get reports for a user with all queries and filters (owned + public or only owned)"""
        from sqlalchemy.orm import joinedload
        from sqlalchemy import cast, String
        from sqlalchemy.dialects.postgresql import ARRAY

        # Check if user is admin
        is_admin = user.role and "miras:admin" in user.role

        if my_reports_only:
            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(
            ).where(
                and_(Report.owner_id == db_user.id, Report.deleted_at.is_(None))
            ).offset(skip).limit(limit)
        elif is_admin:
            # Admin sees all reports
            # Admin sees all reports
            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(Report.deleted_at.is_(None)).offset(skip).limit(limit)
        else:
            # Generate all parent departments for the user
            user_dept = user.department or ""
            dept_prefixes = []
            if user_dept:
                parts = user_dept.split('_')
                current = ""
                for part in parts:
                    current = f"{current}_{part}" if current else part
                    dept_prefixes.append(current)

            # dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(
                and_(
                    Report.deleted_at.is_(None),  # Exclude deleted reports
                    or_(
                        Report.owner_id == db_user.id,
                        Report.is_public == True,
                        Report.allowed_users.op('@>')(cast([user.username], ARRAY(String))),
                        Report.allowed_departments.op('&&')(dept_prefixes_array)
                    )
                )
            ).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        reports = result.scalars().all()

        # Set owner_name for each report
        for report in reports:
            report.owner_name = report.owner.name if report.owner else None

        return reports

    async def get_reports_list(self, user: UserSchema, skip: int = 0, limit: int = 100, my_reports_only: bool = False, platform: Platform | None = None, subplatform: str | None = None) -> list[ReportList]:
        """Get reports list for a user (without nested queries and filters for performance)"""
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        from sqlalchemy import String, and_, cast, func
        from sqlalchemy.dialects.postgresql import ARRAY

        # Build base conditions
        from sqlalchemy import or_, and_, cast, String, literal
        from sqlalchemy.dialects.postgresql import ARRAY

        # Check if user is admin
        is_admin = user.role and "miras:admin" in user.role

        if my_reports_only:
            base_condition = and_(Report.owner_id == db_user.id, Report.deleted_at.is_(None))
        elif is_admin:
            # Admin sees all reports - no condition needed
            base_condition = Report.deleted_at.is_(None)
        else:
            # Access logic:
            # 1. Owner
            # 2. Public
            # 3. In allowed_users
            # 4. In allowed_departments (checking all parent departments of user's department)

            # Generate all parent departments for the user (e.g. "A_B_C" -> ["A_B_C", "A_B", "A"])
            user_dept = user.department or ""
            dept_prefixes = []
            if user_dept:
                parts = user_dept.split('_')
                current = ""
                for part in parts:
                    current = f"{current}_{part}" if current else part
                    dept_prefixes.append(current)

            # If no department, just check empty array overlap (which is false)
            dept_prefixes_array = cast(dept_prefixes, ARRAY(String))

            base_condition = and_(
                Report.deleted_at.is_(None),
                or_(
                    Report.owner_id == db_user.id,
                    Report.is_public == True,
                    Report.allowed_users.op('@>')(cast([user.username], ARRAY(String))),
                    Report.allowed_departments.op('&&')(dept_prefixes_array)
                )
            )

        # Build filter conditions
        filters = [base_condition]
        if platform:
            filters.append(Report.platform_id == platform.id)
        if subplatform:
            # Use PostgreSQL array @> operator (contains) with proper type casting
            filters.append(Report.tags.op('@>')(cast([subplatform], ARRAY(String))))

        stmt = select(
            Report.id,
            Report.name,
            Report.description,
            Report.is_public,
            Report.owner_id,
            Report.created_at,
            Report.updated_at,
            Report.tags,
            Report.color,
            Report.is_direct_link,
            Report.direct_link,
            func.count(ReportQuery.id).label('query_count')
        ).outerjoin(ReportQuery).group_by(
            Report.id,
            Report.name,
            Report.description,
            Report.is_public,
            Report.owner_id,
            Report.created_at,
            Report.updated_at,
            Report.tags,
            Report.color,
            Report.is_direct_link,
            Report.direct_link
        ).where(
            and_(*filters)
        ).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        report_rows = result.all()

        # Get owner names for all reports
        owner_ids = list(set([row.owner_id for row in report_rows]))
        owner_stmt = select(User.id, User.name).where(User.id.in_(owner_ids))
        owner_result = await self.db.execute(owner_stmt)
        owner_map = {row.id: row.name for row in owner_result.all()}

        # Get favorite status for all reports
        report_ids = [row.id for row in report_rows]
        if not report_ids:
            favorite_ids = set()
        else:
            favorite_stmt = select(ReportUser.report_id).where(
                and_(ReportUser.user_id == db_user.id, ReportUser.report_id.in_(report_ids), ReportUser.is_favorite == True)
            )
            favorite_result = await self.db.execute(favorite_stmt)
            favorite_ids = {row.report_id for row in favorite_result.all()}

        # Build ReportList objects
        reports = []
        for row in report_rows:
            reports.append(ReportList(
                id=row.id,
                name=row.name,
                description=row.description,
                is_public=row.is_public,
                owner_id=row.owner_id,
                owner_name=owner_map.get(row.owner_id),
                created_at=row.created_at,
                updated_at=row.updated_at,
                tags=row.tags,
                query_count=row.query_count,
                is_favorite=row.id in favorite_ids,
                color=row.color,
                is_direct_link=row.is_direct_link or False,
                direct_link=row.direct_link
            ))

        return reports

    async def update_report(self, report_id: int, report_data: ReportUpdate, user: UserSchema, is_admin: bool = False) -> Report | None:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Update a report with queries and filters (only if user owns it)"""
        filters = [Report.id == report_id]
        if not is_admin:
            filters.append(Report.owner_id == db_user.id)

        stmt = select(Report).where(and_(*filters))
        result = await self.db.execute(stmt)
        db_report = result.scalar_one_or_none()

        if not db_report:
            return None

        # Update report metadata
        if report_data.name is not None:
            db_report.name = report_data.name
        if report_data.description is not None:
            db_report.description = report_data.description
        if report_data.is_public is not None:
            db_report.is_public = report_data.is_public
        if report_data.tags is not None:
            db_report.tags = report_data.tags
        if report_data.layout_config is not None:
            db_report.layout_config = report_data.layout_config
        if report_data.color is not None:
            db_report.color = report_data.color
        if report_data.allowed_departments is not None:
            db_report.allowed_departments = report_data.allowed_departments
        if report_data.allowed_users is not None:
            db_report.allowed_users = report_data.allowed_users
        if report_data.is_direct_link is not None:
            db_report.is_direct_link = report_data.is_direct_link
        if report_data.direct_link is not None:
            db_report.direct_link = report_data.direct_link
        if report_data.db_config is not None:
            db_report.db_config = report_data.db_config

        await self.db.commit()

        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def update_report_full(self, report_id: int, report_data: ReportFullUpdate, user: UserSchema, is_admin: bool = False) -> Report | None:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Update a report with queries and filters (only if user owns it)"""
        filters = [Report.id == report_id]
        if not is_admin:
            filters.append(Report.owner_id == db_user.id)

        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(and_(*filters))
        result = await self.db.execute(stmt)
        db_report = result.scalar_one_or_none()

        if not db_report:
            return None

        # Update report metadata
        if report_data.name is not None:
            db_report.name = report_data.name
        if report_data.description is not None:
            db_report.description = report_data.description
        if report_data.is_public is not None:
            db_report.is_public = report_data.is_public
        if report_data.tags is not None:
            db_report.tags = report_data.tags
        if report_data.layout_config is not None:
            db_report.layout_config = report_data.layout_config
        if report_data.color is not None:
            db_report.color = report_data.color
        if report_data.allowed_departments is not None:
            db_report.allowed_departments = report_data.allowed_departments
        if report_data.allowed_users is not None:
            db_report.allowed_users = report_data.allowed_users
        if report_data.is_direct_link is not None:
            db_report.is_direct_link = report_data.is_direct_link
        if report_data.direct_link is not None:
            db_report.direct_link = report_data.direct_link
        if report_data.db_config is not None:
            db_report.db_config = report_data.db_config

        # Update global filters if provided
        if report_data.global_filters is not None:
            global_filters_json = []
            for filter_data in report_data.global_filters:
                filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type
                global_filters_json.append({
                    'fieldName': filter_data.field_name,
                    'displayName': filter_data.display_name,
                    'type': filter_type_value,
                    'dropdownQuery': filter_data.dropdown_query,
                    'required': filter_data.required,
                    'sqlExpression': filter_data.sql_expression,
                    'dependsOn': filter_data.depends_on
                })
            db_report.global_filters = global_filters_json

        # Determine if report is/will be in direct link mode
        will_be_direct_link = report_data.is_direct_link if report_data.is_direct_link is not None else db_report.is_direct_link
        
        # If switching to or already in direct link mode, delete all queries
        if will_be_direct_link:
            old_db_query_ids = [q.id for q in db_report.queries]
            if old_db_query_ids:
                # Delete all filters for these queries
                filter_delete_stmt = delete(ReportQueryFilter).where(
                    ReportQueryFilter.query_id.in_(old_db_query_ids)
                )
                await self.db.execute(filter_delete_stmt)
                # Delete all queries for this report
                query_delete_stmt = delete(ReportQuery).where(
                    ReportQuery.report_id == db_report.id
                )
                await self.db.execute(query_delete_stmt)
                await self.db.flush()
        
        # Update queries if provided (only if not a direct link report)
        if report_data.queries is not None and not will_be_direct_link:
            # Store old query IDs from the database
            old_db_query_ids = [q.id for q in db_report.queries]

            if old_db_query_ids:
                # Delete all filters for these queries
                filter_delete_stmt = delete(ReportQueryFilter).where(
                    ReportQueryFilter.query_id.in_(old_db_query_ids)
                )
                await self.db.execute(filter_delete_stmt)

                # Delete all queries for this report
                query_delete_stmt = delete(ReportQuery).where(
                    ReportQuery.report_id == db_report.id
                )
                await self.db.execute(query_delete_stmt)

                await self.db.flush()

            # Create new queries and track incoming-ID-to-new-ID mapping
            # The incoming query IDs are what the frontend uses (and what's in layoutConfig)
            old_to_new_map = {}
            for idx, query_data in enumerate(report_data.queries):
                # Store the incoming ID (from frontend) before creating new query
                incoming_query_id = str(query_data.id) if query_data.id else None

                db_query = ReportQuery(
                    report_id=db_report.id,
                    name=query_data.name,
                    sql=query_data.sql,
                    visualization_config=query_data.visualization.dict(),
                    order_index=query_data.order_index or 0
                )
                self.db.add(db_query)
                await self.db.flush()  # Get the new query ID from database

                # Map incoming ID (used in layoutConfig) to new database ID
                if incoming_query_id:
                    old_to_new_map[incoming_query_id] = str(db_query.id)

                # Create filters for this query
                for filter_data in query_data.filters:
                    # Handle both enum and string types
                    filter_type_value = filter_data.type.value if hasattr(filter_data.type, 'value') else filter_data.type

                    db_filter = ReportQueryFilter(
                        query_id=db_query.id,
                        field_name=filter_data.field_name,
                        display_name=filter_data.display_name,
                        filter_type=filter_type_value,
                        dropdown_query=filter_data.dropdown_query,
                        required=filter_data.required,
                        sql_expression=filter_data.sql_expression,
                        depends_on=filter_data.depends_on
                    )
                    self.db.add(db_filter)

            # Update layout_config to use new query IDs
            if db_report.layout_config and old_to_new_map:
                # Update layout config with new IDs
                updated_layout = []
                for layout_item in db_report.layout_config:
                    old_id = str(layout_item.get('i', ''))
                    if old_id in old_to_new_map:
                        # Create a new dict to avoid mutating the original
                        new_layout_item = dict(layout_item)
                        new_layout_item['i'] = old_to_new_map[old_id]
                        updated_layout.append(new_layout_item)
                    # If old_id not found in map, skip this layout item (query was removed)

                db_report.layout_config = updated_layout

        await self.db.commit()

        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def delete_report(self, report_id: int, user: UserSchema) -> bool:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Delete a report with all its queries and filters (only if user owns it)"""
        # First, verify the report exists and user owns it
        stmt = select(Report).where(
            and_(Report.id == report_id, Report.owner_id == db_user.id)
        )
        result = await self.db.execute(stmt)
        db_report = result.scalar_one_or_none()

        if not db_report:
            return False


            
        # Soft delete: update deleted_at
        from sqlalchemy import func
        db_report.deleted_at = func.now()
        await self.db.commit()
        return True


    async def toggle_favorite(self, report_id: int, user: UserSchema) -> bool:
        """Toggle favorite status for a report"""
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        # Check if report exists
        stmt = select(Report).where(Report.id == report_id)
        result = await self.db.execute(stmt)
        report = result.scalar_one_or_none()

        if not report:
            raise ValueError("Report not found")

        # Check if ReportUser relationship exists
        report_user_stmt = select(ReportUser).where(
            and_(ReportUser.report_id == report_id, ReportUser.user_id == db_user.id)
        )
        report_user_result = await self.db.execute(report_user_stmt)
        report_user = report_user_result.scalar_one_or_none()

        if report_user:
            # Toggle existing favorite status
            report_user.is_favorite = not report_user.is_favorite
            is_favorite = report_user.is_favorite
        else:
            # Create new ReportUser with favorite=True
            report_user = ReportUser(
                report_id=report_id,
                user_id=db_user.id,
                is_favorite=True
            )
            self.db.add(report_user)
            is_favorite = True

        await self.db.commit()
        return is_favorite


    # Query Execution
    def sanitize_sql_query(self, query: str) -> str:
        """Basic SQL injection protection and query sanitization"""
        dangerous_patterns = [
            r'\b(DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)\b',
            r';[\s]*(?:DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)',
            r'/\*.*?\*/',  # Multi-line comments
        ]

        sanitized_query = query.strip()

        for pattern in dangerous_patterns:
            if re.search(pattern, sanitized_query, re.IGNORECASE):
                raise ValueError(f"Query contains potentially dangerous SQL: {pattern}")

        # Ensure query starts with SELECT
        if not re.match(r'^\s*SELECT\s+', sanitized_query, re.IGNORECASE):
            raise ValueError("Only SELECT queries are allowed")

        return sanitized_query

    def apply_filters_to_query(self, sql: str, filters: list[ReportQueryFilter], filter_values: list[FilterValue], db_type: str = "clickhouse") -> str:
        """Apply filter values to a SQL query by replacing {{dynamic_filters}} placeholder

        Args:
            sql: SQL query string
            filters: List of filter configurations
            filter_values: List of filter values to apply
            db_type: Database type ('clickhouse', 'postgresql', 'mssql')
        """
        # Handle empty or None filter_values
        if not filter_values:
            # If no filter values provided, just remove the placeholder
            if "{{dynamic_filters}}" in sql:
                sql = sql.replace("{{dynamic_filters}}", "")
            return sql

        # Create a mapping of field names to values
        filter_map = {fv.field_name: fv for fv in filter_values}

        # Build WHERE conditions
        conditions = []

        for db_filter in filters:
            if db_filter.field_name not in filter_map:
                if db_filter.required:
                    raise ValueError(f"Required filter '{db_filter.display_name}' is missing")
                continue

            filter_value = filter_map[db_filter.field_name]

            if filter_value.value is None or filter_value.value == "":
                continue

            # Use sql_expression if provided, otherwise use field_name
            field_expression = db_filter.sql_expression if db_filter.sql_expression else db_filter.field_name

            # Auto-quote field names that need quoting for PostgreSQL (unless already quoted or using sql_expression)
            if not db_filter.sql_expression:
                if not (field_expression.startswith('"') and field_expression.endswith('"')):
                    # Check if field needs quoting (contains uppercase, spaces, or special chars)
                    if not field_expression.islower() or ' ' in field_expression or not field_expression.replace('_', '').isalnum():
                        field_expression = f'"{field_expression}"'

            value = filter_value.value
            operator = filter_value.operator or "="

            if db_filter.filter_type == "text":
                # For text filters, use different operators based on the filter condition
                # Use CAST for quoted identifiers to ensure LOWER works properly
                field_expr = f"LOWER(CAST({field_expression} AS TEXT))" if field_expression.startswith('"') and field_expression.endswith('"') else f"LOWER({field_expression})"
                value_expr = f"LOWER('{value}')"

                if operator == "CONTAINS":
                    conditions.append(f"{field_expr} LIKE LOWER('%{value}%')")
                elif operator == "NOT_CONTAINS":
                    conditions.append(f"{field_expr} NOT LIKE LOWER('%{value}%')")
                elif operator == "STARTS_WITH":
                    conditions.append(f"{field_expr} LIKE LOWER('{value}%')")
                elif operator == "ENDS_WITH":
                    conditions.append(f"{field_expr} LIKE LOWER('%{value}')")
                elif operator == "=":
                    conditions.append(f"{field_expr} = {value_expr}")
                elif operator == "NOT_EQUALS":
                    conditions.append(f"{field_expr} != {value_expr}")
                else:
                    # Default to CONTAINS for backward compatibility
                    conditions.append(f"{field_expr} LIKE LOWER('%{value}%')")
            elif db_filter.filter_type == "number":
                # For number filters, support =, !=, >, <, >=, <=, NOT_EQUALS
                if operator == "NOT_EQUALS":
                    conditions.append(f"{field_expression} != {value}")
                elif operator in ["=", "!=", ">", "<", ">=", "<="]:
                    conditions.append(f"{field_expression} {operator} {value}")
                else:
                    # Default to equals for backward compatibility
                    conditions.append(f"{field_expression} = {value}")
            elif db_filter.filter_type == "date":
                # Use database-specific date functions
                if db_type.lower() == "clickhouse":
                    date_func = "toDate"
                elif db_type.lower() in ["postgresql", "mssql"]:
                    date_func = "DATE"
                else:
                    date_func = "DATE"  # Default to standard SQL

                if operator == "BETWEEN" and isinstance(value, list) and len(value) == 2:
                    # For timestamp fields, we need to compare dates properly
                    condition = f"{date_func}({field_expression}) BETWEEN {date_func}('{value[0]}') AND {date_func}('{value[1]}')"
                    conditions.append(condition)
                elif operator == ">=":
                    condition = f"{date_func}({field_expression}) >= {date_func}('{value}')"
                    conditions.append(condition)
                elif operator == "<=":
                    condition = f"{date_func}({field_expression}) <= {date_func}('{value}')"
                    conditions.append(condition)
                else:
                    condition = f"{date_func}({field_expression}) {operator} {date_func}('{value}')"
                    conditions.append(condition)
            elif db_filter.filter_type in ["dropdown", "multiselect"]:
                if isinstance(value, list):
                    quoted_values = [f"'{v}'" for v in value]
                    conditions.append(f"{field_expression} IN ({','.join(quoted_values)})")
                else:
                    conditions.append(f"{field_expression} = '{value}'")

        # Replace {{dynamic_filters}} placeholder with actual filter conditions
        if "{{dynamic_filters}}" in sql:
            if conditions:
                filter_clause = " AND " + " AND ".join(conditions)
                sql = sql.replace("{{dynamic_filters}}", filter_clause)
            else:
                # Remove the placeholder if no filters are applied
                sql = sql.replace("{{dynamic_filters}}", "")
        elif conditions:
            where_clause = " AND ".join(conditions)
            if "WHERE" in sql.upper():
                sql = sql + f" AND ({where_clause})"
            else:
                sql = sql + f" WHERE {where_clause}"

        return sql

    def apply_sorting_to_query(self, sql: str, sort_by: str, sort_direction: str) -> str:
        """Apply sorting to SQL query, overriding any existing ORDER BY clause"""
        import re

        # Validate inputs
        if not sort_by or not sort_by.strip():
            raise ValueError("sort_by cannot be empty")

        if not sort_direction or not sort_direction.strip():
            raise ValueError("sort_direction cannot be empty")

        # Validate sort direction
        sort_direction = sort_direction.strip().lower()
        if sort_direction not in ['asc', 'desc']:
            raise ValueError(f"Invalid sort direction: {sort_direction}. Must be 'asc' or 'desc'")

        # Validate sort_by column name (basic SQL injection prevention)
        sort_by = sort_by.strip()

        # Check for dangerous SQL keywords/characters first
        dangerous_chars = [';', '--', '/*', '*/', 'DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE']
        sort_by_upper = sort_by.upper()
        for danger in dangerous_chars:
            if danger in sort_by_upper:
                raise ValueError(f"Invalid column name: {sort_by}. Contains potentially dangerous SQL.")

        # Auto-quote field names that need quoting for PostgreSQL (unless already quoted)
        if not (sort_by.startswith('"') and sort_by.endswith('"')):
            # Check if field needs quoting (contains uppercase, spaces, or special chars)
            if not sort_by.islower() or ' ' in sort_by or not sort_by.replace('_', '').replace('.', '').isalnum():
                # Quote the identifier for PostgreSQL
                sort_by = f'"{sort_by}"'

        # Remove existing ORDER BY clause (case insensitive)
        # This regex matches ORDER BY followed by any characters until the end or LIMIT
        sql_without_order = re.sub(r'\s+ORDER\s+BY\s+.*?(?=\s+LIMIT\s+|\s*$)', '', sql, flags=re.IGNORECASE)

        # Add new ORDER BY clause
        new_sql = f"{sql_without_order} ORDER BY {sort_by} {sort_direction.upper()}"

        return new_sql

    def execute_query(self, query: ReportQuery, filter_values: list[FilterValue] = None, limit: int = 1000, page_size: int = None, page_limit: int = None, sort_by: str = None, sort_direction: str = None, visualization_type: str = None, platform: Platform | None = None, global_filters: list[dict[str, Any]] = None, db_config: dict[str, Any] | None = None) -> QueryExecutionResult:
        """Execute a single query with optional filters

        Args:
            query: ReportQuery to execute
            filter_values: Optional filter values
            limit: Result limit (default 1000)
            page_size: Page size for pagination
            page_limit: Page number for pagination (1-based)
            sort_by: Column to sort by
            sort_direction: Sort direction ('asc' or 'desc')
            visualization_type: Type of visualization
            platform: Platform instance for database connection (optional, falls back to clickhouse_client)
            global_filters: Global filters from the report that apply to all queries
            db_config: Database configuration from report (overrides platform db_config)
        """
        t0 = time.time()
        print(f"\n[PERF] Starting execute_query for query_id={query.id}")

        # Determine database type - prioritize report's db_config
        t1 = time.time()
        if db_config:
            db_type = db_config.get('db_type', 'clickhouse').lower()
        elif platform:
            db_type = platform.db_type.lower()
        else:
            # Fallback to ClickHouse for backward compatibility
            db_type = "clickhouse"
            if not self.clickhouse_client:
                raise ValueError("Database client not available")
        print(f"[PERF] DB type determination: {(time.time() - t1) * 1000:.2f}ms")

        try:
            # Get the base SQL
            t1 = time.time()
            sql = query.sql
            print(f"[PERF] Get base SQL: {(time.time() - t1) * 1000:.2f}ms")

            # Merge global filters with query-specific filters
            t1 = time.time()
            all_filters = list(query.filters)
            if global_filters:
                # Convert global filters dict to ReportQueryFilter objects for processing
                for gf in global_filters:
                    # Create a pseudo-filter object that matches ReportQueryFilter structure
                    filter_obj = type('obj', (object,), {
                        'field_name': gf.get('fieldName'),
                        'display_name': gf.get('displayName'),
                        'filter_type': gf.get('type'),
                        'dropdown_query': gf.get('dropdownQuery'),
                        'required': gf.get('required', False),
                        'sql_expression': gf.get('sqlExpression'),
                        'depends_on': gf.get('dependsOn')
                    })()
                    all_filters.append(filter_obj)
            print(f"[PERF] Merge global filters: {(time.time() - t1) * 1000:.2f}ms")

            # Always apply filters (even if empty) to handle {{dynamic_filters}} placeholder
            t1 = time.time()
            sql = self.apply_filters_to_query(sql, all_filters, filter_values or [], db_type)
            print(f"[PERF] Apply filters: {(time.time() - t1) * 1000:.2f}ms")

            # Apply sorting if provided
            t1 = time.time()
            if sort_by and sort_direction:
                try:
                    sql = self.apply_sorting_to_query(sql, sort_by, sort_direction)
                except ValueError as e:
                    return QueryExecutionResult(
                        query_id=query.id,
                        query_name=query.name,
                        columns=[],
                        data=[],
                        total_rows=0,
                        execution_time_ms=0,
                        success=False,
                        message=f"Sorting error: {e!s}"
                    )
            print(f"[PERF] Apply sorting: {(time.time() - t1) * 1000:.2f}ms")

            # Sanitize the query
            t1 = time.time()
            sanitized_sql = self.sanitize_sql_query(sql)
            print(f"[PERF] Sanitize SQL: {(time.time() - t1) * 1000:.2f}ms")

            start_time = time.time()
            total_rows = 0

            # Execute based on database type
            if db_type == "clickhouse":
                # Use ClickHouse client (existing logic)
                if not self.clickhouse_client:
                    raise ValueError("ClickHouse client not available")

                # Handle pagination if both page_size and page_limit are provided
                if page_size is not None and page_limit is not None:
                    # First, get the total count for pagination info
                    t1 = time.time()
                    count_sql = f"SELECT COUNT(*) FROM ({sanitized_sql}) AS subquery"
                    count_result = self.clickhouse_client.execute(count_sql)
                    total_rows = count_result[0][0] if count_result and count_result[0] else 0
                    print(f"[PERF] ClickHouse count query: {(time.time() - t1) * 1000:.2f}ms")

                    # Calculate offset (page_limit is 1-based)
                    offset = (page_limit - 1) * page_size

                    # Add pagination to the main query
                    t1 = time.time()
                    paginated_sql = f"{sanitized_sql} LIMIT {page_size} OFFSET {offset}"
                    result = self.clickhouse_client.execute(paginated_sql, with_column_types=True)
                    print(f"[PERF] ClickHouse paginated query: {(time.time() - t1) * 1000:.2f}ms")
                else:
                    # Add limit only for table visualizations (non-paginated query)
                    if visualization_type == 'table' and 'LIMIT' not in sanitized_sql.upper():
                        sanitized_sql = f"{sanitized_sql} LIMIT {limit}"

                    # Execute the query
                    t1 = time.time()
                    result = self.clickhouse_client.execute(sanitized_sql, with_column_types=True)
                    print(f"[PERF] ClickHouse execute query: {(time.time() - t1) * 1000:.2f}ms")

                # Process ClickHouse results
                t1 = time.time()
                if result and len(result) > 0:
                    columns = [col[0] for col in result[1]] if len(result) > 1 else []
                    data = result[0] if result[0] else []
                else:
                    columns = []
                    data = []
                print(f"[PERF] Process ClickHouse results: {(time.time() - t1) * 1000:.2f}ms")

            elif db_type == "postgresql":
                # Use PostgreSQL connection - prioritize report's db_config
                t1 = time.time()
                if db_config:
                    # Use report's db_config with connection pool
                    conn = self._connection_pool.get_connection(db_config=db_config, db_type=db_type)
                elif platform:
                    # Fallback to platform's connection pool
                    conn = self._connection_pool.get_connection(platform=platform, db_type=db_type)
                else:
                    raise ValueError("Database configuration required for PostgreSQL queries")
                cursor = conn.cursor()
                print(f"[PERF] PostgreSQL get connection: {(time.time() - t1) * 1000:.2f}ms")

                try:
                    # Handle pagination if both page_size and page_limit are provided
                    if page_size is not None and page_limit is not None:
                        # Calculate offset (page_limit is 1-based)
                        offset = (page_limit - 1) * page_size

                        # Fetch page_size + 1 rows to check if there are more pages (no COUNT needed)
                        t1 = time.time()
                        paginated_sql = f"{sanitized_sql} LIMIT {page_size + 1} OFFSET {offset}"
                        cursor.execute(paginated_sql)
                        print(f"[PERF] PostgreSQL paginated query: {(time.time() - t1) * 1000:.2f}ms")
                    else:
                        # Add limit only for table visualizations (non-paginated query)
                        if visualization_type == 'table' and 'LIMIT' not in sanitized_sql.upper():
                            sanitized_sql = f"{sanitized_sql} LIMIT {limit}"

                        # Execute the query
                        t1 = time.time()
                        cursor.execute(sanitized_sql)
                        print(f"[PERF] PostgreSQL execute query: {(time.time() - t1) * 1000:.2f}ms")

                    # Get columns and data
                    t1 = time.time()
                    columns = [desc[0] for desc in cursor.description] if cursor.description else []
                    data = cursor.fetchall()
                    print(f"[PERF] PostgreSQL fetch results: {(time.time() - t1) * 1000:.2f}ms")

                finally:
                    cursor.close()
                    # Return connection to pool
                    self._connection_pool.return_connection(conn, db_config=db_config, platform=platform, db_type=db_type)

            elif db_type == "mssql":
                # Use MSSQL connection - prioritize report's db_config
                if db_config:
                    # Use report's db_config with connection pool
                    conn = self._connection_pool.get_connection(db_config=db_config, db_type=db_type)
                elif platform:
                    # Fallback to platform's connection pool
                    conn = self._connection_pool.get_connection(platform=platform, db_type=db_type)
                else:
                    raise ValueError("Database configuration required for MSSQL queries")
                cursor = conn.cursor()

                try:
                    # Handle pagination if both page_size and page_limit are provided
                    if page_size is not None and page_limit is not None:
                        # Calculate offset (page_limit is 1-based)
                        offset = (page_limit - 1) * page_size

                        # Fetch page_size + 1 rows to check if there are more pages (no COUNT needed)
                        # MSSQL uses OFFSET/FETCH syntax
                        paginated_sql = f"{sanitized_sql} OFFSET {offset} ROWS FETCH NEXT {page_size + 1} ROWS ONLY"
                        cursor.execute(paginated_sql)
                    else:
                        # Add TOP for table visualizations (non-paginated query)
                        if visualization_type == 'table' and 'TOP' not in sanitized_sql.upper() and 'LIMIT' not in sanitized_sql.upper():
                            # MSSQL uses TOP instead of LIMIT
                            sanitized_sql = sanitized_sql.replace("SELECT", f"SELECT TOP {limit}", 1)

                        # Execute the query
                        cursor.execute(sanitized_sql)

                    # Get columns and data
                    columns = [column[0] for column in cursor.description] if cursor.description else []
                    data = cursor.fetchall()

                finally:
                    cursor.close()
                    # Return connection to pool
                    self._connection_pool.return_connection(conn, db_config=db_config, platform=platform, db_type=db_type)
            else:
                raise ValueError(f"Unsupported database type: {db_type}")

            execution_time_ms = (time.time() - start_time) * 1000
            print(f"[PERF] Total DB execution time: {execution_time_ms:.2f}ms")

            # Format data for JSON serialization (common for all database types)
            t1 = time.time()
            formatted_data = []
            has_more = False

            # If paginated, check if we got more rows than page_size
            if page_size is not None and page_limit is not None:
                has_more = len(data) > page_size
                # Remove the extra row used for has_more check
                data_to_format = data[:page_size]
            else:
                data_to_format = data

            for row in data_to_format:
                formatted_row = []
                for item in row:
                    if isinstance(item, (int, float, str, bool)) or item is None:
                        formatted_row.append(item)
                    else:
                        # Handle datetime, date, and other types
                        formatted_row.append(str(item))
                formatted_data.append(formatted_row)
            print(f"[PERF] Format data for JSON: {(time.time() - t1) * 1000:.2f}ms")

            # For paginated queries, we don't know exact total (no COUNT), just whether there are more pages
            # For non-paginated queries, use data length
            actual_total_rows = len(formatted_data)

            print(f"[PERF] TOTAL execute_query time: {(time.time() - t0) * 1000:.2f}ms\n")

            return QueryExecutionResult(
                query_id=query.id,
                query_name=query.name,
                columns=columns,
                data=formatted_data,
                total_rows=actual_total_rows,
                execution_time_ms=round(execution_time_ms, 2),
                success=True,
                message=f"Query executed successfully. Retrieved {len(formatted_data)} rows{f' of {actual_total_rows} total' if actual_total_rows > len(formatted_data) else ''}.",
                has_more=has_more
            )

        except Exception as e:
            error_msg = str(e)
            if "Code:" in error_msg:
                error_msg = error_msg.split("Code:")[1].strip()

            return QueryExecutionResult(
                query_id=query.id,
                query_name=query.name,
                columns=[],
                data=[],
                total_rows=0,
                execution_time_ms=0,
                success=False,
                message=f"Query execution failed: {error_msg}"
            )

    async def execute_report(self, request: ReportExecutionRequest, user: UserSchema) -> ReportExecutionResponse:
        t0 = time.time()
        print(f"\n[PERF] Starting execute_report for report_id={request.report_id}")
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")
        print(f"[PERF] Get user: {(time.time() - t0) * 1000:.2f}ms")

        """Execute a full report or specific query"""
        # Get the report with platform relationship
        # Use joinedload for better performance - single query with JOINs instead of multiple queries
        stmt = select(Report).options(
            joinedload(Report.queries).joinedload(ReportQuery.filters),
            joinedload(Report.platform)
        ).where(Report.id == request.report_id)
        t2 = time.time()
        result = await self.db.execute(stmt)
        print(f"[PERF] Fetch report with joinedload: {(time.time() - t2) * 1000:.2f}ms")
        report = result.unique().scalar_one_or_none()

        if not report:
            raise ValueError("Report not found or access denied")

        is_admin = user.role and "miras:admin" in user.role
        if is_admin:
            has_access = True
        else:
            has_access = (
                report.owner_id == db_user.id or 
                report.is_public == True
            )
        
        if not has_access:
            # Check allowed users
            if report.allowed_users and user.username in report.allowed_users:
                has_access = True
            
            # Check allowed departments
            if not has_access and report.allowed_departments and user.department:
                # Check if user's department or any of its parents are in allowed_departments
                user_dept_parts = user.department.split('_')
                current_dept = ""
                for part in user_dept_parts:
                    current_dept = f"{current_dept}_{part}" if current_dept else part
                    if current_dept in report.allowed_departments:
                        has_access = True
                        break

        if not has_access:
            raise ValueError("Report access denied")

        # Get platform for database connection (used as fallback)
        platform = report.platform
        
        # Get report's db_config (prioritized over platform's config)
        report_db_config = report.db_config

        # Verify we have a way to execute queries (report db_config, platform, or clickhouse_client)
        if not report_db_config and not platform and not self.clickhouse_client:
            raise ValueError("No database connection available for this report")

        # Merge global filters with request filters
        # Global filters apply to all queries, request filters are user-provided values
        merged_filters = list(request.filters) if request.filters else []

        # If report has global filters defined, they should already be part of the SQL
        # The filter values in the request will apply to both global and query-specific filters

        start_time = time.time()
        results = []

        try:
            if request.query_id:
                # Execute specific query
                query = next((q for q in report.queries if q.id == request.query_id), None)
                if not query:
                    raise ValueError("Query not found in report")

                result = self.execute_query(
                    query, merged_filters, request.limit,
                    request.page_size, request.page_limit,
                    request.sort_by, request.sort_direction,
                    query.visualization_config.get('type', 'table'),
                    platform=platform,
                    global_filters=report.global_filters or [],
                    db_config=report_db_config
                )
                results.append(result)
            else:
                # Execute all queries
                for query in report.queries:
                    result = self.execute_query(
                        query, merged_filters, request.limit,
                        request.page_size, request.page_limit,
                        request.sort_by, request.sort_direction,
                        query.visualization_config.get('type', 'table'),
                        platform=platform,
                        global_filters=report.global_filters or [],
                        db_config=report_db_config
                    )
                    results.append(result)

            total_execution_time = (time.time() - start_time) * 1000
            print(f"[PERF] Total execute_report time: {(time.time() - t0) * 1000:.2f}ms\n")

            return ReportExecutionResponse(
                report_id=report.id,
                report_name=report.name,
                results=results,
                total_execution_time_ms=round(total_execution_time, 2),
                success=all(r.success for r in results),
                message="Report executed successfully" if all(r.success for r in results) else "Some queries failed"
            )

        except Exception as e:
            total_execution_time = (time.time() - start_time) * 1000

            return ReportExecutionResponse(
                report_id=request.report_id,
                report_name=report.name if report else "Unknown",
                results=results,
                total_execution_time_ms=round(total_execution_time, 2),
                success=False,
                message=str(e)
            )

    async def get_filter_options(self, report_id: int, query_id: int, filter_field: str, user: UserSchema, page: int = 1, page_size: int = 50, search: str = "") -> dict[str, Any]:
        db_user = await UserService.get_user_by_username(self.db, user.username)
        if not db_user:
            raise ValueError("User not found")

        """Get dropdown options for a filter by report, query, and field name with pagination and search"""
        # Get the filter along with report and platform
        stmt = select(ReportQueryFilter).join(ReportQuery).join(Report).options(
            selectinload(ReportQueryFilter.query).selectinload(ReportQuery.report).selectinload(Report.platform)
        ).where(
            and_(
                Report.id == report_id,
                ReportQuery.id == query_id,
                ReportQueryFilter.field_name == filter_field
            )
        )
        result = await self.db.execute(stmt)
        db_filter = result.scalar_one_or_none()
        
        if not db_filter:
            return {"options": [], "total": 0, "page": page, "page_size": page_size, "has_more": False}
            
        # Check permissions
        report = db_filter.query.report
        has_access = (
            report.owner_id == db_user.id or 
            report.is_public == True
        )
        
        if not has_access:
            # Check allowed users
            if report.allowed_users and user.username in report.allowed_users:
                has_access = True
            
            # Check allowed departments
            if not has_access and report.allowed_departments and user.department:
                user_dept_parts = user.department.split('_')
                current_dept = ""
                for part in user_dept_parts:
                    current_dept = f"{current_dept}_{part}" if current_dept else part
                    if current_dept in report.allowed_departments:
                        has_access = True
                        break
        
        if not has_access:
            # Don't throw error, just return empty options to avoid leaking info
            return {"options": [], "total": 0, "page": page, "page_size": page_size, "has_more": False}

        if not db_filter.dropdown_query:
            return {"options": [], "total": 0, "page": page, "page_size": page_size, "has_more": False}

        # Get report's db_config and platform (fallback)
        report_db_config = db_filter.query.report.db_config if db_filter.query and db_filter.query.report else None
        platform = db_filter.query.report.platform if db_filter.query and db_filter.query.report else None

        # Determine database type - prioritize report's db_config
        if report_db_config:
            db_type = report_db_config.get('db_type', 'clickhouse').lower()
        elif platform:
            db_type = platform.db_type.lower()
        else:
            db_type = "clickhouse"
            if not self.clickhouse_client:
                raise ValueError("Database client not available")

        try:
            # Build the query with search and pagination
            base_query = self.sanitize_sql_query(db_filter.dropdown_query)

            # Remove trailing semicolon if present
            base_query = base_query.rstrip(';').strip()

            # Add search filter if provided
            if search:
                # Wrap base query and add WHERE clause for search
                # This assumes the first column is value and second is label
                if "WHERE" in base_query.upper():
                    base_query = f"SELECT * FROM ({base_query}) AS subquery WHERE CAST(subquery.value AS TEXT) ILIKE '%{search}%' OR CAST(subquery.label AS TEXT) ILIKE '%{search}%'"
                else:
                    # If no columns specified, search in all columns
                    base_query = f"SELECT * FROM ({base_query}) AS subquery WHERE CAST(subquery.value AS TEXT) ILIKE '%{search}%'"

            # Get total count
            count_query = f"SELECT COUNT(*) FROM ({base_query}) AS count_subquery"

            # Add pagination
            offset = (page - 1) * page_size
            paginated_query = f"{base_query} LIMIT {page_size} OFFSET {offset}"

            if db_type == "clickhouse":
                if not self.clickhouse_client:
                    raise ValueError("ClickHouse client not available")

                # Get total count
                total_result = self.clickhouse_client.execute(count_query)
                total = total_result[0][0] if total_result else 0

                # Get paginated results
                result = self.clickhouse_client.execute(paginated_query)

            elif db_type == "postgresql":
                # Use report's db_config or fallback to platform
                if report_db_config:
                    conn = self._connection_pool.get_connection(db_config=report_db_config, db_type=db_type)
                elif platform:
                    conn = self._connection_pool.get_connection(platform=platform, db_type=db_type)
                else:
                    raise ValueError("Database configuration required for PostgreSQL queries")
                
                cursor = conn.cursor()
                try:
                    # Get total count
                    cursor.execute(count_query)
                    total = cursor.fetchone()[0]

                    # Get paginated results
                    cursor.execute(paginated_query)
                    result = cursor.fetchall()
                finally:
                    cursor.close()
                    # Return connection to pool
                    self._connection_pool.return_connection(conn, db_config=report_db_config, platform=platform, db_type=db_type)

            elif db_type == "mssql":
                # Use report's db_config or fallback to platform
                if report_db_config:
                    conn = self._connection_pool.get_connection(db_config=report_db_config, db_type=db_type)
                elif platform:
                    conn = self._connection_pool.get_connection(platform=platform, db_type=db_type)
                else:
                    raise ValueError("Database configuration required for MSSQL queries")
                
                cursor = conn.cursor()
                try:
                    # Get total count
                    cursor.execute(count_query)
                    total = cursor.fetchone()[0]

                    # Get paginated results
                    cursor.execute(paginated_query)
                    result = cursor.fetchall()
                finally:
                    cursor.close()
                    # Return connection to pool
                    self._connection_pool.return_connection(conn, db_config=report_db_config, platform=platform, db_type=db_type)
            else:
                raise ValueError(f"Unsupported database type: {db_type}")

            # Format as value/label pairs
            options = []
            for row in result:
                if len(row) >= 2:
                    options.append({"value": row[0], "label": row[1]})
                elif len(row) == 1:
                    options.append({"value": row[0], "label": str(row[0])})

            has_more = (offset + len(options)) < total

            return {
                "options": options,
                "total": total,
                "page": page,
                "page_size": page_size,
                "has_more": has_more
            }

        except Exception as e:
            raise ValueError(f"Failed to get filter options: {e!s}")
