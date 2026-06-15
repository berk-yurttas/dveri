from datetime import date, datetime
from typing import Any, Dict

from pydantic import BaseModel, Field

from app.schemas.order_pair import OrderPair


class QRCodeDataCreate(BaseModel):
    """Schema for creating a new QR code with compressed data - accepts any JSON structure"""
    data: Dict[str, Any]


class QRCodeDataResponse(BaseModel):
    code: str
    expires_at: datetime | None = None

    class Config:
        from_attributes = True


class QRCodeDataRetrieve(BaseModel):
    """Full QR code data retrieved by code - returns the original JSON structure"""
    data: Dict[str, Any]


class QRCodeBatchCreate(BaseModel):
    """Schema for batch QR code generation from the work order form.

    `target_company` is the customer the QR is created FOR (storage tenant).
    The QR's printed "Gönderen Firma" (sender) is filled in server-side from
    the caller's department; clients must NOT send a `company_from` field.
    """
    model_config = {"extra": "forbid"}

    main_customer: str = Field(..., description="Ana Müşteri")
    sector: str = Field(..., description="Sektör")
    target_company: str = Field(..., description="Hedef Firma — QR'ın oluşturulduğu hedef şirket")
    teklif_number: str | None = Field(None, description="Teklif Numarası")
    pairs: list[OrderPair] = Field(..., min_length=1, description="(Sipariş No, Kalem No) çiftleri")
    part_number: str = Field(..., description="Parça Numarası")
    revision_number: str | None = Field(None, description="Revizyon Numarası")
    quantity: int = Field(..., gt=0, description="Toplam Sipariş Miktarı")
    package_quantity: int = Field(1, gt=0, description="Parti Sayısı")
    target_date: date = Field(..., description="Hedef Bitirme Tarihi")


class QRCodePackageInfo(BaseModel):
    code: str
    package_index: int
    quantity: int


class QRCodeBatchResponse(BaseModel):
    work_order_group_id: str
    total_packages: int
    total_quantity: int
    packages: list[QRCodePackageInfo]
    expires_at: datetime | None = None
