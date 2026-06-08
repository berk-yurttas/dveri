"""Unit test for `_resolve_track_group_ids` — selects scanned group ids matching
the query, scoped to company_from. Mocked DB.

Run with: python -m unittest test_track_endpoint_resolve_helper -v
"""
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock

from app.api.v1.endpoints.romiot.station.work_order import _resolve_track_group_ids


def _db_returning(rows):
    result = MagicMock()
    result.all.return_value = rows
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    return db


class ResolveTrackGroupIdsTest(unittest.TestCase):
    def test_returns_group_ids_from_rows(self):
        db = _db_returning([("WO-1",), ("WO-2",)])
        ids = asyncio.run(_resolve_track_group_ids(
            db, company_from="Bora",
            order_number="SIP-1", order_item_number="KLM-1", part_number=None,
        ))
        self.assertEqual(set(ids), {"WO-1", "WO-2"})
        db.execute.assert_awaited_once()

    def test_empty_when_no_matches(self):
        db = _db_returning([])
        ids = asyncio.run(_resolve_track_group_ids(
            db, company_from="Bora",
            order_number=None, order_item_number=None, part_number="P1",
        ))
        self.assertEqual(ids, [])


if __name__ == "__main__":
    unittest.main()
