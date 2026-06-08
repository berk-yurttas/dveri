"""Unit tests for `_build_track_timeline`. No DB.

Run with: python -m unittest test_track_timeline_helper -v
"""
import unittest
from datetime import datetime

from app.api.v1.endpoints.romiot.station.work_order import _build_track_timeline


def _route(*triples):
    # (station_id, station_name, is_exit_station)
    return [{"station_id": s, "station_name": n, "is_exit_station": e} for (s, n, e) in triples]


D1 = datetime(2025, 5, 1, 9, 0)
D2 = datetime(2025, 5, 2, 16, 0)
D3 = datetime(2025, 5, 6, 9, 0)


class TimelineWithRouteTest(unittest.TestCase):
    def test_route_overlay_marks_done_active_waiting(self):
        route = _route((1, "Mal Giriş", False), (2, "Kaplama", False), (3, "Sevk", True))
        history = {
            1: {"entry": D1, "exit": D2, "active": False},
            2: {"entry": D3, "exit": None, "active": True},
        }
        steps = _build_track_timeline(route, history, group_is_delayed=False)
        self.assertEqual([s["position"] for s in steps], [0, 1, 2])
        self.assertEqual([s["status"] for s in steps], ["done", "active", "waiting"])
        self.assertEqual(steps[0]["entry_date"], D1)
        self.assertEqual(steps[0]["exit_date"], D2)
        self.assertEqual(steps[2]["station_name"], "Sevk")
        self.assertTrue(steps[2]["is_exit_station"])

    def test_active_step_is_delayed_when_group_delayed(self):
        route = _route((1, "Mal Giriş", False), (2, "Boya", False))
        history = {1: {"entry": D1, "exit": D2, "active": False},
                   2: {"entry": D3, "exit": None, "active": True}}
        steps = _build_track_timeline(route, history, group_is_delayed=True)
        self.assertEqual(steps[1]["status"], "delayed")


class TimelineHistoryOnlyTest(unittest.TestCase):
    def test_no_route_uses_history_sorted_by_entry(self):
        history = {
            2: {"entry": D3, "exit": None, "active": True, "name": "Kaplama", "is_exit": False},
            1: {"entry": D1, "exit": D2, "active": False, "name": "Mal Giriş", "is_exit": False},
        }
        steps = _build_track_timeline([], history, group_is_delayed=False)
        self.assertEqual([s["station_name"] for s in steps], ["Mal Giriş", "Kaplama"])
        self.assertEqual([s["position"] for s in steps], [None, None])
        self.assertEqual([s["status"] for s in steps], ["done", "active"])


if __name__ == "__main__":
    unittest.main()
