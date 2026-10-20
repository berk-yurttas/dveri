"""Unit tests for scripts.resend_toy_work_orders (no DB / network: mocked).

Run with:
    python -m unittest test_resend_toy_work_orders_helper -v
"""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from scripts import resend_toy_work_orders as script


def _db(integrations, rows):
    """db.execute returns integrations first, then (WorkOrder, company) rows."""
    integ_result = MagicMock()
    integ_result.scalars.return_value.all.return_value = integrations
    rows_result = MagicMock()
    rows_result.all.return_value = rows
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[integ_result, rows_result])
    db.commit = AsyncMock()
    return db


def _integration(company="MEKASAN", url="u", key="k"):
    return SimpleNamespace(company=company, api_url=url, api_key=key)


def _wo(id_):
    return SimpleNamespace(id=id_, work_order_group_id=f"WO-{id_}")


class ResendTest(unittest.TestCase):
    def test_dry_run_does_not_push_or_commit(self):
        db = _db([_integration()], [(_wo(1), "MEKASAN"), (_wo(2), "MEKASAN")])
        push = AsyncMock(return_value=True)
        with patch.object(script, "_push_one_work_order", new=push):
            summary = asyncio.run(script.resend(db, send=False))
        push.assert_not_awaited()
        db.commit.assert_not_awaited()
        self.assertEqual(summary, {"matched": 2, "sent": 0, "failed": 0})

    def test_send_pushes_each_row_with_its_company_integration_and_commits(self):
        mek, oth = _integration("MEKASAN"), _integration("OTHER")
        db = _db([mek, oth], [(_wo(1), "MEKASAN"), (_wo(2), "OTHER"), (_wo(3), "MEKASAN")])
        push = AsyncMock(side_effect=[True, False, True])
        with patch.object(script, "_push_one_work_order", new=push):
            summary = asyncio.run(script.resend(db, send=True))
        self.assertEqual(
            [(c.args[1].id, c.args[2].company) for c in push.await_args_list],
            [(1, "MEKASAN"), (2, "OTHER"), (3, "MEKASAN")],
        )
        db.commit.assert_awaited()
        self.assertEqual(summary, {"matched": 3, "sent": 2, "failed": 1})

    def test_no_usable_integration_returns_without_querying_rows(self):
        db = _db([_integration(url=None)], [])
        summary = asyncio.run(script.resend(db, send=True))
        self.assertEqual(db.execute.await_count, 1)
        self.assertEqual(summary, {"matched": 0, "sent": 0, "failed": 0})


if __name__ == "__main__":
    unittest.main()
