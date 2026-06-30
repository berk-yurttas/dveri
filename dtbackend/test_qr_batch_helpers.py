"""Unit tests for the QR batch-building helpers. No live DB — the romiot
session is mocked. Run with:
    python -m unittest test_qr_batch_helpers -v
"""
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock

from app.api.v1.endpoints.romiot.station.qr_code import (
    _compute_package_quantities,
    _generate_unique_code,
)


class ComputePackageQuantitiesTest(unittest.TestCase):
    def test_even_split(self):
        self.assertEqual(_compute_package_quantities(10, 2), [5, 5])

    def test_remainder_goes_to_earlier_packages(self):
        # 10 into 3 -> 4,3,3 (earlier packages absorb the remainder)
        self.assertEqual(_compute_package_quantities(10, 3), [4, 3, 3])

    def test_single_package_gets_everything(self):
        self.assertEqual(_compute_package_quantities(7, 1), [7])

    def test_one_each_when_packages_equal_quantity(self):
        self.assertEqual(_compute_package_quantities(4, 4), [1, 1, 1, 1])


def _db_collisions(n_existing_then_free):
    """A romiot_db mock: the first `n` execute() calls report a collision
    (scalar_one_or_none -> object), the rest report a free code (-> None)."""
    seq = [MagicMock() if i < n_existing_then_free else None
           for i in range(5)]
    results = []
    for found in seq:
        r = MagicMock()
        r.scalar_one_or_none.return_value = found
        results.append(r)
    db = MagicMock()
    db.execute = AsyncMock(side_effect=results)
    return db


class GenerateUniqueCodeTest(unittest.TestCase):
    def test_returns_code_on_first_try(self):
        db = _db_collisions(0)
        code = asyncio.run(_generate_unique_code(db))
        self.assertIsInstance(code, str)
        self.assertEqual(len(code), 12)
        db.execute.assert_awaited_once()

    def test_retries_then_succeeds(self):
        db = _db_collisions(2)  # 2 collisions, 3rd is free
        code = asyncio.run(_generate_unique_code(db))
        self.assertIsInstance(code, str)
        self.assertEqual(db.execute.await_count, 3)

    def test_returns_none_when_all_collide(self):
        db = _db_collisions(5)  # all 5 attempts collide
        code = asyncio.run(_generate_unique_code(db))
        self.assertIsNone(code)
        self.assertEqual(db.execute.await_count, 5)
