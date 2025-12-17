from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, RootModel


# Config Schemas
class ConfigBase(BaseModel):
    config_key: str = Field(..., min_length=1, max_length=255, description="Configuration key identifier")
    config_value: dict[str, Any] = Field(..., description="Configuration value as JSON")
    description: str | None = Field(None, description="Description of this configuration")

    class Config:
        from_attributes = True


class ConfigCreate(ConfigBase):
    pass


class ConfigUpdate(BaseModel):
    config_value: dict[str, Any] | None = None
    description: str | None = None

    class Config:
        from_attributes = True


class Config(ConfigBase):
    id: int
    platform_id: int | None = None
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


# Specific Config Value Schemas for validation
class ColorGroupConfig(BaseModel):
    """Schema for color group configuration"""
    name: str = Field(..., description="Display name for the color group")
    description: str | None = Field(None, description="Description of what this color represents")

    class Config:
        from_attributes = True


# Pydantic v2 RootModel for color groups configuration
# Key is the hex color code, value is ColorGroupConfig
# Example: {"#FF6B6B": {"name": "Şirket", "description": "Company reports"}}
ColorGroupsConfigValue = RootModel[dict[str, ColorGroupConfig]]
