"""Unit tests for `check_group_deletable` — the pure authorization/guard decision
for deleting an unscanned work order group. No DB: the function takes plain values.

Run with:
    python -m unittest test_qr_group_delete_helper -v
"""
import unittest

from fastapi import HTTPException

from app.api.v1.endpoints.romiot.station.qr_code import check_group_deletable


class CheckGroupDeletableTest(unittest.TestCase):
    def test_musteri_owns_unscanned_group_allowed(self):
        self.assertIsNone(
            check_group_deletable(
                role_values=["atolye:musteri"],
                payload_company_froms=["ACME", "ACME"],
                scanned_count=0,
                caller_company="ACME",
            )
        )

    def test_yonetici_owns_unscanned_group_allowed(self):
        self.assertIsNone(
            check_group_deletable(
                role_values=["atolye:yonetici"],
                payload_company_froms=["DIGINNO"],
                scanned_count=0,
                caller_company="DIGINNO",
            )
        )

    def test_non_creator_role_forbidden(self):
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:operator"],
                payload_company_froms=["ACME"],
                scanned_count=0,
                caller_company="ACME",
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_other_company_group_forbidden(self):
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:yonetici"],
                payload_company_froms=["ACME"],
                scanned_count=0,
                caller_company="DIGINNO",
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_mixed_ownership_forbidden(self):
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:musteri"],
                payload_company_froms=["ACME", "OTHER"],
                scanned_count=0,
                caller_company="ACME",
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_scanned_group_conflict(self):
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:musteri"],
                payload_company_froms=["ACME"],
                scanned_count=2,
                caller_company="ACME",
            )
        self.assertEqual(ctx.exception.status_code, 409)

    def test_role_checked_before_scanned_guard(self):
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:operator"],
                payload_company_froms=["ACME"],
                scanned_count=5,
                caller_company="ACME",
            )
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
