from pydantic import BaseModel, Field
from typing import Optional


class FeedbackCreate(BaseModel):
    """Schema for creating feedback"""
    subject: str = Field(..., description="Sorun başlığı", min_length=1, max_length=255)
    description: str = Field(..., description="Sorun detayı", min_length=1)


class FeedbackResponse(BaseModel):
    """Schema for feedback response"""
    success: bool
    message: str
    work_package_id: Optional[int] = None

