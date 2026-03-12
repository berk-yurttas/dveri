from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.csuite_history_store import CSuiteHistoryStore, JsonCSuiteHistoryStore

logger = logging.getLogger(__name__)


class CSuiteHistoryScheduler:
    """
    Background scheduler that snapshots CSuite metrics into local JSON history.

    It does not blindly write on every tick: for each firma, it writes at most
    one record per ISO week (e.g. 2026-W11).
    """

    _task: asyncio.Task | None = None
    _stop_event: asyncio.Event | None = None
    _interval_seconds = max(60, int(settings.CSUITE_HISTORY_SCHEDULER_INTERVAL_SECONDS))
    _history_store: CSuiteHistoryStore = JsonCSuiteHistoryStore()

    @classmethod
    def configure_history_store(cls, store: CSuiteHistoryStore) -> None:
        """Swap persistence backend without changing scheduler logic."""
        cls._history_store = store

    @classmethod
    def start(cls) -> None:
        if not settings.CSUITE_HISTORY_SCHEDULER_ENABLED:
            logger.info("CSuite history scheduler is disabled by configuration")
            return
        if cls._task and not cls._task.done():
            return
        cls._stop_event = asyncio.Event()
        cls._task = asyncio.create_task(cls._run_loop(), name="csuite-history-scheduler")
        logger.info("CSuite history scheduler started (interval=%ss)", cls._interval_seconds)

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
        logger.info("CSuite history scheduler stopped")

    @classmethod
    async def _run_loop(cls) -> None:
        while True:
            try:
                await cls.run_once()
            except Exception:
                logger.exception("CSuite history scheduler tick failed")

            if not cls._stop_event:
                await asyncio.sleep(cls._interval_seconds)
                continue

            try:
                await asyncio.wait_for(cls._stop_event.wait(), timeout=cls._interval_seconds)
                break
            except asyncio.TimeoutError:
                continue

    @classmethod
    async def run_once(cls) -> dict[str, int]:
        current_week = cls._history_store.current_week_key()
        per_firma_tedarikci: dict[str, dict[str, int]] = {}
        per_firma_aselsan: dict[str, dict[str, int]] = {}

        async with AsyncSessionLocal() as session:
            tedarikci_rows = await session.execute(
                text(
                    """
                    SELECT firma, name, value
                    FROM csuite.tedarikci_kapasite
                    ORDER BY firma, id
                    """
                )
            )
            for row in tedarikci_rows.all():
                firma = str(row[0] or "").strip()
                name = str(row[1] or "").strip()
                value = int(row[2] or 0)
                if not firma or not name:
                    continue
                per_firma_tedarikci.setdefault(firma, {})[name] = value

            # Optional source; some environments may not have this table yet.
            try:
                aselsan_rows = await session.execute(
                    text(
                        """
                        SELECT firma, name, value
                        FROM csuite.aselsan_kaynakli_durma
                        ORDER BY firma, id
                        """
                    )
                )
                for row in aselsan_rows.all():
                    firma = str(row[0] or "").strip()
                    name = str(row[1] or "").strip()
                    value = int(row[2] or 0)
                    if not firma or not name:
                        continue
                    per_firma_aselsan.setdefault(firma, {})[name] = value
            except Exception:
                logger.debug(
                    "Skipping csuite.aselsan_kaynakli_durma snapshot; table unavailable in this environment"
                )

        total_firmas = 0
        written = 0

        all_firmas = sorted(set(per_firma_tedarikci.keys()) | set(per_firma_aselsan.keys()))
        for firma in all_firmas:
            total_firmas += 1
            if cls._history_store.latest_week_for_company(firma) == current_week:
                continue

            cls._history_store.write_weekly_snapshot(
                firma=firma,
                week=current_week,
                tedarikci_kapasite_analizi=per_firma_tedarikci.get(firma, {}),
                aselsan_kaynakli_durma=per_firma_aselsan.get(firma, {}),
            )
            written += 1

        logger.info(
            "CSuite weekly snapshot tick complete: firmas=%s written=%s week=%s",
            total_firmas,
            written,
            current_week,
        )
        return {"firmas": total_firmas, "written": written}


