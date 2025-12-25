from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_postgres_db
from app.models.postgres_models import Platform
from app.schemas.config import Config, ConfigCreate, ConfigUpdate
from app.services.config_service import ConfigService
from app.services.platform_service import PlatformService

router = APIRouter()


async def get_platform_from_header(
    x_platform: str | None = Header(None),
    db: AsyncSession = Depends(get_postgres_db)
) -> Platform | None:
    """Get platform from header if provided"""
    if not x_platform:
        return None

    platform_service = PlatformService(db)
    platform = await platform_service.get_platform_by_code(x_platform)
    return platform


@router.get("/configs", response_model=list[Config])
async def get_all_configs(
    db: AsyncSession = Depends(get_postgres_db),
    platform: Platform | None = Depends(get_platform_from_header)
):
    """Get all configurations"""
    config_service = ConfigService(db)
    configs = await config_service.get_all_configs(platform)
    return configs


@router.get("/configs/{config_key}", response_model=Config)
async def get_config(
    config_key: str,
    db: AsyncSession = Depends(get_postgres_db),
    platform: Platform | None = Depends(get_platform_from_header)
):
    """Get a specific configuration by key"""
    config_service = ConfigService(db)
    config = await config_service.get_config(config_key, platform)

    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    return config


@router.post("/configs", response_model=Config)
async def create_config(
    config_data: ConfigCreate,
    db: AsyncSession = Depends(get_postgres_db),
    platform: Platform | None = Depends(get_platform_from_header)
):
    """Create a new configuration"""
    config_service = ConfigService(db)

    # Check if config already exists
    existing_config = await config_service.get_config(config_data.config_key, platform)
    if existing_config:
        raise HTTPException(status_code=400, detail="Configuration with this key already exists")

    config = await config_service.create_config(config_data, platform)
    return config


@router.put("/configs/{config_key}", response_model=Config)
async def update_config(
    config_key: str,
    config_data: ConfigUpdate,
    db: AsyncSession = Depends(get_postgres_db),
    platform: Platform | None = Depends(get_platform_from_header)
):
    """Update an existing configuration"""
    config_service = ConfigService(db)
    config = await config_service.update_config(config_key, config_data, platform)

    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")

    return config


class UpsertConfigRequest(BaseModel):
    config_value: dict[str, Any]
    description: str | None = None

@router.post("/configs/{config_key}/upsert", response_model=Config)
async def upsert_config(
    config_key: str,
    request: UpsertConfigRequest,
    db: AsyncSession = Depends(get_postgres_db),
    platform: Platform | None = Depends(get_platform_from_header)
):
    """Create or update a configuration"""
    config_service = ConfigService(db)
    config = await config_service.upsert_config(config_key, request.config_value, request.description, platform)
    return config


@router.delete("/configs/{config_key}")
async def delete_config(
    config_key: str,
    db: AsyncSession = Depends(get_postgres_db),
    platform: Platform | None = Depends(get_platform_from_header)
):
    """Delete a configuration"""
    config_service = ConfigService(db)
    success = await config_service.delete_config(config_key, platform)

    if not success:
        raise HTTPException(status_code=404, detail="Configuration not found")

    return {"message": "Configuration deleted successfully"}
