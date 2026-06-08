from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.order_pair import OrderPair


class WorkOrderStatus(str, Enum):
    ENTRANCE = "Entrance"
    EXIT = "Exit"


class WorkOrderBase(BaseModel):
    station_id: int = Field(..., description="Station ID")
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    main_customer: str = Field(..., description="Ana Müşteri")
    sector: str = Field(..., description="Sektör")
    company_from: str = Field(..., description="Gönderen Firma")
    teklif_number: str = Field(..., description="Teklif Numarası")
    pairs: list[OrderPair] = Field(..., min_length=1, description="(Sipariş No, Kalem No) çiftleri")
    part_number: str = Field(..., description="Parça Numarası")
    revision_number: str | None = Field(None, description="Revizyon Numarası")
    quantity: int = Field(..., description="Bu paketin parça sayısı")
    total_quantity: int = Field(..., description="Toplam sipariş miktarı")
    package_index: int = Field(..., description="Parti sırası (1-based)")
    total_packages: int = Field(..., description="Toplam parti sayısı")
    target_date: date | None = Field(None, description="Hedef Bitirme Tarihi")
    qr_code: str | None = Field(None, description="QR kodu (tarama sırasında kullanılan kısa kod)")
    qr_created_at: datetime | None = Field(None, description="QR kodunun oluşturulma tarihi")


class WorkOrderCreate(WorkOrderBase):
    """Schema for creating a work order (one package at one station)"""
    acknowledged_route_violation: bool = Field(
        False,
        description="If True, the operator has acknowledged a route warning and the row is committed with route_violation=True",
    )


class WorkOrderUpdateExitDate(BaseModel):
    """Schema for updating exit_date for a specific package"""
    station_id: int = Field(..., description="Station ID")
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    package_index: int = Field(..., description="Paket sırası (1-based)")
    acknowledged_route_violation: bool = Field(
        False,
        description="If True, the operator has acknowledged a route warning",
    )


class WorkOrder(WorkOrderBase):
    id: int
    priority: int = 0
    prioritized_by: int | None = None
    delivered: bool = False
    route_violation: bool = False
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
    is_first_scan_for_group: bool = Field(..., description="Bu, grubun ilk taraması mıydı (F6 rota seçici tetikleyicisi)")
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
    teklif_number: str
    pairs: list[OrderPair]
    part_number: str
    revision_number: str | None = None
    quantity: int
    total_quantity: int
    package_index: int
    total_packages: int
    priority: int = 0
    prioritized_by: int | None = None
    delivered: bool = False
    route_violation: bool = False
    target_date: date | None = None
    entrance_date: datetime | None = None
    exit_date: datetime | None = None
    qr_code: str | None = None
    qr_created_at: datetime | None = None

    class Config:
        from_attributes = True


class WorkOrderDetail(BaseModel):
    """Schema for detailed work order information with user and station details"""
    id: int
    station_id: int
    station_name: str
    is_entry_station: bool = False
    is_exit_station: bool = False
    user_id: int
    user_name: str | None = None
    work_order_group_id: str
    main_customer: str
    sector: str
    company_from: str
    teklif_number: str
    pairs: list[OrderPair]
    pair_count: int = Field(..., description="Toplam çift sayısı (collapsed row badge'i için denormalize)")
    part_number: str
    revision_number: str | None = None
    quantity: int
    total_quantity: int
    package_index: int
    total_packages: int
    priority: int = 0
    prioritized_by: int | None = None
    delivered: bool = False
    route_violation: bool = False
    target_date: date | None = None
    entrance_date: datetime | None = None
    exit_date: datetime | None = None
    qr_code: str | None = None
    qr_created_at: datetime | None = None

    class Config:
        from_attributes = True


class PaginatedWorkOrderResponse(BaseModel):
    """Schema for paginated work order response"""
    items: list[WorkOrderDetail]
    total: int
    page: int
    page_size: int
    total_pages: int


class PriorityAssignment(BaseModel):
    """Schema for assigning priority to a work order group"""
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    priority: int = Field(..., ge=0, le=5, description="Öncelik (0-5 jeton, 0=kaldır)")


class PriorityAssignRequest(BaseModel):
    """Schema for batch priority assignment"""
    assignments: list[PriorityAssignment] = Field(..., description="Öncelik atamaları")


class PriorityTokenInfo(BaseModel):
    """Schema for token info response"""
    total_tokens: int
    used_tokens: int
    remaining_tokens: int


class TrackTimelineStep(BaseModel):
    """One station node on the tracking timeline (route spine + history overlay)."""
    position: int | None = Field(None, description="Route pozisyonu; history-only modda None")
    station_id: int
    station_name: str
    is_exit_station: bool = False
    status: str = Field(..., description='"done" | "active" | "delayed" | "waiting"')
    entry_date: datetime | None = None
    exit_date: datetime | None = None


class TrackPackage(BaseModel):
    """A single package's current position within its group."""
    package_index: int
    total_packages: int
    quantity: int
    current_station_name: str | None = None
    status: str = Field(..., description="TrackStatus")


class TrackMatch(BaseModel):
    """A matched work-order group assembled for the tracker view."""
    work_order_group_id: str
    part_number: str
    revision_number: str | None = None
    pairs: list[OrderPair]
    main_customer: str
    sector: str
    company_from: str
    coating_company: str | None = None
    teklif_number: str
    total_quantity: int
    total_packages: int
    target_date: date | None = None
    current_station_name: str | None = None
    current_entry_date: datetime | None = None
    status: str = Field(..., description="TrackStatus (group rollup)")
    last_updated: datetime | None = None
    has_route: bool = False
    timeline: list[TrackTimelineStep]
    packages: list[TrackPackage]


class TrackResponse(BaseModel):
    """0 matches = not found; 1 = open directly; >1 = selector list."""
    matches: list[TrackMatch]
