"""Unit tests for the Ürünüm Nerede per-package + group status helpers. No DB.

Run with: python -m unittest test_track_status_helper -v
"""
import unittest
from datetime import date

from app.api.v1.endpoints.romiot.station.work_order import (
    _track_package_status,
    _track_group_status,
)

TODAY = date(2025, 5, 9)


class PackageStatusTest(unittest.TestCase):
    def test_no_rows_is_unscanned(self):
        self.assertEqual(
            _track_package_status(has_rows=False, active_is_exit=None,
                                  last_is_exit=None, target_date=None, today=TODAY),
            "Henüz okutulmadı",
        )

    def test_active_at_exit_station_is_ready_to_ship(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=True,
                                  last_is_exit=None, target_date=None, today=TODAY),
            "Sevke Hazır",
        )

    def test_active_past_target_is_delayed(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=False,
                                  last_is_exit=None, target_date=date(2025, 5, 7), today=TODAY),
            "Gecikmiş",
        )

    def test_active_within_target_is_in_progress(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=False,
                                  last_is_exit=None, target_date=date(2025, 5, 20), today=TODAY),
            "İşlemde",
        )

    def test_all_exited_at_exit_station_is_done(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=None,
                                  last_is_exit=True, target_date=None, today=TODAY),
            "Tamamlandı",
        )

    def test_all_exited_mid_route_is_waiting(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=None,
                                  last_is_exit=False, target_date=None, today=TODAY),
            "Bekliyor",
        )


class GroupStatusTest(unittest.TestCase):
    def test_delivered_wins(self):
        self.assertEqual(_track_group_status(["İşlemde", "Bekliyor"], delivered=True), "Tamamlandı")

    def test_all_done_is_done(self):
        self.assertEqual(_track_group_status(["Tamamlandı", "Tamamlandı"], delivered=False), "Tamamlandı")

    def test_any_delayed_wins_over_in_progress(self):
        self.assertEqual(_track_group_status(["İşlemde", "Gecikmiş"], delivered=False), "Gecikmiş")

    def test_in_progress_over_ready(self):
        self.assertEqual(_track_group_status(["Sevke Hazır", "İşlemde"], delivered=False), "İşlemde")

    def test_all_unscanned(self):
        self.assertEqual(_track_group_status(["Henüz okutulmadı"], delivered=False), "Henüz okutulmadı")


if __name__ == "__main__":
    unittest.main()
