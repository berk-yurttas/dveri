import io
from typing import Any

from clickhouse_driver import Client
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.database import get_clickhouse_db
from app.core.platform_db import DatabaseConnectionFactory
from app.core.platform_middleware import get_optional_platform
from app.models.postgres_models import Platform
from app.schemas.data import WidgetQueryRequest
from app.services.data_service import DataService, WidgetFactory

router = APIRouter()

def get_db_client(
    platform: Platform | None = Depends(get_optional_platform),
    default_client: Client = Depends(get_clickhouse_db)
):
    """Get database client based on platform configuration or default ClickHouse"""
    if platform:
        try:
            # Get platform-specific database client
            db_type = platform.db_type.lower()
            if db_type == "clickhouse":
                return DatabaseConnectionFactory.get_clickhouse_client(platform)
            elif db_type == "mssql":
                return DatabaseConnectionFactory.get_mssql_connection(platform)
            elif db_type == "postgresql":
                return DatabaseConnectionFactory.get_postgresql_connection(platform)
            else:
                # Fallback to default if unsupported type
                return default_client
        except Exception as e:
            print(f"Error getting platform database client: {e}")
            return default_client
    return default_client


@router.post("/widget")
async def get_widget_data(
    request: WidgetQueryRequest,
    db_client = Depends(get_db_client)
):
    """Get widget data from platform-specific database or ClickHouse"""
    try:
        data = DataService.get_widget_data(
            db_client=db_client,
            widget_type=request.widget_type,
            filters=request.filters
        )

        # Check if data service returned an error response
        if data and data.get("error"):
            raise HTTPException(
                status_code=500,
                detail=data.get("message", "Unknown error occurred")
            )

        # If widget type is excel_export, return Excel file
        if request.widget_type == 'excel_export':
            excel_file_bytes = data.get("excel_file")
            filename = data.get("filename", "export.xlsx")
            content_type = data.get("content_type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

            if not excel_file_bytes:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to generate Excel file"
                )

            # Create streaming response for file download
            excel_io = io.BytesIO(excel_file_bytes)

            return StreamingResponse(
                excel_io,
                media_type=content_type,
                headers={
                    "Content-Disposition": f"attachment; filename={filename}",
                    "Content-Length": str(len(excel_file_bytes))
                }
            )

        # For other widget types, return JSON data
        return data

    except ValueError as ve:
        # Handle validation errors (like missing filters) with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/widget-types", response_model=dict[str, Any])
async def get_supported_widget_types():
    """Get list of supported widget types"""
    try:
        supported_types = WidgetFactory.get_supported_types()
        return {
            "supported_types": supported_types,
            "count": len(supported_types)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/infrastructure", response_model=list[dict[str, Any]])
async def get_infrastructure_list(db_client = Depends(get_db_client)):
    """Get list of available infrastructure/equipment for dropdown filters"""
    try:
        infrastructure_list = DataService.get_infrastructure_list(db_client)
        return infrastructure_list
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products", response_model=list[dict[str, Any]])
async def get_product_list(db_client = Depends(get_db_client)):
    """Get list of all products for dropdown filters"""
    try:
        product_list = DataService.get_product_list(db_client)
        return product_list
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{product_id}/serial-numbers", response_model=list[dict[str, Any]])
async def get_product_serial_numbers(
    product_id: int,
    firma: str = Query(None, description="Filter serial numbers by firma"),
    db_client = Depends(get_db_client)
):
    """Get serial numbers for a specific product, optionally filtered by firma"""
    try:
        serial_numbers = DataService.get_product_serial_numbers(db_client, product_id, firma)
        return serial_numbers
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{product_id}/test-names", response_model=list[dict[str, Any]])
async def get_product_test_names(
    product_id: int,
    db_client = Depends(get_db_client)
):
    """Get list of test names for a specific product"""
    try:
        test_names = DataService.get_product_test_names(db_client, product_id)
        return test_names
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/companies", response_model=list[dict[str, Any]])
async def get_distinct_companies(product_id: int, db_client = Depends(get_db_client)):
    """Get list of distinct companies for dropdown filters"""
    try:
        companies = DataService.get_distinct_companies(db_client, product_id)
        return companies
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{product_id}/test-names/{test_name}/test-statuses", response_model=list[dict[str, Any]])
async def get_test_statuses(
    product_id: int,
    test_name: str,
    db_client = Depends(get_db_client)
):
    """Get list of test statuses for a specific product and test name"""
    try:
        test_statuses = DataService.get_test_statuses(db_client, product_id, test_name)
        return test_statuses
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{product_id}/test-names/{test_name}/test-statuses/{test_status}/measurement-locations", response_model=list[dict[str, Any]])
async def get_measurement_locations(
    product_id: int,
    test_name: str,
    test_status: str,
    db_client = Depends(get_db_client)
):
    """Get list of measurement locations for a specific product, test name, and test status"""
    try:
        measurement_locations = DataService.get_measurement_locations(db_client, product_id, test_name, test_status)
        return measurement_locations
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def data_health_check(
    platform: Platform | None = Depends(get_optional_platform),
    db_client = Depends(get_db_client)
):
    """Check database connection health (platform-specific or default ClickHouse)"""
    try:
        db_type = platform.db_type.lower() if platform else "clickhouse"

        if db_type == "clickhouse":
            result = db_client.execute("SELECT 1 as health_check")
            return {
                "status": "healthy",
                "database_type": db_type,
                "platform": platform.code if platform else "default",
                "connected": True,
                "result": result
            }
        elif db_type == "mssql" or db_type == "postgresql":
            cursor = db_client.cursor()
            cursor.execute("SELECT 1 as health_check")
            result = cursor.fetchall()
            cursor.close()
            return {
                "status": "healthy",
                "database_type": db_type,
                "platform": platform.code if platform else "default",
                "connected": True,
                "result": result
            }
        else:
            return {
                "status": "unknown",
                "database_type": db_type,
                "platform": platform.code if platform else "default",
                "connected": False
            }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed: {e!s}"
        )
