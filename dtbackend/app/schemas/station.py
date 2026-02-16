from pydantic import BaseModel, Field


class StationBase(BaseModel):
    name: str = Field(..., description="Station name", min_length=1, max_length=255)
    company: str = Field(..., description="Company name", min_length=1, max_length=255)
    is_exit_station: bool = Field(False, description="Whether this is an exit station (Çıkış Atölyesi)")


class StationCreate(StationBase):
    """Schema for creating a station"""
    pass


class Station(StationBase):
    id: int

    class Config:
        from_attributes = True


class StationList(BaseModel):
    """Schema for listing stations"""
    id: int
    name: str
    company: str
    is_exit_station: bool = False

    class Config:
        from_attributes = True

