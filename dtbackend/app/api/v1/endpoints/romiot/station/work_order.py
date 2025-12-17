from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.auth import check_station_operator_role
from app.core.auth import check_authenticated
from app.core.database import get_postgres_db, get_romiot_db
from app.models.postgres_models import User as PostgresUser
from app.models.romiot_models import WorkOrder
from app.schemas.user import User
from app.services.user_service import UserService
from app.schemas.work_order import (
    WorkOrder as WorkOrderSchema,
)
from app.schemas.work_order import (
    WorkOrderCreate,
    WorkOrderList,
    WorkOrderStatus,
    WorkOrderUpdateExitDate,
)

router = APIRouter()


@router.post("/", response_model=WorkOrderSchema, status_code=status.HTTP_201_CREATED)
async def create_work_order(
    work_order_data: WorkOrderCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db)
):
    """
    Create a new work order without an exit_date.
    Returns 400 Bad Request if a work order with the same (station_id, aselsan_order_number, order_item_number) already exists.
    Requires role 'atolye:<company>:operator' where company matches the station's company.
    """
    # Check if user has the required role for this station
    await check_station_operator_role(work_order_data.station_id, current_user, romiot_db)
    
    # Get PostgreSQL user ID from username
    pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
    if not pg_user:
        # Create user in PostgreSQL if it doesn't exist
        pg_user = await UserService.create_user(postgres_db, current_user.username)
    pg_user_id = pg_user.id
    
    # Check if work order already exists with the unique keys
    existing_work_order = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.station_id == work_order_data.station_id,
                WorkOrder.aselsan_order_number == work_order_data.aselsan_order_number,
                WorkOrder.order_item_number == work_order_data.order_item_number
            )
        )
    )
    existing = existing_work_order.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Work order with the same station_id, aselsan_order_number, and order_item_number already exists"
        )

    # Create new work order without exit_date
    new_work_order = WorkOrder(
        station_id=work_order_data.station_id,
        user_id=pg_user_id,
        manufacturer_number=work_order_data.manufacturer_number,
        aselsan_order_number=work_order_data.aselsan_order_number,
        aselsan_work_order_number=work_order_data.aselsan_work_order_number,
        order_item_number=work_order_data.order_item_number,
        quantity=work_order_data.quantity,
        exit_date=None  # Explicitly set to None
    )

    romiot_db.add(new_work_order)
    await romiot_db.commit()
    await romiot_db.refresh(new_work_order)

    return new_work_order


@router.post("/update-exit-date", response_model=WorkOrderSchema)
async def update_exit_date(
    update_data: WorkOrderUpdateExitDate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Find work order by unique keys (station_id, aselsan_order_number, order_item_number)
    and fill the exit_date field with current datetime.
    Returns 400 Bad Request if work order not found or exit_date is already filled.
    Requires role 'atolye:<company>:operator' where company matches the station's company.
    """
    # Check if user has the required role for this station
    await check_station_operator_role(update_data.station_id, current_user, romiot_db)
    
    # Find work order by unique keys
    work_order_result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.station_id == update_data.station_id,
                WorkOrder.aselsan_order_number == update_data.aselsan_order_number,
                WorkOrder.order_item_number == update_data.order_item_number
            )
        )
    )
    work_order = work_order_result.scalar_one_or_none()

    if not work_order:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Work order not found with the provided station_id, aselsan_order_number, and order_item_number"
        )

    if work_order.exit_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Work order exit_date is already filled"
        )

    # Update exit_date with current datetime (timezone-aware)
    work_order.exit_date = datetime.now(timezone.utc)
    await romiot_db.commit()
    await romiot_db.refresh(work_order)

    return work_order


@router.get("/list/{station_id}", response_model=list[WorkOrderList])
async def get_work_orders_by_station(
    station_id: int,
    status_filter: WorkOrderStatus = Query(..., description="Filter by Entrance or Exit status"),
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Get work order list by station_id with status filter.
    - Entrance: Returns work orders with entrance_date filled but exit_date is not filled
    - Exit: Returns work orders with both entrance_date and exit_date filled
    Requires role 'atolye:<company>:operator' where company matches the station's company.
    """
    # Check if user has the required role for this station
    await check_station_operator_role(station_id, current_user, romiot_db)
    
    base_query = select(WorkOrder).where(WorkOrder.station_id == station_id)

    if status_filter == WorkOrderStatus.ENTRANCE:
        # Entrance: entrance_date is filled but exit_date is not filled
        query = base_query.where(
            and_(
                WorkOrder.entrance_date.isnot(None),
                WorkOrder.exit_date.is_(None)
            )
        )
    elif status_filter == WorkOrderStatus.EXIT:
        # Exit: both entrance_date and exit_date are filled
        query = base_query.where(
            and_(
                WorkOrder.entrance_date.isnot(None),
                WorkOrder.exit_date.isnot(None)
            )
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status filter. Must be 'Entrance' or 'Exit'"
        )

    result = await romiot_db.execute(query)
    work_orders = result.scalars().all()

    return list(work_orders)

