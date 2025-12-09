
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import check_authenticated
from app.core.database import get_postgres_db
from app.core.platform_middleware import get_optional_platform
from app.models.postgres_models import Platform
from app.schemas.dashboard import (
    Dashboard,
    DashboardCreate,
    DashboardList,
    DashboardUpdate,
)
from app.schemas.user import User
from app.services.dashboard_service import DashboardService

router = APIRouter()

@router.post("/", response_model=Dashboard, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    dashboard_data: DashboardCreate,
    current_user: User = Depends(check_authenticated),
    platform: Platform | None = Depends(get_optional_platform),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Create a new dashboard"""
    dashboard = await DashboardService.create_dashboard(
        db=db,
        dashboard_data=dashboard_data,
        username=current_user.username,
        platform=platform
    )
    return dashboard

@router.get("/", response_model=list[DashboardList])
async def get_dashboards(
    skip: int = 0,
    limit: int = 100,
    subplatform: str | None = None,
    platform: Platform | None = Depends(get_optional_platform),
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get dashboards - optionally filtered by platform and subplatform"""
    dashboards = await DashboardService.get_dashboards(
        db=db,
        username=current_user.username,
        skip=skip,
        limit=limit,
        platform=platform,
        subplatform=subplatform
    )
    return dashboards

@router.post("/favorite", response_model=dict)
async def add_to_favorite_dashboard(
    dashboard_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """Add a dashboard to favorites"""
    dashboard_added = await DashboardService.add_favorite_dashboard(db=db, dashboard_id=dashboard_id, username=current_user.username)
    return {"message": "Dashboard added to favorites"}

@router.delete("/favorite", response_model=dict)
async def remove_from_favorite_dashboard(
    dashboard_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """Remove a dashboard from favorites"""
    dashboard_removed = await DashboardService.remove_from_favorite_dashboard(db=db, dashboard_id=dashboard_id, username=current_user.username)
    return {"message": "Dashboard removed from favorites"}

@router.get("/{dashboard_id}", response_model=Dashboard)
async def get_dashboard(
    dashboard_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """Get a specific dashboard by ID"""
    dashboard = await DashboardService.get_dashboard_by_id(
        db=db,
        dashboard_id=dashboard_id,
        username=current_user.username
    )

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )

    return dashboard

@router.put("/{dashboard_id}", response_model=Dashboard)
async def update_dashboard(
    dashboard_id: int,
    dashboard_update: DashboardUpdate,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """Update a dashboard"""
    dashboard = await DashboardService.update_dashboard(
        db=db,
        dashboard_id=dashboard_id,
        dashboard_update=dashboard_update,
        username=current_user.username
    )

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )

    return dashboard

@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard(
    dashboard_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """Delete a dashboard"""
    success = await DashboardService.delete_dashboard(
        db=db,
        dashboard_id=dashboard_id,
        username=current_user.username
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found"
        )

    # 204 No Content - don't return any body
