"""Proxy to odak-db-guncelleme for refreshing report source tables."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.services.sql_table_extractor import (
    collect_sql_from_report,
    extract_tables_from_sqls,
)

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0)


def _base_url() -> str:
    return (settings.ODAK_UPDATER_BASE_URL or "").strip().rstrip("/")


async def _updater_request(method: str, path: str, json_body: dict[str, Any] | None = None) -> Any:
    base = _base_url()
    if not base:
        raise HTTPException(status_code=503, detail="Odak güncelleme servisi yapılandırılmamış")

    url = f"{base}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, verify=False) as client:
            kwargs: dict[str, Any] = {}
            if json_body is not None:
                kwargs["json"] = json_body
            response = await client.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("odak-updater HTTP error %s %s: %s", method, path, exc)
        detail = exc.response.text
        try:
            payload = exc.response.json()
            detail = payload.get("message") or payload.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=f"Odak güncelleme servisi hatası: {detail}") from exc
    except httpx.RequestError as exc:
        logger.warning("odak-updater unreachable %s %s: %s", method, path, exc)
        raise HTTPException(
            status_code=502,
            detail="Odak güncelleme servisine ulaşılamadı",
        ) from exc


async def get_known_table_names() -> set[str]:
    try:
        payload = await _updater_request("GET", "/api/table-versions")
    except HTTPException:
        return set()
    if not isinstance(payload, dict):
        return set()
    return {str(name) for name in payload.keys()}


def match_known_tables(
    extracted: list[str],
    known: set[str],
) -> tuple[list[str], list[str]]:
    if not known:
        return list(extracted), []

    known_map = {name.lower(): name for name in known}
    matched: list[str] = []
    skipped: list[str] = []
    seen: set[str] = set()
    for table in extracted:
        canonical = known_map.get(table.lower())
        if not canonical:
            skipped.append(table)
            continue
        key = canonical.lower()
        if key in seen:
            continue
        seen.add(key)
        matched.append(canonical)
    return matched, skipped


async def trigger_reports_tables_update(reports: list[Any]) -> dict[str, Any]:
    sqls: list[str] = []
    for report in reports:
        sqls.extend(collect_sql_from_report(report))
    extracted = extract_tables_from_sqls(sqls)
    known = await get_known_table_names()
    table_names, skipped_tables = match_known_tables(extracted, known)

    if not table_names:
        found = ", ".join(extracted) if extracted else "yok"
        raise HTTPException(
            status_code=400,
            detail=f"Rapor sorgularında güncellenebilir tablo bulunamadı (bulunan: {found})",
        )

    payload = await _updater_request(
        "POST",
        "/trigger-multiple-update",
        {
            "table_names": table_names,
            "versions": {},
            "nightly": False,
        },
    )

    status = (payload or {}).get("status")
    message = (payload or {}).get("message") or ""
    if status == "error":
        raise HTTPException(
            status_code=409 if "devam ediyor" in message else 400,
            detail=message or "Güncelleme başlatılamadı",
        )

    return {
        "status": status or "started",
        "message": message or f"{len(table_names)} tablo güncelleme başlatıldı.",
        "table_names": table_names,
        "skipped_tables": skipped_tables,
        "skipped_nightly": (payload or {}).get("skipped_nightly") or [],
        "user_info": (payload or {}).get("user_info"),
    }


async def trigger_report_tables_update(report: Any) -> dict[str, Any]:
    return await trigger_reports_tables_update([report])


async def get_job_status() -> dict[str, Any]:
    payload = await _updater_request("GET", "/job-status")
    if not isinstance(payload, dict):
        return {"running": False, "type": None, "message": None, "cancel_requested": False, "logs": []}
    logs = payload.get("logs")
    return {
        "running": bool(payload.get("running")),
        "type": payload.get("type"),
        "message": payload.get("message"),
        "cancel_requested": bool(payload.get("cancel_requested")),
        "logs": logs if isinstance(logs, list) else [],
    }


async def get_last_update_info() -> dict[str, Any]:
    try:
        payload = await _updater_request("GET", "/last-update-info")
    except HTTPException:
        return {"user_info": None, "date": None}
    if not isinstance(payload, dict):
        return {"user_info": None, "date": None}
    return {
        "user_info": payload.get("user_info"),
        "date": payload.get("date"),
    }


async def wait_for_job_completion(timeout_seconds: int = 14400, interval_seconds: float = 5.0) -> dict[str, Any]:
    import asyncio

    started = False
    elapsed = 0.0
    last_status: dict[str, Any] = {"running": False, "message": None, "logs": []}
    while elapsed <= timeout_seconds:
        last_status = await get_job_status()
        if last_status.get("running"):
            started = True
        elif started or elapsed >= 15:
            return last_status
        await asyncio.sleep(interval_seconds)
        elapsed += interval_seconds
    last_status["message"] = last_status.get("message") or "Zaman aşımı"
    return last_status


async def cancel_job() -> dict[str, Any]:
    payload = await _updater_request("GET", "/cancel-job")
    if not isinstance(payload, dict):
        return {"status": "error", "message": "İptal yanıtı alınamadı"}
    return {
        "status": payload.get("status") or "success",
        "message": payload.get("message") or "",
    }
