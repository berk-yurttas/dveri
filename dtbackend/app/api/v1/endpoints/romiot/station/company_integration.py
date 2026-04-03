from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.auth import check_station_yonetici_role
from app.core.auth import check_authenticated
from app.core.database import get_romiot_db
from app.models.romiot_models import CompanyIntegration
from app.schemas.company_integration import CompanyIntegrationResponse, CompanyIntegrationUpdate
from app.schemas.user import User

router = APIRouter()


@router.get("/", response_model=CompanyIntegrationResponse)
async def get_company_integration(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Returns the current company's external API integration settings (api_url, api_key).
    Requires 'atolye:yonetici' role.
    """
    company = await check_station_yonetici_role(current_user)

    result = await romiot_db.execute(
        select(CompanyIntegration).where(CompanyIntegration.company == company)
    )
    record = result.scalar_one_or_none()

    if not record:
        return CompanyIntegrationResponse(company=company, api_url=None, api_key=None)

    return CompanyIntegrationResponse(
        company=record.company,
        api_url=record.api_url,
        api_key=record.api_key,
    )


@router.put("/", response_model=CompanyIntegrationResponse)
async def upsert_company_integration(
    data: CompanyIntegrationUpdate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Creates or updates the external API integration settings for the current company.
    Requires 'atolye:yonetici' role.
    """
    company = await check_station_yonetici_role(current_user)

    result = await romiot_db.execute(
        select(CompanyIntegration).where(CompanyIntegration.company == company)
    )
    record = result.scalar_one_or_none()

    if record:
        record.api_url = data.api_url
        record.api_key = data.api_key
    else:
        record = CompanyIntegration(
            company=company,
            api_url=data.api_url,
            api_key=data.api_key,
        )
        romiot_db.add(record)

    await romiot_db.commit()
    await romiot_db.refresh(record)

    return CompanyIntegrationResponse(
        company=record.company,
        api_url=record.api_url,
        api_key=record.api_key,
    )
