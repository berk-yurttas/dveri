import logging

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


async def send_production_order(
    work_order,
    station,
    api_url: str,
    api_key: str,
    company: str,
    pairs: list[OrderPair],
    subcontractor_id: str | None = None,
) -> bool:
    """
    Fire-and-forget Mekasan push: ONE POST whose `data` holds one item per pair,
    all with Mes_OrderId = "{group_id}".

    Toy replaces by (SubcontractorID, Mes_OrderId) — it deletes the existing
    rows and inserts the new ones in a single transaction — so sending every
    pair in one request keeps all pairs and lets the next push replace them
    cleanly. Separate parallel POSTs with the same id would race on Toy's
    delete-then-insert (duplicate rows or a 500).

    Returns the POST result: True on 2xx, False otherwise.
    """
    if not pairs:
        logger.warning("send_production_order skipped: empty pairs for work_order_id=%s", work_order.id)
        return False

    mes_order_id = work_order.work_order_group_id
    items = [
        _build_payload_item(work_order, station, pair, mes_order_id, subcontractor_id, company)
        for pair in pairs
    ]
    return await _post_one(api_url, api_key, {"company": company, "data": items}, work_order.id)


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


async def _push_one_work_order(db, work_order, integration) -> bool:
    """Reload a row's station/pairs/subcontractor, push the current state, and
    record `sent`. Returns the push result. Assumes `integration` (api_url,
    api_key, company) is the integration for the row's company."""
    station = await db.get(Station, work_order.station_id)
    if station is None:
        return False
    pairs = await _resolve_pairs(db, work_order.work_order_group_id)
    subcontractor_id = await _resolve_subcontractor_id(db, work_order.company_from_id)
    ok = await send_production_order(
        work_order, station, integration.api_url, integration.api_key,
        integration.company, pairs, subcontractor_id,
    )
    work_order.sent = ok
    return ok


async def push_and_sync(work_order_id: int) -> None:
    """Background entrypoint dispatched after a scan. Owns its own session.

    Pushes the current row's state to Toy and records `sent`, then sweeps up to
    20 `sent=false` rows for the SAME company (oldest first) and re-pushes them.
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
                await _push_one_work_order(db, row, integration)

            await db.commit()
    except Exception as exc:
        logger.error("push_and_sync failed for work_order_id=%s: %s", work_order_id, exc)
