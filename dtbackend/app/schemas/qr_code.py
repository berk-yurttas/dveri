from datetime import datetime
from typing import Any, Dict
from pydantic import BaseModel


class QRCodeDataCreate(BaseModel):
    """Schema for creating a new QR code with compressed data - accepts any JSON structure"""
    data: Dict[str, Any]  # Flexible JSON structure for future changes


class QRCodeDataResponse(BaseModel):
    """Response with the short code to embed in QR"""
    code: str
    expires_at: datetime | None = None

    class Config:
        from_attributes = True


class QRCodeDataRetrieve(BaseModel):
    """Full QR code data retrieved by code - returns the original JSON structure"""
    data: Dict[str, Any]  # Returns the original JSON structure

