from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query, HTTPException

from app.services.romiot_service import RomiotService
from app.models.postgres_models import User
from app.core.auth import check_authenticated

router = APIRouter()

@router.get("/dashboard-kpi")
async def get_dashboard_kpi(
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)"),
    current_user: User = Depends(check_authenticated)
) -> dict[str, Any]:
    """
    Get KPI stats for RomIOT dashboard.
    """
    try:
        stats = RomiotService.get_dashboard_stats(start_date, end_date)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
