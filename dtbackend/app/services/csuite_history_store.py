from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

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
    """JSON file based implementation for Kablaj/EMM and Kart Dizgi (under construction)."""

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


class DatabaseCSuiteHistoryStore(CSuiteHistoryStore):
    """
    Database-backed implementation for Talaşlı İmalat and Kablaj.
    Writes to:
    - mes_production.firma_makina_planlanan_doluluk_history (tedarikci_kapasite_analizi)
    - mes_production.aselsan_kaynakli_durma_history (aselsan_kaynakli_durma)
    """

    def __init__(self, session_maker: async_sessionmaker, platform: str = "talasli_imalat"):
        """
        Initialize with an async session maker.
        
        Args:
            session_maker: Async session maker for IVME database
            platform: Platform identifier ('talasli_imalat' or 'kablaj')
        """
        self._session_maker = session_maker
        self._platform = platform

    def current_week_key(self) -> str:
        year, week, _ = datetime.now(timezone.utc).isocalendar()
        return f"{year}-W{week:02d}"

    async def latest_week_for_company_async(self, firma: str) -> str | None:
        """
        Async version to fetch latest week from database.
        Checks doluluk_history only (durma history not used).
        """
        async with self._session_maker() as session:
            try:
                # Check doluluk history
                doluluk_result = await session.execute(
                    text(
                        """
                        SELECT week
                        FROM mes_production.firma_makina_planlanan_doluluk_history
                        WHERE "Firma Adı" = :firma
                        ORDER BY week DESC
                        LIMIT 1
                        """
                    ),
                    {"firma": firma}
                )
                doluluk_row = doluluk_result.fetchone()
                return str(doluluk_row[0]) if doluluk_row else None
                
            except Exception:
                return None

    def latest_week_for_company(self, firma: str) -> str | None:
        """Sync wrapper - not used in async scheduler context."""
        import asyncio
        try:
            return asyncio.run(self.latest_week_for_company_async(firma))
        except Exception:
            return None

    async def write_weekly_snapshot_async(
        self,
        *,
        firma: str,
        week: str,
        tedarikci_kapasite_analizi: dict[str, int],
        aselsan_kaynakli_durma: dict[str, int],
    ) -> None:
        """
        Write data to database.
        - Stores tedarikci_kapasite_analizi (doluluk oranı) to firma_makina_planlanan_doluluk_history
        - aselsan_kaynakli_durma parameter is kept for compatibility but not stored (durma history not used)
        """
        async with self._session_maker() as session:
            # Write tedarikci_kapasite_analizi (Talaşlı İmalat doluluk oranı)
            if tedarikci_kapasite_analizi:
                talasli_imalat_value = tedarikci_kapasite_analizi.get("Talaşlı İmalat", 0)
                
                await session.execute(
                    text(
                        """
                        INSERT INTO mes_production.firma_makina_planlanan_doluluk_history 
                            ("Firma Adı", week, "Aylık Planlanan Doluluk Oranı", recorded_at)
                        VALUES (:firma, :week, :doluluk_orani, :recorded_at)
                        ON CONFLICT ("Firma Adı", week) 
                        DO UPDATE SET 
                            "Aylık Planlanan Doluluk Oranı" = EXCLUDED."Aylık Planlanan Doluluk Oranı",
                            recorded_at = EXCLUDED.recorded_at
                        """
                    ),
                    {
                        "firma": firma,
                        "week": week,
                        "doluluk_orani": talasli_imalat_value,
                        "recorded_at": datetime.now(timezone.utc)
                    }
                )
            
            await session.commit()

    def write_weekly_snapshot(
        self,
        *,
        firma: str,
        week: str,
        tedarikci_kapasite_analizi: dict[str, int],
        aselsan_kaynakli_durma: dict[str, int],
    ) -> None:
        """Sync wrapper - not used in async scheduler context."""
        import asyncio
        asyncio.run(self.write_weekly_snapshot_async(
            firma=firma,
            week=week,
            tedarikci_kapasite_analizi=tedarikci_kapasite_analizi,
            aselsan_kaynakli_durma=aselsan_kaynakli_durma
        ))



