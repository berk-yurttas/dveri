from datetime import datetime

from pydantic import BaseModel, Field


class WorkOrderRoutePosition(BaseModel):
    position: int
    station_id: int
    station_name: str

    class Config:
        from_attributes = True


class WorkOrderRouteCreate(BaseModel):
    """Body for POST /work-order-routes/

    `station_ids[0]` MUST equal:
      - the operator's current station when an `atolye:operator` is calling, OR
      - the earliest historical entrance station for the group when a yönetici
        is initialising a grandfathered group (F6.5 — "Rota Tanımla")
    `station_ids[-1]` MUST be `is_exit_station == True` UNLESS the group's
    company has zero exit stations (graceful fallback per F6.8).
    """
    model_config = {"extra": "forbid"}

    work_order_group_id: str = Field(..., min_length=1, max_length=50)
    station_ids: list[int] = Field(..., min_length=1, description="Ordered list of station ids")


class WorkOrderRouteUpdate(BaseModel):
    """Body for PUT /work-order-routes/{work_order_group_id}

    `station_ids[0]` MUST equal the existing route's position-0 station_id.
    """
    model_config = {"extra": "forbid"}

    station_ids: list[int] = Field(..., min_length=1, description="Ordered list of station ids")


class WorkOrderRouteResponse(BaseModel):
    work_order_group_id: str
    positions: list[WorkOrderRoutePosition]
    created_at: datetime | None = None

    class Config:
        from_attributes = True
