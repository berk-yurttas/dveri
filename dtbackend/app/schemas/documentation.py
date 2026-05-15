"""
Documentation schemas for API requests and responses
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DocumentationBase(BaseModel):
    """Base schema for documentation"""
    title: str = Field(..., description="Title of the documentation")
    description: Optional[str] = Field(None, description="Description of the documentation")
    platform_id: Optional[int] = Field(None, description="Associated platform ID")
    file_url: str = Field(..., description="PocketBase file URL")
    file_type: str = Field(..., description="File type (video, document, image)")
    file_name: str = Field(..., description="Original file name")
    file_size: Optional[int] = Field(None, description="File size in bytes")
    category: Optional[str] = Field(None, description="Documentation category")
    tags: list[str] = Field(default_factory=list, description="Tags for categorization")
    is_active: bool = Field(True, description="Whether documentation is active")
    order_index: int = Field(0, description="Display order")


class DocumentationCreate(DocumentationBase):
    """Schema for creating documentation"""
    uploaded_by: str = Field(..., description="Username of uploader")


class DocumentationUpdate(BaseModel):
    """Schema for updating documentation"""
    title: Optional[str] = None
    description: Optional[str] = None
    platform_id: Optional[int] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None
    is_active: Optional[bool] = None
    order_index: Optional[int] = None


class Documentation(DocumentationBase):
    """Schema for documentation response"""
    id: int
    uploaded_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    view_count: int = 0
    download_count: int = 0

    class Config:
        from_attributes = True


class DocumentationList(BaseModel):
    """Schema for paginated documentation list"""
    items: list[Documentation]
    total: int
    page: int
    page_size: int
    total_pages: int


class DocumentationStats(BaseModel):
    """Schema for documentation statistics"""
    total_documents: int
    total_videos: int
    total_images: int
    total_documents_count: int
    total_views: int
    total_downloads: int
    documents_by_platform: dict[str, int]
    documents_by_category: dict[str, int]
    recent_uploads: list[Documentation]


class DocumentationUploadRequest(BaseModel):
    """Schema for uploading documentation to PocketBase"""
    title: str
    description: Optional[str] = None
    platform_id: Optional[int] = None
    category: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    order_index: int = 0


class DocumentationUploadResponse(BaseModel):
    """Schema for upload response"""
    documentation_id: int
    file_url: str
    message: str
