"""
Platform API Endpoints

CRUD operations for managing platforms in the multi-tenant system.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_postgres_db
from app.models.postgres_models import Platform, User
from app.schemas.platform import (
    Platform as PlatformSchema,
    PlatformList,
    PlatformCreate,
    PlatformUpdate,
    PlatformStats,
    PlatformWithStats,
    PlatformConnectionTest
)
from app.services.platform_service import PlatformService
from app.core.auth import check_authenticated

router = APIRouter()


@router.get("/", response_model=List[PlatformList])
async def get_platforms(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records to return"),
    include_inactive: bool = Query(False, description="Include inactive platforms"),
    search: Optional[str] = Query(None, description="Search platforms by code or name"),
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get list of platforms
    
    - **skip**: Number of records to skip (pagination)
    - **limit**: Maximum number of records to return
    - **include_inactive**: Whether to include inactive platforms
    - **search**: Search term for filtering by code or name
    """
    platforms = await PlatformService.get_platforms(
        db=db,
        skip=skip,
        limit=limit,
        include_inactive=include_inactive,
        search=search
    )
    return platforms


@router.get("/count")
async def get_platform_count(
    include_inactive: bool = Query(False, description="Include inactive platforms"),
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get total count of platforms
    """
    if include_inactive:
        # Count all platforms
        platforms = await PlatformService.get_platforms(
            db=db,
            skip=0,
            limit=10000,  # High limit to get all
            include_inactive=True
        )
        count = len(platforms)
    else:
        # Count only active platforms
        count = await PlatformService.get_active_platform_count(db)
    
    return {"total": count, "active_only": not include_inactive}


@router.get("/{platform_id}", response_model=PlatformSchema)
async def get_platform(
    platform_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get platform by ID
    
    - **platform_id**: Platform ID
    """
    platform = await PlatformService.get_platform_by_id(db, platform_id)
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    return platform


@router.get("/code/{platform_code}", response_model=PlatformSchema)
async def get_platform_by_code(
    platform_code: str,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get platform by code
    
    - **platform_code**: Platform code (e.g., 'deriniz', 'app2')
    """
    platform = await PlatformService.get_platform_by_code(db, platform_code)
    if not platform:
        raise HTTPException(
            status_code=404,
            detail=f"Platform with code '{platform_code}' not found"
        )
    return platform


@router.get("/{platform_id}/stats", response_model=PlatformStats)
async def get_platform_statistics(
    platform_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get platform statistics (dashboard count, report count, user count)
    
    - **platform_id**: Platform ID
    """
    stats = await PlatformService.get_platform_stats(db, platform_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Platform not found")
    return stats


@router.get("/{platform_id}/with-stats", response_model=PlatformWithStats)
async def get_platform_with_stats(
    platform_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Get platform with statistics
    
    - **platform_id**: Platform ID
    """
    platform = await PlatformService.get_platform_by_id(db, platform_id)
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    
    stats = await PlatformService.get_platform_stats(db, platform_id)
    
    # Combine platform data with stats
    platform_dict = {
        "id": platform.id,
        "code": platform.code,
        "name": platform.name,
        "display_name": platform.display_name,
        "description": platform.description,
        "db_type": platform.db_type,
        "db_config": platform.db_config,
        "logo_url": platform.logo_url,
        "theme_config": platform.theme_config,
        "is_active": platform.is_active,
        "created_at": platform.created_at,
        "updated_at": platform.updated_at,
        "dashboard_count": stats.dashboard_count if stats else 0,
        "report_count": stats.report_count if stats else 0,
        "user_count": stats.user_count if stats else 0
    }
    
    return platform_dict


@router.post("/", response_model=PlatformSchema, status_code=201)
async def create_platform(
    platform_data: PlatformCreate,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Create a new platform
    
    Required fields:
    - **code**: Unique platform code (alphanumeric, lowercase)
    - **name**: Platform name
    - **display_name**: Display name for UI
    - **db_type**: Database type (clickhouse, mssql, postgresql)
    
    Optional fields:
    - **description**: Platform description
    - **db_config**: Database connection configuration
    - **logo_url**: URL to platform logo
    - **theme_config**: Theme configuration (colors, etc.)
    - **is_active**: Whether platform is active (default: True)
    """
    platform = await PlatformService.create_platform(db, platform_data)
    return platform


@router.put("/{platform_id}", response_model=PlatformSchema)
async def update_platform(
    platform_id: int,
    platform_data: PlatformUpdate,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Update platform
    
    - **platform_id**: Platform ID
    
    All fields are optional. Only provided fields will be updated.
    """
    platform = await PlatformService.update_platform(db, platform_id, platform_data)
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    return platform


@router.patch("/{platform_id}/activate", response_model=PlatformSchema)
async def activate_platform(
    platform_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Activate platform (set is_active = True)
    
    - **platform_id**: Platform ID
    """
    platform_data = PlatformUpdate(is_active=True)
    platform = await PlatformService.update_platform(db, platform_id, platform_data)
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    return platform


@router.patch("/{platform_id}/deactivate", response_model=PlatformSchema)
async def deactivate_platform(
    platform_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Deactivate platform (set is_active = False)
    
    - **platform_id**: Platform ID
    """
    platform_data = PlatformUpdate(is_active=False)
    platform = await PlatformService.update_platform(db, platform_id, platform_data)
    if not platform:
        raise HTTPException(status_code=404, detail="Platform not found")
    return platform


@router.delete("/{platform_id}")
async def delete_platform(
    platform_id: int,
    hard_delete: bool = Query(
        False,
        description="If True, permanently delete. If False, deactivate (soft delete)"
    ),
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Delete platform
    
    - **platform_id**: Platform ID
    - **hard_delete**: If True, permanently delete from database. 
                      If False (default), soft delete by setting is_active=False
    
    Note: Hard delete will fail if platform has associated dashboards or reports.
          Use soft delete for platforms with existing data.
    """
    success = await PlatformService.delete_platform(
        db,
        platform_id,
        soft_delete=not hard_delete
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Platform not found")
    
    delete_type = "permanently deleted" if hard_delete else "deactivated"
    return {
        "success": True,
        "message": f"Platform {delete_type} successfully",
        "platform_id": platform_id,
        "hard_delete": hard_delete
    }


@router.post("/{platform_id}/test-connection", response_model=PlatformConnectionTest)
async def test_platform_connection(
    platform_id: int,
    db: AsyncSession = Depends(get_postgres_db),
    current_user: User = Depends(check_authenticated)
):
    """
    Test platform database connection
    
    - **platform_id**: Platform ID
    
    Tests connectivity to the configured database and returns connection status.
    """
    result = await PlatformService.test_platform_connection(db, platform_id)
    return result

