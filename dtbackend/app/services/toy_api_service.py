import logging
from types import SimpleNamespace

import httpx
from sqlalchemy import select

from app.core.database import RomiotAsyncSessionLocal
from app.models.romiot_models import (
    Company,
    CompanyIntegration,
    Station,
    WorkOrder,
)
from app.schemas.order_pair import OrderPair

logger = logging.getLogger(__name__)


def _build_payload_item(
    work_order,
    station,
    pair: OrderPair,
    mes_order_id: str,
    subcontractor_id: str | None,
    source_company: str,
) -> dict:
    return {
        "AselsanOrderCode": pair.aselsan_order_number,
        "WorkOrderItemNo": pair.order_item_number,
        "ProductCode": work_order.part_number,
        "Mes_ProductCode": work_order.part_number,
        "RevisionNo": work_order.revision_number,
        "Mes_MachineGroup": str(station.station_order_code) if station.station_order_code is not None else None,
        "OperationCode": str(station.station_order_code) if station.station_order_code is not None else None,
        "OperationDesc": station.name,
        "Mes_OrderId": mes_order_id,
        "SubcontractorWorkOrderNo": work_order.work_order_group_id,
        # SubcontractorID = company_from's code (resolved by the caller from
        # work_orders.company_from_id); SourceCompany = the target company name.
        "SubcontractorID": subcontractor_id,
        "SourceCompany": source_company,
        "ActualStartDate": work_order.entrance_date.isoformat() if work_order.entrance_date else None,
        "ActualEndDate": work_order.exit_date.isoformat() if work_order.exit_date else None,
        "PlannedQuantity": work_order.quantity,
        "WorkOrderAmount": work_order.total_quantity,
        "ActualQuantity": work_order.exited_quantity,
        "MES_CreatedDate": work_order.qr_created_at.isoformat() if work_order.qr_created_at else None,
        "NeedDate": work_order.target_date.isoformat() if work_order.target_date else None,
        "AselsanSectorCode": work_order.sector,
    }


async def _post_one(api_url: str, api_key: str, payload: dict, work_order_id: int) -> bool:
    """POST one payload. Returns True on a 2xx response, False on a non-2xx
    response or any exception. Never raises."""
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            response = await client.post(
                api_url,
                json=payload,
                headers={"Authorization": api_key, "Content-Type": "application/json"},
            )
            if not response.is_success:
                logger.error(
                    "Mekasan API error %s for work_order_id=%s: %s",
                    response.status_code, work_order_id, response.text,
                )
                return False
            return True
    except Exception as exc:
        logger.error("Mekasan API call failed for work_order_id=%s: %s", work_order_id, exc)
        return False


def _station_snapshot(rows: list) -> SimpleNamespace:
    """Combine one station's package rows (same group + station) into a single
    row-like object for _build_payload_item.

    entrance_date = earliest entrance; exit_date = latest exit, but only once
    every package has exited (else None); quantity / exited_quantity are summed
    over the scanned packages. Group-level fields come from the first row."""
    base = rows[0]
    entrances = [r.entrance_date for r in rows if r.entrance_date is not None]
    all_exited = all(r.exit_date is not None for r in rows)
    return SimpleNamespace(
        id=base.id,
        work_order_group_id=base.work_order_group_id,
        part_number=base.part_number,
        revision_number=base.revision_number,
        total_quantity=base.total_quantity,
        qr_created_at=base.qr_created_at,
        target_date=base.target_date,
        sector=base.sector,
        entrance_date=min(entrances) if entrances else None,
        exit_date=max(r.exit_date for r in rows) if all_exited else None,
        quantity=sum(r.quantity for r in rows),
        exited_quantity=sum(r.exited_quantity for r in rows),
    )


async def send_production_order(
    group_rows: list,
    api_url: str,
    api_key: str,
    company: str,
    pairs: list[OrderPair],
    subcontractor_id: str | None = None,
) -> bool:
    """
    Fire-and-forget Mekasan push of a whole work order group.

    `group_rows` is every (WorkOrder, Station) scan row of ONE group. Sends ONE
    POST whose `data` holds one item per station x pair, all with
    Mes_OrderId = "{group_id}". A station's packages are combined by
    _station_snapshot; stations keep the order of their first row.

    Toy replaces by (SubcontractorID, Mes_OrderId) — it deletes the existing
    rows and inserts the request's items in a single transaction — so each push
    must carry the full group: anything left out is deleted. Separate parallel
    POSTs with the same id would race on that delete-then-insert.

    Returns the POST result: True on 2xx, False otherwise.
    """
    if not group_rows or not pairs:
        logger.warning(
            "send_production_order skipped: %d rows, %d pairs",
            len(group_rows), len(pairs),
        )
        return False

    by_station: dict[int, tuple] = {}
    for work_order, station in group_rows:
        by_station.setdefault(station.id, (station, []))[1].append(work_order)

    first = group_rows[0][0]
    items = [
        _build_payload_item(
            _station_snapshot(rows), station, pair,
            first.work_order_group_id, subcontractor_id, company,
        )
        for station, rows in by_station.values()
        for pair in pairs
    ]
    return await _post_one(api_url, api_key, {"company": company, "data": items}, first.id)


async def _resolve_pairs(db, work_order_group_id: str) -> list[OrderPair]:
    """Canonical pairs for a group. Delegates to the endpoint's `_pairs_for_group`
    via a lazy import — a top-level import would be circular (the endpoint module
    imports this service)."""
    from app.api.v1.endpoints.romiot.station.work_order import _pairs_for_group
    return await _pairs_for_group(db, work_order_group_id)


async def _resolve_subcontractor_id(db, company_from_id) -> str | None:
    """Company.code for the row's company_from_id (sent as SubcontractorID).
    Short-circuits to None when the row has no company_from_id."""
    if company_from_id is None:
        return None
    result = await db.execute(select(Company.code).where(Company.id == company_from_id))
    return result.scalar_one_or_none()


async def _load_group_rows(db, work_order_group_id: str, company: str) -> list:
    """Every (WorkOrder, Station) scan row of a group at `company`'s stations,
    oldest first."""
    result = await db.execute(
        select(WorkOrder, Station)
        .join(Station, WorkOrder.station_id == Station.id)
        .where(
            WorkOrder.work_order_group_id == work_order_group_id,
            Station.company == company,
        )
        .order_by(WorkOrder.id)
    )
    return [tuple(row) for row in result.all()]


async def _push_one_work_order(db, work_order, integration) -> bool:
    """Push the current state of the row's WHOLE group and record `sent` on
    every row of that group. Returns the push result. Assumes `integration`
    (api_url, api_key, company) is the integration for the row's company."""
    group_rows = await _load_group_rows(db, work_order.work_order_group_id, integration.company)
    if not group_rows:
        work_order.sent = False
        return False
    pairs = await _resolve_pairs(db, work_order.work_order_group_id)
    subcontractor_id = await _resolve_subcontractor_id(db, work_order.company_from_id)
    ok = await send_production_order(
        group_rows, integration.api_url, integration.api_key,
        integration.company, pairs, subcontractor_id,
    )
    for row, _station in group_rows:
        row.sent = ok
    work_order.sent = ok
    return ok


async def push_and_sync(work_order_id: int) -> None:
    """Background entrypoint dispatched after a scan. Owns its own session.

    Pushes the current row's group to Toy and records `sent`, then sweeps up to
    20 `sent=false` rows for the SAME company (oldest first) and re-pushes their
    groups (each group once).
    Re-pushing is safe: Toy replaces rows by (SubcontractorID, Mes_OrderId).
    Never raises."""
    try:
        async with RomiotAsyncSessionLocal() as db:
            work_order = await db.get(WorkOrder, work_order_id)
            if work_order is None:
                return
            station = await db.get(Station, work_order.station_id)
            if station is None:
                return
            integration_result = await db.execute(
                select(CompanyIntegration).where(CompanyIntegration.company == station.company)
            )
            integration = integration_result.scalar_one_or_none()
            if not (integration and integration.api_url and integration.api_key):
                return

            await _push_one_work_order(db, work_order, integration)

            unsent_result = await db.execute(
                select(WorkOrder)
                .join(Station, WorkOrder.station_id == Station.id)
                .where(
                    Station.company == integration.company,
                    WorkOrder.sent == False,  # noqa: E712 — SQLAlchemy boolean comparison
                    WorkOrder.id != work_order.id,
                )
                .order_by(WorkOrder.id)
                .limit(20)
            )
            for row in unsent_result.scalars().all():
                if row.sent:   # already went out with an earlier push of its group
                    continue
                await _push_one_work_order(db, row, integration)

            await db.commit()
    except Exception as exc:
        logger.error("push_and_sync failed for work_order_id=%s: %s", work_order_id, exc)
