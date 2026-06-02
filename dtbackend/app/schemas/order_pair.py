from pydantic import BaseModel, Field


class OrderPair(BaseModel):
    """A (Sipariş No, Kalem No) pair on a work order group.

    Used in the QR JSON payload, QRCodeBatchCreate, WorkOrderBase, and the
    work_order_pairs table serialization. One work order group has 1..N pairs;
    every package of the group shares the same pair list.
    """
    aselsan_order_number: str = Field(..., description="ASELSAN Sipariş Numarası", min_length=1, max_length=255)
    order_item_number: str = Field(..., description="Sipariş Kalem Numarası", min_length=1, max_length=255)

    class Config:
        from_attributes = True
