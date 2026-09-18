"""Nightly scheduler for automated report health tests."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.postgres_models import ReportTestRun
from app.services.report_test_service import get_running_run, start_run

logger = logging.getLogger(__name__)
IST = ZoneInfo("Europe/Istanbul")


class ReportTestScheduler:
    _task: asyncio.Task | None = None
    _stop_event: asyncio.Event | None = None
    _interval_seconds = max(15, int(settings.REPORT_TEST_SCHEDULER_INTERVAL_SECONDS))

    @classmethod
    def start(cls) -> None:
        if not settings.REPORT_TEST_SCHEDULER_ENABLED:
            logger.info("Report test scheduler is disabled by configuration")
            return
        if cls._task and not cls._task.done():
            return
        cls._stop_event = asyncio.Event()
        cls._task = asyncio.create_task(cls._run_loop(), name="report-test-scheduler")
        logger.info(
            "Report test scheduler started (interval=%ss, daily=%02d:%02d Europe/Istanbul)",
            cls._interval_seconds,
            settings.REPORT_TEST_SCHEDULE_HOUR,
            settings.REPORT_TEST_SCHEDULE_MINUTE,
        )

    @classmethod
    async def stop(cls) -> None:
        if not cls._task:
            return
        if cls._stop_event:
            cls._stop_event.set()
        cls._task.cancel()
        try:
            await cls._task
        except asyncio.CancelledError:
            pass
        finally:
            cls._task = None
            cls._stop_event = None
        logger.info("Report test scheduler stopped")

    @classmethod
    async def _run_loop(cls) -> None:
        while True:
            try:
                await cls.run_once()
            except Exception:
                logger.exception("Report test scheduler tick failed")

            if not cls._stop_event:
                await asyncio.sleep(cls._interval_seconds)
                continue
            try:
                await asyncio.wait_for(cls._stop_event.wait(), timeout=cls._interval_seconds)
                break
            except asyncio.TimeoutError:
                continue

    @classmethod
    async def run_once(cls) -> bool:
        now = datetime.now(IST)
        target_hour = int(settings.REPORT_TEST_SCHEDULE_HOUR)
        target_minute = int(settings.REPORT_TEST_SCHEDULE_MINUTE)
        scheduled = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        window_end = scheduled + timedelta(seconds=cls._interval_seconds + 5)
        if not (scheduled <= now < window_end):
            return False

        async with AsyncSessionLocal() as db:
            running = await get_running_run(db)
            if running:
                logger.info("Skipping scheduled report tests; a run is already in progress")
                return False

            day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            existing = (
                await db.execute(
                    select(ReportTestRun.id).where(
                        ReportTestRun.trigger == "scheduled",
                        ReportTestRun.created_at >= day_start,
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if existing:
                return False

        await start_run(triggered_by="scheduler", trigger="scheduled")
        logger.info("Scheduled report health test run started")
        return True
