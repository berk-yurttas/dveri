from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.romiot_models import Station
from app.schemas.user import User


async def check_station_operator_role(
    station_id: int,
    current_user: User,
    db: AsyncSession
):
    """
    Helper function to check if user has the role 'atolye:operator'
    and department matches the station's company.
    Raises HTTPException with 401 if role doesn't match.
    """
    # Get station from database
    station_result = await db.execute(
        select(Station).where(Station.id == station_id)
    )
    station = station_result.scalar_one_or_none()

    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{station_id} ID'li atölye bulunamadı"
        )

    # New role format is company-independent: atolye:operator
    expected_role = "atolye:operator"

    # Check if user has the expected role
    if expected_role not in current_user.role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bu atölye için gerekli operatör yetkisine sahip değilsiniz"
        )

    # Company is now stored in user's department field
    user_company = (current_user.department or "").strip()
    if not user_company or station.company != user_company:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bu atölye için şirket yetkisine sahip değilsiniz"
        )

    return station


async def check_station_yonetici_role(current_user: User):
    """
    Helper function to check if user has the role 'atolye:yonetici'.
    Raises HTTPException with 401 if role doesn't match.
    Returns the company name from user's department field.
    """
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

    company = (current_user.department or "").strip()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kullanıcı şirket bilgisi bulunamadı"
        )

    return company


async def get_station_company(current_user: User):
    """
    Helper function to get company from department for any station role.
    Returns the company name if user has any station role, raises HTTPException otherwise.
    """
    if not current_user.role or not isinstance(current_user.role, list):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Atölye yetkisine sahip değilsiniz"
        )

    allowed_roles = {
        "atolye:yonetici",
        "atolye:operator",
        "atolye:musteri",
        "atolye:satinalma",
    }
    has_station_role = any(
        isinstance(role, str) and role in allowed_roles
        for role in current_user.role
    )

    if not has_station_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçerli bir atölye yetkisine sahip değilsiniz"
        )

    company = (current_user.department or "").strip()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kullanıcı şirket bilgisi bulunamadı"
        )

    return company

    