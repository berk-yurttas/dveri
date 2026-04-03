from pydantic import BaseModel, Field


class CompanyIntegrationResponse(BaseModel):
    company: str
    api_url: str | None = None
    api_key: str | None = None

    class Config:
        from_attributes = True


class CompanyIntegrationUpdate(BaseModel):
    api_url: str | None = Field(None, max_length=1024, description="API URL")
    api_key: str | None = Field(None, max_length=512, description="API Key / Token")
