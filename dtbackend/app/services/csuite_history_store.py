from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone

from app.services.csuite_history_service import CSuiteHistoryService


class CSuiteHistoryStore(ABC):
    """
    Persistence abstraction for CSuite weekly snapshots.

    This lets scheduler logic stay unchanged when moving from JSON file storage
    to a database-backed implementation in the future.
    """

    @abstractmethod
    def current_week_key(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def latest_week_for_company(self, firma: str) -> str | None:
        raise NotImplementedError

    @abstractmethod
    def write_weekly_snapshot(
        self,
        *,
        firma: str,
        week: str,
        tedarikci_kapasite_analizi: dict[str, int],
        aselsan_kaynakli_durma: dict[str, int],
    ) -> None:
        raise NotImplementedError


class JsonCSuiteHistoryStore(CSuiteHistoryStore):
    """Current JSON file based implementation."""

    def current_week_key(self) -> str:
        return CSuiteHistoryService._week_key(datetime.now(timezone.utc))

    def latest_week_for_company(self, firma: str) -> str | None:
        history = CSuiteHistoryService.get_company_history(firma=firma, limit=1)
        latest_week = history.get("latest_week")
        return str(latest_week) if latest_week else None

    def write_weekly_snapshot(
        self,
        *,
        firma: str,
        week: str,
        tedarikci_kapasite_analizi: dict[str, int],
        aselsan_kaynakli_durma: dict[str, int],
    ) -> None:
        CSuiteHistoryService.record_snapshot(
            firma=firma,
            tedarikci_kapasite_analizi=tedarikci_kapasite_analizi,
            aselsan_kaynakli_durma=aselsan_kaynakli_durma,
            week=week,
            backfill_missing_weeks=True,
        )


