"""Unit tests for the QR batch-building helpers. No live DB — the romiot
session is mocked. Run with:
    python -m unittest test_qr_batch_helpers -v
"""
import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.api.v1.endpoints.romiot.station.qr_code import (
    _authorize_batch_creation,
    _build_group_packages,
    _check_item_packaging,
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


def _db_all_free():
    """romiot_db mock where every code candidate is free and add() is recorded."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    return db


class BuildGroupPackagesTest(unittest.TestCase):
    def _payload_base(self):
        return {
            "main_customer": "ASELSAN",
            "sector": "AGS",
            "company_from": "ACME",
            "company_from_id": "cmp1",
            "teklif_number": "T1",
            "part_number": "PN1",
            "revision_number": "R1",
            "target_date": "2026-07-15",
        }

    def test_creates_one_qrcode_record_per_package(self):
        db = _db_all_free()
        pairs = [{"aselsan_order_number": "20Y1", "order_item_number": "10"}]
        packages = asyncio.run(_build_group_packages(
            db,
            work_order_group_id="WO-X",
            pairs=pairs,
            payload_base=self._payload_base(),
            total_quantity=10,
            total_packages=2,
            target_company="TGT",
            expires_at=None,
        ))
        self.assertEqual(len(packages), 2)
        self.assertEqual([p.quantity for p in packages], [5, 5])
        self.assertEqual([p.package_index for p in packages], [1, 2])
        # 1 WorkOrderPair add + 2 QRCodeData adds
        self.assertEqual(db.add.call_count, 3)

    def test_payload_embeds_pairs_and_group_fields(self):
        db = _db_all_free()
        pairs = [{"aselsan_order_number": "20Y1", "order_item_number": "10"}]
        asyncio.run(_build_group_packages(
            db,
            work_order_group_id="WO-X",
            pairs=pairs,
            payload_base=self._payload_base(),
            total_quantity=4,
            total_packages=1,
            target_company="TGT",
            expires_at=None,
        ))
        # last add is the QRCodeData record; inspect its serialized data
        qr_record = db.add.call_args_list[-1].args[0]
        data = json.loads(qr_record.data)
        self.assertEqual(data["work_order_group_id"], "WO-X")
        self.assertEqual(data["pairs"], pairs)
        self.assertEqual(data["quantity"], 4)
        self.assertEqual(data["total_quantity"], 4)
        self.assertEqual(data["package_index"], 1)
        self.assertEqual(data["total_packages"], 1)
        self.assertEqual(data["main_customer"], "ASELSAN")

    def test_raises_500_when_codes_exhausted(self):
        # every candidate collides -> _generate_unique_code returns None
        result = MagicMock()
        result.scalar_one_or_none.return_value = MagicMock()  # always "found"
        db = MagicMock()
        db.execute = AsyncMock(return_value=result)
        db.add = MagicMock()
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(_build_group_packages(
                db,
                work_order_group_id="WO-X",
                pairs=[{"aselsan_order_number": "A", "order_item_number": "10"}],
                payload_base=self._payload_base(),
                total_quantity=1,
                total_packages=1,
                target_company="TGT",
                expires_at=None,
            ))
        self.assertEqual(ctx.exception.status_code, 500)


class AuthorizeBatchCreationTest(unittest.TestCase):
    def _user(self, roles):
        return SimpleNamespace(role=roles)

    def _db_integration(self, exists: bool):
        result = MagicMock()
        result.scalar_one_or_none.return_value = "id" if exists else None
        db = MagicMock()
        db.execute = AsyncMock(return_value=result)
        return db

    def _run(self, user, db, target):
        sender = SimpleNamespace(id="cmp1", name="ACME")
        with patch(
            "app.api.v1.endpoints.romiot.station.qr_code.require_user_company",
            AsyncMock(return_value=sender),
        ):
            return asyncio.run(_authorize_batch_creation(user, db, target))

    def test_musteri_ok_when_integration_exists(self):
        db = self._db_integration(True)
        sender = self._run(self._user(["atolye:musteri"]), db, "TGT")
        self.assertEqual(sender.name, "ACME")

    def test_no_create_role_rejected(self):
        db = self._db_integration(True)
        with self.assertRaises(HTTPException) as ctx:
            self._run(self._user(["atolye:operator"]), db, "TGT")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_empty_target_rejected(self):
        db = self._db_integration(True)
        with self.assertRaises(HTTPException) as ctx:
            self._run(self._user(["atolye:musteri"]), db, "   ")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_yonetici_only_locked_to_own_company(self):
        db = self._db_integration(True)
        with self.assertRaises(HTTPException) as ctx:
            self._run(self._user(["atolye:yonetici"]), db, "OTHERCO")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_unknown_target_rejected(self):
        db = self._db_integration(False)
        with self.assertRaises(HTTPException) as ctx:
            self._run(self._user(["atolye:musteri"]), db, "TGT")
        self.assertEqual(ctx.exception.status_code, 400)


class CheckItemPackagingTest(unittest.TestCase):
    def test_ok_when_parti_le_quantity(self):
        self.assertIsNone(_check_item_packaging(quantity=10, package_quantity=3))

    def test_rejected_when_parti_gt_quantity(self):
        msg = _check_item_packaging(quantity=2, package_quantity=3)
        self.assertIsNotNone(msg)
