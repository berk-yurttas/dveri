"""Playwright UI tests that drive report pages like a real user."""

from __future__ import annotations

import asyncio
import logging
import sys
import threading
import time
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.models.postgres_models import Report
from app.services.report_test_checks import case, normalize_filter

logger = logging.getLogger(__name__)
IST = ZoneInfo("Europe/Istanbul")

try:
    from playwright.async_api import Browser, BrowserContext, Page, async_playwright
except ImportError:  # pragma: no cover
    Browser = Any  # type: ignore
    BrowserContext = Any  # type: ignore
    Page = Any  # type: ignore
    async_playwright = None


def playwright_available() -> bool:
    return async_playwright is not None


def _ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)


def _frontend_url() -> str:
    raw = settings.REPORT_TEST_FRONTEND_URL
    if isinstance(raw, (list, tuple)):
        raw = raw[0] if raw else "http://localhost:3000"
    return str(raw).split(",")[0].strip().rstrip("/")


def _snapshot_report(report: Report) -> SimpleNamespace:
    """Copy ORM fields so Playwright can run on another thread."""
    platform = None
    if getattr(report, "platform", None) is not None:
        platform = SimpleNamespace(code=report.platform.code)
    queries = [
        SimpleNamespace(
            id=query.id,
            name=query.name,
            tab_id=getattr(query, "tab_id", None),
            visualization_config=(
                dict(query.visualization_config)
                if isinstance(query.visualization_config, dict)
                else query.visualization_config
            ),
        )
        for query in (report.queries or [])
    ]
    tabs = [
        SimpleNamespace(
            id=tab.id,
            name=tab.name,
            order_index=getattr(tab, "order_index", 0) or 0,
        )
        for tab in (report.tabs or [])
    ]
    return SimpleNamespace(
        id=report.id,
        name=report.name,
        platform=platform,
        global_filters=list(report.global_filters or []),
        queries=queries,
        tabs=tabs,
    )


class _PlaywrightThread:
    """Run Playwright on a Proactor loop.

    Uvicorn --reload on Windows forces WindowsSelectorEventLoopPolicy, which
    cannot spawn subprocesses and raises a blank NotImplementedError.
    """

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._ready = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._ready.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="report-ui-playwright",
            daemon=True,
        )
        self._thread.start()
        if not self._ready.wait(timeout=15):
            raise RuntimeError("Playwright thread failed to start")

    def _run(self) -> None:
        if sys.platform == "win32":
            loop: asyncio.AbstractEventLoop = asyncio.ProactorEventLoop()
        else:
            loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)
        self._ready.set()
        loop.run_forever()
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        loop.run_until_complete(loop.shutdown_asyncgens())
        loop.close()

    async def run(self, coro):
        loop = self._loop
        if loop is None or not loop.is_running():
            raise RuntimeError("Playwright thread is not running")
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        return await asyncio.wrap_future(future)

    def stop(self) -> None:
        loop = self._loop
        if loop is not None and loop.is_running():
            loop.call_soon_threadsafe(loop.stop)
        if self._thread is not None:
            self._thread.join(timeout=15)
        self._thread = None
        self._loop = None


class ReportUiTester:
    def __init__(self, cookies: dict[str, str] | None = None):
        self.cookies = cookies or {}
        self._playwright = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._thread = _PlaywrightThread()

    async def start(self) -> None:
        if not playwright_available():
            raise RuntimeError("playwright is not installed. Run: pip install playwright && playwright install chromium")
        self._thread.start()
        try:
            await self._thread.run(self._start_browser())
        except Exception:
            self._thread.stop()
            raise

    async def _start_browser(self) -> None:
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=settings.REPORT_TEST_UI_HEADLESS,
            args=["--disable-gpu", "--disable-dev-shm-usage"],
        )
        base_url = _frontend_url()
        parsed = urlparse(base_url)
        self._context = await self._browser.new_context(
            base_url=base_url,
            viewport={"width": 1440, "height": 900},
            ignore_https_errors=True,
            locale="tr-TR",
        )
        await self._context.add_cookies(self._playwright_cookies(parsed))

    async def close(self) -> None:
        try:
            if self._thread._loop is not None and self._thread._loop.is_running():
                await self._thread.run(self._close_browser())
        finally:
            self._thread.stop()

    async def _close_browser(self) -> None:
        if self._context:
            await self._context.close()
            self._context = None
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

    def _playwright_cookies(self, parsed) -> list[dict[str, Any]]:
        host = parsed.hostname or "localhost"
        domains = {host}
        if host == "localhost":
            domains.add("127.0.0.1")
        cookie_domain = (settings.COOKIE_DOMAIN or "").strip()
        if cookie_domain and cookie_domain not in {"localhost", "none"}:
            domains.add(cookie_domain.lstrip("."))
        cors = settings.CORS_ORIGIN
        if isinstance(cors, list):
            cors_url = cors[0] if cors else ""
        else:
            cors_url = str(cors).split(",")[0]
        api_host = urlparse(cors_url).hostname if cors_url else None
        if api_host:
            domains.add(api_host)

        cookies = []
        for name, value in self.cookies.items():
            if not value:
                continue
            for domain in domains:
                cookies.append({
                    "name": name,
                    "value": value,
                    "domain": domain,
                    "path": "/",
                    "httpOnly": name.endswith("_token"),
                    "secure": parsed.scheme == "https",
                    "sameSite": "Lax",
                })
        return cookies

    async def test_report(self, report: Report) -> list[dict[str, Any]]:
        snapshot = _snapshot_report(report)
        return await self._thread.run(self._test_report_on_page(snapshot))

    async def _test_report_on_page(self, report: Any) -> list[dict[str, Any]]:
        if not self._context:
            return [case(
                "ui_browser",
                "ui",
                "Browser session",
                "failed",
                "UI tester was not started",
            )]

        platform_code = report.platform.code if report.platform else None
        if not platform_code:
            return [case(
                "ui_url",
                "ui",
                "Open report page",
                "failed",
                "Report has no platform code; cannot build the UI URL",
            )]

        url = f"/{platform_code}/reports/{report.id}"
        page = await self._context.new_page()
        timeout = settings.REPORT_TEST_UI_TIMEOUT_MS
        page.set_default_timeout(timeout)
        page.set_default_navigation_timeout(timeout)
        console_errors: list[str] = []
        page_errors: list[str] = []
        failed_apis: list[str] = []

        def on_console(msg):
            if msg.type == "error":
                text = msg.text or ""
                if "Download the React DevTools" in text:
                    return
                console_errors.append(text[:400])

        def on_page_error(err):
            page_errors.append(str(err)[:400])

        def on_response(response):
            try:
                status = response.status
                resp_url = response.url
                if status >= 400 and any(part in resp_url for part in ("/reports/", "/filters/", "/execute")):
                    failed_apis.append(f"{status} {resp_url.split('?')[0]}"[:300])
            except Exception:
                pass

        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.on("response", on_response)

        cases: list[dict[str, Any]] = []
        started = time.perf_counter()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            await page.wait_for_timeout(500)

            if "login" in page.url.lower() or "rdct" in page.url.lower():
                cases.append(case(
                    "ui_auth",
                    "ui",
                    "Open report as logged-in user",
                    "failed",
                    f"Browser was redirected to login: {page.url}",
                    _ms(started),
                ))
                return cases

            load_error = page.locator('[data-testid="report-load-error"]')
            if await load_error.count():
                text = (await load_error.inner_text()).strip()
                cases.append(case(
                    "ui_load",
                    "ui",
                    "Report page loads",
                    "failed",
                    text or "Report page rendered a load error",
                    _ms(started),
                ))
                return cases

            title = page.locator('[data-testid="report-title"]')
            try:
                await title.wait_for(state="visible", timeout=timeout)
                shown = (await title.inner_text()).strip()
                cases.append(case(
                    "ui_load",
                    "ui",
                    "Report page loads",
                    "passed",
                    f"Opened '{shown}' as a user at {url}",
                    _ms(started),
                ))
            except Exception:
                cases.append(case(
                    "ui_load",
                    "ui",
                    "Report page loads",
                    "failed",
                    f"Report title did not appear at {url}",
                    _ms(started),
                ))
                return cases

            cases.extend(await self._exercise_filters(page, report))
            cases.extend(await self._exercise_tabs_and_queries(page, report, timeout))

            if failed_apis:
                unique = list(dict.fromkeys(failed_apis))[:8]
                cases.append(case(
                    "ui_network",
                    "ui",
                    "No failed report API calls",
                    "failed",
                    "; ".join(unique),
                    _ms(started),
                ))
            else:
                cases.append(case(
                    "ui_network",
                    "ui",
                    "No failed report API calls",
                    "passed",
                    "Execute/filter requests returned success",
                    _ms(started),
                ))

            if page_errors:
                cases.append(case(
                    "ui_pageerror",
                    "ui",
                    "No page JavaScript exceptions",
                    "failed",
                    page_errors[0],
                    _ms(started),
                    meta={"errors": page_errors[:5]},
                ))
            else:
                cases.append(case(
                    "ui_pageerror",
                    "ui",
                    "No page JavaScript exceptions",
                    "passed",
                    "No uncaught page errors",
                    _ms(started),
                ))

            serious_console = [err for err in console_errors if "Failed to fetch" in err or "TypeError" in err]
            if serious_console:
                cases.append(case(
                    "ui_console",
                    "ui",
                    "Browser console",
                    "warning",
                    serious_console[0],
                    _ms(started),
                    meta={"errors": serious_console[:5]},
                ))
        except Exception as exc:
            cases.append(case(
                "ui_crash",
                "ui",
                "Drive report UI",
                "failed",
                str(exc),
                _ms(started),
            ))
        finally:
            await page.close()
        return cases

    async def _exercise_filters(self, page: Page, report: Report) -> list[dict[str, Any]]:
        cases: list[dict[str, Any]] = []
        started = time.perf_counter()
        bar = page.locator('[data-testid="global-filters"]')
        if not await bar.count():
            if report.global_filters:
                cases.append(case(
                    "ui_global_filters",
                    "ui",
                    "Global filters visible",
                    "failed",
                    "Report has global filters but the filter bar did not render",
                    _ms(started),
                ))
            return cases

        cases.append(case(
            "ui_global_filters",
            "ui",
            "Global filters visible",
            "passed",
            "Filter bar is on the page",
            _ms(started),
        ))

        start, end = _default_dates()
        for raw in report.global_filters or []:
            filt = normalize_filter(raw)
            field = filt["field_name"]
            if not field:
                continue
            if filt["type"] == "date":
                step = time.perf_counter()
                start_input = page.locator(f'[data-testid="global-filter-{field}-start"]')
                end_input = page.locator(f'[data-testid="global-filter-{field}-end"]')
                if await start_input.count() and await end_input.count():
                    await start_input.fill(start)
                    await end_input.fill(end)
                    cases.append(case(
                        f"ui_filter_date_{field}",
                        "ui",
                        f"Fill date filter '{filt['display_name']}'",
                        "passed",
                        f"{start} – {end}",
                        _ms(step),
                    ))
            elif filt["type"] in {"dropdown", "multiselect"}:
                step = time.perf_counter()
                toggle = page.locator(f'[data-testid="global-filter-{field}-dropdown"]')
                if not await toggle.count():
                    cases.append(case(
                        f"ui_filter_dropdown_{field}",
                        "ui",
                        f"Open dropdown '{filt['display_name']}'",
                        "failed",
                        "Dropdown toggle was not found",
                        _ms(step),
                    ))
                    continue
                await toggle.scroll_into_view_if_needed()
                await toggle.click()
                option = page.locator('[data-testid="global-filter-option"]').first
                try:
                    await option.wait_for(state="visible", timeout=8000)
                    label = (await option.inner_text()).strip()
                    await option.click()
                    cases.append(case(
                        f"ui_filter_dropdown_{field}",
                        "ui",
                        f"Select option in '{filt['display_name']}'",
                        "passed",
                        f"Clicked '{label or 'first option'}'",
                        _ms(step),
                    ))
                except Exception:
                    cases.append(case(
                        f"ui_filter_dropdown_{field}",
                        "ui",
                        f"Select option in '{filt['display_name']}'",
                        "warning",
                        "Dropdown opened but no options appeared",
                        _ms(step),
                    ))
                    await page.keyboard.press("Escape")

        apply_btn = page.locator('[data-testid="global-filter-apply"]')
        if await apply_btn.count():
            step = time.perf_counter()
            await apply_btn.click()
            cases.append(case(
                "ui_filter_apply",
                "ui",
                "Click Apply on global filters",
                "passed",
                "Clicked Uygula like a user",
                _ms(step),
            ))
        return cases

    async def _exercise_tabs_and_queries(self, page: Page, report: Report, timeout: int) -> list[dict[str, Any]]:
        cases: list[dict[str, Any]] = []
        tabs = list(report.tabs or [])
        if len(tabs) > 1:
            for tab in sorted(tabs, key=lambda item: getattr(item, "order_index", 0) or 0):
                step = time.perf_counter()
                tab_btn = page.locator(f'[data-testid="report-tab-{tab.id}"]')
                if not await tab_btn.count():
                    cases.append(case(
                        f"ui_tab_{tab.id}",
                        "ui",
                        f"Open tab '{tab.name}'",
                        "failed",
                        "Tab button was not found",
                        _ms(step),
                    ))
                    continue
                await tab_btn.click()
                cases.append(case(
                    f"ui_tab_{tab.id}",
                    "ui",
                    f"Open tab '{tab.name}'",
                    "passed",
                    "Clicked tab",
                    _ms(step),
                ))
                tab_queries = [q for q in (report.queries or []) if getattr(q, "tab_id", None) == tab.id]
                cases.extend(await self._wait_queries(page, tab_queries, timeout, tab.name))
        else:
            cases.extend(await self._wait_queries(page, list(report.queries or []), timeout, None))
        return cases

    async def _wait_queries(
        self,
        page: Page,
        queries: list[Any],
        timeout: int,
        tab_name: str | None,
    ) -> list[dict[str, Any]]:
        cases: list[dict[str, Any]] = []
        for query in queries:
            qid = query.id
            qname = query.name or f"Query {qid}"
            label = f"{qname}" + (f" ({tab_name})" if tab_name else "")
            step = time.perf_counter()
            widget = page.locator(f'[data-testid="query-widget-{qid}"]')
            if not await widget.count():
                cases.append(case(
                    f"ui_query_{qid}_visible",
                    "ui",
                    f"Query widget visible: {label}",
                    "failed",
                    "Query card did not render",
                    _ms(step),
                ))
                continue
            await widget.scroll_into_view_if_needed()
            cases.append(case(
                f"ui_query_{qid}_visible",
                "ui",
                f"Query widget visible: {label}",
                "passed",
                "Query card is on the page",
                _ms(step),
            ))

            loading = page.locator(f'[data-testid="query-loading-{qid}"]')
            load_started = time.perf_counter()
            try:
                if await loading.count():
                    await loading.wait_for(state="hidden", timeout=timeout)
            except Exception:
                cases.append(case(
                    f"ui_query_{qid}_load",
                    "ui",
                    f"Query finishes loading: {label}",
                    "failed",
                    f"Still loading after {timeout}ms",
                    _ms(load_started),
                ))
                continue

            error_box = page.locator(f'[data-testid="query-error-{qid}"]')
            if await error_box.count() and await error_box.is_visible():
                text = (await error_box.inner_text()).strip()
                cases.append(case(
                    f"ui_query_{qid}_error",
                    "ui",
                    f"Query renders without error: {label}",
                    "failed",
                    text or "Query widget showed an error",
                    _ms(load_started),
                ))
                continue

            empty = page.locator(f'[data-testid="query-empty-{qid}"]')
            if await empty.count() and await empty.is_visible():
                cases.append(case(
                    f"ui_query_{qid}_data",
                    "ui",
                    f"Query shows data: {label}",
                    "warning",
                    "Widget finished but showed the empty state",
                    _ms(load_started),
                ))
                continue

            result_box = page.locator(f'[data-testid="query-result-{qid}"]')
            if not await result_box.count():
                cases.append(case(
                    f"ui_query_{qid}_data",
                    "ui",
                    f"Query shows data: {label}",
                    "failed",
                    "No result, error, or empty state appeared",
                    _ms(load_started),
                ))
                continue

            viz_type = ""
            if isinstance(query.visualization_config, dict):
                viz_type = str(query.visualization_config.get("type") or "")

            rows = result_box.locator('[data-testid="viz-table-row"]')
            row_count = await rows.count()
            count_label = result_box.locator('[data-testid="viz-table-count"]')
            count_text = (await count_label.inner_text()).strip() if await count_label.count() else ""
            chart = result_box.locator(".recharts-wrapper, .recharts-surface, svg.recharts-surface")
            chart_count = await chart.count()
            viz_ms = _ms(load_started)

            if viz_type in {"table", "expandable"} or row_count:
                status = "passed" if row_count else "warning"
                cases.append(case(
                    f"ui_query_{qid}_table",
                    "ui",
                    f"Table rows: {label}",
                    status,
                    count_text or f"{row_count} visible row(s)",
                    viz_ms,
                    meta={"visible_rows": row_count, "count_text": count_text},
                ))
                if row_count:
                    header = result_box.locator("th").first
                    if await header.count():
                        sort_started = time.perf_counter()
                        await header.click()
                        cases.append(case(
                            f"ui_query_{qid}_sort",
                            "ui",
                            f"Click column header: {label}",
                            "passed",
                            "Clicked first column to sort",
                            _ms(sort_started),
                        ))
            elif viz_type == "card" or "card" in viz_type:
                cases.append(case(
                    f"ui_query_{qid}_card",
                    "ui",
                    f"Card visualization: {label}",
                    "passed",
                    "Card result rendered",
                    viz_ms,
                ))
            elif chart_count:
                cases.append(case(
                    f"ui_query_{qid}_chart",
                    "ui",
                    f"Chart visualization: {label}",
                    "passed",
                    f"{viz_type or 'chart'} rendered",
                    viz_ms,
                ))
            else:
                cases.append(case(
                    f"ui_query_{qid}_data",
                    "ui",
                    f"Query visualization: {label}",
                    "warning",
                    "Result container is present but no table/chart was detected",
                    viz_ms,
                ))

            apply_btn = page.locator(f'[data-testid="query-apply-{qid}"]')
            if await apply_btn.count():
                apply_started = time.perf_counter()
                await apply_btn.scroll_into_view_if_needed()
                await apply_btn.click()
                loading = page.locator(f'[data-testid="query-loading-{qid}"]')
                try:
                    if await loading.count():
                        await loading.wait_for(state="hidden", timeout=timeout)
                    cases.append(case(
                        f"ui_query_{qid}_apply",
                        "ui",
                        f"Click Apply on query filters: {label}",
                        "passed",
                        "Clicked Uygula and waited for reload",
                        _ms(apply_started),
                    ))
                except Exception:
                    cases.append(case(
                        f"ui_query_{qid}_apply",
                        "ui",
                        f"Click Apply on query filters: {label}",
                        "failed",
                        "Query did not finish after clicking Uygula",
                        _ms(apply_started),
                    ))
        return cases


def _default_dates() -> tuple[str, str]:
    end = datetime.now(IST).date()
    start = end - timedelta(days=30)
    return start.isoformat(), end.isoformat()
