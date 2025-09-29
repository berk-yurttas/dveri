from typing import List
from app.core.auth import check_authenticated
from app.schemas.user import User
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_postgres_db
from app.services.dashboard_service import DashboardService
from app.schemas.dashboard import (
    Dashboard,
    DashboardCreate,
    DashboardUpdate,
    DashboardList
)

router = APIRouter()

@router.post("/", response_model=Dashboard, status_code=status.HTTP_201_CREATED)
async def create_dashboard(
    dashboard_data: DashboardCreate,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Create a new dashboard"""
    dashboard = await DashboardService.create_dashboard(
        db=db,
        dashboard_data=dashboard_data,
        username=current_user.username
    )
    return dashboard

@router.get("/", response_model=List[DashboardList])
async def get_dashboards(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    dashboards = await DashboardService.get_dashboards(
        db=db,
        username=current_user.username,
        skip=skip,
        limit=limit
    )
    return dashboards

@router.get("/public", response_model=List[DashboardList])
async def get_public_dashboards(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """Get all public dashboards"""
    dashboards = await DashboardService.get_public_dashboards(
        db=db,
        username=current_user.username,
        skip=skip,
        limit=limit
    )
    return dashboards

@router.get("/favorite", response_model=List[DashboardList])
async def get_favorite_dashboards(
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """Get all favorite dashboards"""
    dashboards = await DashboardService.get_favorite_dashboards(db=db, username=current_user.username)
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
