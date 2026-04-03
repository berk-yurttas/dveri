import logging

import httpx

logger = logging.getLogger(__name__)


async def send_production_order(work_order, station, api_url: str, api_key: str, company: str) -> None:
    """
    Sends work order data to the endpoint specified in api_url.
    Fire-and-forget: logs errors but never raises, so caller is never blocked.

    Called after both entrance (exit_date=None, ActualQuantity=0)
    and exit (exit_date set, ActualQuantity=package_quantity).
    """
    payload = {
        "company": company,
        "data": [
            {
                "AselsanOrderCode": work_order.aselsan_order_number,
                "WorkOrderItemNo": work_order.order_item_number,
                "ProductCode": work_order.part_number,
                "Mes_ProductCode": work_order.part_number,
                "RevisionNo": work_order.revision_number,
                "Mes_MachineGroup": str(station.station_order_code) if station.station_order_code is not None else None,
                "OperationDesc": station.name,
                "Mes_OrderId": f"{work_order.qr_code}-{station.id}" if work_order.qr_code else None,
                "SubcontractorWorkOrderNo": work_order.work_order_group_id,
                "ActualStartDate": work_order.entrance_date.isoformat() if work_order.entrance_date else None,
                "ActualEndDate": work_order.exit_date.isoformat() if work_order.exit_date else None,
                "PlannedQuantity": work_order.quantity,
                "WorkOrderAmount": work_order.total_quantity,
                "ActualQuantity": work_order.quantity if work_order.exit_date else 0,
                "MES_CreatedDate": work_order.qr_created_at.isoformat() if work_order.qr_created_at else None,
                "NeedDate": work_order.target_date.isoformat() if work_order.target_date else None,
                "AselsanSectorCode": work_order.sector,
            }
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            response = await client.post(
                api_url,
                json=payload,
                headers={
                    "Authorization": api_key,
                    "Content-Type": "application/json",
                },
            )
            if not response.is_success:
                logger.error(
                    "Mekasan API error %s for work_order_id=%s: %s",
                    response.status_code,
                    work_order.id,
                    response.text,
                )
    except Exception as exc:
        logger.error("Mekasan API call failed for work_order_id=%s: %s", work_order.id, exc)
