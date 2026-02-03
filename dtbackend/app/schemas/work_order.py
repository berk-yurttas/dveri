from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class WorkOrderStatus(str, Enum):
    ENTRANCE = "Entrance"
    EXIT = "Exit"


class WorkOrderBase(BaseModel):
    station_id: int = Field(..., description="Station ID")
    manufacturer_number: str = Field(..., description="Üretici Firma Numarası")
    aselsan_order_number: str = Field(..., description="ASELSAN Sipariş Numarası")
    aselsan_work_order_number: str = Field(..., description="ASELSAN İş Emri Numarası")
    order_item_number: str = Field(..., description="Sipariş Kalemi")
    quantity: int = Field(..., description="İş Emri Adedi")


class WorkOrderCreate(WorkOrderBase):
    """Schema for creating a work order without exit_date"""
    pass


class WorkOrderUpdateExitDate(BaseModel):
    """Schema for updating exit_date"""
    station_id: int = Field(..., description="Station ID")
    aselsan_order_number: str = Field(..., description="ASELSAN Sipariş Numarası")
    order_item_number: str = Field(..., description="Sipariş Kalemi")


class WorkOrder(WorkOrderBase):
    id: int
    entrance_date: datetime | None = None
    exit_date: datetime | None = None

    class Config:
        from_attributes = True


class WorkOrderList(BaseModel):
    """Schema for listing work orders"""
    id: int
    station_id: int
    user_id: int
    manufacturer_number: str
    aselsan_order_number: str
    aselsan_work_order_number: str
    order_item_number: str
    quantity: int
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
    manufacturer_number: str
    aselsan_order_number: str
    aselsan_work_order_number: str
    order_item_number: str
    quantity: int
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