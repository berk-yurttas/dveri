"""Unit tests for Playwright report UI auth helpers. No browser."""

import unittest

from app.core.report_test_auth import (
    PLAYWRIGHT_TEST_USERNAME,
    REPORT_TEST_HEADER,
    REPORT_TEST_TOKEN,
    is_playwright_bypass_user,
    playwright_extra_headers,
    playwright_test_user,
    user_from_playwright_request,
)
from app.services.report_ui_tester import build_playwright_cookie_specs, is_login_bounce


class _Req:
    def __init__(self, headers: dict[str, str]):
        self.headers = headers


class PlaywrightBypassAuthTest(unittest.TestCase):
    def test_header_authenticates_admin_user(self):
        user = user_from_playwright_request(_Req(playwright_extra_headers()))
        self.assertIsNotNone(user)
        self.assertEqual(user.username, PLAYWRIGHT_TEST_USERNAME)
        self.assertIn("miras:admin", user.role)
        self.assertIn("odak:admin", user.role)
        self.assertTrue(is_playwright_bypass_user(user))

    def test_wrong_header_is_rejected(self):
        self.assertIsNone(user_from_playwright_request(_Req({REPORT_TEST_HEADER: "nope"})))
        self.assertIsNone(user_from_playwright_request(_Req({})))
        self.assertIsNone(user_from_playwright_request(_Req({REPORT_TEST_HEADER: ""})))

    def test_token_is_not_empty(self):
        self.assertGreaterEqual(len(REPORT_TEST_TOKEN), 16)
        self.assertEqual(playwright_test_user().username, PLAYWRIGHT_TEST_USERNAME)


class CookieSpecTest(unittest.TestCase):
    def test_localhost_uses_url_not_domain(self):
        specs = build_playwright_cookie_specs(
            {"access_token": "tok", "session_id": "sid"},
            frontend_url="http://localhost:3000",
            api_origin="http://localhost:8000",
        )
        self.assertTrue(specs)
        self.assertTrue(all("url" in spec or spec.get("domain") not in {"localhost", "127.0.0.1"} for spec in specs))
        self.assertFalse(any(spec.get("domain") in {"localhost", "127.0.0.1"} for spec in specs))
        urls = {spec.get("url") for spec in specs if "url" in spec}
        self.assertTrue(any(url and "localhost" in url for url in urls))

    def test_tokens_are_httponly(self):
        specs = build_playwright_cookie_specs({"access_token": "tok", "session_id": "sid"})
        tokens = [spec for spec in specs if spec["name"] == "access_token"]
        sessions = [spec for spec in specs if spec["name"] == "session_id"]
        self.assertTrue(tokens)
        self.assertTrue(all(spec["httpOnly"] for spec in tokens))
        self.assertTrue(all(spec["httpOnly"] for spec in sessions))


class LoginBounceTest(unittest.TestCase):
    def test_detects_auth_redirect_query(self):
        self.assertTrue(is_login_bounce("http://auth.local/?rdct_url=http://localhost:8000/api/v1/users/login_redirect"))
        self.assertTrue(is_login_bounce("http://localhost:8000/users/login_redirect?client_rdct=%2Freport"))
        self.assertTrue(is_login_bounce("http://localhost:3000/login"))

    def test_report_url_is_not_a_bounce(self):
        self.assertFalse(is_login_bounce("http://localhost:3000/romiot/reports/12"))
        self.assertFalse(is_login_bounce("http://localhost:3000/admin/report-tests/4"))


if __name__ == "__main__":
    unittest.main()
