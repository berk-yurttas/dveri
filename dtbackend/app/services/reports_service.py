from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select, delete
from sqlalchemy.orm import selectinload
from clickhouse_driver import Client
import time
import re
import json

from app.models.postgres_models import Report, ReportQuery, ReportQueryFilter, User
from app.schemas.reports import (
    ReportCreate, ReportUpdate, ReportFullUpdate, QueryConfigCreate, QueryConfigUpdate,
    FilterConfigCreate, FilterConfigUpdate, ReportExecutionRequest,
    QueryExecutionResult, ReportExecutionResponse, FilterValue
)
from app.services.user_service import UserService


class ReportsService:
    def __init__(self, db: AsyncSession, clickhouse_client: Optional[Client] = None):
        self.db = db
        self.clickhouse_client = clickhouse_client

    # Report CRUD Operations
    async def create_report(self, report_data: ReportCreate, username: str) -> Report:
        """Create a new report with queries and filters"""
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        # Create the main report
        db_report = Report(
            name=report_data.name,
            description=report_data.description,
            owner_id=user.id,
            is_public=report_data.is_public,
            tags=report_data.tags or []
        )
        self.db.add(db_report)
        await self.db.flush()  # Get the report ID

        # Create queries
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
                    required=filter_data.required
                )
                self.db.add(db_filter)

        await self.db.commit()
        
        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_report(self, report_id: int, username: str) -> Optional[Report]:
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        """Get a report by ID with all queries and filters (only if user owns it or it's public)"""
        from sqlalchemy.orm import joinedload

        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters),
            joinedload(Report.owner)
        ).where(
            and_(
                Report.id == report_id,
                or_(Report.owner_id == user.id, Report.is_public == True)
            )
        )
        result = await self.db.execute(stmt)
        report = result.scalar_one_or_none()

        if report:
            report.owner_name = report.owner.name if report.owner else None

        return report

    async def get_reports(self, username: str, skip: int = 0, limit: int = 100, my_reports_only: bool = False) -> List[Report]:
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        """Get reports for a user with all queries and filters (owned + public or only owned)"""
        from sqlalchemy.orm import joinedload

        if my_reports_only:
            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(
                Report.owner_id == user.id
            ).offset(skip).limit(limit)
        else:
            stmt = select(Report).options(
                selectinload(Report.queries).selectinload(ReportQuery.filters),
                joinedload(Report.owner)
            ).where(
                or_(Report.owner_id == user.id, Report.is_public == True)
            ).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        reports = result.scalars().all()

        # Set owner_name for each report
        for report in reports:
            report.owner_name = report.owner.name if report.owner else None

        return reports

    async def get_reports_list(self, username: str, skip: int = 0, limit: int = 100, my_reports_only: bool = False) -> List[Report]:
        """Get reports list for a user (without nested queries and filters for performance)"""
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        from sqlalchemy.orm import joinedload
        from sqlalchemy import func

        if my_reports_only:
            stmt = select(
                Report.id,
                Report.name,
                Report.description,
                Report.is_public,
                Report.owner_id,
                Report.created_at,
                Report.updated_at,
                Report.tags,
                func.count(ReportQuery.id).label('query_count')
            ).outerjoin(ReportQuery).group_by(
                Report.id,
                Report.name,
                Report.description,
                Report.is_public,
                Report.owner_id,
                Report.created_at,
                Report.updated_at,
                Report.tags
            ).where(
                Report.owner_id == user.id
            ).offset(skip).limit(limit)
        else:
            stmt = select(
                Report.id,
                Report.name,
                Report.description,
                Report.is_public,
                Report.owner_id,
                Report.created_at,
                Report.updated_at,
                Report.tags,
                func.count(ReportQuery.id).label('query_count')
            ).outerjoin(ReportQuery).group_by(
                Report.id,
                Report.name,
                Report.description,
                Report.is_public,
                Report.owner_id,
                Report.created_at,
                Report.updated_at,
                Report.tags
            ).where(
                or_(Report.owner_id == user.id, Report.is_public == True)
            ).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        report_rows = result.all()

        # Get owner names for all reports
        owner_ids = list(set([row.owner_id for row in report_rows]))
        owner_stmt = select(User.id, User.name).where(User.id.in_(owner_ids))
        owner_result = await self.db.execute(owner_stmt)
        owner_map = {row.id: row.name for row in owner_result.all()}

        # Build ReportList objects
        reports = []
        for row in report_rows:
            reports.append({
                'id': row.id,
                'name': row.name,
                'description': row.description,
                'is_public': row.is_public,
                'owner_id': row.owner_id,
                'owner_name': owner_map.get(row.owner_id),
                'created_at': row.created_at,
                'updated_at': row.updated_at,
                'tags': row.tags,
                'query_count': row.query_count
            })

        return reports

    async def update_report(self, report_id: int, report_data: ReportUpdate, username: str) -> Optional[Report]:
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        """Update a report with queries and filters (only if user owns it)"""
        stmt = select(Report).where(
            and_(Report.id == report_id, Report.owner_id == user.id)
        )
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

        await self.db.commit()
        
        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def update_report_full(self, report_id: int, report_data: ReportFullUpdate, username: str) -> Optional[Report]:
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        """Update a report with queries and filters (only if user owns it)"""
        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(
            and_(Report.id == report_id, Report.owner_id == user.id)
        )
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

        # Update queries if provided
        if report_data.queries is not None:
            # Delete existing filters first using direct SQL
            # Get all query IDs for this report
            query_ids = [q.id for q in db_report.queries]
            
            if query_ids:
                # Delete all filters for these queries
                filter_delete_stmt = delete(ReportQueryFilter).where(
                    ReportQueryFilter.query_id.in_(query_ids)
                )
                await self.db.execute(filter_delete_stmt)
                
                # Delete all queries for this report
                query_delete_stmt = delete(ReportQuery).where(
                    ReportQuery.report_id == db_report.id
                )
                await self.db.execute(query_delete_stmt)
                
                await self.db.flush()

            # Create new queries
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
                        required=filter_data.required
                    )
                    self.db.add(db_filter)

        await self.db.commit()
        
        # Refresh and eagerly load relationships
        stmt = select(Report).options(
            selectinload(Report.queries).selectinload(ReportQuery.filters)
        ).where(Report.id == db_report.id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def delete_report(self, report_id: int, username: str) -> bool:
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        """Delete a report with all its queries and filters (only if user owns it)"""
        stmt = select(Report).where(
            and_(Report.id == report_id, Report.owner_id == user.id)
        )
        result = await self.db.execute(stmt)
        db_report = result.scalar_one_or_none()
        
        if not db_report:
            return False

        self.db.delete(db_report)
        await self.db.commit()
        return True


    # Query Execution
    def sanitize_sql_query(self, query: str) -> str:
        """Basic SQL injection protection and query sanitization"""
        dangerous_patterns = [
            r'\b(DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)\b',
            r';[\s]*(?:DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)',
            r'--',  # SQL comments
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

    def apply_filters_to_query(self, sql: str, filters: List[ReportQueryFilter], filter_values: List[FilterValue]) -> str:
        """Apply filter values to a SQL query by replacing {{dynamic_filters}} placeholder"""
        print(f"DEBUG: apply_filters_to_query called with {len(filter_values)} filter values")
        print(f"DEBUG: filter_values: {[{'field': fv.field_name, 'value': fv.value, 'operator': fv.operator} for fv in filter_values]}")
        print(f"DEBUG: available filters: {[{'field': f.field_name, 'type': f.filter_type} for f in filters]}")
        
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
            print(f"DEBUG: Processing filter {db_filter.field_name} (type: {db_filter.filter_type})")
            if db_filter.field_name not in filter_map:
                print(f"DEBUG: Filter {db_filter.field_name} not found in filter_map")
                if db_filter.required:
                    raise ValueError(f"Required filter '{db_filter.display_name}' is missing")
                continue
                
            filter_value = filter_map[db_filter.field_name]
            
            if filter_value.value is None or filter_value.value == "":
                print(f"DEBUG: Filter {db_filter.field_name} has empty value")
                continue
                
            field_name = db_filter.field_name
            value = filter_value.value
            operator = filter_value.operator or "="
            
            print(f"DEBUG: Building condition for {field_name} with value {value} and operator {operator}")
            
            if db_filter.filter_type == "text":
                # For text filters, always use LIKE for partial matching (case-insensitive search)
                conditions.append(f"LOWER({field_name}) LIKE LOWER('%{value}%')")
            elif db_filter.filter_type == "number":
                conditions.append(f"{field_name} {operator} {value}")
            elif db_filter.filter_type == "date":
                if operator == "BETWEEN" and isinstance(value, list) and len(value) == 2:
                    # For timestamp fields, we need to compare dates properly
                    # Convert date strings to timestamp range for the entire day
                    start_date = f"{value[0]} 00:00:00"
                    end_date = f"{value[1]} 23:59:59"
                    condition = f"toDate({field_name}) BETWEEN toDate('{value[0]}') AND toDate('{value[1]}')"
                    print(f"DEBUG: Created BETWEEN condition: {condition}")
                    conditions.append(condition)
                elif operator == ">=":
                    condition = f"toDate({field_name}) >= toDate('{value}')"
                    print(f"DEBUG: Created >= date condition: {condition}")
                    conditions.append(condition)
                elif operator == "<=":
                    condition = f"toDate({field_name}) <= toDate('{value}')"
                    print(f"DEBUG: Created <= date condition: {condition}")
                    conditions.append(condition)
                else:
                    condition = f"toDate({field_name}) {operator} toDate('{value}')"
                    print(f"DEBUG: Created date condition: {condition}")
                    conditions.append(condition)
            elif db_filter.filter_type in ["dropdown", "multiselect"]:
                if isinstance(value, list):
                    quoted_values = [f"'{v}'" for v in value]
                    conditions.append(f"{field_name} IN ({','.join(quoted_values)})")
                else:
                    conditions.append(f"{field_name} = '{value}'")
        
        print(f"DEBUG: Generated conditions: {conditions}")
        
        # Replace {{dynamic_filters}} placeholder with actual filter conditions
        if "{{dynamic_filters}}" in sql:
            if conditions:
                filter_clause = " AND " + " AND ".join(conditions)
                print(f"DEBUG: Replacing {{dynamic_filters}} with: {filter_clause}")
                sql = sql.replace("{{dynamic_filters}}", filter_clause)
            else:
                # Remove the placeholder if no filters are applied
                sql = sql.replace("{{dynamic_filters}}", "")
        else:
            # Fallback: Add conditions to existing WHERE clause if no placeholder found
            if conditions:
                where_clause = " AND ".join(conditions)
                if "WHERE" in sql.upper():
                    sql = sql + f" AND ({where_clause})"
                else:
                    sql = sql + f" WHERE {where_clause}"
        
        print(f"DEBUG: Final SQL: {sql}")
        return sql

    def execute_query(self, query: ReportQuery, filter_values: List[FilterValue] = None, limit: int = 1000, page_size: int = None, page_limit: int = None) -> QueryExecutionResult:
        """Execute a single query with optional filters"""
        if not self.clickhouse_client:
            raise ValueError("ClickHouse client not available")

        try:
            # Get the base SQL
            sql = query.sql
            
            # Always apply filters (even if empty) to handle {{dynamic_filters}} placeholder
            sql = self.apply_filters_to_query(sql, query.filters, filter_values or [])
            
            # Sanitize the query
            sanitized_sql = self.sanitize_sql_query(sql)
            
            start_time = time.time()
            total_rows = 0
            
            # Handle pagination if both page_size and page_limit are provided
            if page_size is not None and page_limit is not None:
                print(f"DEBUG: Pagination requested - page_size: {page_size}, page_limit: {page_limit}")
                
                # First, get the total count for pagination info
                count_sql = f"SELECT COUNT(*) FROM ({sanitized_sql}) AS subquery"
                print(f"DEBUG: Count SQL: {count_sql}")
                count_result = self.clickhouse_client.execute(count_sql)
                total_rows = count_result[0][0] if count_result and count_result[0] else 0
                print(f"DEBUG: Total rows: {total_rows}")
                
                # Calculate offset (page_limit is 1-based)
                offset = (page_limit - 1) * page_size
                print(f"DEBUG: Calculated offset: {offset}")
                
                # Add pagination to the main query
                paginated_sql = f"{sanitized_sql} LIMIT {page_size} OFFSET {offset}"
                print(f"DEBUG: Paginated SQL: {paginated_sql}")
                result = self.clickhouse_client.execute(paginated_sql, with_column_types=True)
            else:
                # Add limit if not present (non-paginated query)
                if 'LIMIT' not in sanitized_sql.upper():
                    sanitized_sql = f"{sanitized_sql} LIMIT {limit}"
                
                # Execute the query
                result = self.clickhouse_client.execute(sanitized_sql, with_column_types=True)
            
            execution_time_ms = (time.time() - start_time) * 1000
            
            # Process results
            if result and len(result) > 0:
                columns = [col[0] for col in result[1]] if len(result) > 1 else []
                data = result[0] if result[0] else []
                
                # Format data for JSON serialization
                formatted_data = []
                for row in data:
                    formatted_row = []
                    for item in row:
                        if isinstance(item, (int, float, str, bool)) or item is None:
                            formatted_row.append(item)
                        else:
                            formatted_row.append(str(item))
                    formatted_data.append(formatted_row)
            else:
                columns = []
                formatted_data = []
            
            # Use total_rows from count query if paginated, otherwise use data length
            actual_total_rows = total_rows if (page_size is not None and page_limit is not None) else len(formatted_data)
            
            return QueryExecutionResult(
                query_id=query.id,
                query_name=query.name,
                columns=columns,
                data=formatted_data,
                total_rows=actual_total_rows,
                execution_time_ms=round(execution_time_ms, 2),
                success=True,
                message=f"Query executed successfully. Retrieved {len(formatted_data)} rows{f' of {actual_total_rows} total' if actual_total_rows > len(formatted_data) else ''}."
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

    async def execute_report(self, request: ReportExecutionRequest, username: str) -> ReportExecutionResponse:
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        """Execute a full report or specific query"""
        if not self.clickhouse_client:
            raise ValueError("ClickHouse client not available")

        # Get the report
        report = await self.get_report(request.report_id, username)
        if not report:
            raise ValueError("Report not found or access denied")

        start_time = time.time()
        results = []

        try:
            if request.query_id:
                # Execute specific query
                query = next((q for q in report.queries if q.id == request.query_id), None)
                if not query:
                    raise ValueError("Query not found in report")
                
                result = self.execute_query(query, request.filters, request.limit, request.page_size, request.page_limit)
                results.append(result)
            else:
                # Execute all queries
                for query in report.queries:
                    result = self.execute_query(query, request.filters, request.limit, request.page_size, request.page_limit)
                    results.append(result)

            total_execution_time = (time.time() - start_time) * 1000
            
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

    async def get_filter_options(self, report_id: int, query_id: int, filter_field: str, username: str) -> List[Dict[str, Any]]:
        user = await UserService.get_user_by_username(self.db, username)
        if not user:
            raise ValueError("User not found")

        """Get dropdown options for a filter by report, query, and field name"""
        if not self.clickhouse_client:
            raise ValueError("ClickHouse client not available")

        # Get the filter
        stmt = select(ReportQueryFilter).join(ReportQuery).join(Report).where(
            and_(
                Report.id == report_id,
                ReportQuery.id == query_id,
                ReportQueryFilter.field_name == filter_field,
                or_(Report.owner_id == user.id, Report.is_public == True)
            )
        )
        result = await self.db.execute(stmt)
        db_filter = result.scalar_one_or_none()
        
        if not db_filter or not db_filter.dropdown_query:
            return []

        try:
            # Execute the dropdown query
            sanitized_query = self.sanitize_sql_query(db_filter.dropdown_query)
            result = self.clickhouse_client.execute(sanitized_query)
            
            # Format as value/label pairs
            options = []
            for row in result:
                if len(row) >= 2:
                    options.append({"value": row[0], "label": row[1]})
                elif len(row) == 1:
                    options.append({"value": row[0], "label": str(row[0])})
            
            return options
            
        except Exception as e:
            raise ValueError(f"Failed to get filter options: {str(e)}")
