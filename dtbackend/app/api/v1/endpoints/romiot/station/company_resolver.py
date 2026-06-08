from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.romiot_models import Company, UserCompany
from app.schemas.user import User


async def resolve_user_company(current_user: User, romiot_db: AsyncSession) -> Company | None:
    """Return the user's Company from the user_companies pairing table (NOT
    PocketBase). None when the user has no pairing row. `current_user.id` is the
    PocketBase user id."""
    result = await romiot_db.execute(
        select(Company)
        .join(UserCompany, UserCompany.company_id == Company.id)
        .where(UserCompany.pb_user_id == current_user.id)
    )
    return result.scalar_one_or_none()


async def require_user_company(current_user: User, romiot_db: AsyncSession) -> Company:
    """Same as resolve_user_company but raises 403 when the user is unpaired."""
    company = await resolve_user_company(current_user, romiot_db)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kullanıcı bir firmaya atanmamış",
        )
    return company
