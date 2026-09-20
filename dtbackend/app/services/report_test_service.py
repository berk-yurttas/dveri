"""Automated report health-test runner with historical persistence."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from clickhouse_driver import Client as ClickHouseClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload, selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.postgres_models import (
    Platform,
    Report,
    ReportQuery,
    ReportTestResult,
    ReportTestRun,
)
from app.schemas.reports import FilterValue
from app.services.report_test_checks import (
    case,
    check_filters,
    check_layout,
    check_query_ui,
    check_report_structure,
    check_result_columns,
    normalize_filter,
    rollup_status,
    summarize_cases,
)
from app.services.reports_service import (
    ReportsService,
    apply_expandable_placeholders,
    extract_dropdown_placeholders,
    extract_expandable_nested_queries,
)

logger = logging.getLogger(__name__)
IST = ZoneInfo("Europe/Istanbul")

_running_lock = asyncio.Lock()
_cancel_flags: dict[int, asyncio.Event] = {}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _default_date_range() -> tuple[str, str]:
    end = datetime.now(IST).date()
    start = end - timedelta(days=30)
    return start.isoformat(), end.isoformat()


def _count_filters(report: Report) -> int:
    total = len(report.global_filters or [])
    for query in report.queries or []:
        total += len(query.filters or [])
    return total


def _elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)


def _stamp_duration(cases: list[dict[str, Any]], started: float) -> list[dict[str, Any]]:
    elapsed = _elapsed_ms(started)
    for item in cases:
        if not item.get("duration_ms"):
            item["duration_ms"] = elapsed
    return cases


def _timed_cases(producer) -> list[dict[str, Any]]:
    started = time.perf_counter()
    return _stamp_duration(list(producer()), started)


def _option_value(option: dict[str, Any] | Any) -> Any:
    if not isinstance(option, dict):
        return option
    value = option.get("value")
    if value is None:
        value = option.get("label")
    return value


def _dropdown_parent_names(filt: dict[str, Any]) -> set[str]:
    names = set(extract_dropdown_placeholders(filt.get("dropdown_query") or ""))
    if filt.get("depends_on"):
        names.add(filt["depends_on"])
    return {name for name in names if name}


def _dropdown_waves(filters: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    remaining = list(filters)
    resolved: set[str] = set()
    waves: list[list[dict[str, Any]]] = []
    while remaining:
        wave: list[dict[str, Any]] = []
        leftover: list[dict[str, Any]] = []
        for filt in remaining:
            parents = _dropdown_parent_names(filt)
            if parents and not parents.issubset(resolved):
                leftover.append(filt)
            else:
                wave.append(filt)
        if not wave:
            waves.append(leftover)
            break
        waves.append(wave)
        for filt in wave:
            resolved.add(filt["field_name"])
            if filt.get("display_name"):
                resolved.add(filt["display_name"])
        remaining = leftover
    return waves


def _dropdown_placeholder_values(
    filt: dict[str, Any],
    option_cache: dict[str, list[dict[str, Any]]],
    siblings: list[dict[str, Any]],
    prefixes: list[str],
) -> dict[str, Any]:
    aliases: dict[str, str] = {}
    for sibling in siblings:
        field = sibling.get("field_name") or ""
        if field:
            aliases[field] = field
        display = sibling.get("display_name") or ""
        if display:
            aliases[display] = field or display
    values: dict[str, Any] = {}
    for name in _dropdown_parent_names(filt):
        cache_field = aliases.get(name, name)
        options: list[dict[str, Any]] = []
        for prefix in prefixes:
            options = option_cache.get(f"{prefix}:{cache_field}") or option_cache.get(f"{prefix}:{name}") or []
            if options:
                break
        if not options:
            continue
        sample = _option_value(options[0])
        if sample is None or sample == "":
            continue
        values[name] = sample
    return values


def _query_concurrency() -> int:
    return max(1, min(int(settings.REPORT_TEST_QUERY_CONCURRENCY), 8))


def _spawn_query_service(db: AsyncSession) -> tuple[ReportsService, ClickHouseClient]:
    client = _clickhouse_client()
    return ReportsService(db, client), client


def _close_clickhouse(client: ClickHouseClient | None) -> None:
    if client is None:
        return
    try:
        client.disconnect()
    except Exception:
        pass


async def _run_limited(items: list[Any], limit: int, handler) -> list[Any]:
    if not items:
        return []
    semaphore = asyncio.Semaphore(max(1, limit))

    async def run(item: Any) -> Any:
        async with semaphore:
            return await handler(item)

    return await asyncio.gather(*(run(item) for item in items), return_exceptions=True)


async def _map_with_services(shared: ReportsService, items: list[Any], handler) -> list[Any]:
    """Run handler(service, item) in parallel with isolated ClickHouse clients when needed."""
    if not items:
        return []
    limit = _query_concurrency()
    if len(items) == 1 or limit <= 1:
        results: list[Any] = []
        for item in items:
            try:
                results.append(await handler(shared, item))
            except Exception as exc:
                results.append(exc)
        return results

    async def wrapped(item: Any) -> Any:
        local, client = _spawn_query_service(shared.db)
        try:
            return await handler(local, item)
        finally:
            _close_clickhouse(client)

    return await _run_limited(items, limit, wrapped)


async def list_runs(
    db: AsyncSession,
    *,
    platform_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ReportTestRun], int]:
    filters = []
    if platform_id is not None:
        filters.append(ReportTestRun.platform_id == platform_id)

    count_stmt = select(func.count(ReportTestRun.id))
    stmt = select(ReportTestRun).options(noload(ReportTestRun.results)).order_by(ReportTestRun.created_at.desc())
    if filters:
        count_stmt = count_stmt.where(*filters)
        stmt = stmt.where(*filters)
    total = int((await db.execute(count_stmt)).scalar() or 0)
    result = await db.execute(stmt.offset(offset).limit(limit))
    return list(result.scalars().all()), total


async def get_run(db: AsyncSession, run_id: int, include_results: bool = True) -> ReportTestRun | None:
    stmt = select(ReportTestRun)
    if include_results:
        stmt = stmt.options(selectinload(ReportTestRun.results))
    else:
        stmt = stmt.options(noload(ReportTestRun.results))
    stmt = stmt.where(ReportTestRun.id == run_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_running_run(db: AsyncSession) -> ReportTestRun | None:
    stmt = (
        select(ReportTestRun)
        .options(noload(ReportTestRun.results))
        .where(ReportTestRun.status.in_(["queued", "running"]))
        .order_by(ReportTestRun.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_summary(db: AsyncSession) -> dict[str, Any]:
    running = await get_running_run(db)
    latest_stmt = (
        select(ReportTestRun)
        .options(noload(ReportTestRun.results))
        .where(ReportTestRun.status.in_(["success", "failed", "cancelled"]))
        .order_by(ReportTestRun.finished_at.desc().nullslast(), ReportTestRun.id.desc())
        .limit(1)
    )
    latest = (await db.execute(latest_stmt)).scalar_one_or_none()

    platforms_stmt = select(Platform).order_by(Platform.display_name)
    platforms = list((await db.execute(platforms_stmt)).scalars().all())

    summaries = []
    for platform in platforms:
        last_run_stmt = (
            select(ReportTestRun)
            .options(noload(ReportTestRun.results))
            .where(
                ReportTestRun.status.in_(["success", "failed", "cancelled"]),
                ReportTestRun.platform_id == platform.id,
            )
            .order_by(ReportTestRun.finished_at.desc().nullslast(), ReportTestRun.id.desc())
            .limit(1)
        )
        last_scoped = (await db.execute(last_run_stmt)).scalar_one_or_none()
        source_run = last_scoped
        if source_run is None and latest is not None:
            source_run = latest

        if not source_run:
            summaries.append({
                "platform_id": platform.id,
                "platform_name": platform.display_name,
                "platform_code": platform.code,
                "last_run_id": None,
                "last_run_at": None,
                "last_run_status": None,
                "passed": 0,
                "failed": 0,
                "skipped": 0,
                "total": 0,
            })
            continue

        counts_stmt = (
            select(ReportTestResult.status, func.count(ReportTestResult.id))
            .where(
                ReportTestResult.run_id == source_run.id,
                ReportTestResult.platform_id == platform.id,
            )
            .group_by(ReportTestResult.status)
        )
        counts = {row[0]: int(row[1]) for row in (await db.execute(counts_stmt)).all()}
        passed = counts.get("passed", 0) + counts.get("warning", 0)
        failed = counts.get("failed", 0) + counts.get("error", 0)
        skipped = counts.get("skipped", 0)
        has_data = last_scoped is not None or any(counts.values())
        summaries.append({
            "platform_id": platform.id,
            "platform_name": platform.display_name,
            "platform_code": platform.code,
            "last_run_id": source_run.id if has_data else None,
            "last_run_at": (source_run.finished_at or source_run.started_at) if has_data else None,
            "last_run_status": source_run.status if has_data else None,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "total": passed + failed + skipped,
        })

    return {
        "latest_run": latest,
        "running_run": running,
        "platforms": summaries,
    }


async def start_run(
    *,
    triggered_by: str | None,
    trigger: str = "manual",
    platform_id: int | None = None,
    report_id: int | None = None,
) -> ReportTestRun:
    async with AsyncSessionLocal() as db:
        existing = await get_running_run(db)
        if existing:
            raise RuntimeError("A report test run is already in progress")

        run = ReportTestRun(
            status="queued",
            trigger=trigger,
            triggered_by=triggered_by,
            platform_id=platform_id,
            report_id=report_id,
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)
        run_id = run.id

    _cancel_flags[run_id] = asyncio.Event()
    asyncio.create_task(_execute_run(run_id), name=f"report-test-run-{run_id}")
    return run


async def request_cancel(run_id: int) -> bool:
    event = _cancel_flags.get(run_id)
    if event:
        event.set()
        return True
    async with AsyncSessionLocal() as db:
        run = await db.get(ReportTestRun, run_id)
        if run and run.status in {"queued", "running"}:
            run.status = "cancelled"
            run.finished_at = _utc_now()
            run.error_message = "Cancelled by user"
            await db.commit()
            return True
    return False


async def _load_reports(db: AsyncSession, platform_id: int | None, report_id: int | None) -> list[Report]:
    stmt = (
        select(Report)
        .options(
            selectinload(Report.queries).selectinload(ReportQuery.filters),
            selectinload(Report.tabs),
            selectinload(Report.platform),
        )
        .where(Report.deleted_at.is_(None), Report.color.isnot(None), Report.color != '#878787')
        .order_by(Report.platform_id.nulls_last(), Report.name)
    )
    if report_id is not None:
        stmt = stmt.where(Report.id == report_id)
    elif platform_id is not None:
        stmt = stmt.where(Report.platform_id == platform_id)
    result = await db.execute(stmt)
    return list(result.scalars().unique().all())


def _clickhouse_client() -> ClickHouseClient:
    return ClickHouseClient(
        host=settings.CLICKHOUSE_HOST,
        port=settings.CLICKHOUSE_PORT,
        user=settings.CLICKHOUSE_USER,
        password=settings.CLICKHOUSE_PASSWORD,
        database=settings.CLICKHOUSE_DB,
    )


async def _execute_run(run_id: int) -> None:
    cancel_event = _cancel_flags.setdefault(run_id, asyncio.Event())
    async with _running_lock:
        try:
            async with AsyncSessionLocal() as db:
                run = await db.get(ReportTestRun, run_id)
                if not run or run.status == "cancelled":
                    return
                reports = await _load_reports(db, run.platform_id, run.report_id)
                run.status = "running"
                run.started_at = _utc_now()
                run.total_reports = len(reports)
                await db.commit()
                report_ids = [report.id for report in reports]

            concurrency = max(1, min(int(settings.REPORT_TEST_CONCURRENCY), 8))
            semaphore = asyncio.Semaphore(concurrency)
            progress_lock = asyncio.Lock()
            in_flight: set[str] = set()
            counters = {
                "passed": 0,
                "failed": 0,
                "skipped": 0,
                "processed": 0,
                "total_cases": 0,
                "passed_cases": 0,
                "failed_cases": 0,
            }

            async def worker(report_id: int) -> None:
                async with semaphore:
                    if cancel_event.is_set():
                        return
                    try:
                        await _run_one_report(
                            run_id,
                            report_id,
                            cancel_event,
                            progress_lock,
                            in_flight,
                            counters,
                        )
                    except Exception:
                        logger.exception("Report worker crashed for report %s", report_id)
                        async with progress_lock:
                            counters["failed"] += 1
                            counters["processed"] += 1
                            await _write_run_progress_counts(run_id, in_flight, counters)

            await asyncio.gather(*(worker(report_id) for report_id in report_ids), return_exceptions=True)

            async with AsyncSessionLocal() as db:
                run = await db.get(ReportTestRun, run_id)
                if not run:
                    return
                if cancel_event.is_set() and run.status != "cancelled":
                    run.status = "cancelled"
                    run.error_message = run.error_message or "Cancelled by user"
                elif run.status != "cancelled":
                    run.status = "failed" if counters["failed"] else "success"
                run.passed_reports = counters["passed"]
                run.failed_reports = counters["failed"]
                run.warning_reports = 0
                run.skipped_reports = counters["skipped"]
                run.total_cases = counters["total_cases"]
                run.passed_cases = counters["passed_cases"]
                run.failed_cases = counters["failed_cases"]
                run.warning_cases = 0
                run.processed_reports = counters["processed"]
                run.finished_at = _utc_now()
                run.current_report_id = None
                run.current_report_name = None
                await db.commit()
        except Exception:
            logger.exception("Report test run %s failed", run_id)
            async with AsyncSessionLocal() as db:
                run = await db.get(ReportTestRun, run_id)
                if run and run.status != "cancelled":
                    run.status = "failed"
                    run.finished_at = _utc_now()
                    run.error_message = "Test runner crashed"
                    await db.commit()
        finally:
            _cancel_flags.pop(run_id, None)
            try:
                from app.services.report_test_schedule import notify_scheduled_run
                await notify_scheduled_run(run_id)
            except Exception:
                logger.exception("Failed to send report test summary mail for run %s", run_id)


async def _run_one_report(
    run_id: int,
    report_id: int,
    cancel_event: asyncio.Event,
    progress_lock: asyncio.Lock,
    in_flight: set[str],
    counters: dict[str, int],
) -> None:
    clickhouse_client = _clickhouse_client()
    report_name = f"Report {report_id}"
    try:
        async with AsyncSessionLocal() as db:
            reports = await _load_reports(db, None, report_id)
            if not reports:
                async with progress_lock:
                    counters["skipped"] += 1
                    counters["processed"] += 1
                    await _write_run_progress_counts(run_id, in_flight, counters)
                return
            report = reports[0]
            report_name = report.name or report_name
            platform_id = report.platform_id
            platform_name = report.platform.display_name if report.platform else None
            platform_code = report.platform.code if report.platform else None
            query_count = len(report.queries or [])
            filter_count = _count_filters(report)
            if cancel_event.is_set():
                async with progress_lock:
                    counters["skipped"] += 1
                    counters["processed"] += 1
                    await _write_run_progress_counts(run_id, in_flight, counters)
                return
            async with progress_lock:
                in_flight.add(report_name)
                await _write_run_progress(run_id, report, in_flight, counters)

            service = ReportsService(db, clickhouse_client)
            started = time.perf_counter()
            try:
                result_row, cases = await _test_report(service, report)
            except Exception as exc:
                logger.exception("Report test crashed for report %s", report_id)
                try:
                    await db.rollback()
                except Exception:
                    pass
                cases = [case(
                    "runner_error",
                    "error",
                    "Rapor kontrolü",
                    "failed",
                    "Bu rapor kontrol edilirken beklenmeyen bir sorun oluştu.",
                    _elapsed_ms(started),
                )]
                result_row = ReportTestResult(
                    report_id=report_id,
                    report_name=report_name,
                    platform_id=platform_id,
                    platform_name=platform_name,
                    platform_code=platform_code,
                    status="error",
                    duration_ms=int(_elapsed_ms(started)),
                    query_count=query_count,
                    filter_count=filter_count,
                    row_count_total=0,
                    summary=str(exc),
                    cases=cases,
                )

            result_row.run_id = run_id
            db.add(result_row)
            await db.commit()
            async with progress_lock:
                in_flight.discard(report_name)
                if result_row.status in {"passed", "warning"}:
                    counters["passed"] += 1
                elif result_row.status == "skipped":
                    counters["skipped"] += 1
                else:
                    counters["failed"] += 1
                counters["processed"] += 1
                counters["total_cases"] += len(cases)
                counters["passed_cases"] += sum(1 for item in cases if item.get("status") in {"passed", "warning"})
                counters["failed_cases"] += sum(1 for item in cases if item.get("status") in {"failed", "error"})
                await _write_run_progress(run_id, report, in_flight, counters)
    finally:
        _close_clickhouse(clickhouse_client)


async def _write_run_progress(
    run_id: int,
    report: Report,
    in_flight: set[str],
    counters: dict[str, int],
) -> None:
    async with AsyncSessionLocal() as db:
        run = await db.get(ReportTestRun, run_id)
        if not run:
            return
        run.current_report_id = report.id if in_flight else None
        names = sorted(in_flight)
        if len(names) > 2:
            run.current_report_name = f"{names[0]}, {names[1]} +{len(names) - 2}"
        else:
            run.current_report_name = ", ".join(names) or None
        run.processed_reports = counters["processed"]
        run.passed_reports = counters["passed"]
        run.failed_reports = counters["failed"]
        run.warning_reports = 0
        run.skipped_reports = counters["skipped"]
        run.total_cases = counters["total_cases"]
        run.passed_cases = counters["passed_cases"]
        run.failed_cases = counters["failed_cases"]
        run.warning_cases = 0
        await db.commit()


async def _write_run_progress_counts(
    run_id: int,
    in_flight: set[str],
    counters: dict[str, int],
) -> None:
    async with AsyncSessionLocal() as db:
        run = await db.get(ReportTestRun, run_id)
        if not run:
            return
        names = sorted(in_flight)
        run.current_report_id = None
        if len(names) > 2:
            run.current_report_name = f"{names[0]}, {names[1]} +{len(names) - 2}"
        else:
            run.current_report_name = ", ".join(names) or None
        run.processed_reports = counters["processed"]
        run.passed_reports = counters["passed"]
        run.failed_reports = counters["failed"]
        run.warning_reports = 0
        run.skipped_reports = counters["skipped"]
        run.total_cases = counters["total_cases"]
        run.passed_cases = counters["passed_cases"]
        run.failed_cases = counters["failed_cases"]
        run.warning_cases = 0
        await db.commit()


async def _test_report(
    service: ReportsService,
    report: Report,
) -> tuple[ReportTestResult, list[dict[str, Any]]]:
    started = time.perf_counter()
    cases: list[dict[str, Any]] = []
    row_count_total = 0

    cases.extend(_timed_cases(lambda: check_report_structure(report)))
    cases.extend(_timed_cases(lambda: check_layout(report)))
    cases.extend(_timed_cases(lambda: check_filters(report.global_filters or [], "Global", f"report_{report.id}")))

    option_cache: dict[str, list[dict[str, Any]]] = {}
    queries = list(report.queries or [])

    global_dropdowns = [
        filt for raw in (report.global_filters or [])
        for filt in [normalize_filter(raw)]
        if filt["type"] in {"dropdown", "multiselect"} and filt["dropdown_query"]
    ]

    async def run_global_dropdown(local_service: ReportsService, filt: dict[str, Any]) -> dict[str, Any]:
        options, option_case = await _test_dropdown(
            local_service,
            report,
            f"global_{report.id}_{filt['field_name']}",
            f"Global filter options: {filt['display_name']}",
            filt["dropdown_query"],
            placeholder_values=_dropdown_placeholder_values(filt, option_cache, global_dropdowns, ["global"]),
        )
        option_cache[f"global:{filt['field_name']}"] = options
        return option_case

    for wave in _dropdown_waves(global_dropdowns):
        for result in await _map_with_services(service, wave, run_global_dropdown):
            if isinstance(result, Exception):
                cases.append(case(
                    "global_dropdown_error",
                    "filter",
                    "Global filter options",
                    "failed",
                    str(result),
                ))
            else:
                cases.append(result)

    async def run_query(local_service: ReportsService, query: ReportQuery) -> tuple[list[dict[str, Any]], int]:
        return await _test_query(local_service, report, query, option_cache)

    if not report.is_direct_link or queries:
        for result in await _map_with_services(service, queries, run_query):
            if isinstance(result, Exception):
                cases.append(case(
                    "query_worker_error",
                    "query",
                    "Query test worker",
                    "failed",
                    str(result),
                ))
                continue
            query_cases, query_rows = result
            cases.extend(query_cases)
            row_count_total += query_rows

    status = rollup_status(cases)
    duration_ms = int(_elapsed_ms(started))
    result = ReportTestResult(
        report_id=report.id,
        report_name=report.name or f"Report {report.id}",
        platform_id=report.platform_id,
        platform_name=report.platform.display_name if report.platform else None,
        platform_code=report.platform.code if report.platform else None,
        status=status,
        duration_ms=duration_ms,
        query_count=len(queries),
        filter_count=_count_filters(report),
        row_count_total=row_count_total,
        summary=summarize_cases(cases),
        cases=cases,
    )
    return result, cases


async def _test_dropdown(
    service: ReportsService,
    report: Report,
    case_id: str,
    name: str,
    dropdown_query: str,
    placeholder_values: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    started = time.perf_counter()
    try:
        payload = await service.run_dropdown_query(
            dropdown_query,
            db_config=report.db_config,
            platform=report.platform,
            page=1,
            page_size=20,
            placeholder_values=placeholder_values,
        )
        options = payload.get("options") or []
        total = payload.get("total") or len(options)
        duration_ms = _elapsed_ms(started)
        if total == 0:
            return options, case(
                case_id,
                "filter",
                name,
                "passed",
                "Dropdown query returned 0 options",
                duration_ms,
                meta={"option_count": 0},
            )
        return options, case(
            case_id,
            "filter",
            name,
            "passed",
            f"{total} option(s)",
            duration_ms,
            meta={
                "option_count": total,
                "sample": [str(opt.get("label") or opt.get("value")) for opt in options[:5]],
            },
        )
    except Exception as exc:
        return [], case(case_id, "filter", name, "failed", str(exc), _elapsed_ms(started))


def _build_filter_values(
    filters: list[dict[str, Any]],
    option_cache: dict[str, list[dict[str, Any]]],
    cache_prefix: str,
    include_optional_dropdowns: bool,
) -> tuple[list[FilterValue], list[str]]:
    values: list[FilterValue] = []
    missing_required: list[str] = []
    start, end = _default_date_range()

    for filt in filters:
        field = filt["field_name"]
        if not field:
            continue
        ftype = filt["type"]
        if ftype == "date":
            values.append(FilterValue(field_name=field, value=[start, end], operator="BETWEEN"))
            continue
        if ftype in {"dropdown", "multiselect"}:
            if not include_optional_dropdowns and not filt["required"]:
                continue
            options = option_cache.get(f"{cache_prefix}:{field}") or []
            if not options:
                if filt["required"]:
                    missing_required.append(filt["display_name"] or field)
                continue
            sample = _option_value(options[0])
            if ftype == "multiselect":
                values.append(FilterValue(field_name=field, value=[sample], operator="IN"))
            else:
                values.append(FilterValue(field_name=field, value=sample, operator="="))
            continue
        if filt["required"]:
            missing_required.append(filt["display_name"] or field)
    return values, missing_required


async def _execute_query_safe(
    service: ReportsService,
    report: Report,
    query: ReportQuery,
    filter_values: list[FilterValue],
) -> Any:
    viz_type = "table"
    if isinstance(query.visualization_config, dict):
        viz_type = query.visualization_config.get("type") or "table"
    return await service.execute_query(
        query,
        filter_values,
        limit=settings.REPORT_TEST_QUERY_LIMIT,
        visualization_type=viz_type,
        platform=report.platform,
        global_filters=report.global_filters or [],
        db_config=report.db_config,
        filter_by_department=False,
    )


async def _test_query(
    service: ReportsService,
    report: Report,
    query: ReportQuery,
    option_cache: dict[str, list[dict[str, Any]]],
) -> tuple[list[dict[str, Any]], int]:
    cases: list[dict[str, Any]] = []
    qid = query.id
    qname = query.name or f"Query {qid}"
    row_count = 0

    cases.extend(_timed_cases(lambda: check_query_ui(query)))
    query_filters = [normalize_filter(item) for item in (query.filters or [])]
    cases.extend(_timed_cases(lambda: check_filters(query.filters or [], f"Query {qname}", f"query_{qid}")))

    query_dropdowns = [
        filt for filt in query_filters
        if filt["type"] in {"dropdown", "multiselect"} and filt["dropdown_query"]
    ]
    for filt in [item for wave in _dropdown_waves(query_dropdowns) for item in wave]:
        options, option_case = await _test_dropdown(
            service,
            report,
            f"query_{qid}_filter_{filt['field_name']}_options",
            f"Filter options '{filt['display_name']}' on {qname}",
            filt["dropdown_query"],
            placeholder_values=_dropdown_placeholder_values(
                filt,
                option_cache,
                query_filters + [normalize_filter(item) for item in (report.global_filters or [])],
                [f"query_{qid}", "global"],
            ),
        )
        cases.append(option_case)
        option_cache[f"query_{qid}:{filt['field_name']}"] = options

    combined_filters = query_filters + [normalize_filter(item) for item in (report.global_filters or [])]
    merged_cache: dict[str, list[dict[str, Any]]] = {}
    for filt in query_filters:
        merged_cache[f"all:{filt['field_name']}"] = option_cache.get(f"query_{qid}:{filt['field_name']}", [])
    for raw in report.global_filters or []:
        filt = normalize_filter(raw)
        merged_cache[f"all:{filt['field_name']}"] = option_cache.get(f"global:{filt['field_name']}", [])

    baseline_values, missing = _build_filter_values(
        combined_filters, merged_cache, "all", include_optional_dropdowns=False
    )
    if missing:
        cases.append(case(
            f"query_{qid}_required_filters",
            "filter",
            f"Required filters for {qname}",
            "failed",
            f"Required filters have no sample values: {', '.join(missing)}",
        ))
        return cases, 0

    exec_result = None
    started = time.perf_counter()
    try:
        exec_result = await _execute_query_safe(service, report, query, baseline_values)
        duration_ms = _elapsed_ms(started)
        if not exec_result.success:
            cases.append(case(
                f"query_{qid}_execute",
                "query",
                f"Execute query: {qname}",
                "failed",
                exec_result.message or "Query execution failed",
                duration_ms,
            ))
            return cases, 0
        row_count = exec_result.total_rows or len(exec_result.data or [])
        cases.append(case(
            f"query_{qid}_execute",
            "query",
            f"Execute query: {qname}",
            "passed",
            exec_result.message or f"{row_count} row(s)",
            duration_ms,
            meta={"row_count": row_count, "column_count": len(exec_result.columns or [])},
        ))
        cases.extend(_stamp_duration(check_result_columns(
            query,
            exec_result.columns or [],
            row_count,
            exec_result.execution_time_ms or duration_ms,
            settings.REPORT_TEST_SLOW_QUERY_MS,
        ), started))
    except Exception as exc:
        cases.append(case(
            f"query_{qid}_execute",
            "query",
            f"Execute query: {qname}",
            "failed",
            str(exc),
            _elapsed_ms(started),
        ))
        return cases, 0

    sample_values, _ = _build_filter_values(
        combined_filters, merged_cache, "all", include_optional_dropdowns=True
    )
    extra_applied = [
        fv.field_name for fv in sample_values
        if fv.field_name not in {v.field_name for v in baseline_values}
    ]
    if extra_applied:
        started = time.perf_counter()
        try:
            filtered = await _execute_query_safe(service, report, query, sample_values)
            duration_ms = _elapsed_ms(started)
            if not filtered.success:
                cases.append(case(
                    f"query_{qid}_filtered_execute",
                    "filter",
                    f"Execute {qname} with sample filter values",
                    "failed",
                    filtered.message or "Filtered execution failed",
                    duration_ms,
                ))
            else:
                filtered_rows = filtered.total_rows or len(filtered.data or [])
                cases.append(case(
                    f"query_{qid}_filtered_execute",
                    "filter",
                    f"Execute {qname} with sample filter values",
                    "passed",
                    f"{filtered_rows} row(s) with sample filters",
                    duration_ms,
                    meta={"row_count": filtered_rows, "filters": extra_applied},
                ))
        except Exception as exc:
            cases.append(case(
                f"query_{qid}_filtered_execute",
                "filter",
                f"Execute {qname} with sample filter values",
                "failed",
                str(exc),
                _elapsed_ms(started),
            ))

    nested = extract_expandable_nested_queries(query.visualization_config)
    if nested and exec_result and exec_result.success and exec_result.columns:
        first_nested = nested[0] if isinstance(nested[0], dict) else None
        if first_nested and first_nested.get("sql"):
            fields = first_nested.get("expandableFields") or first_nested.get("expandable_fields") or []
            parent_row = (exec_result.data or [[]])[0] if exec_result.data else []
            if parent_row and fields:
                processed = apply_expandable_placeholders(
                    first_nested["sql"],
                    fields,
                    exec_result.columns,
                    parent_row,
                )
                nested_obj = type("NestedQuery", (), {})()
                nested_obj.id = query.id
                nested_obj.name = f"{qname} nested"
                nested_obj.sql = processed
                nested_obj.visualization_config = {"type": "table"}
                nested_obj.filters = []
                started = time.perf_counter()
                try:
                    nested_result = await _execute_query_safe(service, report, nested_obj, [])
                    duration_ms = _elapsed_ms(started)
                    if nested_result.success:
                        nested_rows = nested_result.total_rows or len(nested_result.data or [])
                        cases.append(case(
                            f"query_{qid}_nested_execute",
                            "query",
                            f"Execute nested query of {qname}",
                            "passed",
                            f"{nested_rows} nested row(s)",
                            duration_ms,
                            meta={"row_count": nested_rows},
                        ))
                    else:
                        cases.append(case(
                            f"query_{qid}_nested_execute",
                            "query",
                            f"Execute nested query of {qname}",
                            "failed",
                            nested_result.message or "Nested query failed",
                            duration_ms,
                        ))
                except Exception as exc:
                    cases.append(case(
                        f"query_{qid}_nested_execute",
                        "query",
                        f"Execute nested query of {qname}",
                        "failed",
                        str(exc),
                        _elapsed_ms(started),
                    ))
            elif not exec_result.data:
                cases.append(case(
                    f"query_{qid}_nested_execute",
                    "query",
                    f"Execute nested query of {qname}",
                    "skipped",
                    "Parent query returned no rows; nested query was not executed",
                ))

    return cases, row_count
