from pydantic import BaseModel, Field


class StationBase(BaseModel):
    name: str = Field(..., description="Station name", min_length=1, max_length=255)
    company: str = Field(..., description="Company name", min_length=1, max_length=255)


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

    class Config:
        from_attributes = True

