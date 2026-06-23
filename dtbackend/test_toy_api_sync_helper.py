"""Unit tests for the per-row push helper and the push_and_sync orchestration.

No live DB/network: the session and inner push are mocked. Run with:
    python -m unittest test_toy_api_sync_helper -v
"""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import app.services.toy_api_service as svc


def _integration():
    return SimpleNamespace(company="CMP", api_url="https://toy", api_key="KEY")


def _wo(**kw):
    base = dict(id=1, station_id=10, work_order_group_id="WO-1", company_from_id=5, sent=False)
    base.update(kw)
    return SimpleNamespace(**base)


class PushOneWorkOrderTest(unittest.TestCase):
    def _run(self, *, send_result, station=SimpleNamespace(id=10, name="ST", station_order_code=2)):
        wo = _wo()
        db = MagicMock()
        db.get = AsyncMock(return_value=station)
        with patch.object(svc, "_resolve_pairs", new=AsyncMock(return_value=[SimpleNamespace(
                    aselsan_order_number="A1", order_item_number="K1")])), \
             patch.object(svc, "_resolve_subcontractor_id", new=AsyncMock(return_value="SUB")), \
             patch.object(svc, "send_production_order", new=AsyncMock(return_value=send_result)) as send:
            ok = asyncio.run(svc._push_one_work_order(db, wo, _integration()))
        return ok, wo, send

    def test_success_sets_sent_true(self):
        ok, wo, send = self._run(send_result=True)
        self.assertTrue(ok)
        self.assertTrue(wo.sent)
        send.assert_awaited_once()

    def test_failure_leaves_sent_false(self):
        ok, wo, send = self._run(send_result=False)
        self.assertFalse(ok)
        self.assertFalse(wo.sent)

    def test_missing_station_returns_false_without_sending(self):
        ok, wo, send = self._run(send_result=True, station=None)
        self.assertFalse(ok)
        self.assertFalse(wo.sent)
        send.assert_not_awaited()


class ResolveSubcontractorIdTest(unittest.TestCase):
    def test_none_company_from_id_short_circuits(self):
        db = MagicMock()
        db.execute = AsyncMock()
        result = asyncio.run(svc._resolve_subcontractor_id(db, None))
        self.assertIsNone(result)
        db.execute.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
