"""Unit tests for the partial-quantity (Kısmi Adet) validation helpers. No DB.

Run with: python -m unittest test_partial_quantity_helper -v
"""
import unittest

from app.api.v1.endpoints.romiot.station.work_order import (
    _entrance_remaining,
    _exit_remaining,
    _check_entrance_scan,
    _check_exit_scan,
    _available_to_enter,
    _entrance_cap,
    _check_flow_entrance,
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


class AvailableToEnterTest(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(_available_to_enter(88, 0), 88)

    def test_partial(self):
        self.assertEqual(_available_to_enter(88, 20), 68)

    def test_never_negative(self):
        self.assertEqual(_available_to_enter(88, 100), 0)


class EntranceCapTest(unittest.TestCase):
    def test_flow_gated_uses_prev_exited(self):
        self.assertEqual(_entrance_cap(quantity=488, prev_exited=88, is_flow_gated=True), 88)

    def test_flow_gated_none_prev_is_zero(self):
        self.assertEqual(_entrance_cap(quantity=488, prev_exited=None, is_flow_gated=True), 0)

    def test_not_flow_gated_uses_quantity(self):
        self.assertEqual(_entrance_cap(quantity=488, prev_exited=88, is_flow_gated=False), 488)


class FlowEntranceCheckTest(unittest.TestCase):
    def test_ok_within_available(self):
        self.assertEqual(_check_flow_entrance(88, 0, 88), ("ok", 88))

    def test_ok_partial(self):
        self.assertEqual(_check_flow_entrance(50, 20, 88), ("ok", 68))

    def test_warn_when_nothing_exited_previous(self):
        outcome, _ = _check_flow_entrance(1, 0, 0)
        self.assertEqual(outcome, "warn")

    def test_warn_when_all_already_pulled_forward(self):
        outcome, _ = _check_flow_entrance(1, 88, 88)
        self.assertEqual(outcome, "warn")

    def test_error_when_over_available(self):
        outcome, msg = _check_flow_entrance(89, 0, 88)
        self.assertEqual(outcome, "error")
        self.assertIn("88", msg)

    def test_error_over_available_after_partial(self):
        outcome, msg = _check_flow_entrance(70, 20, 88)
        self.assertEqual(outcome, "error")
        self.assertIn("68", msg)


if __name__ == "__main__":
    unittest.main()
