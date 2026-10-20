"""Re-send existing atolye work_orders rows to the Toy/Mekasan API.

Use after a change to the payload or Mes_OrderId format, so Toy receives every
row again in the new shape. Each row is pushed with the same code path as a
live scan (toy_api_service._push_one_work_order), which also records the
result in work_orders.sent.

Only rows whose station company has a CompanyIntegration with api_url and
api_key are considered. Rows are pushed oldest first (by id), so for a group
the most recent scan is the last one Toy receives.

Dry run by default — prints what would be sent. Pass --send to actually POST.

Run from the dtbackend directory (so .env / app.* import):

    python -m scripts.resend_toy_work_orders
    python -m scripts.resend_toy_work_orders --company MEKASAN
    python -m scripts.resend_toy_work_orders --group WO-20260205-A7K9M2 --send
    python -m scripts.resend_toy_work_orders --send
"""
import argparse
import asyncio

from sqlalchemy import select

from app.core.database import RomiotAsyncSessionLocal
from app.models.romiot_models import CompanyIntegration, Station, WorkOrder
from app.services.toy_api_service import _push_one_work_order

COMMIT_EVERY = 50


async def resend(
    db,
    *,
    company: str | None = None,
    group: str | None = None,
    send: bool = False,
) -> dict:
    """Push every matching row (or just count them when send=False).
    Returns {"matched", "sent", "failed"}."""
    integ_query = select(CompanyIntegration)
    if company:
        integ_query = integ_query.where(CompanyIntegration.company == company)
    integ_result = await db.execute(integ_query)
    integrations = {
        i.company: i
        for i in integ_result.scalars().all()
        if i.api_url and i.api_key
    }
    summary = {"matched": 0, "sent": 0, "failed": 0}
    if not integrations:
        print("Kullanılabilir Toy entegrasyonu bulunamadı.")
        return summary

    rows_query = (
        select(WorkOrder, Station.company)
        .join(Station, WorkOrder.station_id == Station.id)
        .where(Station.company.in_(list(integrations)))
        .order_by(WorkOrder.id)
    )
    if group:
        rows_query = rows_query.where(WorkOrder.work_order_group_id == group)
    rows = (await db.execute(rows_query)).all()
    summary["matched"] = len(rows)

    for i, (work_order, row_company) in enumerate(rows, start=1):
        if not send:
            print(f"[dry-run] id={work_order.id} group={work_order.work_order_group_id} company={row_company}")
            continue
        ok = await _push_one_work_order(db, work_order, integrations[row_company])
        summary["sent" if ok else "failed"] += 1
        print(f"{i}/{len(rows)} id={work_order.id} group={work_order.work_order_group_id} -> {'OK' if ok else 'FAILED'}")
        if i % COMMIT_EVERY == 0:
            await db.commit()

    if send:
        await db.commit()
    return summary


async def _main(args) -> None:
    async with RomiotAsyncSessionLocal() as db:
        summary = await resend(db, company=args.company, group=args.group, send=args.send)
    print(f"Eşleşen: {summary['matched']}, gönderilen: {summary['sent']}, başarısız: {summary['failed']}")
    if not args.send:
        print("Dry run — göndermek için --send ekleyin.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--company", help="Yalnızca bu firmanın entegrasyonu")
    parser.add_argument("--group", help="Yalnızca bu work_order_group_id")
    parser.add_argument("--send", action="store_true", help="Gerçekten gönder (varsayılan: dry run)")
    asyncio.run(_main(parser.parse_args()))
