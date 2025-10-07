from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from clickhouse_driver import Client
from sqlalchemy.ext.asyncio import AsyncSession
import time
import re

from app.core.database import get_clickhouse_db, get_postgres_db
from app.core.auth import check_authenticated
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
    db_client: Client = Depends(get_clickhouse_db)
):
    """
    Preview the results of a SQL query for report building
    """
    try:
        # Sanitize the SQL query
        sanitized_query = sanitize_sql_query(request.sql_query)

        # Add LIMIT to the query if not present
        if 'LIMIT' not in sanitized_query.upper():
            sanitized_query = f"{sanitized_query} LIMIT {request.limit}"

        # Record execution start time
        start_time = time.time()

        # Execute the query
        result = db_client.execute(sanitized_query, with_column_types=True)

        # Calculate execution time
        execution_time_ms = (time.time() - start_time) * 1000

        # Extract columns and data
        if result and len(result) > 0:
            # First row contains column info (name, type)
            columns = [col[0] for col in result[1]] if len(result) > 1 else []
            data = result[0] if result[0] else []

            # Convert data to list of lists for JSON serialization
            formatted_data = []
            for row in data:
                formatted_row = []
                for item in row:
                    # Handle different data types for JSON serialization
                    if isinstance(item, (int, float, str, bool)) or item is None:
                        formatted_row.append(item)
                    else:
                        formatted_row.append(str(item))
                formatted_data.append(formatted_row)
        else:
            columns = []
            formatted_data = []

        return ReportPreviewResponse(
            columns=columns,
            data=formatted_data,
            total_rows=len(formatted_data),
            execution_time_ms=round(execution_time_ms, 2),
            success=True,
            message=f"Query executed successfully. Retrieved {len(formatted_data)} rows."
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
    db_client: Client = Depends(get_clickhouse_db)
):
    """
    Validate SQL syntax without executing the query
    """
    try:
        # Sanitize the query
        sanitized_query = sanitize_sql_query(query)

        # Use EXPLAIN to validate syntax without executing
        explain_query = f"EXPLAIN {sanitized_query}"

        start_time = time.time()
        result = db_client.execute(explain_query)
        execution_time_ms = (time.time() - start_time) * 1000

        return SqlValidationResponse(
            success=True,
            message="Query syntax is valid",
            execution_time_ms=round(execution_time_ms, 2),
            explain_plan=result
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
    clickhouse_client: Client = Depends(get_clickhouse_db)
):
    """Create a new report"""
    service = ReportsService(db, clickhouse_client)
    try:
        return await service.create_report(report_data, current_user.username)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[ReportList])
async def get_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    my_reports_only: bool = Query(False),
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get reports list (owned + public, or only owned)"""
    service = ReportsService(db)
    reports = await service.get_reports_list(current_user.username, skip, limit, my_reports_only)
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
    report = await service.update_report(report_id, report_data, current_user.username)
    
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
    report = await service.update_report_full(report_id, report_data, current_user.username)
    
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
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db),
    clickhouse_client: Client = Depends(get_clickhouse_db)
):
    """Get dropdown options for a specific filter"""
    service = ReportsService(db, clickhouse_client)
    try:
        options = await service.get_filter_options(report_id, query_id, filter_field, current_user.username)
        return {"options": options}
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