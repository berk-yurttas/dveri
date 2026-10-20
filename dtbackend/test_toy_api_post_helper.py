"""Unit tests for the Toy/Mekasan HTTP layer returning success booleans.

No live network: httpx.AsyncClient is mocked. Run with:
    python -m unittest test_toy_api_post_helper -v
"""
import asyncio
from datetime import datetime
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.services.toy_api_service import _post_one, send_production_order


def _client_cm(*, is_success=True, raises=False):
    """Patch target for httpx.AsyncClient: an async-context-manager whose
    `.post` returns a response (or raises)."""
    client = MagicMock()
    if raises:
        client.post = AsyncMock(side_effect=httpx.ConnectError("boom"))
    else:
        client.post = AsyncMock(return_value=MagicMock(
            is_success=is_success, status_code=200 if is_success else 500, text="err",
        ))
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return patch("app.services.toy_api_service.httpx.AsyncClient", return_value=cm)


def _wo(id=1, entrance_date=None, exit_date=None, quantity=3, exited_quantity=3):
    return SimpleNamespace(
        id=id, work_order_group_id="WO-1", part_number="P", revision_number="R",
        entrance_date=entrance_date, exit_date=exit_date, quantity=quantity, total_quantity=9,
        exited_quantity=exited_quantity,
        qr_created_at=None, target_date=None, sector="S",
    )


def _station(id=10, name="ST"):
    return SimpleNamespace(id=id, name=name, station_order_code=2)


def _d(day, hour=8):
    return datetime(2026, 10, day, hour)


def _pair(a="A1", k="K1"):
    return SimpleNamespace(aselsan_order_number=a, order_item_number=k)


class PostOneTest(unittest.TestCase):
    def test_returns_true_on_2xx(self):
        with _client_cm(is_success=True):
            self.assertTrue(asyncio.run(_post_one("u", "k", {"data": []}, 1)))

    def test_returns_false_on_non_2xx(self):
        with _client_cm(is_success=False):
            self.assertFalse(asyncio.run(_post_one("u", "k", {"data": []}, 1)))

    def test_returns_false_on_exception(self):
        with _client_cm(raises=True):
            self.assertFalse(asyncio.run(_post_one("u", "k", {"data": []}, 1)))


class SendProductionOrderTest(unittest.TestCase):
    def _send(self, rows, pairs, post_result=True):
        post = AsyncMock(return_value=post_result)
        with patch("app.services.toy_api_service._post_one", new=post):
            ok = asyncio.run(send_production_order(rows, "u", "k", "CMP", pairs, "SUB"))
        return ok, post

    def test_empty_pairs_returns_false(self):
        ok, post = self._send([(_wo(), _station())], [])
        self.assertFalse(ok)
        post.assert_not_awaited()

    def test_empty_rows_returns_false(self):
        ok, post = self._send([], [_pair()])
        self.assertFalse(ok)
        post.assert_not_awaited()

    def test_one_post_with_a_row_per_station_and_pair(self):
        rows = [(_wo(1), _station(10, "KESIM")), (_wo(2), _station(20, "BOYA"))]
        ok, post = self._send(rows, [_pair("A1", "K1"), _pair("A1", "K2")])
        self.assertTrue(ok)
        post.assert_awaited_once()
        payload = post.await_args.args[2]
        self.assertEqual(payload["company"], "CMP")
        self.assertEqual(
            [(d["OperationDesc"], d["WorkOrderItemNo"], d["Mes_OrderId"]) for d in payload["data"]],
            [("KESIM", "K1", "WO-1"), ("KESIM", "K2", "WO-1"),
             ("BOYA", "K1", "WO-1"), ("BOYA", "K2", "WO-1")],
        )

    def test_packages_at_one_station_are_combined(self):
        st = _station(10, "KESIM")
        rows = [
            (_wo(1, entrance_date=_d(2), exit_date=_d(3), quantity=4, exited_quantity=4), st),
            (_wo(2, entrance_date=_d(1), exit_date=_d(5), quantity=5, exited_quantity=5), st),
        ]
        _, post = self._send(rows, [_pair()])
        [item] = post.await_args.args[2]["data"]
        self.assertEqual(item["ActualStartDate"], _d(1).isoformat())
        self.assertEqual(item["ActualEndDate"], _d(5).isoformat())
        self.assertEqual(item["PlannedQuantity"], 9)
        self.assertEqual(item["ActualQuantity"], 9)

    def test_station_has_no_end_date_until_every_package_exits(self):
        st = _station(10, "KESIM")
        rows = [
            (_wo(1, entrance_date=_d(1), exit_date=_d(3), quantity=4, exited_quantity=4), st),
            (_wo(2, entrance_date=_d(2), exit_date=None, quantity=5, exited_quantity=1), st),
        ]
        _, post = self._send(rows, [_pair()])
        [item] = post.await_args.args[2]["data"]
        self.assertEqual(item["ActualStartDate"], _d(1).isoformat())
        self.assertIsNone(item["ActualEndDate"])
        self.assertEqual(item["ActualQuantity"], 5)

    def test_returns_post_result(self):
        ok, _ = self._send([(_wo(), _station())], [_pair()], post_result=False)
        self.assertFalse(ok)

if __name__ == "__main__":
    unittest.main()
