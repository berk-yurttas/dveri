from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from clickhouse_driver import Client
import io

from app.core.database import get_clickhouse_db
from app.services.data_service import DataService, WidgetFactory
from app.schemas.data import (
    WidgetQueryRequest
)

router = APIRouter()

@router.post("/widget")
async def get_widget_data(
    request: WidgetQueryRequest,
    db_client: Client = Depends(get_clickhouse_db)
):
    """Get widget data from ClickHouse or Excel file for excel_export widget type"""
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


@router.get("/widget-types", response_model=Dict[str, Any])
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


@router.get("/infrastructure", response_model=List[Dict[str, Any]])
async def get_infrastructure_list(db_client: Client = Depends(get_clickhouse_db)):
    """Get list of available infrastructure/equipment for dropdown filters"""
    try:
        infrastructure_list = DataService.get_infrastructure_list(db_client)
        return infrastructure_list
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products", response_model=List[Dict[str, Any]])
async def get_product_list(db_client: Client = Depends(get_clickhouse_db)):
    """Get list of all products for dropdown filters"""
    try:
        product_list = DataService.get_product_list(db_client)
        return product_list
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{product_id}/serial-numbers", response_model=List[Dict[str, Any]])
async def get_product_serial_numbers(
    product_id: int,
    db_client: Client = Depends(get_clickhouse_db)
):
    """Get serial numbers for a specific product"""
    try:
        serial_numbers = DataService.get_product_serial_numbers(db_client, product_id)
        return serial_numbers
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{product_id}/test-names", response_model=List[Dict[str, Any]])
async def get_product_test_names(
    product_id: int,
    db_client: Client = Depends(get_clickhouse_db)
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


@router.get("/companies", response_model=List[Dict[str, Any]])
async def get_distinct_companies(product_id: int, db_client: Client = Depends(get_clickhouse_db)):
    """Get list of distinct companies for dropdown filters"""
    try:
        companies = DataService.get_distinct_companies(db_client, product_id)
        return companies
    except ValueError as ve:
        # Handle validation errors with 400 Bad Request
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{product_id}/test-names/{test_name}/test-statuses", response_model=List[Dict[str, Any]])
async def get_test_statuses(
    product_id: int,
    test_name: str,
    db_client: Client = Depends(get_clickhouse_db)
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


@router.get("/products/{product_id}/test-names/{test_name}/test-statuses/{test_status}/measurement-locations", response_model=List[Dict[str, Any]])
async def get_measurement_locations(
    product_id: int,
    test_name: str,
    test_status: str,
    db_client: Client = Depends(get_clickhouse_db)
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
async def data_health_check(db_client: Client = Depends(get_clickhouse_db)):
    """Check ClickHouse connection health"""
    try:
        result = db_client.execute("SELECT 1 as health_check")
        return {"status": "healthy", "clickhouse": "connected", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ClickHouse connection failed: {str(e)}")
