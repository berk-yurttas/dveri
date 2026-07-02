"""Unit tests for the route "expected next position" decision helper. No DB.

Regression guard for the bug where a yönetici edits a work order's route and
the operator's next scan — correctly following the NEW route — is wrongly
rejected as "Rota dışı". The old logic used max(exited_position)+1, which
assumes contiguous progress from position 0 and breaks once a route edit
renumbers positions so an already-completed station sits at a higher index
than the operator's real next step.

Run with: python -m unittest test_route_expected_position_helper -v
"""
import unittest

from app.api.v1.endpoints.romiot.station.work_order import _next_route_position


class NextRoutePositionTest(unittest.TestCase):
    def test_no_scans_yet_expects_entry(self):
        # Nothing exited → operator should be at position 0.
        self.assertEqual(_next_route_position([0, 1, 2, 3], set()), 0)

    def test_normal_contiguous_progress(self):
        # Exited 0 and 1 contiguously → next is 2 (same as old max+1 behaviour).
        self.assertEqual(_next_route_position([0, 1, 2, 3], {0, 1}), 2)

    def test_all_exited_points_past_end(self):
        # Every route station exited → position past the last (matches old n).
        self.assertEqual(_next_route_position([0, 1, 2], {0, 1, 2}), 3)

    def test_edit_left_completed_station_at_higher_index(self):
        # Route edited so a completed station (now at pos 2) sits AFTER the
        # operator's real next step (pos 1). Exited positions {0, 2}; the
        # lowest not-yet-exited position is 1 — the operator's legitimate next
        # scan. Old max+1 logic returned 3 and wrongly rejected the scan.
        self.assertEqual(_next_route_position([0, 1, 2, 3], {0, 2}), 1)

    def test_gap_returns_lowest_incomplete(self):
        # Multiple gaps → the FIRST (lowest) incomplete position wins.
        self.assertEqual(_next_route_position([0, 1, 2, 3, 4], {0, 3}), 1)

    def test_positions_need_not_start_at_zero_or_be_dense(self):
        # Helper works off the actual position list, in order.
        self.assertEqual(_next_route_position([0, 1, 2], {0}), 1)


if __name__ == "__main__":
    unittest.main()
