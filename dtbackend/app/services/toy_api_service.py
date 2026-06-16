import asyncio
import logging

import httpx

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


async def _post_one(api_url: str, api_key: str, payload: dict, work_order_id: int) -> None:
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
    except Exception as exc:
        logger.error("Mekasan API call failed for work_order_id=%s: %s", work_order_id, exc)


async def send_production_order(
    work_order,
    station,
    api_url: str,
    api_key: str,
    company: str,
    pairs: list[OrderPair],
    subcontractor_id: str | None = None,
) -> None:
    """
    Fire-and-forget Mekasan push.

    F3:
      - `len(pairs) == 1`: one POST with Mes_OrderId = "{group_id}-{station.id}"
        (unchanged single-pair behavior).
      - `len(pairs) > 1`: N parallel POSTs, each with
        Mes_OrderId = "{group_id}-{station.id}-{sipariş_no}-{kalem_no}".
        The suffix carries BOTH the sipariş no and kalem no so the id stays
        unique even when one order has several line items (same sipariş_no,
        different kalem_no) — the primary multi-pair case. Sipariş-no alone
        would collide there.

    Never raises — logs and swallows.
    """
    if not pairs:
        logger.warning("send_production_order skipped: empty pairs for work_order_id=%s", work_order.id)
        return

    base_id = f"{work_order.work_order_group_id}-{station.id}"

    if len(pairs) == 1:
        item = _build_payload_item(work_order, station, pairs[0], base_id, subcontractor_id, company)
        await _post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id)
        return

    # Multi-pair: N independent POSTs in parallel
    tasks = []
    for pair in pairs:
        mes_order_id = f"{base_id}-{pair.aselsan_order_number}-{pair.order_item_number}"
        item = _build_payload_item(work_order, station, pair, mes_order_id, subcontractor_id, company)
        tasks.append(_post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id))
    await asyncio.gather(*tasks)
