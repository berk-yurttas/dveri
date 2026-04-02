import logging
from typing import Any

import httpx
import asyncio
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_postgres_db
from app.models.postgres_models import Platform

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/service-status")
async def get_service_status(db: AsyncSession = Depends(get_postgres_db)) -> dict[str, Any]:
    """
    Proxy ServiceChecker GET /api/endpoints so the frontend can show up/down for external links.
    When SERVICE_CHECKER_BASE_URL is unset, returns enabled=false (UI hides badges).
    """
    base = (settings.SERVICE_CHECKER_BASE_URL or "").strip().rstrip("/")
    if not base:
        return {"enabled": False, "endpoints": []}

    url = f"{base}/api/endpoints"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            if not isinstance(data, list):
                logger.warning("service-status: unexpected payload from ServiceChecker")
                return {"enabled": True, "endpoints": [], "error": "invalid_response"}
            
            # --- Auto-enroll platform features into ServiceChecker ---
            try:
                platforms_q = await db.execute(select(Platform).where(Platform.is_active == True))
                platforms = platforms_q.scalars().all()
                existing_urls = {ep.get("url", "").strip() for ep in data if ep.get("url")}
                
                new_tasks = []
                for p in platforms:
                    theme = p.theme_config or {}
                    features = theme.get("features", [])
                    for f in features:
                        f_url = f.get("url", "").strip()
                        if f_url.startswith("http") and f_url not in existing_urls:
                            # Add to existing_urls to avoid duplicates in the same pass
                            existing_urls.add(f_url)
                            name = f.get("title") or f.get("name") or f_url
                            
                            logger.info(f"Auto-enrolling new service check for {f_url}")
                            # Send POST request asynchronously
                            coro = client.post(
                                url, 
                                json={"name": f"Auto: {name}", "url": f_url, "is_active": True}
                            )
                            new_tasks.append(coro)
                
                if new_tasks:
                    results = await asyncio.gather(*new_tasks, return_exceptions=True)
                    # Refresh the data completely by calling GET /api/endpoints again
                    r_ref = await client.get(url)
                    r_ref.raise_for_status()
                    data = r_ref.json()
            except Exception as auto_enroll_e:
                logger.error(f"Failed to auto-enroll features: {auto_enroll_e}")
            # --------------------------------------------------------

            return {"enabled": True, "endpoints": data}
    except httpx.HTTPError as e:
        logger.warning("service-status: ServiceChecker unreachable: %s", e)
        return {"enabled": True, "endpoints": [], "error": "unreachable"}
    except Exception as e:
        logger.exception("service-status: unexpected error")
        return {"enabled": True, "endpoints": [], "error": str(e)}
