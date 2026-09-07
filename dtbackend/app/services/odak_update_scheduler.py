"""Background runner for daily IVME report Odak updates."""

from __future__ import annotations

import asyncio
import logging

from fastapi import HTTPException

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.odak_schedule_service import (
    advance_next_run,
    list_due_schedules,
    record_last_run,
)
from app.services.odak_updater_service import trigger_report_tables_update, wait_for_job_completion
from app.services.reports_service import ReportsService

logger = logging.getLogger(__name__)


class OdakUpdateScheduler:
    _task: asyncio.Task | None = None
    _stop_event: asyncio.Event | None = None
    _interval_seconds = max(15, int(settings.ODAK_UPDATE_SCHEDULER_INTERVAL_SECONDS))
    _running_job = False

    @classmethod
    def start(cls) -> None:
        if not settings.ODAK_UPDATE_SCHEDULER_ENABLED:
            logger.info("Odak update scheduler is disabled by configuration")
            return
        if cls._task and not cls._task.done():
            return
        cls._stop_event = asyncio.Event()
        cls._task = asyncio.create_task(cls._run_loop(), name="odak-update-scheduler")
        logger.info("Odak update scheduler started (interval=%ss)", cls._interval_seconds)

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
        logger.info("Odak update scheduler stopped")

    @classmethod
    async def _run_loop(cls) -> None:
        while True:
            try:
                await cls.run_once()
            except Exception:
                logger.exception("Odak update scheduler tick failed")

            if not cls._stop_event:
                await asyncio.sleep(cls._interval_seconds)
                continue
            try:
                await asyncio.wait_for(cls._stop_event.wait(), timeout=cls._interval_seconds)
                break
            except asyncio.TimeoutError:
                continue

    @classmethod
    async def run_once(cls) -> int:
        if cls._running_job:
            return 0

        async with AsyncSessionLocal() as db:
            due = await list_due_schedules(db)
            if not due:
                return 0

            cls._running_job = True
            processed = 0
            try:
                reports_service = ReportsService(db)
                for schedule in due:
                    report = await reports_service.get_report_for_export(schedule.report_id)
                    if not report:
                        logger.warning("Scheduled Odak update skipped, report missing: %s", schedule.report_id)
                        await advance_next_run(db, schedule)
                        continue
                    try:
                        result = await trigger_report_tables_update(report)
                    except HTTPException as exc:
                        if exc.status_code == 409:
                            logger.info("Odak updater busy; will retry report %s next tick", schedule.report_id)
                            break
                        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
                        await record_last_run(db, schedule.report_id, "error", detail)
                        await advance_next_run(db, schedule)
                        processed += 1
                        continue

                    await record_last_run(
                        db,
                        schedule.report_id,
                        "started",
                        result.get("message"),
                    )
                    final = await wait_for_job_completion()
                    message = final.get("message") or result.get("message") or ""
                    status = "error" if _looks_like_error(message) else "success"
                    await record_last_run(db, schedule.report_id, status, message)
                    await advance_next_run(db, schedule)
                    processed += 1
            finally:
                cls._running_job = False
            return processed


def _looks_like_error(message: str) -> bool:
    lowered = (message or "").lower()
    return (
        lowered.startswith("hata")
        or "güncellenemedi" in lowered
        or "iptal" in lowered
        or "zaman aşımı" in lowered
    )


async def follow_job_and_record(report_id: int) -> None:
    await follow_job_and_record_many([report_id])


async def follow_job_and_record_many(report_ids: list[int]) -> None:
    if not report_ids:
        return
    try:
        final = await wait_for_job_completion()
        message = final.get("message") or ""
        status = "error" if _looks_like_error(message) else "success"
        async with AsyncSessionLocal() as db:
            for report_id in report_ids:
                await record_last_run(db, report_id, status, message)
    except Exception:
        logger.exception("Failed to record Odak job result for reports %s", report_ids)
