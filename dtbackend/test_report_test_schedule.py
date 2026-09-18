"""Unit tests for per-platform report test schedules and mail summary."""

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from app.services.report_test_schedule import (
    _smtp_login,
    build_summary_email,
    is_schedule_due,
    parse_recipients,
    run_detail_url,
)

IST = ZoneInfo("Europe/Istanbul")


class RecipientsTest(unittest.TestCase):
    def test_splits_and_dedupes(self):
        self.assertEqual(
            parse_recipients("Ali@Aselsan.com.tr, veli@aselsan.com.tr; ali@aselsan.com.tr"),
            ["ali@aselsan.com.tr", "veli@aselsan.com.tr"],
        )

    def test_skips_invalid(self):
        self.assertEqual(parse_recipients(["ok@x.com", "not-an-email", ""]), ["ok@x.com"])


class ScheduleDueTest(unittest.TestCase):
    def test_before_time_is_not_due(self):
        now = datetime(2026, 9, 18, 8, 59, tzinfo=IST)
        self.assertFalse(is_schedule_due(now, 9, 0, None))

    def test_at_time_is_due(self):
        now = datetime(2026, 9, 18, 9, 0, tzinfo=IST)
        self.assertTrue(is_schedule_due(now, 9, 0, None))

    def test_already_started_today_is_not_due(self):
        now = datetime(2026, 9, 18, 10, 0, tzinfo=IST)
        started = datetime(2026, 9, 18, 9, 0, tzinfo=IST)
        self.assertFalse(is_schedule_due(now, 9, 0, started))

    def test_yesterday_start_is_due_again(self):
        now = datetime(2026, 9, 18, 9, 1, tzinfo=IST)
        started = datetime(2026, 9, 17, 9, 0, tzinfo=IST)
        self.assertTrue(is_schedule_due(now, 9, 0, started))


class MailSummaryTest(unittest.TestCase):
    def test_includes_run_url_and_counts(self):
        run = SimpleNamespace(
            id=42,
            failed_reports=2,
            passed_reports=8,
            total_reports=10,
            status="failed",
        )
        subject, html, text = build_summary_email(
            platform_name="RomIOT",
            run=run,
            failed_names=["Sipariş", "Stok"],
        )
        url = run_detail_url(42)
        self.assertIn("RomIOT", subject)
        self.assertIn("2 hata", subject)
        self.assertIn(url, html)
        self.assertIn(url, text)
        self.assertIn("/admin/report-tests/42", url)
        self.assertIn("Sipariş", html)


class SmtpLoginTest(unittest.TestCase):
    def test_skips_login_when_only_ntlm_is_advertised(self):
        client = SimpleNamespace(esmtp_features={"auth": "NTLM XOAUTH2"}, login=lambda *_: self.fail("login"))
        with patch("app.services.report_test_schedule.settings") as smtp_settings:
            smtp_settings.SMTP_USER = "user@example.com"
            smtp_settings.SMTP_PASSWORD = "secret"
            _smtp_login(client)

    def test_logs_in_when_login_is_advertised(self):
        calls = []
        client = SimpleNamespace(
            esmtp_features={"auth": "LOGIN PLAIN"},
            login=lambda user, password: calls.append((user, password)),
        )
        with patch("app.services.report_test_schedule.settings") as smtp_settings:
            smtp_settings.SMTP_USER = "user@example.com"
            smtp_settings.SMTP_PASSWORD = "secret"
            _smtp_login(client)
        self.assertEqual(calls, [("user@example.com", "secret")])


if __name__ == "__main__":
    unittest.main()
