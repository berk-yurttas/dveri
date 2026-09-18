"""In-process Playwright auth for report UI tests.

The tester runs inside this backend process, so it can send a random header
that a normal browser cannot know. Report pages then load without SAML login.
"""

from __future__ import annotations

import secrets
from typing import Any

from app.schemas.user import User

REPORT_TEST_HEADER = "X-Report-Test-Key"
PLAYWRIGHT_TEST_USERNAME = "playwright-report-test"
REPORT_TEST_TOKEN = secrets.token_urlsafe(32)


def playwright_extra_headers() -> dict[str, str]:
    return {REPORT_TEST_HEADER: REPORT_TEST_TOKEN}


def playwright_test_user() -> User:
    return User(
        id=PLAYWRIGHT_TEST_USERNAME,
        username=PLAYWRIGHT_TEST_USERNAME,
        email="playwright-report-test@local",
        name="Playwright Report Test",
        company="",
        department="",
        management_dpt="",
        title="",
        role=["miras:admin", "odak:admin"],
        verified=True,
    )


def is_playwright_bypass_user(user: Any) -> bool:
    return bool(user) and getattr(user, "username", None) == PLAYWRIGHT_TEST_USERNAME


def user_from_playwright_request(request: Any) -> User | None:
    headers = getattr(request, "headers", None)
    if headers is None:
        return None
    getter = getattr(headers, "get", None)
    provided = getter(REPORT_TEST_HEADER) if callable(getter) else None
    if not provided:
        provided = getter(REPORT_TEST_HEADER.lower()) if callable(getter) else None
    token = str(provided or "").strip()
    if not token:
        return None
    try:
        matched = secrets.compare_digest(token, REPORT_TEST_TOKEN)
    except (TypeError, ValueError):
        return None
    if not matched:
        return None
    return playwright_test_user()
