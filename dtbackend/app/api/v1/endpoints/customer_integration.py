"""Customer integration for dijital puantaj scores.

GET /api/v1/integrations/dijital-puantaj runs a fixed query on the Ivme
platform's primary database and returns rows in the customer's envelope:

    Status   "success" or "error"
    Message  short outcome
    Data     result rows
    Details  error explanation, otherwise null
"""

import asyncio
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_postgres_db
from app.models.postgres_models import Platform
from app.services.reports_service import ReportsService

router = APIRouter()

DIJITAL_PUANTAJ_SQL = (
    'SELECT "Toplam Puan" AS toplam_puan, "Satıcı Kodu" AS satici_kodu '
    "FROM mes_production.dijital_puantaj_genel_skor "
    'WHERE "Satıcı Kodu" IS NOT NULL'
)
RESPONSE_FIELDS = ("toplam_puan", "satici_kodu")


class IntegrationResponse(BaseModel):
    Status: str = Field(description='"success" or "error"')
    Message: str
    Data: Any = None
    Details: str | None = None


def primary_db_config(platform: Platform) -> dict[str, Any]:
    """Return the Ivme database marked primary (is_default), otherwise the first config."""
    configs = platform.db_configs if isinstance(platform.db_configs, list) else []
    selected = next((config for config in configs if config.get("is_default")), None)
    if selected is None and configs:
        selected = configs[0]
    if selected is None and platform.db_config:
        selected = dict(platform.db_config)
        selected.setdefault("db_type", platform.db_type)

    if not selected:
        raise ValueError("Ivme platform has no primary database")

    config = dict(selected)
    config["db_type"] = (config.get("db_type") or platform.db_type or "postgresql").lower()
    return config


def json_value(item: Any) -> Any:
    if isinstance(item, Decimal):
        return float(item)
    if isinstance(item, (int, float, str, bool)) or item is None:
        return item
    return str(item)


def puan_query(db_type: str, satici_kodu: str | None) -> tuple[str, Any]:
    if not satici_kodu:
        return DIJITAL_PUANTAJ_SQL, None
    if db_type == "mssql":
        return f'{DIJITAL_PUANTAJ_SQL} AND "Satıcı Kodu" = ?', (satici_kodu,)
    if db_type == "clickhouse":
        return f'{DIJITAL_PUANTAJ_SQL} AND "Satıcı Kodu" = %(satici_kodu)s', {"satici_kodu": satici_kodu}
    return f'{DIJITAL_PUANTAJ_SQL} AND "Satıcı Kodu" = %s', (satici_kodu,)


def records_from_rows(rows: list[Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for row in rows:
        record = {
            field: json_value(row[index] if index < len(row) else None)
            for index, field in enumerate(RESPONSE_FIELDS)
        }
        records.append(record)
    return records


def _query_sync(conn: Any, db_type: str, satici_kodu: str | None) -> list[Any]:
    sql, params = puan_query(db_type, satici_kodu)
    if db_type == "clickhouse":
        rows, _column_types = conn.execute(sql, params or {}, with_column_types=True)
        return rows

    cursor = conn.cursor()
    try:
        cursor.execute(sql, params) if params is not None else cursor.execute(sql)
        return cursor.fetchall()
    finally:
        cursor.close()


async def fetch_dijital_puantaj(db_config: dict[str, Any], satici_kodu: str | None) -> list[dict[str, Any]]:
    db_type = db_config["db_type"]
    pool = ReportsService._connection_pool
    conn = await asyncio.to_thread(pool.get_connection, db_config=db_config, db_type=db_type)
    try:
        rows = await asyncio.to_thread(_query_sync, conn, db_type, satici_kodu)
        return records_from_rows(rows)
    finally:
        await asyncio.to_thread(
            pool.return_connection,
            conn,
            db_config=db_config,
            db_type=db_type,
        )


@router.get("/dijital-puantaj", response_model=IntegrationResponse)
async def get_dijital_puantaj(
    satici_kodu: str | None = Query(None),
    db: AsyncSession = Depends(get_postgres_db),
) -> IntegrationResponse:
    """Return seller scores from the Ivme primary database."""
    try:
        result = await db.execute(select(Platform).where(Platform.code == "ivme"))
        platform = result.scalar_one_or_none()
        if platform is None or not platform.is_active:
            return IntegrationResponse(
                Status="error",
                Message="Dijital puantaj query failed",
                Data=None,
                Details="Ivme platform not found",
            )

        seller_code = satici_kodu.strip() if satici_kodu and satici_kodu.strip() else None
        rows = await fetch_dijital_puantaj(primary_db_config(platform), seller_code)
    except Exception as exc:
        return IntegrationResponse(
            Status="error",
            Message="Dijital puantaj query failed",
            Data=None,
            Details=str(exc),
        )

    return IntegrationResponse(
        Status="success",
        Message=f"Retrieved {len(rows)} rows",
        Data=rows,
        Details=None,
    )
