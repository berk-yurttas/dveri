from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.services.csuite_history_store import CSuiteHistoryStore, DatabaseCSuiteHistoryStore, JsonCSuiteHistoryStore

logger = logging.getLogger(__name__)


class CSuiteHistoryScheduler:
    """
    Background scheduler that snapshots CSuite metrics into local JSON history.

    It does not blindly write on every tick: for each firma, it writes at most
    one record per ISO week (e.g. 2026-W11).
    
    This scheduler uses the IVME platform database for fetching CSuite data.
    """

    _task: asyncio.Task | None = None
    _stop_event: asyncio.Event | None = None
    _interval_seconds = max(60, int(settings.CSUITE_HISTORY_SCHEDULER_INTERVAL_SECONDS))
    _history_store: CSuiteHistoryStore = JsonCSuiteHistoryStore()
    _ivme_session_maker: async_sessionmaker | None = None
    _database_store: DatabaseCSuiteHistoryStore | None = None  # For Talaşlı İmalat doluluk

    @classmethod
    async def _get_ivme_session_maker(cls) -> async_sessionmaker:
        """
        Get or create the IVME database session maker.
        Fetches the IVME platform configuration from the platforms table and creates
        an async engine for it.
        """
        if cls._ivme_session_maker is not None:
            return cls._ivme_session_maker

        # Import here to avoid circular imports
        from app.core.database import AsyncSessionLocal
        from app.models.postgres_models import Platform

        # Fetch IVME platform configuration
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT db_type, db_config FROM platforms WHERE code = 'ivme' AND is_active = true")
            )
            row = result.fetchone()
            
            if not row:
                raise ValueError(
                    "IVME platform not found or inactive in the database. "
                    "Please configure the IVME platform with proper database settings."
                )
            
            db_type, db_config = row
            
            if db_type.lower() != "postgresql":
                raise ValueError(
                    f"IVME platform must use PostgreSQL database, but found: {db_type}"
                )
            
            if not db_config:
                raise ValueError("IVME platform has no database configuration (db_config is null)")

            # Build connection string from db_config
            host = db_config.get("host", "localhost")
            port = db_config.get("port", 5432)
            database = db_config.get("database")
            user = db_config.get("user")
            password = db_config.get("password")

            if not all([database, user]):
                raise ValueError(
                    f"IVME platform database configuration is incomplete. "
                    f"Required: database, user. Found: {list(db_config.keys())}"
                )

            connection_string = f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{database}"
            
            # Create async engine for IVME database
            ivme_engine = create_async_engine(
                connection_string,
                echo=True,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10
            )
            
            cls._ivme_session_maker = async_sessionmaker(
                ivme_engine,
                class_=AsyncSession,
                expire_on_commit=False
            )
            
            # Initialize database store for Talaşlı İmalat doluluk oranı only
            cls._database_store = DatabaseCSuiteHistoryStore(cls._ivme_session_maker, platform="talasli_imalat")
            
            logger.info(f"Created IVME database connection: {host}:{port}/{database}")
            logger.info("Initialized database store for Talaşlı İmalat doluluk tracking")
        
        return cls._ivme_session_maker

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

        # Get IVME session maker
        ivme_session_maker = await cls._get_ivme_session_maker()

        async with ivme_session_maker() as session:
            # For Talaşlı İmalat: Fetch from MES production function
            try:
                mes_rows = await session.execute(
                    text(
                        """
                        SELECT "Firma Adı", "Aylık Planlanan Doluluk Oranı"
                        FROM mes_production.get_firma_makina_planlanan_doluluk
                        """
                    )
                )
                for row in mes_rows.all():
                    firma = str(row[0] or "").strip()
                    doluluk_orani = row[1]
                    if not firma:
                        continue
                    # Convert doluluk_orani to integer (0-100 range)
                    try:
                        value = int(float(doluluk_orani or 0))
                        value = max(0, min(100, value))  # Clamp to 0-100
                    except (ValueError, TypeError):
                        value = 0
                    
                    per_firma_tedarikci.setdefault(firma, {})["Talaşlı İmalat"] = value
                    logger.debug(f"MES data: {firma} - Talaşlı İmalat = {value}%")
            except Exception as e:
                logger.warning(f"Failed to fetch MES production data for Talaşlı İmalat: {e}")
            
            # For Kablaj/EMM and Kart Dizgi: These are under construction
            # TODO: Add data sources when tables/functions are available
            # For now, we'll populate with placeholder zeros for consistency in the data structure
            for firma in per_firma_tedarikci.keys():
                per_firma_tedarikci[firma].setdefault("Kablaj/EMM", 0)
                per_firma_tedarikci[firma].setdefault("Kart Dizgi", 0)
            
            logger.debug("Kablaj/EMM and Kart Dizgi set to 0 (under construction)")

        total_firmas = 0
        written_json = 0
        written_db = 0

        all_firmas = sorted(set(per_firma_tedarikci.keys()))
        for firma in all_firmas:
            total_firmas += 1
            
            # Write Talaşlı İmalat doluluk to database
            if firma in per_firma_tedarikci and "Talaşlı İmalat" in per_firma_tedarikci[firma]:
                try:
                    # Check if we already have this week's data in the database
                    latest_db_week = await cls._database_store.latest_week_for_company_async(firma)
                    logger.debug(f"Checking {firma}: latest_week={latest_db_week}, current_week={current_week}")
                    
                    if latest_db_week != current_week:
                        logger.info(f"Writing doluluk to DB: firma={firma}, tedarikci={per_firma_tedarikci[firma]}")
                        
                        await cls._database_store.write_weekly_snapshot_async(
                            firma=firma,
                            week=current_week,
                            tedarikci_kapasite_analizi=per_firma_tedarikci[firma],
                            aselsan_kaynakli_durma={},  # Not storing durma in history
                        )
                        written_db += 1
                        logger.info(f"✓ Wrote Talaşlı İmalat doluluk data to database for {firma}")
                    else:
                        logger.debug(f"Skipping {firma} - week {current_week} already recorded")
                except Exception as e:
                    logger.error(f"Failed to write Talaşlı İmalat data to database for {firma}: {e}", exc_info=True)
            
            # Write Kablaj/EMM and Kart Dizgi to JSON (currently under construction, so all zeros)
            # This is for future compatibility when these categories become available
            latest_json_week = cls._history_store.latest_week_for_company(firma)
            if latest_json_week != current_week:
                cls._history_store.write_weekly_snapshot(
                    firma=firma,
                    week=current_week,
                    tedarikci_kapasite_analizi=per_firma_tedarikci.get(firma, {}),
                    aselsan_kaynakli_durma={},  # Not storing durma in history
                )
                written_json += 1

        logger.info(
            "CSuite weekly snapshot tick complete: firmas=%s written_db=%s written_json=%s week=%s",
            total_firmas,
            written_db,
            written_json,
            current_week,
        )
        return {"firmas": total_firmas, "written": written_db + written_json}


