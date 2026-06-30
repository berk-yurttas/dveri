"""Unit tests for the QR batch-building helpers. No live DB — the romiot
session is mocked. Run with:
    python -m unittest test_qr_batch_helpers -v
"""
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock

from app.api.v1.endpoints.romiot.station.qr_code import (
    _compute_package_quantities,
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
