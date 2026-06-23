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


def _session_factory(db):
    """Patch target for RomiotAsyncSessionLocal: a callable returning an
    async-context-manager that yields `db`."""
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=db)
    cm.__aexit__ = AsyncMock(return_value=False)
    return MagicMock(return_value=cm)


def _execute_returning(*, scalar_one=None, scalars_all=None):
    result = MagicMock()
    result.scalar_one_or_none.return_value = scalar_one
    result.scalars.return_value.all.return_value = scalars_all or []
    return result


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


class PushAndSyncTest(unittest.TestCase):
    def test_pushes_current_then_sweeps_unsent_and_commits(self):
        current = _wo(id=1)
        station = SimpleNamespace(id=10, name="ST", company="CMP", station_order_code=2)
        u1, u2 = _wo(id=2), _wo(id=3)

        db = MagicMock()
        db.get = AsyncMock(side_effect=[current, station])
        db.execute = AsyncMock(side_effect=[
            _execute_returning(scalar_one=_integration()),   # integration lookup
            _execute_returning(scalars_all=[u1, u2]),        # unsent sweep
        ])
        db.commit = AsyncMock()

        pushed = []
        async def _fake_push(_db, wo, _integ):
            pushed.append(wo.id)
            wo.sent = True
            return True

        with patch.object(svc, "RomiotAsyncSessionLocal", _session_factory(db)), \
             patch.object(svc, "_push_one_work_order", new=AsyncMock(side_effect=_fake_push)):
            asyncio.run(svc.push_and_sync(1))

        self.assertEqual(pushed, [1, 2, 3])   # current row first, then swept rows
        db.commit.assert_awaited_once()

    def test_no_integration_skips_push_and_commit(self):
        current = _wo(id=1)
        station = SimpleNamespace(id=10, name="ST", company="CMP", station_order_code=2)
        db = MagicMock()
        db.get = AsyncMock(side_effect=[current, station])
        db.execute = AsyncMock(side_effect=[_execute_returning(scalar_one=None)])
        db.commit = AsyncMock()

        with patch.object(svc, "RomiotAsyncSessionLocal", _session_factory(db)), \
             patch.object(svc, "_push_one_work_order", new=AsyncMock()) as push:
            asyncio.run(svc.push_and_sync(1))

        push.assert_not_awaited()
        db.commit.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
