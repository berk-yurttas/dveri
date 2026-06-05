from pydantic import BaseModel


class CompanyOut(BaseModel):
    """A company as returned to the frontend (registry list + my-company)."""
    id: int
    name: str
    code: str

    class Config:
        from_attributes = True
