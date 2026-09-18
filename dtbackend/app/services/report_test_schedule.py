"""Per-platform report-test schedules and summary mail."""

from __future__ import annotations

import logging
import re
import smtplib
from datetime import datetime
from email.message import EmailMessage
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.postgres_models import Platform, ReportTestResult, ReportTestRun, ReportTestSchedule

logger = logging.getLogger(__name__)
IST = ZoneInfo("Europe/Istanbul")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def parse_recipients(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = re.split(r"[,\s;]+", raw)
    elif isinstance(raw, (list, tuple, set)):
        parts = []
        for item in raw:
            parts.extend(re.split(r"[,\s;]+", str(item)))
    else:
        parts = re.split(r"[,\s;]+", str(raw))
    seen: set[str] = set()
    emails: list[str] = []
    for part in parts:
        email = part.strip().lower()
        if not email or not EMAIL_RE.match(email) or email in seen:
            continue
        seen.add(email)
        emails.append(email)
    return emails


def is_schedule_due(now: datetime, hour: int, minute: int, last_started_at: datetime | None) -> bool:
    current = now.astimezone(IST) if now.tzinfo else now.replace(tzinfo=IST)
    scheduled = current.replace(hour=int(hour), minute=int(minute), second=0, microsecond=0)
    if current < scheduled:
        return False
    if last_started_at is None:
        return True
    last = last_started_at.astimezone(IST) if last_started_at.tzinfo else last_started_at.replace(tzinfo=IST)
    return last.date() < current.date()


def run_detail_url(run_id: int) -> str:
    raw = settings.REPORT_TEST_FRONTEND_URL
    if isinstance(raw, (list, tuple)):
        raw = raw[0] if raw else "http://localhost:3000"
    base = str(raw).split(",")[0].strip().rstrip("/")
    return f"{base}/admin/report-tests/{run_id}"


def _schedule_out(platform: Platform, schedule: ReportTestSchedule | None) -> dict[str, Any]:
    return {
        "platform_id": platform.id,
        "platform_name": platform.display_name or platform.name,
        "platform_code": platform.code,
        "enabled": bool(schedule.enabled) if schedule else False,
        "hour": int(schedule.hour) if schedule else 2,
        "minute": int(schedule.minute) if schedule else 0,
        "recipients": list(schedule.recipients or []) if schedule else [],
        "last_started_at": schedule.last_started_at if schedule else None,
    }


async def list_schedules(db: AsyncSession) -> list[dict[str, Any]]:
    platforms = list((await db.execute(select(Platform).order_by(Platform.display_name))).scalars().all())
    rows = list((await db.execute(select(ReportTestSchedule))).scalars().all())
    by_platform = {row.platform_id: row for row in rows}
    return [_schedule_out(platform, by_platform.get(platform.id)) for platform in platforms]


async def upsert_schedule(
    db: AsyncSession,
    platform_id: int,
    *,
    enabled: bool,
    hour: int,
    minute: int,
    recipients: list[str],
) -> dict[str, Any]:
    platform = await db.get(Platform, platform_id)
    if not platform:
        raise ValueError("Platform not found")
    emails = parse_recipients(recipients)
    row = (
        await db.execute(select(ReportTestSchedule).where(ReportTestSchedule.platform_id == platform_id))
    ).scalar_one_or_none()
    if not row:
        row = ReportTestSchedule(platform_id=platform_id)
        db.add(row)
    row.enabled = bool(enabled)
    row.hour = int(hour)
    row.minute = int(minute)
    row.recipients = emails
    await db.commit()
    await db.refresh(row)
    return _schedule_out(platform, row)


async def due_schedules(db: AsyncSession, now: datetime | None = None) -> list[ReportTestSchedule]:
    current = now or datetime.now(IST)
    rows = list(
        (
            await db.execute(
                select(ReportTestSchedule)
                .options(selectinload(ReportTestSchedule.platform))
                .where(ReportTestSchedule.enabled.is_(True))
            )
        ).scalars().all()
    )
    due = [
        row
        for row in rows
        if (row.platform is None or row.platform.is_active)
        and is_schedule_due(current, row.hour, row.minute, row.last_started_at)
    ]
    if not due:
        return []
    day_start = current.replace(hour=0, minute=0, second=0, microsecond=0)
    already = set(
        (
            await db.execute(
                select(ReportTestRun.platform_id).where(
                    ReportTestRun.trigger == "scheduled",
                    ReportTestRun.platform_id.in_([row.platform_id for row in due]),
                    ReportTestRun.created_at >= day_start,
                )
            )
        ).scalars().all()
    )
    return [row for row in due if row.platform_id not in already]


async def mark_started(platform_id: int, when: datetime | None = None) -> None:
    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(select(ReportTestSchedule).where(ReportTestSchedule.platform_id == platform_id))
        ).scalar_one_or_none()
        if not row:
            return
        row.last_started_at = when or datetime.now(IST)
        await db.commit()


def build_summary_email(
    *,
    platform_name: str,
    run: ReportTestRun,
    failed_names: list[str],
) -> tuple[str, str, str]:
    url = run_detail_url(run.id)
    failed = int(run.failed_reports or 0)
    passed = int(run.passed_reports or 0)
    total = int(run.total_reports or 0)
    status_label = "hatalı" if failed or run.status == "failed" else "sorunsuz"
    subject = f"{platform_name} rapor kontrolü: {failed} hata, {passed} sorunsuz"
    failed_lines = "".join(f"<li>{name}</li>" for name in failed_names[:20])
    extra = f"<p>ve {len(failed_names) - 20} hata daha.</p>" if len(failed_names) > 20 else ""
    failed_block = (
        f"<p><b>Hatalı raporlar</b></p><ul>{failed_lines}</ul>{extra}"
        if failed_names
        else "<p>Hatalı rapor yok.</p>"
    )
    html = f"""
    <html><body>
      <p>{platform_name} platformu için otomatik rapor kontrolü {status_label} tamamlandı.</p>
      <p>
        Toplam rapor: {total}<br/>
        Sorunsuz: {passed}<br/>
        Hata: {failed}
      </p>
      {failed_block}
      <p>Ayrıntılar için: <a href="{url}">{url}</a></p>
    </body></html>
    """
    text = (
        f"{platform_name} rapor kontrolü {status_label} tamamlandı.\n"
        f"Toplam: {total}, sorunsuz: {passed}, hata: {failed}\n"
        + (("Hatalı raporlar: " + ", ".join(failed_names[:20]) + "\n") if failed_names else "")
        + f"Ayrıntılar: {url}\n"
    )
    return subject, html, text


def send_email(recipients: list[str], subject: str, html: str, text: str) -> None:
    emails = parse_recipients(recipients)
    if not emails:
        return
    host = (settings.SMTP_HOST or "").strip()
    if not host:
        logger.info("SMTP_HOST is empty; report test summary mail was not sent")
        return
    sender = (settings.SMTP_FROM or settings.SMTP_USER or "noreply@localhost").strip()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = ", ".join(emails)
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    port = int(settings.SMTP_PORT or 25)
    if port == 465:
        client: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=20)
    else:
        client = smtplib.SMTP(host, port, timeout=20)
    try:
        client.ehlo()
        if settings.SMTP_USE_TLS and port != 465:
            client.starttls()
            client.ehlo()
        _smtp_login(client)
        client.send_message(message)
    finally:
        try:
            client.quit()
        except Exception:
            pass


def _smtp_auth_methods(client: smtplib.SMTP) -> list[str]:
    return (client.esmtp_features.get("auth") or "").upper().split()


def _smtp_login(client: smtplib.SMTP) -> None:
    user = (settings.SMTP_USER or "").strip()
    password = settings.SMTP_PASSWORD or ""
    if not user:
        return
    advertised = _smtp_auth_methods(client)
    if any(method in advertised for method in ("PLAIN", "LOGIN", "CRAM-MD5")):
        client.login(user, password)
        return
    # Exchange on port 25 without TLS often advertises only NTLM/XOAUTH2.
    # Python's SMTP.login() cannot use those, and internal relays usually
    # accept mail without AUTH when SMTP_USE_TLS is false.
    logger.warning(
        "SMTP AUTH methods %s are not usable without TLS; sending without login",
        advertised or ["none"],
    )


async def notify_scheduled_run(run_id: int) -> None:
    async with AsyncSessionLocal() as db:
        run = (
            await db.execute(
                select(ReportTestRun)
                .options(selectinload(ReportTestRun.results))
                .where(ReportTestRun.id == run_id)
            )
        ).scalar_one_or_none()
        if not run or run.trigger != "scheduled" or run.status == "cancelled":
            return
        if not run.platform_id:
            return
        schedule = (
            await db.execute(
                select(ReportTestSchedule)
                .options(selectinload(ReportTestSchedule.platform))
                .where(ReportTestSchedule.platform_id == run.platform_id)
            )
        ).scalar_one_or_none()
        recipients = parse_recipients(schedule.recipients if schedule else [])
        if not recipients:
            return
        platform_name = (
            schedule.platform.display_name
            if schedule and schedule.platform
            else f"Platform {run.platform_id}"
        )
        failed_names = [
            result.report_name
            for result in (run.results or [])
            if (result.status or "") in {"failed", "error"}
        ]
        subject, html, text = build_summary_email(
            platform_name=platform_name,
            run=run,
            failed_names=failed_names,
        )
    import asyncio
    await asyncio.to_thread(send_email, recipients, subject, html, text)
