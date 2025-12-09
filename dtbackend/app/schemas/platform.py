from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, validator


class PlatformBase(BaseModel):
    """Base platform schema with common fields"""
    code: str = Field(..., min_length=1, max_length=50, description="Unique platform code (e.g., 'deriniz', 'app2')")
    name: str = Field(..., min_length=1, max_length=255, description="Platform name")
    display_name: str = Field(..., min_length=1, max_length=255, description="Display name for UI")
    description: str | None = Field(None, description="Platform description")

    # Database configuration
    db_type: str = Field(default="clickhouse", description="Database type: clickhouse, mssql, postgresql")
    db_config: dict[str, Any] | None = Field(None, description="Database connection configuration")

    # Branding
    logo_url: str | None = Field(None, max_length=255, description="URL to platform logo")
    theme_config: dict[str, Any] | None = Field(None, description="Theme configuration (colors, etc.)")

    # Status
    is_active: bool = Field(default=True, description="Whether platform is active")

    @validator('code')
    def validate_code(cls, v):
        """Validate platform code format"""
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('Platform code must be alphanumeric (with - or _ allowed)')
        return v.lower()  # Always lowercase

    @validator('db_type')
    def validate_db_type(cls, v):
        """Validate database type"""
        allowed_types = ['clickhouse', 'mssql', 'postgresql']
        if v.lower() not in allowed_types:
            raise ValueError(f'Database type must be one of: {", ".join(allowed_types)}')
        return v.lower()


class PlatformCreate(PlatformBase):
    """Schema for creating a new platform"""
    pass


class PlatformUpdate(BaseModel):
    """Schema for updating a platform (all fields optional)"""
    name: str | None = Field(None, min_length=1, max_length=255)
    display_name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    db_type: str | None = None
    db_config: dict[str, Any] | None = None
    logo_url: str | None = Field(None, max_length=255)
    theme_config: dict[str, Any] | None = None
    is_active: bool | None = None

    @validator('db_type')
    def validate_db_type(cls, v):
        """Validate database type"""
        if v is not None:
            allowed_types = ['clickhouse', 'mssql', 'postgresql']
            if v.lower() not in allowed_types:
                raise ValueError(f'Database type must be one of: {", ".join(allowed_types)}')
            return v.lower()
        return v


class Platform(PlatformBase):
    """Full platform schema with all fields"""
    id: int
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class PlatformList(BaseModel):
    """Lightweight platform schema for listing"""
    id: int
    code: str
    name: str
    display_name: str
    description: str | None = None
    db_type: str
    logo_url: str | None = None
    theme_config: dict[str, Any] | None = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PlatformStats(BaseModel):
    """Platform statistics"""
    platform_id: int
    platform_code: str
    platform_name: str
    dashboard_count: int = 0
    report_count: int = 0
    user_count: int = 0


class PlatformConnectionTest(BaseModel):
    """Schema for testing platform database connection"""
    success: bool
    message: str
    connection_time_ms: float | None = None
    error: str | None = None


class PlatformWithStats(Platform):
    """Platform with statistics"""
    dashboard_count: int = 0
    report_count: int = 0
    user_count: int = 0

