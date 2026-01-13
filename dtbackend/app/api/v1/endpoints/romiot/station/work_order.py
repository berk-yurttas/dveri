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
    WorkOrderDetail,
    WorkOrderList,
    WorkOrderStatus,
    WorkOrderUpdateExitDate,
    PaginatedWorkOrderResponse,
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
            detail="Bu barkod ile işlem yapılmıştır"
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
            detail="Bu barkod ile işlem yapılmıştır"
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


@router.get("/all", response_model=PaginatedWorkOrderResponse)
async def get_all_work_orders(
    page: int = Query(1, ge=1, description="Page number (starts from 1)"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db)
):
    """
    Get all work orders for the current user's company with detailed information and pagination.
    Returns work orders from all stations belonging to the user's company.
    Includes station name and user name for each work order.
    Pagination is applied to grouped work orders (by work order number), not individual entries.
    Requires role 'atolye:<company>:operator', 'atolye:<company>:yonetici', or 'atolye:<company>:musteri'.
    """
    from app.models.romiot_models import Station
    from collections import defaultdict
    
    # Extract company from user's role
    company = None
    if current_user.role and isinstance(current_user.role, list):
        for role in current_user.role:
            if isinstance(role, str) and role.startswith("atolye:"):
                parts = role.split(":")
                if len(parts) >= 2:
                    company = parts[1]
                    break
    
    if not company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have atolye role"
        )
    
    # Get all stations for this company
    stations_result = await romiot_db.execute(
        select(Station).where(Station.company == company)
    )
    stations = stations_result.scalars().all()
    station_ids = [station.id for station in stations]
    
    if not station_ids:
        return PaginatedWorkOrderResponse(
            items=[],
            total=0,
            page=page,
            page_size=page_size,
            total_pages=0
        )
    
    # Create a map of station_id to station_name
    station_map = {station.id: station.name for station in stations}
    
    # Use SQL to efficiently group, sort, and paginate work orders
    from sqlalchemy import func, case, desc, text
    from sqlalchemy.sql import label
    
    # Create a subquery that adds grouping and sorting metadata to each work order
    # We'll use window functions to:
    # 1. Identify unique groups
    # 2. Calculate if group has any active entry
    # 3. Calculate last action date per group
    # 4. Assign a rank to each group for pagination
    
    # First, create a CTE (Common Table Expression) with group metadata
    group_metadata_cte = select(
        WorkOrder,
        # Concatenate to create group key
        func.concat(
            WorkOrder.aselsan_work_order_number, 
            '|', 
            WorkOrder.aselsan_order_number, 
            '|', 
            WorkOrder.order_item_number
        ).label('group_key'),
        # Check if this entry is active (no exit_date)
        case((WorkOrder.exit_date.is_(None), 1), else_=0).label('is_active'),
        # Get the action date (exit_date or entrance_date)
        func.coalesce(WorkOrder.exit_date, WorkOrder.entrance_date).label('action_date'),
        # Use window function to get max active status per group
        func.max(case((WorkOrder.exit_date.is_(None), 1), else_=0)).over(
            partition_by=[
                WorkOrder.aselsan_work_order_number,
                WorkOrder.aselsan_order_number,
                WorkOrder.order_item_number
            ]
        ).label('group_has_active'),
        # Use window function to get max action date per group
        func.max(func.coalesce(WorkOrder.exit_date, WorkOrder.entrance_date)).over(
            partition_by=[
                WorkOrder.aselsan_work_order_number,
                WorkOrder.aselsan_order_number,
                WorkOrder.order_item_number
            ]
        ).label('group_last_date')
    ).where(
        WorkOrder.station_id.in_(station_ids)
    ).cte('group_metadata')
    
    # Now create a query that assigns a dense rank to each group
    ranked_groups_cte = select(
        group_metadata_cte,
        func.dense_rank().over(
            order_by=[
                desc(group_metadata_cte.c.group_has_active),
                desc(group_metadata_cte.c.group_last_date)
            ]
        ).label('group_rank')
    ).cte('ranked_groups')
    
    # Get total number of unique groups for pagination
    total_groups_query = select(func.count(func.distinct(ranked_groups_cte.c.group_key)))
    total_groups_result = await romiot_db.execute(total_groups_query)
    total_groups = total_groups_result.scalar() or 0
    total_pages = (total_groups + page_size - 1) // page_size if total_groups > 0 else 0
    
    # Get work orders for the requested page
    start_rank = (page - 1) * page_size + 1
    end_rank = start_rank + page_size - 1
    
    paginated_query = select(
        ranked_groups_cte.c.id,
        ranked_groups_cte.c.station_id,
        ranked_groups_cte.c.user_id,
        ranked_groups_cte.c.manufacturer_number,
        ranked_groups_cte.c.aselsan_order_number,
        ranked_groups_cte.c.aselsan_work_order_number,
        ranked_groups_cte.c.order_item_number,
        ranked_groups_cte.c.quantity,
        ranked_groups_cte.c.entrance_date,
        ranked_groups_cte.c.exit_date
    ).where(
        ranked_groups_cte.c.group_rank.between(start_rank, end_rank)
    )
    
    paginated_result = await romiot_db.execute(paginated_query)
    paginated_work_orders = paginated_result.fetchall()
    
    # Get all unique user IDs from the paginated results
    user_ids = list(set(row.user_id for row in paginated_work_orders))
    
    # Fetch user information from PostgreSQL
    user_map = {}
    if user_ids:
        users_result = await postgres_db.execute(
            select(PostgresUser).where(PostgresUser.id.in_(user_ids))
        )
        users = users_result.scalars().all()
        user_map = {user.id: user.name for user in users}
    
    # Build detailed work order list from SQL rows
    detailed_work_orders = []
    for row in paginated_work_orders:
        detailed_work_orders.append(WorkOrderDetail(
            id=row.id,
            station_id=row.station_id,
            station_name=station_map.get(row.station_id, "Unknown"),
            user_id=row.user_id,
            user_name=user_map.get(row.user_id, "Unknown"),
            manufacturer_number=row.manufacturer_number,
            aselsan_order_number=row.aselsan_order_number,
            aselsan_work_order_number=row.aselsan_work_order_number,
            order_item_number=row.order_item_number,
            quantity=row.quantity,
            entrance_date=row.entrance_date,
            exit_date=row.exit_date
        ))
    
    return PaginatedWorkOrderResponse(
        items=detailed_work_orders,
        total=len(detailed_work_orders),  # Total items in current page
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )
