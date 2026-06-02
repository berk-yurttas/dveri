from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.auth import check_station_operator_role
from app.core.auth import check_authenticated
from app.core.database import get_postgres_db, get_romiot_db
from app.models.romiot_models import Station, WorkOrder, WorkOrderRoute
from app.models.postgres_models import User as PostgresUser
from app.schemas.user import User
from app.schemas.work_order_route import (
    WorkOrderRouteCreate,
    WorkOrderRoutePosition,
    WorkOrderRouteResponse,
    WorkOrderRouteUpdate,
)
from app.services.user_service import UserService

router = APIRouter()


async def _company_for_group(romiot_db: AsyncSession, group_id: str) -> str | None:
    """Returns the (single) company that owns the group's existing stations."""
    result = await romiot_db.execute(
        select(Station.company)
        .join(WorkOrder, WorkOrder.station_id == Station.id)
        .where(WorkOrder.work_order_group_id == group_id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _earliest_entry_station_id(romiot_db: AsyncSession, group_id: str) -> int | None:
    """Returns the station_id of the earliest entrance scan for the group."""
    result = await romiot_db.execute(
        select(WorkOrder.station_id)
        .where(WorkOrder.work_order_group_id == group_id)
        .order_by(WorkOrder.entrance_date.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _validate_station_ids(
    romiot_db: AsyncSession,
    company: str,
    station_ids: list[int],
) -> list[Station]:
    """Validates uniqueness, all-belong-to-company, last-is-exit (or company has none).
    Returns the Station rows in the order matching station_ids."""
    if len(set(station_ids)) != len(station_ids):
        raise HTTPException(status_code=400, detail="Aynı atölye birden fazla seçilemez.")

    stations_result = await romiot_db.execute(
        select(Station).where(Station.id.in_(station_ids), Station.company == company)
    )
    stations_by_id = {s.id: s for s in stations_result.scalars().all()}
    if len(stations_by_id) != len(station_ids):
        raise HTTPException(status_code=400, detail="Bir veya daha fazla atölye bu şirkete ait değil.")

    company_exit_check = await romiot_db.execute(
        select(Station.id).where(Station.company == company, Station.is_exit_station == True).limit(1)
    )
    company_has_exit = company_exit_check.scalar_one_or_none() is not None
    if company_has_exit:
        last_station = stations_by_id[station_ids[-1]]
        if not last_station.is_exit_station:
            raise HTTPException(
                status_code=400,
                detail="Rota bir Çıkış Atölyesinde bitmelidir.",
            )

    return [stations_by_id[sid] for sid in station_ids]


def _build_response(group_id: str, ordered_stations: list[Station]) -> WorkOrderRouteResponse:
    return WorkOrderRouteResponse(
        work_order_group_id=group_id,
        positions=[
            WorkOrderRoutePosition(position=i, station_id=s.id, station_name=s.name)
            for i, s in enumerate(ordered_stations)
        ],
    )


@router.post("/", response_model=WorkOrderRouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(
    body: WorkOrderRouteCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db),
):
    """Create a route for a work order group.

    Position 0 is pinned. The pin source depends on the caller's role:
      - `atolye:operator`: position 0 = operator's station (looked up from
        their user record's `workshop_id`).
      - `atolye:yonetici` (creating a route for a grandfathered group):
        position 0 = earliest historical entrance station for the group.
    Conflicts with an existing route → 409.
    """
    role_values = current_user.role if isinstance(current_user.role, list) else []
    is_operator = "atolye:operator" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    if not (is_operator or is_yonetici):
        raise HTTPException(status_code=403, detail="Operatör veya yönetici yetkisi gereklidir.")

    # Conflict guard
    existing_check = await romiot_db.execute(
        select(WorkOrderRoute.id).where(WorkOrderRoute.work_order_group_id == body.work_order_group_id).limit(1)
    )
    if existing_check.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Bu grup için zaten bir rota tanımlı.")

    company = await _company_for_group(romiot_db, body.work_order_group_id)
    if company is None:
        raise HTTPException(status_code=400, detail="Bu iş emri grubu için tarama kaydı bulunamadı.")

    if is_operator:
        pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
        if pg_user is None or pg_user.workshop_id is None:
            raise HTTPException(status_code=403, detail="Operatörün atölyesi bulunamadı.")
        expected_first = pg_user.workshop_id
    else:
        # is_yonetici (grandfathered group flow)
        expected_first = await _earliest_entry_station_id(romiot_db, body.work_order_group_id)
        if expected_first is None:
            raise HTTPException(status_code=400, detail="Bu grubun geçmiş tarama kaydı bulunamadı.")

    if body.station_ids[0] != expected_first:
        raise HTTPException(status_code=400, detail="İlk atölye geçerli giriş atölyesiyle eşleşmiyor.")

    ordered_stations = await _validate_station_ids(romiot_db, company, body.station_ids)

    pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
    creator_id = pg_user.id if pg_user else 0

    for i, station in enumerate(ordered_stations):
        romiot_db.add(WorkOrderRoute(
            work_order_group_id=body.work_order_group_id,
            position=i,
            station_id=station.id,
            created_by_user_id=creator_id,
        ))
    await romiot_db.commit()

    return _build_response(body.work_order_group_id, ordered_stations)


@router.put("/{work_order_group_id}", response_model=WorkOrderRouteResponse)
async def update_route(
    work_order_group_id: str,
    body: WorkOrderRouteUpdate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Replace a route for a group. Yönetici-only. Position 0 cannot change."""
    role_values = current_user.role if isinstance(current_user.role, list) else []
    if "atolye:yonetici" not in role_values:
        raise HTTPException(status_code=403, detail="Yönetici yetkisi gereklidir.")

    existing_rows_result = await romiot_db.execute(
        select(WorkOrderRoute).where(WorkOrderRoute.work_order_group_id == work_order_group_id).order_by(WorkOrderRoute.position)
    )
    existing_rows = existing_rows_result.scalars().all()
    if not existing_rows:
        raise HTTPException(status_code=404, detail="Bu grup için tanımlı rota yok.")

    if body.station_ids[0] != existing_rows[0].station_id:
        raise HTTPException(status_code=400, detail="Giriş istasyonu değiştirilemez.")

    company = await _company_for_group(romiot_db, work_order_group_id)
    if company is None:
        raise HTTPException(status_code=400, detail="Bu iş emri grubu için tarama kaydı bulunamadı.")

    ordered_stations = await _validate_station_ids(romiot_db, company, body.station_ids)

    # Replace in a single transaction
    for row in existing_rows:
        await romiot_db.delete(row)
    await romiot_db.flush()

    for i, station in enumerate(ordered_stations):
        romiot_db.add(WorkOrderRoute(
            work_order_group_id=work_order_group_id,
            position=i,
            station_id=station.id,
            created_by_user_id=existing_rows[0].created_by_user_id,
        ))
    await romiot_db.commit()

    return _build_response(work_order_group_id, ordered_stations)


@router.get("/{work_order_group_id}", response_model=WorkOrderRouteResponse)
async def get_route(
    work_order_group_id: str,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Read the route for a group. Returns 404 if grandfathered (no route)."""
    role_values = current_user.role if isinstance(current_user.role, list) else []
    has_atolye_role = any(
        isinstance(r, str) and r.startswith("atolye:") for r in role_values
    )
    if not has_atolye_role:
        raise HTTPException(status_code=403, detail="Atölye yetkisi gereklidir.")

    rows_result = await romiot_db.execute(
        select(WorkOrderRoute, Station.name)
        .join(Station, Station.id == WorkOrderRoute.station_id)
        .where(WorkOrderRoute.work_order_group_id == work_order_group_id)
        .order_by(WorkOrderRoute.position)
    )
    rows = rows_result.all()
    if not rows:
        raise HTTPException(status_code=404, detail="Bu grup için tanımlı rota yok.")

    positions = [
        WorkOrderRoutePosition(position=route.position, station_id=route.station_id, station_name=name)
        for (route, name) in rows
    ]
    return WorkOrderRouteResponse(work_order_group_id=work_order_group_id, positions=positions)
