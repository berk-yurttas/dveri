from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

# Widget schema (for JSONB field)
class Widget(BaseModel):
    id: Optional[str] = None  # Client-generated ID for widget identification
    title: str
    widget_type: str
    position_x: int = 0
    position_y: int = 0
    width: int = 1
    height: int = 1
    config: Optional[Dict[str, Any]] = None
    data_source_query: Optional[str] = None

# Base schemas
class DashboardBase(BaseModel):
    title: str
    tags: Optional[List[str]] = []
    is_public: bool = False
    layout_config: Optional[Dict[str, Any]] = None
    widgets: Optional[List[Widget]] = []

class DashboardCreate(DashboardBase):
    username: str
    owner_id: int

class DashboardUpdate(BaseModel):
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    layout_config: Optional[Dict[str, Any]] = None
    widgets: Optional[List[Widget]] = None

class Dashboard(DashboardBase):
    id: int
    owner_id: int
    owner_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_favorite: Optional[bool] = False

    class Config:
        from_attributes = True

class DashboardList(BaseModel):
    id: int
    title: str
    tags: Optional[List[str]] = []
    is_public: bool
    owner_id: int
    owner_name: Optional[str] = None
    layout_config: Optional[Dict[str, Any]] = None
    widgets: Optional[List[Dict[str, Any]]] = []  # Using Dict instead of Widget to avoid circular imports
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_favorite: Optional[bool] = False

    class Config:
        from_attributes = True
