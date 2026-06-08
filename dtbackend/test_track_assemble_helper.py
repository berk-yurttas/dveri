"""Unit tests for `_assemble_track_match`. No DB — plain row namespaces.

Run with: python -m unittest test_track_assemble_helper -v
"""
import unittest
from datetime import date, datetime
from types import SimpleNamespace

from app.api.v1.endpoints.romiot.station.work_order import _assemble_track_match
from app.schemas.order_pair import OrderPair

TODAY = date(2025, 5, 9)


def _row(package_index, station_id, entrance, exit_):
    return SimpleNamespace(
        package_index=package_index, station_id=station_id,
        entrance_date=entrance, exit_date=exit_, quantity=10,
    )


def _meta():
    # station_id -> (name, is_exit_station)
    return {
        1: ("Mal Giriş", False),
        2: ("Kaplama", False),
        3: ("Sevk", True),
    }


def _common():
    return dict(
        group_id="WO-1", part_number="P1", revision_number="R1",
        pairs=[OrderPair(aselsan_order_number="SIP-1", order_item_number="KLM-1")],
        main_customer="ASELSAN", sector="AGS", company_from="Bora",
        coating_company="Mekasan", teklif_number="MKS-1",
        total_quantity=20, total_packages=2, target_date=date(2025, 5, 20),
        delivered=False, today=TODAY,
    )


class AssembleTest(unittest.TestCase):
    def test_single_active_package_with_route(self):
        rows = [
            _row(1, 1, datetime(2025, 4, 28, 8), datetime(2025, 4, 28, 16)),
            _row(1, 2, datetime(2025, 5, 6, 9), None),
        ]
        route = [{"station_id": 1, "station_name": "Mal Giriş", "is_exit_station": False},
                 {"station_id": 2, "station_name": "Kaplama", "is_exit_station": False},
                 {"station_id": 3, "station_name": "Sevk", "is_exit_station": True}]
        match = _assemble_track_match(rows=rows, route=route, station_meta=_meta(), **_common())
        self.assertEqual(match["status"], "İşlemde")
        self.assertEqual(match["current_station_name"], "Kaplama")
        self.assertTrue(match["has_route"])
        self.assertEqual([s["status"] for s in match["timeline"]], ["done", "active", "waiting"])
        self.assertEqual(len(match["packages"]), 1)
        self.assertEqual(match["packages"][0]["status"], "İşlemde")
        self.assertEqual(match["last_updated"], datetime(2025, 5, 6, 9))

    def test_unscanned_group_has_no_rows(self):
        match = _assemble_track_match(rows=[], route=[], station_meta=_meta(), **_common())
        self.assertEqual(match["status"], "Henüz okutulmadı")
        self.assertIsNone(match["current_station_name"])
        self.assertFalse(match["has_route"])
        self.assertEqual(match["timeline"], [])

    def test_delivered_group_is_done(self):
        rows = [_row(1, 3, datetime(2025, 5, 9, 8), datetime(2025, 5, 9, 14))]
        common = _common()
        common["delivered"] = True
        match = _assemble_track_match(rows=rows, route=[], station_meta=_meta(), **common)
        self.assertEqual(match["status"], "Tamamlandı")


if __name__ == "__main__":
    unittest.main()
