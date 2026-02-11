from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class WorkOrderStatus(str, Enum):
    ENTRANCE = "Entrance"
    EXIT = "Exit"


class WorkOrderBase(BaseModel):
    station_id: int = Field(..., description="Station ID")
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    main_customer: str = Field(..., description="Ana Müşteri")
    sector: str = Field(..., description="Sektör")
    company_from: str = Field(..., description="Gönderen Firma")
    aselsan_order_number: str = Field(..., description="Sipariş Numarası")
    order_item_number: str = Field(..., description="Sipariş Kalem Numarası")
    quantity: int = Field(..., description="Bu paketin parça sayısı")
    total_quantity: int = Field(..., description="Toplam parça sayısı")
    package_index: int = Field(..., description="Paket sırası (1-based)")
    total_packages: int = Field(..., description="Toplam paket sayısı")
    target_date: date | None = Field(None, description="Hedef Bitiş Tarihi")


class WorkOrderCreate(WorkOrderBase):
    """Schema for creating a work order (one package at one station)"""
    pass


class WorkOrderUpdateExitDate(BaseModel):
    """Schema for updating exit_date for a specific package"""
    station_id: int = Field(..., description="Station ID")
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    package_index: int = Field(..., description="Paket sırası (1-based)")


class WorkOrder(WorkOrderBase):
    id: int
    entrance_date: datetime | None = None
    exit_date: datetime | None = None

    class Config:
        from_attributes = True


class WorkOrderCreateResponse(BaseModel):
    """Response when creating a work order package entry"""
    work_order: WorkOrder
    packages_scanned: int = Field(..., description="Bu gruptaki okunan paket sayısı")
    total_packages: int = Field(..., description="Toplam paket sayısı")
    all_scanned: bool = Field(..., description="Tüm paketler okundu mu")
    message: str = Field(..., description="Durum mesajı")


class WorkOrderExitResponse(BaseModel):
    """Response when updating exit date for a package"""
    work_order: WorkOrder
    packages_exited: int = Field(..., description="Bu gruptaki çıkışı yapılan paket sayısı")
    total_packages: int = Field(..., description="Toplam paket sayısı")
    all_exited: bool = Field(..., description="Tüm paketlerin çıkışı yapıldı mı")
    message: str = Field(..., description="Durum mesajı")


class WorkOrderList(BaseModel):
    """Schema for listing work orders"""
    id: int
    station_id: int
    user_id: int
    work_order_group_id: str
    main_customer: str
    sector: str
    company_from: str
    aselsan_order_number: str
    order_item_number: str
    quantity: int
    total_quantity: int
    package_index: int
    total_packages: int
    target_date: date | None = None
    entrance_date: datetime | None = None
    exit_date: datetime | None = None

    class Config:
        from_attributes = True


class WorkOrderDetail(BaseModel):
    """Schema for detailed work order information with user and station details"""
    id: int
    station_id: int
    station_name: str
    user_id: int
    user_name: str | None = None
    work_order_group_id: str
    main_customer: str
    sector: str
    company_from: str
    aselsan_order_number: str
    order_item_number: str
    quantity: int
    total_quantity: int
    package_index: int
    total_packages: int
    target_date: date | None = None
    entrance_date: datetime | None = None
    exit_date: datetime | None = None

    class Config:
        from_attributes = True


class PaginatedWorkOrderResponse(BaseModel):
    """Schema for paginated work order response"""
    items: list[WorkOrderDetail]
    total: int
    page: int
    page_size: int
    total_pages: int
