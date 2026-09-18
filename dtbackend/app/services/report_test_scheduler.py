"""Daily per-platform scheduler for automated report health tests."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.report_test_schedule import due_schedules, mark_started
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
        logger.info("Report test scheduler started (interval=%ss, Europe/Istanbul)", cls._interval_seconds)

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
        async with AsyncSessionLocal() as db:
            running = await get_running_run(db)
            if running:
                return False
            due = await due_schedules(db, datetime.now(IST))
            if not due:
                return False
            schedule = due[0]
            platform_id = schedule.platform_id
            platform_code = schedule.platform.code if schedule.platform else str(platform_id)

        try:
            await start_run(
                triggered_by=f"scheduler:{platform_code}",
                trigger="scheduled",
                platform_id=platform_id,
            )
        except RuntimeError:
            logger.info("Skipping scheduled report tests; a run is already in progress")
            return False
        await mark_started(platform_id)
        logger.info("Scheduled report health test started for platform %s", platform_code)
        return True
