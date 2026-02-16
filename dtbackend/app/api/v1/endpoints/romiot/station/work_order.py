from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.auth import check_station_operator_role
from app.core.auth import check_authenticated
from app.core.database import get_postgres_db, get_romiot_db
from app.models.postgres_models import User as PostgresUser
from app.models.romiot_models import PriorityToken, WorkOrder
from app.schemas.user import User
from app.services.user_service import UserService
from app.schemas.work_order import (
    WorkOrder as WorkOrderSchema,
    WorkOrderCreate,
    WorkOrderCreateResponse,
    WorkOrderDetail,
    WorkOrderExitResponse,
    WorkOrderList,
    WorkOrderStatus,
    WorkOrderUpdateExitDate,
    PaginatedWorkOrderResponse,
)

router = APIRouter()


@router.post("/", response_model=WorkOrderCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_work_order(
    work_order_data: WorkOrderCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db)
):
    """
    Create a new work order entry for a specific package at a station (entrance).
    Returns progress info showing how many packages of this group have been scanned.
    Returns 400 Bad Request if this package has already been entered at this station.
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
    
    # Check if this specific package already exists at this station
    existing_result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.station_id == work_order_data.station_id,
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrder.package_index == work_order_data.package_index
            )
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bu paket (Paket {work_order_data.package_index}/{work_order_data.total_packages}) ile işlem yapılmıştır"
        )

    # Create new work order entry for this package
    new_work_order = WorkOrder(
        station_id=work_order_data.station_id,
        user_id=pg_user_id,
        work_order_group_id=work_order_data.work_order_group_id,
        main_customer=work_order_data.main_customer,
        sector=work_order_data.sector,
        company_from=work_order_data.company_from,
        aselsan_order_number=work_order_data.aselsan_order_number,
        order_item_number=work_order_data.order_item_number,
        part_number=work_order_data.part_number,
        quantity=work_order_data.quantity,
        total_quantity=work_order_data.total_quantity,
        package_index=work_order_data.package_index,
        total_packages=work_order_data.total_packages,
        target_date=work_order_data.target_date,
        exit_date=None,
    )

    romiot_db.add(new_work_order)
    await romiot_db.commit()
    await romiot_db.refresh(new_work_order)

    # Count how many packages of this group have been scanned at this station
    scanned_count_result = await romiot_db.execute(
        select(func.count()).where(
            and_(
                WorkOrder.station_id == work_order_data.station_id,
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id
            )
        )
    )
    packages_scanned = scanned_count_result.scalar() or 0
    total_packages = work_order_data.total_packages
    all_scanned = packages_scanned >= total_packages

    if all_scanned:
        message = f"Tüm paketler okundu! İş emri girişi tamamlandı. ({packages_scanned}/{total_packages})"
    else:
        message = f"Paket {work_order_data.package_index} okundu. ({packages_scanned}/{total_packages})"

    return WorkOrderCreateResponse(
        work_order=WorkOrderSchema.model_validate(new_work_order),
        packages_scanned=packages_scanned,
        total_packages=total_packages,
        all_scanned=all_scanned,
        message=message
    )


@router.post("/update-exit-date", response_model=WorkOrderExitResponse)
async def update_exit_date(
    update_data: WorkOrderUpdateExitDate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    """
    Find work order package by unique keys (station_id, work_order_group_id, package_index)
    and fill the exit_date field with current datetime.
    Returns progress info showing how many packages have been exited.
    Returns 400 Bad Request if package not found or exit_date is already filled.
    Requires role 'atolye:<company>:operator' where company matches the station's company.
    """
    # Check if user has the required role for this station
    await check_station_operator_role(update_data.station_id, current_user, romiot_db)
    
    # Find work order package by unique keys
    work_order_result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.station_id == update_data.station_id,
                WorkOrder.work_order_group_id == update_data.work_order_group_id,
                WorkOrder.package_index == update_data.package_index
            )
        )
    )
    work_order = work_order_result.scalar_one_or_none()

    if not work_order:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Girişi yapılmayan iş emri çıkışı yapılamaz."
        )

    if work_order.exit_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bu paket (Paket {update_data.package_index}/{work_order.total_packages}) ile çıkış işlemi yapılmıştır"
        )

    # Update exit_date with current datetime (timezone-aware)
    work_order.exit_date = datetime.now(timezone.utc)
    await romiot_db.commit()
    await romiot_db.refresh(work_order)

    # Count how many packages of this group have been exited at this station
    exited_count_result = await romiot_db.execute(
        select(func.count()).where(
            and_(
                WorkOrder.station_id == update_data.station_id,
                WorkOrder.work_order_group_id == update_data.work_order_group_id,
                WorkOrder.exit_date.isnot(None)
            )
        )
    )
    packages_exited = exited_count_result.scalar() or 0
    total_packages = work_order.total_packages
    all_exited = packages_exited >= total_packages

    # If this is an exit station and all packages exited, mark work order as delivered
    # and refund priority tokens
    if all_exited:
        from app.models.romiot_models import Station as StationModel
        station_result = await romiot_db.execute(
            select(StationModel).where(StationModel.id == update_data.station_id)
        )
        station = station_result.scalar_one_or_none()

        if station and station.is_exit_station:
            # Mark all packages of this group as delivered
            await romiot_db.execute(
                update(WorkOrder)
                .where(WorkOrder.work_order_group_id == work_order.work_order_group_id)
                .values(delivered=True)
            )

            # Refund priority tokens if priority was assigned
            if work_order.priority and work_order.priority > 0 and work_order.prioritized_by:
                token_result = await romiot_db.execute(
                    select(PriorityToken).where(
                        PriorityToken.user_id == work_order.prioritized_by
                    )
                )
                token_record = token_result.scalar_one_or_none()
                if token_record:
                    token_record.used_tokens = max(0, token_record.used_tokens - work_order.priority)

            await romiot_db.commit()
            await romiot_db.refresh(work_order)

    if all_exited:
        message = f"Tüm paketlerin çıkışı yapıldı! İş emri çıkışı tamamlandı. ({packages_exited}/{total_packages})"
    else:
        message = f"Paket {update_data.package_index} çıkışı yapıldı. ({packages_exited}/{total_packages})"

    return WorkOrderExitResponse(
        work_order=WorkOrderSchema.model_validate(work_order),
        packages_exited=packages_exited,
        total_packages=total_packages,
        all_exited=all_exited,
        message=message
    )


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
    
    base_query = select(WorkOrder).where(
        and_(
            WorkOrder.station_id == station_id,
            WorkOrder.delivered == False,
        )
    )

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
    search_station: str | None = Query(None, description="Search by station name"),
    search_part_number: str | None = Query(None, description="Search by part number"),
    search_order_number: str | None = Query(None, description="Search by order number"),
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db)
):
    """
    Get all work orders for the current user's company with detailed information and pagination.
    Returns work orders from all stations belonging to the user's company.
    Includes station name and user name for each work order.
    Pagination is applied to grouped work orders (by work_order_group_id), not individual entries.
    Delivered work orders are excluded from the list.
    Requires role 'atolye:<company>:operator', 'atolye:<company>:yonetici', 'atolye:<company>:musteri', or 'atolye:<company>:satinalma'.
    """
    from app.models.romiot_models import Station
    from sqlalchemy import case, desc
    
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
    
    # Build base filter conditions
    base_conditions = [
        WorkOrder.station_id.in_(station_ids),
        WorkOrder.delivered == False,
    ]

    # Apply search filters
    if search_part_number:
        base_conditions.append(WorkOrder.part_number.ilike(f"%{search_part_number}%"))
    if search_order_number:
        base_conditions.append(WorkOrder.aselsan_order_number.ilike(f"%{search_order_number}%"))

    # If searching by station name, filter station_ids
    if search_station:
        filtered_station_ids = [
            sid for sid, sname in station_map.items()
            if search_station.lower() in sname.lower()
        ]
        if not filtered_station_ids:
            return PaginatedWorkOrderResponse(
                items=[], total=0, page=page, page_size=page_size, total_pages=0
            )
        base_conditions = [
            WorkOrder.station_id.in_(filtered_station_ids),
            WorkOrder.delivered == False,
        ]
        if search_part_number:
            base_conditions.append(WorkOrder.part_number.ilike(f"%{search_part_number}%"))
        if search_order_number:
            base_conditions.append(WorkOrder.aselsan_order_number.ilike(f"%{search_order_number}%"))

    # Create a CTE with group metadata using work_order_group_id
    group_metadata_cte = select(
        WorkOrder,
        # Check if this entry is active (no exit_date)
        case((WorkOrder.exit_date.is_(None), 1), else_=0).label('is_active'),
        # Get the action date (exit_date or entrance_date)
        func.coalesce(WorkOrder.exit_date, WorkOrder.entrance_date).label('action_date'),
        # Use window function to get max active status per group
        func.max(case((WorkOrder.exit_date.is_(None), 1), else_=0)).over(
            partition_by=[WorkOrder.work_order_group_id]
        ).label('group_has_active'),
        # Use window function to get max action date per group
        func.max(func.coalesce(WorkOrder.exit_date, WorkOrder.entrance_date)).over(
            partition_by=[WorkOrder.work_order_group_id]
        ).label('group_last_date')
    ).where(
        and_(*base_conditions)
    ).cte('group_metadata')
    
    # Assign a dense rank to each group, sorted by priority descending first
    ranked_groups_cte = select(
        group_metadata_cte,
        func.dense_rank().over(
            order_by=[
                desc(group_metadata_cte.c.priority),
                desc(group_metadata_cte.c.group_has_active),
                desc(group_metadata_cte.c.group_last_date)
            ]
        ).label('group_rank')
    ).cte('ranked_groups')
    
    # Get total number of unique groups for pagination
    total_groups_query = select(func.count(func.distinct(ranked_groups_cte.c.work_order_group_id)))
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
        ranked_groups_cte.c.work_order_group_id,
        ranked_groups_cte.c.main_customer,
        ranked_groups_cte.c.sector,
        ranked_groups_cte.c.company_from,
        ranked_groups_cte.c.aselsan_order_number,
        ranked_groups_cte.c.order_item_number,
        ranked_groups_cte.c.part_number,
        ranked_groups_cte.c.quantity,
        ranked_groups_cte.c.total_quantity,
        ranked_groups_cte.c.package_index,
        ranked_groups_cte.c.total_packages,
        ranked_groups_cte.c.priority,
        ranked_groups_cte.c.prioritized_by,
        ranked_groups_cte.c.delivered,
        ranked_groups_cte.c.target_date,
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
    
    # Build station exit flag map
    station_exit_map = {station.id: station.is_exit_station for station in stations}

    # Build detailed work order list from SQL rows
    detailed_work_orders = []
    for row in paginated_work_orders:
        detailed_work_orders.append(WorkOrderDetail(
            id=row.id,
            station_id=row.station_id,
            station_name=station_map.get(row.station_id, "Unknown"),
            is_exit_station=station_exit_map.get(row.station_id, False),
            user_id=row.user_id,
            user_name=user_map.get(row.user_id, "Unknown"),
            work_order_group_id=row.work_order_group_id,
            main_customer=row.main_customer,
            sector=row.sector,
            company_from=row.company_from,
            aselsan_order_number=row.aselsan_order_number,
            order_item_number=row.order_item_number,
            part_number=row.part_number,
            quantity=row.quantity,
            total_quantity=row.total_quantity,
            package_index=row.package_index,
            total_packages=row.total_packages,
            priority=row.priority,
            prioritized_by=row.prioritized_by,
            delivered=row.delivered,
            target_date=row.target_date,
            entrance_date=row.entrance_date,
            exit_date=row.exit_date
        ))
    
    return PaginatedWorkOrderResponse(
        items=detailed_work_orders,
        total=len(detailed_work_orders),
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )
