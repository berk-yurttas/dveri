from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime


class AnnouncementBase(BaseModel):
    """Base announcement schema with common fields"""
    title: str = Field(..., description="Announcement title")
    month_title: Optional[str] = Field(None, description="Month label (e.g., 'Kasım', 'Aralık')")
    content_summary: Optional[str] = Field(None, description="Short summary of the announcement")
    content_detail: Optional[str] = Field(None, description="Detailed content of the announcement")
    content_image: Optional[str] = Field(None, description="Image data (base64 or URL)")
    creation_date: Optional[datetime] = Field(None, description="Date when announcement becomes visible")
    expire_date: Optional[datetime] = Field(None, description="Date when announcement should be hidden")
    platform_id: Optional[int] = Field(None, description="Platform ID (null for general announcements)")


class AnnouncementCreate(AnnouncementBase):
    """Schema for creating a new announcement"""
    pass


class AnnouncementUpdate(BaseModel):
    """Schema for updating an announcement (all fields optional)"""
    title: Optional[str] = None
    month_title: Optional[str] = None
    content_summary: Optional[str] = None
    content_detail: Optional[str] = None
    content_image: Optional[str] = None
    creation_date: Optional[datetime] = None
    expire_date: Optional[datetime] = None
    platform_id: Optional[int] = None


class Announcement(AnnouncementBase):
    """Full announcement schema with all fields"""
    id: int
    
    class Config:
        from_attributes = True


class AnnouncementList(BaseModel):
    """Lightweight announcement schema for listing"""
    id: int
    title: str
    month_title: Optional[str] = None
    content_summary: Optional[str] = None
    creation_date: datetime
    expire_date: Optional[datetime] = None
    platform_id: Optional[int] = None
    
    class Config:
        from_attributes = True


class AnnouncementWithPlatform(Announcement):
    """Announcement with platform information"""
    platform_code: Optional[str] = None
    platform_name: Optional[str] = None

