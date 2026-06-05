from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.romiot_models import Station
from app.schemas.user import User
from app.api.v1.endpoints.romiot.station.company_resolver import require_user_company


async def check_station_operator_role(
    station_id: int,
    current_user: User,
    db: AsyncSession
):
    """Check the user holds 'atolye:operator' AND their resolved company matches
    the station's company. Company now comes from user_companies, not PocketBase."""
    station_result = await db.execute(
        select(Station).where(Station.id == station_id)
    )
    station = station_result.scalar_one_or_none()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{station_id} ID'li atölye bulunamadı"
        )

    if "atolye:operator" not in current_user.role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bu atölye için gerekli operatör yetkisine sahip değilsiniz"
        )

    company = await require_user_company(current_user, db)
    if station.company != company.name:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bu atölye için şirket yetkisine sahip değilsiniz"
        )

    return station


async def check_station_yonetici_role(current_user: User, romiot_db: AsyncSession) -> str:
    """Check 'atolye:yonetici' and return the user's resolved company NAME
    (from user_companies). Raises 401 without the role, 403 when unpaired."""
    if not current_user.role or not isinstance(current_user.role, list):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yönetici yetkisine sahip değilsiniz"
        )
    if "atolye:yonetici" not in current_user.role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yönetici yetkisine sahip değilsiniz"
        )
    company = await require_user_company(current_user, romiot_db)
    return company.name


async def get_station_company(current_user: User, romiot_db: AsyncSession) -> str:
    """Return the user's resolved company NAME for any atolye role
    (from user_companies). 401 without an atolye role, 403 when unpaired."""
    if not current_user.role or not isinstance(current_user.role, list):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Atölye yetkisine sahip değilsiniz"
        )
    allowed_roles = {"atolye:yonetici", "atolye:operator", "atolye:musteri", "atolye:satinalma"}
    if not any(isinstance(r, str) and r in allowed_roles for r in current_user.role):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçerli bir atölye yetkisine sahip değilsiniz"
        )
    company = await require_user_company(current_user, romiot_db)
    return company.name


def is_full_admin(current_user: User) -> bool:
    """
    Returns True if the user has the literal "fullAdmin:true" string in their
    role list. The role is set in PocketBase out-of-band; no other side effect.
    """
    if not current_user.role or not isinstance(current_user.role, list):
        return False
    return "fullAdmin:true" in current_user.role

    