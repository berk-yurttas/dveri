from typing import List, Dict, Any, Optional
from app.core.platform_middleware import get_current_platform, get_optional_platform
from app.models.postgres_models import Platform
from fastapi import APIRouter, Depends, HTTPException, Query
from clickhouse_driver import Client
from sqlalchemy.ext.asyncio import AsyncSession
import time
import re

from app.core.database import get_clickhouse_db, get_postgres_db
from app.core.auth import check_authenticated
from app.core.platform_db import DatabaseConnectionFactory
from app.schemas.data import ReportPreviewRequest, ReportPreviewResponse
from app.schemas.reports import (
    Report, ReportCreate, ReportUpdate, ReportFullUpdate, ReportList,
    ReportExecutionRequest, ReportExecutionResponse,
    SqlValidationRequest, SqlValidationResponse,
    SampleQueriesResponse
)
from app.schemas.user import User
from app.services.reports_service import ReportsService

router = APIRouter()

def sanitize_sql_query(query: str) -> str:
    """
    Basic SQL injection protection and query sanitization
    """
    # Remove dangerous SQL commands
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

@router.post("/preview", response_model=ReportPreviewResponse)
async def preview_report_query(
    request: ReportPreviewRequest,
    platform: Optional[Platform] = Depends(get_optional_platform),
    db_client: Client = Depends(get_clickhouse_db)
):
    """
    Preview the results of a SQL query for report building.
    Supports multiple database types based on platform configuration.
    """
    try:
        # Sanitize the SQL query
        sanitized_query = sanitize_sql_query(request.sql_query)
        
        # Determine database type
        db_type = platform.db_type.lower() if platform else "clickhouse"
        print(sanitized_query)
        # Add LIMIT to the query if not present (database-specific)
        if db_type == "mssql":
            # MSSQL uses TOP instead of LIMIT
            if 'TOP' not in sanitized_query.upper() and 'LIMIT' not in sanitized_query.upper():
                sanitized_query = sanitized_query.replace("SELECT", f"SELECT TOP {request.limit}", 1)
        else:
            # ClickHouse and PostgreSQL use LIMIT
            if 'LIMIT' not in sanitized_query.upper():
                if request.limit:
                    sanitized_query = f"{sanitized_query} LIMIT {request.limit}"
                else:
                    sanitized_query = f"{sanitized_query}"


        # Record execution start time
        start_time = time.time()

        # Execute the query based on database type
        if db_type == "clickhouse":
            # Use ClickHouse client (existing logic)
            result = db_client.execute(sanitized_query, with_column_types=True)
            
            # Extract columns and data for ClickHouse
            if result and len(result) > 0:
                columns = [col[0] for col in result[1]] if len(result) > 1 else []
                data = result[0] if result[0] else []
            else:
                columns = []
                data = []
                
        elif db_type == "postgresql":
            # Use PostgreSQL connection (without RealDictCursor for raw data)
            if not platform:
                raise ValueError("Platform required for PostgreSQL queries")
            
            import psycopg2
            db_config = platform.db_config or {}
            
            # Create connection without RealDictCursor to get raw tuples
            conn = psycopg2.connect(
                host=db_config.get("host", "localhost"),
                port=int(db_config.get("port", 5432)),
                database=db_config.get("database"),
                user=db_config.get("user"),
                password=db_config.get("password")
            )
            cursor = conn.cursor()

            try:
                cursor.execute(sanitized_query)
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                data = cursor.fetchall()
            finally:
                cursor.close()
                conn.close()
                
        elif db_type == "mssql":
            # Use MSSQL connection
            if not platform:
                raise ValueError("Platform required for MSSQL queries")
            
            import pyodbc
            conn = DatabaseConnectionFactory.get_mssql_connection(platform)
            cursor = conn.cursor()
            
            try:
                cursor.execute(sanitized_query)
                columns = [column[0] for column in cursor.description] if cursor.description else []
                data = cursor.fetchall()
            finally:
                cursor.close()
                conn.close()
        else:
            raise ValueError(f"Unsupported database type: {db_type}")

        # Calculate execution time
        execution_time_ms = (time.time() - start_time) * 1000

        # Convert data to list of lists for JSON serialization (common for all database types)
        formatted_data = []
        for row in data:
            formatted_row = []
            for item in row:
                # Handle different data types for JSON serialization
                if isinstance(item, (int, float, str, bool)) or item is None:
                    formatted_row.append(item)
                else:
                    # Handle datetime, date, and other types
                    formatted_row.append(str(item))
            formatted_data.append(formatted_row)

        return ReportPreviewResponse(
            columns=columns,
            data=formatted_data,
            total_rows=len(formatted_data),
            execution_time_ms=round(execution_time_ms, 2),
            success=True,
            message=f"Query executed successfully on {db_type.upper()}. Retrieved {len(formatted_data)} rows."
        )

    except ValueError as ve:
        # Handle validation/security errors
        return ReportPreviewResponse(
            columns=[],
            data=[],
            total_rows=0,
            execution_time_ms=0,
            success=False,
            message=str(ve)
        )
    except Exception as e:
        # Handle database or other errors
        error_msg = str(e)
        if "Code:" in error_msg:
            # Extract ClickHouse error message
            error_msg = error_msg.split("Code:")[1].strip()

        return ReportPreviewResponse(
            columns=[],
            data=[],
            total_rows=0,
            execution_time_ms=0,
            success=False,
            message=f"Query execution failed: {error_msg}"
        )

@router.get("/validate-syntax", response_model=SqlValidationResponse)
async def validate_sql_syntax(
    query: str = Query(..., description="SQL query to validate"),
    platform: Optional[Platform] = Depends(get_optional_platform),
    db_client: Client = Depends(get_clickhouse_db)
):
    """
    Validate SQL syntax without executing the query.
    Supports multiple database types based on platform configuration.
    """
    try:
        # Sanitize the query
        sanitized_query = sanitize_sql_query(query)
        
        # Determine database type
        db_type = platform.db_type.lower() if platform else "clickhouse"

        # Use EXPLAIN to validate syntax without executing
        explain_query = f"EXPLAIN {sanitized_query}"

        start_time = time.time()
        
        # Execute EXPLAIN based on database type
        if db_type == "clickhouse":
            result = db_client.execute(explain_query)
            explain_plan = result
            
        elif db_type == "postgresql":
            if not platform:
                raise ValueError("Platform required for PostgreSQL queries")
            
            import psycopg2
            db_config = platform.db_config or {}
            
            # Create connection without RealDictCursor to get raw tuples
            conn = psycopg2.connect(
                host=db_config.get("host", "localhost"),
                port=int(db_config.get("port", 5432)),
                database=db_config.get("database"),
                user=db_config.get("user"),
                password=db_config.get("password")
            )
            cursor = conn.cursor()
            
            try:
                cursor.execute(explain_query)
                explain_plan = [list(row) for row in cursor.fetchall()]
            finally:
                cursor.close()
                conn.close()
                
        elif db_type == "mssql":
            # MSSQL doesn't support EXPLAIN in the same way
            # We can use SET SHOWPLAN_TEXT ON
            if not platform:
                raise ValueError("Platform required for MSSQL queries")
            
            import pyodbc
            conn = DatabaseConnectionFactory.get_mssql_connection(platform)
            cursor = conn.cursor()
            
            try:
                # MSSQL uses SET SHOWPLAN_TEXT ON for query plans
                cursor.execute("SET SHOWPLAN_TEXT ON")
                cursor.execute(sanitized_query)
                explain_plan = [list(row) for row in cursor.fetchall()]
                cursor.execute("SET SHOWPLAN_TEXT OFF")
            finally:
                cursor.close()
                conn.close()
        else:
            raise ValueError(f"Unsupported database type: {db_type}")
        
        execution_time_ms = (time.time() - start_time) * 1000

        return SqlValidationResponse(
            success=True,
            message=f"Query syntax is valid for {db_type.upper()}",
            execution_time_ms=round(execution_time_ms, 2),
            explain_plan=explain_plan
        )

    except ValueError as ve:
        return SqlValidationResponse(
            success=False,
            message=str(ve),
            execution_time_ms=0
        )
    except Exception as e:
        error_msg = str(e)
        if "Code:" in error_msg:
            error_msg = error_msg.split("Code:")[1].strip()

        return SqlValidationResponse(
            success=False,
            message=f"Syntax validation failed: {error_msg}",
            execution_time_ms=0
        )

@router.get("/sample-queries", response_model=SampleQueriesResponse)
async def get_sample_queries():
    """
    Get sample SQL queries for users to start with
    """
    return SampleQueriesResponse(
        samples=[
            {
                "name": "Basic Test Results",
                "description": "Get basic test results with product information",
                "query": """SELECT
    tu.StokNo as product_code,
    teu.SeriNo as serial_number,
    t.TestAdi as test_name,
    t.TestGectiKaldi as test_result,
    t.TestBaslangicTarihi as test_date
FROM REHIS_TestKayit_Test_TabloTest t
LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g ON g.TestGrupID = t.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = g.TEUID
LEFT JOIN REHIS_TestTanim_Test_TabloUrun tu ON tu.UrunID = teu.UrunID
WHERE t.TestBaslangicTarihi >= '2025-01-01'
LIMIT 100"""
            },
            {
                "name": "Test Statistics by Product",
                "description": "Get pass/fail statistics grouped by product",
                "query": """SELECT
    tu.StokNo as product_code,
    tu.Tanim as product_name,
    COUNT(*) as total_tests,
    SUM(CASE WHEN t.TestGectiKaldi IN ('GEÇTİ', 'PASS') THEN 1 ELSE 0 END) as passed_tests,
    SUM(CASE WHEN t.TestGectiKaldi IN ('KALDI', 'FAIL') THEN 1 ELSE 0 END) as failed_tests
FROM REHIS_TestKayit_Test_TabloTest t
LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g ON g.TestGrupID = t.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = g.TEUID
LEFT JOIN REHIS_TestTanim_Test_TabloUrun tu ON tu.UrunID = teu.UrunID
WHERE t.TestBaslangicTarihi >= '2025-01-01'
GROUP BY tu.StokNo, tu.Tanim
LIMIT 50"""
            },
            {
                "name": "Detailed Test Analysis",
                "description": "Comprehensive test analysis with measurements",
                "query": """SELECT
    p.TPAdimID,
    tu.StokNo,
    teu.SeriNo,
    t.TestAdi,
    p.TestDurum,
    p.OlcumYeri,
    ta.OlculenDeger,
    p.AltLimit,
    p.UstLimit,
    ta.TestAdimiGectiKaldi,
    p.VeriTipi,
    t.TestBaslangicTarihi
FROM REHIS_TestKayit_Test_TabloTest t
LEFT JOIN REHIS_TestKayit_Test_TabloTestAdimi ta ON ta.TestID = t.TestID
LEFT JOIN REHIS_TestTanim_Test_TabloTestPlan p ON p.TPAdimID = ta.TPAdimID
LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g ON g.TestGrupID = t.TestGrupID
LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = g.TEUID
LEFT JOIN REHIS_TestTanim_Test_TabloUrun tu ON tu.UrunID = teu.UrunID
WHERE t.TestBaslangicTarihi >= '2025-08-01'
LIMIT 100"""
            }
        ]
    )


# Report CRUD Endpoints
@router.post("/", response_model=Report)
async def create_report(
    report_data: ReportCreate,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db),
    platform: Optional[Platform] = Depends(get_current_platform),
    clickhouse_client: Client = Depends(get_clickhouse_db)
):
    """Create a new report"""
    service = ReportsService(db, clickhouse_client)
    try:
        return await service.create_report(report_data, current_user.username, platform)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[ReportList])
async def get_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    my_reports_only: bool = Query(False),
    subplatform: Optional[str] = None,
    platform: Optional[Platform] = Depends(get_current_platform),
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get reports list (owned + public, or only owned) - optionally filtered by subplatform"""
    service = ReportsService(db)
    reports = await service.get_reports_list(current_user.username, skip, limit, my_reports_only, platform, subplatform)
    return reports


@router.get("/{report_id}", response_model=Report)
async def get_report(
    report_id: int,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get a specific report"""
    service = ReportsService(db)
    report = await service.get_report(report_id, current_user.username)
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return report


@router.put("/{report_id}", response_model=Report)
async def update_report(
    report_id: int,
    report_data: ReportUpdate,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Update report metadata only"""
    service = ReportsService(db)
    is_admin = any((role or "").lower() == "miras:admin" for role in (current_user.role or []))
    report = await service.update_report(report_id, report_data, current_user.username, is_admin=is_admin)
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found or access denied")
    
    return report


@router.put("/{report_id}/full", response_model=Report)
async def update_report_full(
    report_id: int,
    report_data: ReportFullUpdate,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Update report with queries and filters"""
    service = ReportsService(db)
    is_admin = any((role or "").lower() == "miras:admin" for role in (current_user.role or []))
    report = await service.update_report_full(report_id, report_data, current_user.username, is_admin=is_admin)
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found or access denied")
    
    return report


@router.delete("/{report_id}")
async def delete_report(
    report_id: int,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Delete a report"""
    service = ReportsService(db)
    success = await service.delete_report(report_id, current_user.username)
    
    if not success:
        raise HTTPException(status_code=404, detail="Report not found or access denied")
    
    return {"message": "Report deleted successfully"}


# Filter Options Endpoint
@router.get("/{report_id}/queries/{query_id}/filters/{filter_field}/options")
async def get_filter_options(
    report_id: int,
    query_id: int,
    filter_field: str,
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db),
    clickhouse_client: Client = Depends(get_clickhouse_db)
):
    """Get dropdown options for a specific filter with pagination and search"""
    service = ReportsService(db, clickhouse_client)
    try:
        result = await service.get_filter_options(report_id, query_id, filter_field, current_user.username, page, page_size, search)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Report Execution Endpoints
@router.post("/execute", response_model=ReportExecutionResponse)
async def execute_report(
    request: ReportExecutionRequest,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db),
    clickhouse_client: Client = Depends(get_clickhouse_db)
):
    """Execute a report with optional filters"""
    service = ReportsService(db, clickhouse_client)
    try:
        return await service.execute_report(request, current_user.username)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))