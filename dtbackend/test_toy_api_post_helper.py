"""Unit tests for the Toy/Mekasan HTTP layer returning success booleans.

No live network: httpx.AsyncClient is mocked. Run with:
    python -m unittest test_toy_api_post_helper -v
"""
import asyncio
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


def _wo():
    return SimpleNamespace(
        id=1, work_order_group_id="WO-1", part_number="P", revision_number="R",
        entrance_date=None, exit_date=None, quantity=3, total_quantity=9,
        exited_quantity=3,
        qr_created_at=None, target_date=None, sector="S",
    )


def _station():
    return SimpleNamespace(id=10, name="ST", station_order_code=2)


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
    def test_empty_pairs_returns_false(self):
        ok = asyncio.run(send_production_order(_wo(), _station(), "u", "k", "CMP", [], "SUB"))
        self.assertFalse(ok)

    def test_single_pair_returns_post_result(self):
        with patch("app.services.toy_api_service._post_one", new=AsyncMock(return_value=True)):
            ok = asyncio.run(send_production_order(_wo(), _station(), "u", "k", "CMP", [_pair()], "SUB"))
        self.assertTrue(ok)

    def test_multi_pair_true_only_when_all_succeed(self):
        with patch("app.services.toy_api_service._post_one",
                   new=AsyncMock(side_effect=[True, True])):
            ok = asyncio.run(send_production_order(
                _wo(), _station(), "u", "k", "CMP", [_pair("A1"), _pair("A2")], "SUB"))
        self.assertTrue(ok)

    def test_multi_pair_false_when_any_fails(self):
        with patch("app.services.toy_api_service._post_one",
                   new=AsyncMock(side_effect=[True, False])):
            ok = asyncio.run(send_production_order(
                _wo(), _station(), "u", "k", "CMP", [_pair("A1"), _pair("A2")], "SUB"))
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
