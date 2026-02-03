from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Any, Tuple
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
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
        SELECT 
            path,
            COUNT(*) FILTER (WHERE event_type = 'pageview') AS views,
            AVG(duration) FILTER (WHERE event_type = 'page_leave' AND duration > 0) AS avg_time,
            COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'pageview') AS unique_visitors
        FROM analytics_events
        WHERE timestamp >= :cutoff
        GROUP BY path
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
            "unique_visitors": row[3]
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
        SELECT
            user_id,
            path,
            COUNT(*) FILTER (WHERE event_type = 'pageview') AS views,
            COALESCE(SUM(duration) FILTER (WHERE event_type = 'page_leave' AND duration > 0), 0) AS total_duration,
            MAX(timestamp) FILTER (WHERE event_type = 'pageview') AS last_seen
        FROM analytics_events
        WHERE timestamp >= :cutoff
          AND user_id IS NOT NULL
          AND user_id != ''
        GROUP BY user_id, path
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
            "last_seen": row[4].isoformat() if row[4] else None
        })
    return visits
