import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.auth import check_station_operator_role
from app.core.auth import check_authenticated
from app.core.database import get_postgres_db, get_romiot_db
from app.models.postgres_models import User as PostgresUser
from app.models.romiot_models import CompanyIntegration, PriorityToken, QRCodeData, Station, WorkOrder
from app.schemas.user import User
from app.services.mekasan_service import send_production_order
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


def _extract_musteri_company_from_roles(role_values: list[str] | None) -> str | None:
    if not role_values:
        return None
    prefix = "atolye:musteri_company:"
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value:
                return value
    return None


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
    Requires role 'atolye:operator' where department matches the station's company.
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

    # Check if any package from this group is currently active at a different station
    active_at_other_station_result = await romiot_db.execute(
        select(WorkOrder.station_id, Station.name).join(
            Station, WorkOrder.station_id == Station.id
        ).where(
            and_(
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrder.station_id != work_order_data.station_id,
                WorkOrder.exit_date.is_(None),
            )
        ).limit(1)
    )
    active_at_other = active_at_other_station_result.first()

    if active_at_other:
        other_station_name = active_at_other[1]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bu iş emri grubu şu anda \"{other_station_name}\" atölyesinde aktif. Önce mevcut atölyeden çıkış yapılmalıdır."
        )

    # Inherit priority from existing records in the same group
    existing_priority = 0
    existing_prioritized_by = None
    existing_group_result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrder.priority > 0,
                WorkOrder.prioritized_by.isnot(None),
            )
        ).limit(1)
    )
    existing_group_record = existing_group_result.scalar_one_or_none()
    if existing_group_record:
        existing_priority = existing_group_record.priority
        existing_prioritized_by = existing_group_record.prioritized_by

    # Look up QR creation time if a qr_code short code was provided
    qr_created_at = None
    if work_order_data.qr_code:
        qr_record_result = await romiot_db.execute(
            select(QRCodeData).where(QRCodeData.code == work_order_data.qr_code)
        )
        qr_record = qr_record_result.scalar_one_or_none()
        if qr_record:
            qr_created_at = qr_record.created_at

    # Create new work order entry for this package
    new_work_order = WorkOrder(
        station_id=work_order_data.station_id,
        user_id=pg_user_id,
        work_order_group_id=work_order_data.work_order_group_id,
        main_customer=work_order_data.main_customer,
        sector=work_order_data.sector,
        company_from=work_order_data.company_from,
        teklif_number=work_order_data.teklif_number,
        aselsan_order_number=work_order_data.aselsan_order_number,
        order_item_number=work_order_data.order_item_number,
        part_number=work_order_data.part_number,
        revision_number=work_order_data.revision_number,
        quantity=work_order_data.quantity,
        total_quantity=work_order_data.total_quantity,
        package_index=work_order_data.package_index,
        total_packages=work_order_data.total_packages,
        target_date=work_order_data.target_date,
        qr_code=work_order_data.qr_code,
        qr_created_at=qr_created_at,
        exit_date=None,
        priority=existing_priority,
        prioritized_by=existing_prioritized_by,
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

    # Fire-and-forget: push entrance event to external integration (e.g. Mekasan)
    station_result = await romiot_db.execute(
        select(Station).where(Station.id == work_order_data.station_id)
    )
    station_obj = station_result.scalar_one_or_none()
    if station_obj:
        integration_result = await romiot_db.execute(
            select(CompanyIntegration).where(CompanyIntegration.company == station_obj.company)
        )
        integration = integration_result.scalar_one_or_none()
        if integration and integration.api_url and integration.api_key:
            asyncio.create_task(
                send_production_order(new_work_order, station_obj, integration.api_url, integration.api_key, station_obj.company)
            )

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
    Requires role 'atolye:operator' where department matches the station's company.
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
            # Look up priority from any record in the group (current station's record may have default 0)
            priority_record_result = await romiot_db.execute(
                select(WorkOrder).where(
                    and_(
                        WorkOrder.work_order_group_id == work_order.work_order_group_id,
                        WorkOrder.priority > 0,
                        WorkOrder.prioritized_by.isnot(None),
                    )
                ).limit(1)
            )
            priority_record = priority_record_result.scalar_one_or_none()

            if priority_record:
                token_result = await romiot_db.execute(
                    select(PriorityToken).where(
                        PriorityToken.user_id == priority_record.prioritized_by
                    )
                )
                token_record = token_result.scalar_one_or_none()
                if token_record:
                    token_record.used_tokens = max(0, token_record.used_tokens - priority_record.priority)

            await romiot_db.commit()
            await romiot_db.refresh(work_order)

    if all_exited:
        message = f"Tüm paketlerin çıkışı yapıldı! İş emri çıkışı tamamlandı. ({packages_exited}/{total_packages})"
    else:
        message = f"Paket {update_data.package_index} çıkışı yapıldı. ({packages_exited}/{total_packages})"

    # Fire-and-forget: push exit event to external integration (e.g. Mekasan)
    exit_station_result = await romiot_db.execute(
        select(Station).where(Station.id == update_data.station_id)
    )
    exit_station_obj = exit_station_result.scalar_one_or_none()
    if exit_station_obj:
        exit_integration_result = await romiot_db.execute(
            select(CompanyIntegration).where(CompanyIntegration.company == exit_station_obj.company)
        )
        exit_integration = exit_integration_result.scalar_one_or_none()
        if exit_integration and exit_integration.api_url and exit_integration.api_key:
            asyncio.create_task(
                send_production_order(work_order, exit_station_obj, exit_integration.api_url, exit_integration.api_key, exit_station_obj.company)
            )

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
    Requires role 'atolye:operator' where department matches the station's company.
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
            detail="Geçersiz durum filtresi. 'Entrance' veya 'Exit' olmalıdır"
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
    filter_company: str | None = Query(None, description="Filter by company (ASELSAN satinalma only)"),
    filter_customer: str | None = Query(None, description="OR search across company_from, main_customer, sector"),
    filter_priority_min: int | None = Query(None, ge=1, le=5, description="Minimum priority level"),
    filter_days_min: int | None = Query(None, ge=0, description="Min days the group has been in its current station"),
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db)
):
    """
    Get all work orders for the current user's company with detailed information and pagination.
    Returns work orders from all stations belonging to the user's company.
    ASELSAN satinalma users can use filter_company to view work orders from other companies.
    Includes station name and user name for each work order.
    Pagination is applied to grouped work orders (by work_order_group_id), not individual entries.
    Delivered work orders are excluded from the list.
    Requires role 'atolye:operator', 'atolye:yonetici', 'atolye:musteri', or 'atolye:satinalma'.
    """
    from app.models.romiot_models import Station
    from sqlalchemy import case, desc
    
    # Company is now taken from department; roles are company-independent
    role_values = current_user.role if current_user.role and isinstance(current_user.role, list) else []
    has_atolye_role = any(
        role in {"atolye:operator", "atolye:yonetici", "atolye:musteri", "atolye:satinalma"}
        for role in role_values
    )

    department_value = (current_user.department or "").strip()
    company = department_value
    musteri_department = None
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    if is_musteri:
        musteri_department = _extract_musteri_company_from_roles(role_values)
        if not musteri_department and ":" in department_value:
            # Backward compatibility for old department format XXX:YYY
            company, musteri_department = department_value.split(":", 1)
            company = company.strip()
            musteri_department = musteri_department.strip()
        if not musteri_department:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Müşteri şirket bilgisi rol üzerinde bulunamadı"
            )

    is_aselsan_satinalma = (
        "atolye:satinalma" in role_values
        and company.upper() == "ASELSAN"
    )
    
    if not has_atolye_role or not company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kullanıcının atölye yetkisi bulunmamaktadır"
        )
    
    # Determine which company's work orders to show
    target_company = company
    if is_aselsan_satinalma and filter_company:
        target_company = filter_company
    
    # Get all stations for target company
    stations_result = await romiot_db.execute(
        select(Station).where(Station.company == target_company)
    )
    stations = stations_result.scalars().all()
    station_ids = [station.id for station in stations]
    
    if not station_ids and not (is_yonetici or is_musteri):
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
    if is_musteri and musteri_department:
        base_conditions.append(WorkOrder.company_from == musteri_department)

    # Apply search filters (OR when both provided, AND individually)
    from sqlalchemy import or_
    if search_part_number and search_order_number:
        base_conditions.append(or_(
            WorkOrder.part_number.ilike(f"%{search_part_number}%"),
            WorkOrder.aselsan_order_number.ilike(f"%{search_order_number}%"),
        ))
    elif search_part_number:
        base_conditions.append(WorkOrder.part_number.ilike(f"%{search_part_number}%"))
    elif search_order_number:
        base_conditions.append(WorkOrder.aselsan_order_number.ilike(f"%{search_order_number}%"))

    # Column filters
    from sqlalchemy import or_
    if filter_customer:
        base_conditions.append(or_(
            WorkOrder.company_from.ilike(f"%{filter_customer}%"),
            WorkOrder.main_customer.ilike(f"%{filter_customer}%"),
            WorkOrder.sector.ilike(f"%{filter_customer}%"),
        ))
    if filter_priority_min is not None:
        base_conditions.append(WorkOrder.priority >= filter_priority_min)
    if filter_days_min is not None:
        from sqlalchemy import text as sa_text
        threshold_expr = func.now() - sa_text(f"INTERVAL '{filter_days_min} days'")
        days_subquery = select(WorkOrder.work_order_group_id).where(
            and_(
                WorkOrder.exit_date.is_(None),
                WorkOrder.entrance_date <= threshold_expr,
            )
        ).distinct()
        base_conditions.append(WorkOrder.work_order_group_id.in_(days_subquery))

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
        if is_musteri and musteri_department:
            base_conditions.append(WorkOrder.company_from == musteri_department)
        if search_part_number and search_order_number:
            base_conditions.append(or_(
                WorkOrder.part_number.ilike(f"%{search_part_number}%"),
                WorkOrder.aselsan_order_number.ilike(f"%{search_order_number}%"),
            ))
        elif search_part_number:
            base_conditions.append(WorkOrder.part_number.ilike(f"%{search_part_number}%"))
        elif search_order_number:
            base_conditions.append(WorkOrder.aselsan_order_number.ilike(f"%{search_order_number}%"))

    # Yönetici and müşteri can also see created-but-not-scanned work orders from QR store.
    # To include those groups in pagination, use Python-side grouping for these roles.
    if is_yonetici or is_musteri:
        scanned_result = await romiot_db.execute(
            select(WorkOrder).where(and_(*base_conditions))
        )
        scanned_work_orders = scanned_result.scalars().all()

        scanned_group_ids = {wo.work_order_group_id for wo in scanned_work_orders}
        user_ids = list({wo.user_id for wo in scanned_work_orders if wo.user_id is not None})
        user_map: dict[int, str | None] = {}
        if user_ids:
            users_result = await postgres_db.execute(
                select(PostgresUser).where(PostgresUser.id.in_(user_ids))
            )
            users = users_result.scalars().all()
            user_map = {user.id: user.name for user in users}

        station_exit_map = {station.id: station.is_exit_station for station in stations}
        grouped_entries: dict[str, list[WorkOrderDetail]] = {}
        for wo in scanned_work_orders:
            grouped_entries.setdefault(wo.work_order_group_id, []).append(
                WorkOrderDetail(
                    id=wo.id,
                    station_id=wo.station_id,
                    station_name=station_map.get(wo.station_id, "Unknown"),
                    is_exit_station=station_exit_map.get(wo.station_id, False),
                    user_id=wo.user_id,
                    user_name=user_map.get(wo.user_id, "Unknown"),
                    work_order_group_id=wo.work_order_group_id,
                    main_customer=wo.main_customer,
                    sector=wo.sector,
                    company_from=wo.company_from,
                    teklif_number=wo.teklif_number,
                    aselsan_order_number=wo.aselsan_order_number,
                    order_item_number=wo.order_item_number,
                    part_number=wo.part_number,
                    quantity=wo.quantity,
                    total_quantity=wo.total_quantity,
                    package_index=wo.package_index,
                    total_packages=wo.total_packages,
                    priority=wo.priority,
                    prioritized_by=wo.prioritized_by,
                    delivered=wo.delivered,
                    target_date=wo.target_date,
                    entrance_date=wo.entrance_date,
                    exit_date=wo.exit_date,
                )
            )

        if not search_station:
            qr_rows_result = await romiot_db.execute(
                select(QRCodeData).where(QRCodeData.company == target_company)
            )
            qr_rows = qr_rows_result.scalars().all()
            synthetic_id = -1

            for qr_row in qr_rows:
                try:
                    payload = json.loads(qr_row.data)
                except (json.JSONDecodeError, TypeError, ValueError):
                    continue

                group_id = str(payload.get("work_order_group_id") or "").strip()
                if not group_id or group_id in scanned_group_ids:
                    continue

                company_from = str(payload.get("company_from") or "").strip()
                if is_musteri and musteri_department and company_from != musteri_department:
                    continue

                part_number = str(payload.get("part_number") or "")
                order_number = str(payload.get("aselsan_order_number") or "")
                if search_part_number and search_order_number:
                    if (search_part_number.lower() not in part_number.lower()) and (
                        search_order_number.lower() not in order_number.lower()
                    ):
                        continue
                elif search_part_number and search_part_number.lower() not in part_number.lower():
                    continue
                elif search_order_number and search_order_number.lower() not in order_number.lower():
                    continue

                if filter_customer:
                    lc = filter_customer.lower()
                    if not (
                        lc in company_from.lower()
                        or lc in str(payload.get("main_customer") or "").lower()
                        or lc in str(payload.get("sector") or "").lower()
                    ):
                        continue

                try:
                    quantity = int(payload.get("quantity") or 0)
                    total_quantity = int(payload.get("total_quantity") or 0)
                    package_index = int(payload.get("package_index") or 0)
                    total_packages = int(payload.get("total_packages") or 0)
                except (TypeError, ValueError):
                    continue

                target_date_value = payload.get("target_date")
                target_date = None
                if isinstance(target_date_value, str) and target_date_value:
                    try:
                        target_date = datetime.fromisoformat(target_date_value).date()
                    except ValueError:
                        target_date = None

                grouped_entries.setdefault(group_id, []).append(
                    WorkOrderDetail(
                        id=synthetic_id,
                        station_id=0,
                        station_name="Henüz okutulmadı",
                        is_exit_station=False,
                        user_id=0,
                        user_name=None,
                        work_order_group_id=group_id,
                        main_customer=str(payload.get("main_customer") or ""),
                        sector=str(payload.get("sector") or ""),
                        company_from=company_from,
                        teklif_number=str(payload.get("teklif_number") or "MKS-000000"),
                        aselsan_order_number=order_number,
                        order_item_number=str(payload.get("order_item_number") or ""),
                        part_number=part_number,
                        quantity=quantity,
                        total_quantity=total_quantity,
                        package_index=package_index,
                        total_packages=total_packages,
                        priority=0,
                        prioritized_by=None,
                        delivered=False,
                        target_date=target_date,
                        entrance_date=None,
                        exit_date=None,
                    )
                )
                synthetic_id -= 1

        def _entry_sort_ts(entry: WorkOrderDetail) -> int:
            dt = entry.exit_date or entry.entrance_date
            if not dt:
                return 0
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp())

        for group_id in grouped_entries:
            grouped_entries[group_id].sort(key=_entry_sort_ts, reverse=True)

        sorted_group_ids = sorted(
            grouped_entries.keys(),
            key=lambda gid: (
                -max((entry.priority for entry in grouped_entries[gid]), default=0),
                -int(any(entry.exit_date is None for entry in grouped_entries[gid])),
                -max((_entry_sort_ts(entry) for entry in grouped_entries[gid]), default=0),
            ),
        )

        # Apply column filters on grouped data
        if filter_customer:
            lc = filter_customer.lower()
            sorted_group_ids = [
                gid for gid in sorted_group_ids
                if any(
                    lc in (e.company_from or "").lower()
                    or lc in (e.main_customer or "").lower()
                    or lc in (e.sector or "").lower()
                    for e in grouped_entries[gid]
                )
            ]
        if filter_priority_min is not None:
            sorted_group_ids = [
                gid for gid in sorted_group_ids
                if max((e.priority for e in grouped_entries[gid]), default=0) >= filter_priority_min
            ]
        if filter_days_min is not None:
            now = datetime.now(timezone.utc)
            def _group_days(gid: str) -> int:
                active = [e for e in grouped_entries[gid] if e.exit_date is None and e.entrance_date]
                if not active:
                    return 0
                oldest = min(active, key=lambda e: e.entrance_date)
                dt = oldest.entrance_date
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return (now - dt).days
            sorted_group_ids = [gid for gid in sorted_group_ids if _group_days(gid) >= filter_days_min]

        total_groups = len(sorted_group_ids)
        total_pages = (total_groups + page_size - 1) // page_size if total_groups > 0 else 0
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        selected_group_ids = sorted_group_ids[start_idx:end_idx]

        detailed_work_orders: list[WorkOrderDetail] = []
        for gid in selected_group_ids:
            detailed_work_orders.extend(grouped_entries[gid])

        return PaginatedWorkOrderResponse(
            items=detailed_work_orders,
            total=total_groups,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

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
        ranked_groups_cte.c.teklif_number,
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
            teklif_number=row.teklif_number,
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


@router.get("/companies", response_model=list[str])
async def get_companies(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Get distinct list of companies that have stations.
    Only available for ASELSAN satinalma users.
    """
    company = (current_user.department or "").strip()
    is_aselsan_satinalma = (
        current_user.role
        and isinstance(current_user.role, list)
        and "atolye:satinalma" in current_user.role
        and company.upper() == "ASELSAN"
    )

    if not is_aselsan_satinalma:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem yalnızca ASELSAN satınalma kullanıcıları için geçerlidir"
        )

    result = await romiot_db.execute(
        select(Station.company).distinct().order_by(Station.company)
    )
    companies = [row[0] for row in result.fetchall()]
    return companies
