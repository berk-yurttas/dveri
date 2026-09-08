"""Periodic Odak update schedules for IVME reports."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.postgres_models import Platform, Report, ReportOdakSchedule
from app.schemas.reports import (
    IvmeSyncListResponse,
    IvmeSyncReportItem,
    IvmeSyncSchedule,
    IvmeSyncScheduleUpdate,
    IvmeSyncBulkScheduleUpdate,
)
from app.services.odak_updater_service import get_last_update_info

ISTANBUL_TZ = ZoneInfo("Europe/Istanbul")
VALID_FREQUENCIES = {"every_30_min", "every_hour", "every_night"}


def normalize_frequency(value: str | None) -> str:
    if value in VALID_FREQUENCIES:
        return value
    return "every_night"


def compute_next_run_at(
    frequency: str,
    hour: int = 1,
    minute: int = 0,
    now: datetime | None = None,
) -> datetime:
    now_utc = now or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    now_local = now_utc.astimezone(ISTANBUL_TZ)
    frequency = normalize_frequency(frequency)

    if frequency == "every_30_min":
        candidate = now_local.replace(second=0, microsecond=0)
        remainder = candidate.minute % 30
        if remainder == 0:
            candidate += timedelta(minutes=30)
        else:
            candidate += timedelta(minutes=30 - remainder)
        return candidate

    if frequency == "every_hour":
        return now_local.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

    candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now_local:
        candidate += timedelta(days=1)
    return candidate


def _avg_runtime_seconds(row: ReportOdakSchedule | None) -> float | None:
    if not row:
        return None
    run_count = int(getattr(row, "run_count", 0) or 0)
    total_seconds = int(getattr(row, "total_run_seconds", 0) or 0)
    if run_count <= 0:
        return None
    return round(total_seconds / run_count, 1)


def _schedule_schema(row: ReportOdakSchedule | None) -> IvmeSyncSchedule | None:
    if not row:
        return None
    frequency = normalize_frequency(getattr(row, "frequency", None))
    return IvmeSyncSchedule(
        enabled=bool(row.enabled),
        frequency=frequency,  # type: ignore[arg-type]
        hour=int(row.hour),
        minute=int(row.minute),
        next_run_at=row.next_run_at,
        last_run_at=row.last_run_at,
        last_run_status=row.last_run_status,
        last_run_message=row.last_run_message,
        last_run_duration_seconds=getattr(row, "last_run_duration_seconds", None),
        run_count=int(getattr(row, "run_count", 0) or 0),
        avg_runtime_seconds=_avg_runtime_seconds(row),
    )


async def _get_ivme_platform(db: AsyncSession) -> Platform:
    result = await db.execute(select(Platform).where(Platform.code == "ivme"))
    platform = result.scalar_one_or_none()
    if not platform:
        raise HTTPException(status_code=404, detail="IVME platformu bulunamadı")
    return platform


async def list_ivme_sync_reports(db: AsyncSession) -> IvmeSyncListResponse:
    platform = await _get_ivme_platform(db)
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.odak_schedule))
        .where(Report.platform_id == platform.id, Report.deleted_at.is_(None))
        .order_by(Report.name.asc())
    )
    reports = result.scalars().unique().all()

    last_info = await get_last_update_info()
    items = [
        IvmeSyncReportItem(
            id=report.id,
            name=report.name,
            description=report.description,
            updated_at=report.updated_at,
            schedule=_schedule_schema(report.odak_schedule),
        )
        for report in reports
    ]
    report_averages = [
        item.schedule.avg_runtime_seconds
        for item in items
        if item.schedule and item.schedule.avg_runtime_seconds is not None
    ]
    overall_avg = (
        round(sum(report_averages) / len(report_averages), 1) if report_averages else None
    )
    return IvmeSyncListResponse(
        reports=items,
        last_updater_date=last_info.get("date"),
        last_updater_user=last_info.get("user_info"),
        avg_runtime_seconds=overall_avg,
    )


async def upsert_schedule(
    db: AsyncSession,
    report_id: int,
    payload: IvmeSyncScheduleUpdate,
) -> IvmeSyncSchedule:
    report = (
        await db.execute(
            select(Report).where(Report.id == report_id, Report.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Aradığınız Rapor Bulunamadı")

    row = (
        await db.execute(select(ReportOdakSchedule).where(ReportOdakSchedule.report_id == report_id))
    ).scalar_one_or_none()
    if not row:
        row = ReportOdakSchedule(report_id=report_id)
        db.add(row)

    row.enabled = payload.enabled
    row.frequency = normalize_frequency(payload.frequency)
    row.hour = payload.hour
    row.minute = payload.minute
    row.timezone = "Europe/Istanbul"
    row.next_run_at = (
        compute_next_run_at(row.frequency, payload.hour, payload.minute)
        if payload.enabled
        else None
    )
    await db.commit()
    await db.refresh(row)
    schedule = _schedule_schema(row)
    if not schedule:
        raise HTTPException(status_code=500, detail="Zamanlama kaydedilemedi")
    return schedule


async def bulk_upsert_schedules(
    db: AsyncSession,
    payload: IvmeSyncBulkScheduleUpdate,
) -> list[tuple[int, IvmeSyncSchedule]]:
    unique_ids = list(dict.fromkeys(payload.report_ids))
    reports = (
        await db.execute(
            select(Report).where(Report.id.in_(unique_ids), Report.deleted_at.is_(None))
        )
    ).scalars().all()
    found_ids = {report.id for report in reports}
    if not found_ids:
        raise HTTPException(status_code=404, detail="Seçilen raporlar bulunamadı")

    existing_rows = (
        await db.execute(select(ReportOdakSchedule).where(ReportOdakSchedule.report_id.in_(found_ids)))
    ).scalars().all()
    rows_by_report = {row.report_id: row for row in existing_rows}

    results: list[tuple[int, IvmeSyncSchedule]] = []
    for report_id in unique_ids:
        if report_id not in found_ids:
            continue
        row = rows_by_report.get(report_id)
        if not row:
            row = ReportOdakSchedule(
                report_id=report_id,
                enabled=False,
                frequency="every_night",
                hour=1,
                minute=0,
            )
            db.add(row)
            rows_by_report[report_id] = row

        if payload.enabled is not None:
            row.enabled = payload.enabled
        if payload.frequency is not None:
            row.frequency = normalize_frequency(payload.frequency)
        if payload.hour is not None:
            row.hour = payload.hour
        if payload.minute is not None:
            row.minute = payload.minute
        row.timezone = "Europe/Istanbul"
        row.next_run_at = (
            compute_next_run_at(row.frequency, row.hour, row.minute)
            if row.enabled
            else None
        )

    await db.commit()
    for report_id in unique_ids:
        if report_id not in found_ids:
            continue
        row = rows_by_report[report_id]
        await db.refresh(row)
        schedule = _schedule_schema(row)
        if schedule:
            results.append((report_id, schedule))
    return results


async def get_or_create_schedule(db: AsyncSession, report_id: int) -> ReportOdakSchedule:
    row = (
        await db.execute(select(ReportOdakSchedule).where(ReportOdakSchedule.report_id == report_id))
    ).scalar_one_or_none()
    if row:
        return row
    row = ReportOdakSchedule(report_id=report_id, enabled=False)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def record_last_run(
    db: AsyncSession,
    report_id: int,
    status: str,
    message: str | None,
) -> None:
    row = await get_or_create_schedule(db, report_id)
    now = datetime.now(timezone.utc)
    if status == "started":
        row.last_run_started_at = now
        row.last_run_status = status
        row.last_run_message = message
    else:
        started = getattr(row, "last_run_started_at", None)
        if started is not None:
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            duration = max(0, int((now - started).total_seconds()))
            row.last_run_duration_seconds = duration
            row.run_count = int(getattr(row, "run_count", 0) or 0) + 1
            row.total_run_seconds = int(getattr(row, "total_run_seconds", 0) or 0) + duration
        row.last_run_at = now
        row.last_run_status = status
        row.last_run_message = message
    await db.commit()


async def list_due_schedules(db: AsyncSession) -> list[ReportOdakSchedule]:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(ReportOdakSchedule)
        .where(
            ReportOdakSchedule.enabled.is_(True),
            ReportOdakSchedule.next_run_at.is_not(None),
            ReportOdakSchedule.next_run_at <= now,
        )
        .order_by(ReportOdakSchedule.next_run_at.asc())
    )
    return list(result.scalars().all())


async def advance_next_run(db: AsyncSession, schedule: ReportOdakSchedule) -> None:
    schedule.next_run_at = compute_next_run_at(
        getattr(schedule, "frequency", "every_night"),
        schedule.hour,
        schedule.minute,
    )
    await db.commit()
