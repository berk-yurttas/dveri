from datetime import datetime

from pydantic import BaseModel, Field


class AnnouncementBase(BaseModel):
    """Base announcement schema with common fields"""
    title: str = Field(..., description="Announcement title")
    month_title: str | None = Field(None, description="Month label (e.g., 'Kasım', 'Aralık')")
    content_summary: str | None = Field(None, description="Short summary of the announcement")
    content_detail: str | None = Field(None, description="Detailed content of the announcement")
    content_image: str | None = Field(None, description="Image data (base64 or URL)")
    creation_date: datetime | None = Field(None, description="Date when announcement becomes visible")
    expire_date: datetime | None = Field(None, description="Date when announcement should be hidden")
    platform_id: int | None = Field(None, description="Platform ID (null for general announcements)")


class AnnouncementCreate(AnnouncementBase):
    """Schema for creating a new announcement"""
    pass


class AnnouncementUpdate(BaseModel):
    """Schema for updating an announcement (all fields optional)"""
    title: str | None = None
    month_title: str | None = None
    content_summary: str | None = None
    content_detail: str | None = None
    content_image: str | None = None
    creation_date: datetime | None = None
    expire_date: datetime | None = None
    platform_id: int | None = None


class Announcement(AnnouncementBase):
    """Full announcement schema with all fields"""
    id: int

    class Config:
        from_attributes = True


class AnnouncementList(BaseModel):
    """Lightweight announcement schema for listing"""
    id: int
    title: str
    month_title: str | None = None
    content_summary: str | None = None
    creation_date: datetime
    expire_date: datetime | None = None
    platform_id: int | None = None

    class Config:
        from_attributes = True


class AnnouncementWithPlatform(Announcement):
    """Announcement with platform information"""
    platform_code: str | None = None
    platform_name: str | None = None

