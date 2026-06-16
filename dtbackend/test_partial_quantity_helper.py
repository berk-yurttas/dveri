"""Unit tests for the partial-quantity (Kısmi Adet) validation helpers. No DB.

Run with: python -m unittest test_partial_quantity_helper -v
"""
import unittest

from app.api.v1.endpoints.romiot.station.work_order import (
    _entrance_remaining,
    _exit_remaining,
    _check_entrance_scan,
    _check_exit_scan,
)


class RemainingTest(unittest.TestCase):
    def test_entrance_remaining(self):
        self.assertEqual(_entrance_remaining(quantity=10, entered_quantity=4), 6)

    def test_entrance_remaining_never_negative(self):
        self.assertEqual(_entrance_remaining(quantity=10, entered_quantity=12), 0)

    def test_exit_remaining(self):
        self.assertEqual(_exit_remaining(entered_quantity=8, exited_quantity=3), 5)

    def test_exit_remaining_never_negative(self):
        self.assertEqual(_exit_remaining(entered_quantity=8, exited_quantity=9), 0)


class EntranceScanCheckTest(unittest.TestCase):
    def test_ok_within_cap(self):
        self.assertIsNone(_check_entrance_scan(scan_quantity=6, entered_quantity=4, quantity=10))

    def test_ok_exactly_full(self):
        self.assertIsNone(_check_entrance_scan(scan_quantity=10, entered_quantity=0, quantity=10))

    def test_zero_rejected(self):
        self.assertIsNotNone(_check_entrance_scan(scan_quantity=0, entered_quantity=0, quantity=10))

    def test_over_cap_rejected(self):
        msg = _check_entrance_scan(scan_quantity=7, entered_quantity=4, quantity=10)
        self.assertIsNotNone(msg)
        self.assertIn("6", msg)  # remaining is 6


class ExitScanCheckTest(unittest.TestCase):
    def test_ok_within_entered(self):
        self.assertIsNone(_check_exit_scan(scan_quantity=4, entered_quantity=8, exited_quantity=0))

    def test_ok_exactly_entered(self):
        self.assertIsNone(_check_exit_scan(scan_quantity=8, entered_quantity=8, exited_quantity=0))

    def test_zero_rejected(self):
        self.assertIsNotNone(_check_exit_scan(scan_quantity=0, entered_quantity=8, exited_quantity=0))

    def test_exit_exceeds_entered_rejected(self):
        msg = _check_exit_scan(scan_quantity=9, entered_quantity=8, exited_quantity=0)
        self.assertIsNotNone(msg)

    def test_exit_exceeds_remaining_rejected(self):
        self.assertIsNotNone(_check_exit_scan(scan_quantity=3, entered_quantity=8, exited_quantity=6))


if __name__ == "__main__":
    unittest.main()
