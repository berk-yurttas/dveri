from datetime import datetime
from typing import Any

from pydantic import BaseModel


# Widget schema (for JSONB field)
class Widget(BaseModel):
    id: str | None = None  # Client-generated ID for widget identification
    title: str
    widget_type: str
    position_x: int = 0
    position_y: int = 0
    width: int = 1
    height: int = 1
    config: dict[str, Any] | None = None
    data_source_query: str | None = None

# Base schemas
class DashboardBase(BaseModel):
    title: str
    tags: list[str] | None = []
    is_public: bool = False
    layout_config: dict[str, Any] | None = None
    widgets: list[Widget] | None = []

class DashboardCreate(DashboardBase):
    username: str
    owner_id: int

class DashboardUpdate(BaseModel):
    title: str | None = None
    tags: list[str] | None = None
    is_public: bool | None = None
    layout_config: dict[str, Any] | None = None
    widgets: list[Widget] | None = None

class Dashboard(DashboardBase):
    id: int
    owner_id: int
    owner_name: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    is_favorite: bool | None = False

    class Config:
        from_attributes = True

class DashboardList(BaseModel):
    id: int
    title: str
    tags: list[str] | None = []
    is_public: bool
    owner_id: int
    owner_name: str | None = None
    layout_config: dict[str, Any] | None = None
    widgets: list[dict[str, Any]] | None = []  # Using Dict instead of Widget to avoid circular imports
    created_at: datetime
    updated_at: datetime | None = None
    is_favorite: bool | None = False

    class Config:
        from_attributes = True
