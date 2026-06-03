from fastapi import APIRouter, Depends, HTTPException, status
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
    company = await check_station_yonetici_role(current_user, romiot_db)

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
    company = await check_station_yonetici_role(current_user, romiot_db)

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


@router.get("/companies", response_model=list[str])
async def list_integration_companies(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    List every company that has a row in `company_integrations`.

    F1: this is the new source of the Hedef Firma dropdown for müşteri users
    and replaces the per-user `atolye:musteri_company:<X>` role allowlist.
    Returns the company names (unique per row) ordered alphabetically.
    Open to any authenticated user with an `atolye:*` role.
    """
    role_values = current_user.role if isinstance(current_user.role, list) else []
    has_atolye_role = any(
        isinstance(r, str) and r.startswith("atolye:") for r in role_values
    )
    if not has_atolye_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Atölye yetkisi gereklidir.",
        )

    # Order by the database's default collation. We intentionally avoid an
    # explicit `.collate("tr-TR-x-icu")` here: that collation only exists on a
    # Postgres build with ICU, and a missing collation would turn this routine
    # dropdown lookup into a hard 500. The result feeds a client-side typeahead
    # that filters/sorts in the browser, so exact server-side Turkish collation
    # is not required.
    result = await romiot_db.execute(
        select(CompanyIntegration.company).order_by(CompanyIntegration.company)
    )
    return [row[0] for row in result.all()]
