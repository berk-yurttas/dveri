"""Unit tests for `_resolve_pairs` — the QR pair resolver that falls back to the
work_order_pairs table when the QR's frozen JSON snapshot carries no pairs.

No live DB: the romiot session is mocked. Run with:
    python -m unittest test_qr_pairs_fallback_helper -v
"""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.api.v1.endpoints.romiot.station.qr_code import _resolve_pairs


def _fake_db_returning(rows):
    """A romiot_db mock whose `await execute(...)` yields `.scalars().all() == rows`."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    return db


def _pair_row(idx, order, item):
    return SimpleNamespace(idx=idx, aselsan_order_number=order, order_item_number=item)


class ResolvePairsTest(unittest.TestCase):
    def test_snapshot_pairs_used_without_touching_db(self):
        """When the JSON snapshot already has pairs, return them and never query."""
        db = _fake_db_returning([_pair_row(0, "SHOULD", "NOT_USE")])
        data = {
            "work_order_group_id": "WO-1",
            "pairs": [{"aselsan_order_number": "A1", "order_item_number": "K1"}],
        }
        result = asyncio.run(_resolve_pairs(db, data))
        self.assertEqual(result, [{"aselsan_order_number": "A1", "order_item_number": "K1"}])
        db.execute.assert_not_called()

    def test_legacy_scalar_keys_used_without_touching_db(self):
        """Legacy single-pair payloads normalize from scalar keys, no DB fallback."""
        db = _fake_db_returning([_pair_row(0, "SHOULD", "NOT_USE")])
        data = {
            "work_order_group_id": "WO-1",
            "aselsan_order_number": "LEG",
            "order_item_number": "ITEM",
        }
        result = asyncio.run(_resolve_pairs(db, data))
        self.assertEqual(result, [{"aselsan_order_number": "LEG", "order_item_number": "ITEM"}])
        db.execute.assert_not_called()

    def test_falls_back_to_table_when_snapshot_empty(self):
        """The bug case: snapshot has no pairs but the table does — use the table."""
        db = _fake_db_returning([
            _pair_row(0, "A1", "K1"),
            _pair_row(1, "A2", "K2"),
        ])
        data = {"work_order_group_id": "WO-1", "pairs": []}
        result = asyncio.run(_resolve_pairs(db, data))
        self.assertEqual(
            result,
            [
                {"aselsan_order_number": "A1", "order_item_number": "K1"},
                {"aselsan_order_number": "A2", "order_item_number": "K2"},
            ],
        )
        db.execute.assert_awaited_once()

    def test_missing_group_id_returns_empty_without_query(self):
        """No group id means nothing to fall back to — stay empty, don't query."""
        db = _fake_db_returning([_pair_row(0, "A1", "K1")])
        data = {"pairs": []}
        result = asyncio.run(_resolve_pairs(db, data))
        self.assertEqual(result, [])
        db.execute.assert_not_called()

    def test_empty_table_returns_empty(self):
        """Snapshot empty and table empty — genuinely no pairs."""
        db = _fake_db_returning([])
        data = {"work_order_group_id": "WO-1", "pairs": []}
        result = asyncio.run(_resolve_pairs(db, data))
        self.assertEqual(result, [])
        db.execute.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
