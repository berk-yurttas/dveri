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
    Helper function to check if user has the role 'atolye:<company>:operator' 
    where company matches the station's company.
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
            detail=f"Station with id {station_id} not found"
        )

    # Build expected role: atolye:<company>:operator
    expected_role = f"atolye:{station.company}:operator"

    # Check if user has the expected role
    if expected_role not in current_user.role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User does not have the required role '{expected_role}' for this station"
        )

    return station


async def check_station_yonetici_role(current_user: User):
    """
    Helper function to check if user has the role 'atolye:<company>:yonetici'.
    Raises HTTPException with 401 if role doesn't match.
    Returns the company name from the role.
    """
    if not current_user.role or not isinstance(current_user.role, list):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User does not have required yonetici role"
        )

    # Find yonetici role
    yonetici_role = None
    for role in current_user.role:
        if isinstance(role, str) and role.startswith("atolye:") and role.endswith(":yonetici"):
            yonetici_role = role
            break

    if not yonetici_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User does not have the required role 'atolye:<company>:yonetici'"
        )

    # Extract company from role: "atolye:<company>:yonetici"
    parts = yonetici_role.split(":")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid role format: {yonetici_role}"
        )

    company = parts[1]
    return company


async def get_station_company(current_user: User):
    """
    Helper function to extract company from any station role (yonetici, operator, or musteri).
    Returns the company name if user has any station role, raises HTTPException otherwise.
    """
    if not current_user.role or not isinstance(current_user.role, list):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User does not have required station role"
        )

    # Find any station role
    station_role = None
    for role in current_user.role:
        if isinstance(role, str) and role.startswith("atolye:"):
            # Check if it ends with :yonetici, :operator, :musteri, or :satinalma
            if role.endswith(":yonetici") or role.endswith(":operator") or role.endswith(":musteri") or role.endswith(":satinalma"):
                station_role = role
                break

    if not station_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User does not have a valid station role (atolye:<company>:yonetici, :operator, or :musteri)"
        )

    # Extract company from role: "atolye:<company>:<type>"
    parts = station_role.split(":")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid role format: {station_role}"
        )

    company = parts[1]
    return company

    