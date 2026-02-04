from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Any, Tuple
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_postgres_db
from app.models.postgres_models import AnalyticsEvent as AnalyticsEventModel
from app.schemas.analytics import AnalyticsEvent

router = APIRouter()

def parse_period(period: str) -> Tuple[int, str]:
    """
    Parse period strings like "24h", "7d", "30d" into interval parts.
    Defaults to 24 hours for invalid input.
    """
    if not period:
        return (24, "HOUR")
    normalized = period.strip().lower()
    if normalized.endswith("h") and normalized[:-1].isdigit():
        return (int(normalized[:-1]), "HOUR")
    if normalized.endswith("d") and normalized[:-1].isdigit():
        return (int(normalized[:-1]), "DAY")
    return (24, "HOUR")

@router.post("/track", status_code=202)
async def track_event(
    event: AnalyticsEvent,
    request: Request,
    db: AsyncSession = Depends(get_postgres_db)
) -> Any:
    """
    Track an analytics event.
    """
    # Enrich event with server-side info
    client_ip = request.client.host
    user_agent = request.headers.get("user-agent", "")
    
    # Resolve user ID: prefer client-provided, fallback to authenticated user
    user_id = event.user_id
    if not user_id:
        request_user = getattr(request.state, "user", None)
        if request_user:
            user_id = request_user.username
            print(f"[Analytics] Resolved user_id from auth: {user_id}")

    if event.event_type == "pageview":
        recent_cutoff = datetime.now() - timedelta(seconds=5)
        query = select(AnalyticsEventModel).where(
            AnalyticsEventModel.event_type == "pageview",
            AnalyticsEventModel.session_id == event.session_id,
            AnalyticsEventModel.path == event.path,
            AnalyticsEventModel.duration == 0,
            AnalyticsEventModel.timestamp >= recent_cutoff
        )
        if user_id:
            query = query.where(AnalyticsEventModel.user_id == user_id)
        query = query.order_by(AnalyticsEventModel.timestamp.desc()).limit(1)

        try:
            result = await db.execute(query)
            existing_pageview = result.scalar_one_or_none()
            if existing_pageview:
                existing_pageview.timestamp = datetime.now()
                existing_pageview.ip = client_ip
                existing_pageview.user_agent = user_agent
                if user_id and not existing_pageview.user_id:
                    existing_pageview.user_id = user_id
                if event.meta:
                    existing_pageview.meta = event.meta
                await db.commit()
                return {"status": "queued"}
        except Exception as e:
            await db.rollback()
            print(f"Failed to dedupe pageview: {e}")
            raise HTTPException(status_code=500, detail="Failed to store analytics event")

    if event.event_type == "page_leave":
        query = select(AnalyticsEventModel).where(
            AnalyticsEventModel.event_type == "pageview",
            AnalyticsEventModel.session_id == event.session_id,
            AnalyticsEventModel.path == event.path
        )
        if user_id:
            query = query.where(AnalyticsEventModel.user_id == user_id)
        query = query.order_by(AnalyticsEventModel.timestamp.desc()).limit(1)

        try:
            result = await db.execute(query)
            pageview_event = result.scalar_one_or_none()
            if pageview_event:
                pageview_event.duration = event.duration or 0
            else:
                pageview_event = AnalyticsEventModel(
                    timestamp=datetime.now(),
                    event_type="pageview",
                    path=event.path,
                    session_id=event.session_id,
                    user_id=user_id,
                    ip=client_ip,
                    user_agent=user_agent,
                    duration=event.duration or 0,
                    meta=event.meta
                )
                db.add(pageview_event)
            await db.commit()
        except Exception as e:
            await db.rollback()
            print(f"Failed to merge page_leave into pageview: {e}")
            raise HTTPException(status_code=500, detail="Failed to store analytics event")
        return {"status": "queued"}

    analytics_event = AnalyticsEventModel(
        timestamp=datetime.now(),
        event_type=event.event_type,
        path=event.path,
        session_id=event.session_id,
        user_id=user_id,
        ip=client_ip,
        user_agent=user_agent,
        duration=event.duration or 0,
        meta=event.meta
    )

    try:
        db.add(analytics_event)
        await db.commit()
    except Exception as e:
        await db.rollback()
        print(f"Failed to insert analytics event: {e}")
        raise HTTPException(status_code=500, detail="Failed to store analytics event")

    return {"status": "queued"}

@router.get("/stats", response_model=Any)
async def get_stats(
    period: str = "24h",
    db: AsyncSession = Depends(get_postgres_db)
) -> Any:
    """
    Get simple aggregation stats.
    """
    interval_value, interval_unit = parse_period(period)
    interval_delta = timedelta(hours=interval_value) if interval_unit == "HOUR" else timedelta(days=interval_value)
    cutoff = datetime.now(timezone.utc) - interval_delta
    query = text("""
        WITH base AS (
            SELECT
                path,
                session_id,
                event_type,
                duration,
                timestamp,
                CASE
                    WHEN path ~ '^/[^/]+/reports/[0-9]+' THEN split_part(path, '/', 4)::int
                    ELSE NULL
                END AS report_id
            FROM analytics_events
            WHERE timestamp >= :cutoff
        )
        SELECT 
            base.path,
            COUNT(*) FILTER (WHERE event_type = 'pageview') AS views,
            AVG(duration) FILTER (WHERE event_type IN ('page_leave', 'pageview') AND duration > 0) AS avg_time,
            COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'pageview') AS unique_visitors,
            base.report_id,
            reports.name AS report_name
        FROM base
        LEFT JOIN reports ON reports.id = base.report_id
        GROUP BY base.path, base.report_id, reports.name
        HAVING COUNT(*) FILTER (WHERE event_type = 'pageview') > 0
        ORDER BY views DESC
        LIMIT 200
    """)

    result = await db.execute(query, {"cutoff": cutoff})
    rows = result.fetchall()

    stats = []
    for row in rows:
        avg_value = row[2]
        if avg_value is None:
            avg_time = 0
        else:
            avg_number = float(avg_value)
            avg_time = 0 if not math.isfinite(avg_number) else round(avg_number, 2)
        stats.append({
            "path": row[0],
            "views": row[1],
            "avg_time": avg_time,
            "unique_visitors": row[3],
            "report_id": row[4],
            "report_name": row[5]
        })

    return stats

@router.get("/user-visits", response_model=Any)
async def get_user_visits(
    period: str = "24h",
    db: AsyncSession = Depends(get_postgres_db)
) -> Any:
    """
    Get visit counts per user and path.
    """
    interval_value, interval_unit = parse_period(period)
    interval_delta = timedelta(hours=interval_value) if interval_unit == "HOUR" else timedelta(days=interval_value)
    cutoff = datetime.now(timezone.utc) - interval_delta
    query = text("""
        WITH base AS (
            SELECT
                user_id,
                path,
                session_id,
                event_type,
                duration,
                timestamp,
                CASE
                    WHEN path ~ '^/[^/]+/reports/[0-9]+' THEN split_part(path, '/', 4)::int
                    ELSE NULL
                END AS report_id
            FROM analytics_events
            WHERE timestamp >= :cutoff
              AND user_id IS NOT NULL
              AND user_id != ''
        )
        SELECT
            base.user_id,
            base.path,
            COUNT(*) FILTER (WHERE event_type = 'pageview') AS views,
            COALESCE(SUM(duration) FILTER (WHERE event_type IN ('page_leave', 'pageview') AND duration > 0), 0) AS total_duration,
            MAX(timestamp) FILTER (WHERE event_type = 'pageview') AS last_seen,
            base.report_id,
            reports.name AS report_name
        FROM base
        LEFT JOIN reports ON reports.id = base.report_id
        GROUP BY base.user_id, base.path, base.report_id, reports.name
        HAVING COUNT(*) FILTER (WHERE event_type = 'pageview') > 0
        ORDER BY views DESC
        LIMIT 500
    """)

    result = await db.execute(query, {"cutoff": cutoff})
    rows = result.fetchall()

    visits = []
    for row in rows:
        total_duration = int(row[3] or 0)
        visits.append({
            "user_id": row[0],
            "path": row[1],
            "views": row[2],
            "total_duration_seconds": total_duration,
            "last_seen": row[4].isoformat() if row[4] else None,
            "report_id": row[5],
            "report_name": row[6]
        })
    return visits
