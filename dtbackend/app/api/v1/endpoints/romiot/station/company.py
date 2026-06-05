from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.company_resolver import resolve_user_company
from app.core.auth import check_authenticated
from app.core.database import get_romiot_db
from app.models.romiot_models import Company
from app.schemas.company import CompanyOut
from app.schemas.user import User

router = APIRouter()


def _has_atolye_role(current_user: User) -> bool:
    roles = current_user.role if isinstance(current_user.role, list) else []
    return any(isinstance(r, str) and r.startswith("atolye:") for r in roles)


@router.get("/", response_model=list[CompanyOut])
async def list_companies(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """List the company registry (name + code), ordered by name. For the
    user-form typeahead. Any atolye:* role may read."""
    if not _has_atolye_role(current_user):
        raise HTTPException(status_code=403, detail="Atölye yetkisi gereklidir.")
    result = await romiot_db.execute(select(Company).order_by(Company.name))
    return list(result.scalars().all())


@router.get("/my-company", response_model=CompanyOut)
async def get_my_company(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """The caller's own company from the pairing table. 404 when unpaired."""
    if not _has_atolye_role(current_user):
        raise HTTPException(status_code=403, detail="Atölye yetkisi gereklidir.")
    company = await resolve_user_company(current_user, romiot_db)
    if company is None:
        raise HTTPException(status_code=404, detail="Kullanıcı bir firmaya atanmamış")
    return company
