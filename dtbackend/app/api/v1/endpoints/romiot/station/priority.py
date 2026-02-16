from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import check_authenticated
from app.core.database import get_postgres_db, get_romiot_db
from app.models.postgres_models import User as PostgresUser
from app.models.romiot_models import PriorityToken, WorkOrder
from app.schemas.user import User
from app.schemas.work_order import PriorityAssignRequest, PriorityTokenInfo
from app.services.user_service import UserService

router = APIRouter()

ASELSAN_TOKEN_LIMIT = 100
DEFAULT_TOKEN_LIMIT = 1
MAX_PRIORITY_PER_ORDER = 5


def _get_satinalma_company(current_user: User) -> str:
    """Extract company from satinalma role. Raises if not satinalma."""
    if not current_user.role or not isinstance(current_user.role, list):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Satınalma yetkisi gerekli")

    for role in current_user.role:
        if isinstance(role, str) and role.startswith("atolye:") and role.endswith(":satinalma"):
            parts = role.split(":")
            if len(parts) == 3:
                return parts[1]

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Satınalma yetkisi gerekli")


async def _get_or_create_token_record(
    user_id: int, company: str, romiot_db: AsyncSession
) -> PriorityToken:
    """Get or create priority token record for a satinalma user."""
    result = await romiot_db.execute(
        select(PriorityToken).where(
            and_(PriorityToken.user_id == user_id, PriorityToken.company == company)
        )
    )
    token_record = result.scalar_one_or_none()

    if not token_record:
        total = ASELSAN_TOKEN_LIMIT if company.upper() == "ASELSAN" else DEFAULT_TOKEN_LIMIT
        token_record = PriorityToken(
            user_id=user_id, company=company, total_tokens=total, used_tokens=0
        )
        romiot_db.add(token_record)
        await romiot_db.commit()
        await romiot_db.refresh(token_record)

    return token_record


@router.get("/tokens", response_model=PriorityTokenInfo)
async def get_my_tokens(
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Get current user's priority token balance."""
    company = _get_satinalma_company(current_user)

    pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
    if not pg_user:
        pg_user = await UserService.create_user(postgres_db, current_user.username)

    token_record = await _get_or_create_token_record(pg_user.id, company, romiot_db)

    return PriorityTokenInfo(
        total_tokens=token_record.total_tokens,
        used_tokens=token_record.used_tokens,
        remaining_tokens=token_record.total_tokens - token_record.used_tokens,
    )


@router.post("/assign", response_model=PriorityTokenInfo)
async def assign_priorities(
    request: PriorityAssignRequest,
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Assign priority tokens to work order groups.
    Each work order group can have max 5 tokens.
    Deducts tokens from user's balance.
    """
    company = _get_satinalma_company(current_user)

    pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
    if not pg_user:
        pg_user = await UserService.create_user(postgres_db, current_user.username)

    token_record = await _get_or_create_token_record(pg_user.id, company, romiot_db)
    remaining = token_record.total_tokens - token_record.used_tokens

    # Calculate net token change (positive = spend, negative = refund)
    net_token_change = 0
    for assignment in request.assignments:
        if assignment.priority < 0 or assignment.priority > MAX_PRIORITY_PER_ORDER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Öncelik değeri 0 ile {MAX_PRIORITY_PER_ORDER} arasında olmalıdır",
            )

        # Check current priority on this work order group
        wo_result = await romiot_db.execute(
            select(WorkOrder).where(
                WorkOrder.work_order_group_id == assignment.work_order_group_id
            ).limit(1)
        )
        wo = wo_result.scalar_one_or_none()
        if not wo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"İş emri bulunamadı: {assignment.work_order_group_id}",
            )

        if wo.delivered:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Teslim edilmiş iş emrine öncelik atanamaz: {assignment.work_order_group_id}",
            )

        current_priority = wo.priority or 0

        # If same user already assigned, calculate delta (can be negative for refund)
        if wo.prioritized_by == pg_user.id:
            delta = assignment.priority - current_priority
        else:
            # If another user assigned, we need to refund their tokens first
            if current_priority > 0 and wo.prioritized_by is not None:
                old_token_result = await romiot_db.execute(
                    select(PriorityToken).where(
                        and_(
                            PriorityToken.user_id == wo.prioritized_by,
                            PriorityToken.company == company,
                        )
                    )
                )
                old_token = old_token_result.scalar_one_or_none()
                if old_token:
                    old_token.used_tokens = max(0, old_token.used_tokens - current_priority)

            delta = assignment.priority

        net_token_change += delta

    # Check if user has enough tokens (only if net change is positive)
    if net_token_change > 0 and net_token_change > remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Yeterli jetonunuz yok. Gerekli: {net_token_change}, Kalan: {remaining}",
        )

    # Apply assignments
    total_delta = 0
    for assignment in request.assignments:
        wo_result = await romiot_db.execute(
            select(WorkOrder).where(
                WorkOrder.work_order_group_id == assignment.work_order_group_id
            ).limit(1)
        )
        wo = wo_result.scalar_one_or_none()
        current_priority = wo.priority or 0

        if wo.prioritized_by == pg_user.id:
            delta = assignment.priority - current_priority
        else:
            if current_priority > 0 and wo.prioritized_by is not None:
                old_token_result = await romiot_db.execute(
                    select(PriorityToken).where(
                        and_(
                            PriorityToken.user_id == wo.prioritized_by,
                            PriorityToken.company == company,
                        )
                    )
                )
                old_token = old_token_result.scalar_one_or_none()
                if old_token:
                    old_token.used_tokens = max(0, old_token.used_tokens - current_priority)
            delta = assignment.priority

        # Update all work orders in this group
        new_prioritized_by = pg_user.id if assignment.priority > 0 else None
        await romiot_db.execute(
            update(WorkOrder)
            .where(WorkOrder.work_order_group_id == assignment.work_order_group_id)
            .values(priority=assignment.priority, prioritized_by=new_prioritized_by)
        )

        total_delta += delta

    # Apply net token change (can be negative for refund)
    token_record.used_tokens = max(0, token_record.used_tokens + total_delta)
    await romiot_db.commit()
    await romiot_db.refresh(token_record)

    return PriorityTokenInfo(
        total_tokens=token_record.total_tokens,
        used_tokens=token_record.used_tokens,
        remaining_tokens=token_record.total_tokens - token_record.used_tokens,
    )
