"""Manually trigger Toy/Mekasan API sync for all unsent work-order rows.

For each company that has pending (sent=false) rows AND a configured
CompanyIntegration, this script calls push_and_sync for the oldest unsent
row. push_and_sync then sweeps up to 20 unsent rows for that company in one
pass — so the script just needs one entry-point row per company to drain the
entire backlog (20 rows per call; run repeatedly if the backlog is larger).

Usage:
    python -m scripts.sync_toy_api            # dry-run by default
    python -m scripts.sync_toy_api --run      # actually push
"""
import asyncio
import logging
import sys

from sqlalchemy import select

from app.core.database import RomiotAsyncSessionLocal
from app.models.romiot_models import CompanyIntegration, Station, WorkOrder
from app.services.toy_api_service import push_and_sync

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def main(dry_run: bool) -> None:
    async with RomiotAsyncSessionLocal() as db:
        # Find the oldest unsent row per company that has a live integration.
        unsent_result = await db.execute(
            select(WorkOrder)
            .join(Station, WorkOrder.station_id == Station.id)
            .join(CompanyIntegration, CompanyIntegration.company == Station.company)
            .where(
                WorkOrder.sent == False,  # noqa: E712
                CompanyIntegration.api_url.isnot(None),
                CompanyIntegration.api_key.isnot(None),
            )
            .order_by(Station.company, WorkOrder.id)
        )
        rows = unsent_result.scalars().all()

    # Deduplicate: one entry-point per company (oldest id). push_and_sync sweeps
    # the rest (LIMIT 20) internally.
    seen: set[str] = set()
    entry_points: list[int] = []
    for row in rows:
        station_company_result = await _company_for_station(row.station_id)
        if station_company_result and station_company_result not in seen:
            seen.add(station_company_result)
            entry_points.append(row.id)

    if not entry_points:
        logger.info("No unsent rows with a configured integration found — nothing to do.")
        return

    logger.info("Unsent rows found for %d company/companies.", len(entry_points))
    for wid in entry_points:
        if dry_run:
            logger.info("DRY RUN — would call push_and_sync(%d)", wid)
        else:
            logger.info("Calling push_and_sync(%d) ...", wid)
            await push_and_sync(wid)
            logger.info("push_and_sync(%d) done.", wid)

    if dry_run:
        logger.info("Dry run complete. Pass --run to actually push.")


async def _company_for_station(station_id: int) -> str | None:
    async with RomiotAsyncSessionLocal() as db:
        result = await db.execute(
            select(Station.company).where(Station.id == station_id)
        )
        return result.scalar_one_or_none()


if __name__ == "__main__":
    dry_run = "--run" not in sys.argv
    asyncio.run(main(dry_run=dry_run))
