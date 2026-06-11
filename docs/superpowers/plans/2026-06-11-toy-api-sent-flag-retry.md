# Toy API `sent` Flag + Piggyback Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Atölye's QR-scan → Toy/Mekasan API push robust: track per-row whether the current state was delivered (`work_orders.sent`), record the result from a background task that owns its own DB session, and piggyback-retry up to 20 unsent rows for the same integration on every scan.

**Architecture:** A new column `work_orders.sent` (bool, default false) marks "current state delivered to Toy." The push moves out of the request lifecycle into `push_and_sync(work_order_id)`, dispatched fire-and-forget; it opens its own `RomiotAsyncSessionLocal`, pushes the current row, flips `sent`, then sweeps `sent=false` rows for the same company (`LIMIT 20`, oldest first) and re-pushes them. The HTTP layer (`_post_one`, `send_production_order`) returns booleans so the result can be recorded. Toy upserts by `Mes_OrderId`, so re-pushes are idempotent.

**Tech Stack:** Python 3, FastAPI, SQLAlchemy async (`AsyncSession`), Alembic (romiot DB via `alembic_romiot.ini`), httpx, `unittest` (root-level `test_*_helper.py`, mocked sessions).

**Spec:** `docs/superpowers/specs/2026-06-11-toy-api-sent-flag-retry-design.md`

---

## File Structure

- `dtbackend/alembic_romiot/versions/add_sent_to_work_orders.py` — **create** — migration adding the column.
- `dtbackend/app/models/romiot_models.py` — **modify** — add `sent` column to `WorkOrder`.
- `dtbackend/app/services/toy_api_service.py` — **modify** — `_post_one`/`send_production_order` return bools; add `_resolve_pairs`, `_resolve_subcontractor_id`, `_push_one_work_order`, `push_and_sync`.
- `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — **modify** — both call sites dispatch `push_and_sync`; `update_exit_date` resets `sent=False`; import swap.
- `dtbackend/test_toy_api_post_helper.py` — **create** — tests for `_post_one` + `send_production_order`.
- `dtbackend/test_toy_api_sync_helper.py` — **create** — tests for `_push_one_work_order` + `push_and_sync` + `_resolve_subcontractor_id`.

All `python`/`alembic` commands below are run from the `dtbackend/` directory.

---

### Task 1: Migration — add `work_orders.sent`

**Files:**
- Create: `dtbackend/alembic_romiot/versions/add_sent_to_work_orders.py`

This is a pure schema/config change (exempt from TDD).

- [ ] **Step 1: Write the migration**

Create `dtbackend/alembic_romiot/versions/add_sent_to_work_orders.py`:

```python
"""add work_orders.sent (Toy API delivery flag)

Revision ID: b1c2d3e4f5a6
Revises: 08be09af3bfd
Create Date: 2026-06-11 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b1c2d3e4f5a6'
down_revision = '08be09af3bfd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'work_orders',
        sa.Column('sent', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('work_orders', 'sent')
```

- [ ] **Step 2: Verify the revision chains onto the current head**

Run: `alembic -c alembic_romiot.ini history | head -5`
Expected: the output lists `b1c2d3e4f5a6` with `08be09af3bfd` as its parent, and no "multiple heads" warning.

- [ ] **Step 3: Apply the migration (only if a romiot DB is reachable)**

Run: `alembic -c alembic_romiot.ini upgrade head`
Expected: `Running upgrade 08be09af3bfd -> b1c2d3e4f5a6, add work_orders.sent ...`.
If no romiot DB is configured in this environment, skip the apply — Step 2's history check is sufficient for the plan; the column is applied at deploy time.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/alembic_romiot/versions/add_sent_to_work_orders.py
git commit -m "feat(atolye): migration add work_orders.sent flag"
```

---

### Task 2: Model — add `sent` to `WorkOrder`

**Files:**
- Modify: `dtbackend/app/models/romiot_models.py:72`

Pure type/column change (exempt from TDD).

- [ ] **Step 1: Add the column**

In `dtbackend/app/models/romiot_models.py`, the `WorkOrder` class currently ends its flag block with (line 71-72):

```python
    # Whether operator overrode a route warning when this row was committed
    route_violation = Column(Boolean, nullable=False, server_default="false")
```

Add immediately below it:

```python
    # Whether the row's CURRENT state has been delivered to the Toy/Mekasan API.
    # Reset to false whenever the state changes (row created, exit_date filled);
    # set true when a push of the current state succeeds. Drives piggyback retry.
    sent = Column(Boolean, nullable=False, server_default="false")
```

- [ ] **Step 2: Verify the model imports and exposes the column**

Run: `python -c "from app.models.romiot_models import WorkOrder; print('sent' in WorkOrder.__table__.columns)"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/models/romiot_models.py
git commit -m "feat(atolye): add WorkOrder.sent column to model"
```

---

### Task 3: `_post_one` and `send_production_order` return booleans

**Files:**
- Modify: `dtbackend/app/services/toy_api_service.py:44-102`
- Test: `dtbackend/test_toy_api_post_helper.py`

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_toy_api_post_helper.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m unittest test_toy_api_post_helper -v`
Expected: FAIL — `_post_one`/`send_production_order` currently return `None`, so `test_returns_true_on_2xx`, `test_single_pair_returns_post_result`, `test_multi_pair_true_only_when_all_succeed` assert `True` against `None`/return-mismatch and fail.

- [ ] **Step 3: Make `_post_one` return a bool**

In `dtbackend/app/services/toy_api_service.py`, replace the current `_post_one` (lines 44-58):

```python
async def _post_one(api_url: str, api_key: str, payload: dict, work_order_id: int) -> None:
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            response = await client.post(
                api_url,
                json=payload,
                headers={"Authorization": api_key, "Content-Type": "application/json"},
            )
            if not response.is_success:
                logger.error(
                    "Mekasan API error %s for work_order_id=%s: %s",
                    response.status_code, work_order_id, response.text,
                )
    except Exception as exc:
        logger.error("Mekasan API call failed for work_order_id=%s: %s", work_order_id, exc)
```

with:

```python
async def _post_one(api_url: str, api_key: str, payload: dict, work_order_id: int) -> bool:
    """POST one payload. Returns True on a 2xx response, False on a non-2xx
    response or any exception. Never raises."""
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            response = await client.post(
                api_url,
                json=payload,
                headers={"Authorization": api_key, "Content-Type": "application/json"},
            )
            if not response.is_success:
                logger.error(
                    "Mekasan API error %s for work_order_id=%s: %s",
                    response.status_code, work_order_id, response.text,
                )
                return False
            return True
    except Exception as exc:
        logger.error("Mekasan API call failed for work_order_id=%s: %s", work_order_id, exc)
        return False
```

- [ ] **Step 4: Make `send_production_order` return all-or-nothing bool**

In the same file, replace the body of `send_production_order` (current lines 85-102, from `if not pairs:` to the end):

```python
    if not pairs:
        logger.warning("send_production_order skipped: empty pairs for work_order_id=%s", work_order.id)
        return

    base_id = f"{work_order.work_order_group_id}-{station.id}"

    if len(pairs) == 1:
        item = _build_payload_item(work_order, station, pairs[0], base_id, subcontractor_id, company)
        await _post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id)
        return

    # Multi-pair: N independent POSTs in parallel
    tasks = []
    for pair in pairs:
        mes_order_id = f"{base_id}-{pair.aselsan_order_number}-{pair.order_item_number}"
        item = _build_payload_item(work_order, station, pair, mes_order_id, subcontractor_id, company)
        tasks.append(_post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id))
    await asyncio.gather(*tasks)
```

with:

```python
    if not pairs:
        logger.warning("send_production_order skipped: empty pairs for work_order_id=%s", work_order.id)
        return False

    base_id = f"{work_order.work_order_group_id}-{station.id}"

    if len(pairs) == 1:
        item = _build_payload_item(work_order, station, pairs[0], base_id, subcontractor_id, company)
        return await _post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id)

    # Multi-pair: N independent POSTs in parallel. All-or-nothing: True only if
    # every pair POST succeeded. Re-pushing already-delivered pairs is safe
    # because Toy upserts by Mes_OrderId.
    tasks = []
    for pair in pairs:
        mes_order_id = f"{base_id}-{pair.aselsan_order_number}-{pair.order_item_number}"
        item = _build_payload_item(work_order, station, pair, mes_order_id, subcontractor_id, company)
        tasks.append(_post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id))
    results = await asyncio.gather(*tasks)
    return all(results)
```

Also update the function's return annotation: change the signature line `) -> None:` (line 69) to `) -> bool:`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `python -m unittest test_toy_api_post_helper -v`
Expected: PASS — all 7 tests.

- [ ] **Step 6: Commit**

```bash
git add dtbackend/app/services/toy_api_service.py dtbackend/test_toy_api_post_helper.py
git commit -m "feat(atolye): Toy API push returns success boolean (all-or-nothing)"
```

---

### Task 4: Service helpers — `_resolve_pairs`, `_resolve_subcontractor_id`, `_push_one_work_order`

**Files:**
- Modify: `dtbackend/app/services/toy_api_service.py` (add imports + three functions)
- Test: `dtbackend/test_toy_api_sync_helper.py`

`_push_one_work_order` reloads a row's station, pairs, and subcontractor code, pushes it, and records `sent`. `_resolve_pairs` reuses the canonical `_pairs_for_group` from the endpoint module via a **lazy import** (the endpoint imports this service, so a top-level import would be circular). `_resolve_subcontractor_id` short-circuits to `None` when the row has no `company_from_id`.

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_toy_api_sync_helper.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m unittest test_toy_api_sync_helper -v`
Expected: FAIL — `AttributeError: module 'app.services.toy_api_service' has no attribute '_push_one_work_order'` (and `_resolve_pairs` / `_resolve_subcontractor_id`).

- [ ] **Step 3: Add imports**

In `dtbackend/app/services/toy_api_service.py`, the current top imports are:

```python
import asyncio
import logging

import httpx

from app.schemas.order_pair import OrderPair
```

Replace that block with:

```python
import asyncio
import logging

import httpx
from sqlalchemy import select

from app.core.database import RomiotAsyncSessionLocal
from app.models.romiot_models import (
    Company,
    CompanyIntegration,
    Station,
    WorkOrder,
)
from app.schemas.order_pair import OrderPair
```

- [ ] **Step 4: Add the three helpers**

Append to the end of `dtbackend/app/services/toy_api_service.py`:

```python
async def _resolve_pairs(db, work_order_group_id: str) -> list[OrderPair]:
    """Canonical pairs for a group. Delegates to the endpoint's `_pairs_for_group`
    via a lazy import — a top-level import would be circular (the endpoint module
    imports this service)."""
    from app.api.v1.endpoints.romiot.station.work_order import _pairs_for_group
    return await _pairs_for_group(db, work_order_group_id)


async def _resolve_subcontractor_id(db, company_from_id) -> str | None:
    """Company.code for the row's company_from_id (sent as SubcontractorID).
    Short-circuits to None when the row has no company_from_id."""
    if company_from_id is None:
        return None
    result = await db.execute(select(Company.code).where(Company.id == company_from_id))
    return result.scalar_one_or_none()


async def _push_one_work_order(db, work_order, integration) -> bool:
    """Reload a row's station/pairs/subcontractor, push the current state, and
    record `sent`. Returns the push result. Assumes `integration` (api_url,
    api_key, company) is the integration for the row's company."""
    station = await db.get(Station, work_order.station_id)
    if station is None:
        return False
    pairs = await _resolve_pairs(db, work_order.work_order_group_id)
    subcontractor_id = await _resolve_subcontractor_id(db, work_order.company_from_id)
    ok = await send_production_order(
        work_order, station, integration.api_url, integration.api_key,
        integration.company, pairs, subcontractor_id,
    )
    work_order.sent = ok
    return ok
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `python -m unittest test_toy_api_sync_helper -v`
Expected: PASS — `PushOneWorkOrderTest` (3) + `ResolveSubcontractorIdTest` (1). (`PushAndSyncTest` is added in Task 5.)

- [ ] **Step 6: Commit**

```bash
git add dtbackend/app/services/toy_api_service.py dtbackend/test_toy_api_sync_helper.py
git commit -m "feat(atolye): per-row Toy push helper that records sent"
```

---

### Task 5: `push_and_sync` orchestration with own session + sweep

**Files:**
- Modify: `dtbackend/app/services/toy_api_service.py` (add `push_and_sync`)
- Test: `dtbackend/test_toy_api_sync_helper.py` (add `PushAndSyncTest`)

`push_and_sync(work_order_id)` opens its own session, resolves the integration for the row's company, pushes the current row, then sweeps up to 20 `sent=false` rows for the same company (oldest first, excluding the current row) and re-pushes them. It never raises (it runs as a detached task).

- [ ] **Step 1: Write the failing test**

Add these imports/cases to `dtbackend/test_toy_api_sync_helper.py`. Insert the helper above the classes (after `_wo`):

```python
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
```

Add this test class before `if __name__`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m unittest test_toy_api_sync_helper.PushAndSyncTest -v`
Expected: FAIL — `AttributeError: module 'app.services.toy_api_service' has no attribute 'push_and_sync'`.

- [ ] **Step 3: Implement `push_and_sync`**

Append to the end of `dtbackend/app/services/toy_api_service.py`:

```python
async def push_and_sync(work_order_id: int) -> None:
    """Background entrypoint dispatched after a scan. Owns its own session.

    Pushes the current row's state to Toy and records `sent`, then sweeps up to
    20 `sent=false` rows for the SAME company (oldest first) and re-pushes them.
    Idempotent on Toy's side (upsert by Mes_OrderId). Never raises."""
    try:
        async with RomiotAsyncSessionLocal() as db:
            work_order = await db.get(WorkOrder, work_order_id)
            if work_order is None:
                return
            station = await db.get(Station, work_order.station_id)
            if station is None:
                return
            integration_result = await db.execute(
                select(CompanyIntegration).where(CompanyIntegration.company == station.company)
            )
            integration = integration_result.scalar_one_or_none()
            if not (integration and integration.api_url and integration.api_key):
                return

            await _push_one_work_order(db, work_order, integration)

            unsent_result = await db.execute(
                select(WorkOrder)
                .join(Station, WorkOrder.station_id == Station.id)
                .where(
                    Station.company == integration.company,
                    WorkOrder.sent == False,  # noqa: E712 — SQLAlchemy boolean comparison
                    WorkOrder.id != work_order.id,
                )
                .order_by(WorkOrder.id)
                .limit(20)
            )
            for row in unsent_result.scalars().all():
                await _push_one_work_order(db, row, integration)

            await db.commit()
    except Exception as exc:
        logger.error("push_and_sync failed for work_order_id=%s: %s", work_order_id, exc)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m unittest test_toy_api_sync_helper -v`
Expected: PASS — `PushOneWorkOrderTest` (3) + `ResolveSubcontractorIdTest` (1) + `PushAndSyncTest` (2).

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/services/toy_api_service.py dtbackend/test_toy_api_sync_helper.py
git commit -m "feat(atolye): push_and_sync background task with unsent sweep"
```

---

### Task 6: Wire endpoints to `push_and_sync` + reset `sent` on exit

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py:29` (import)
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py:574-589` (create_work_order push)
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py:686-689` (exit resets sent)
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py:754-774` (exit push)

Endpoint wiring (no new unit test — the repo unit-tests helpers, not handlers; this task verifies via an import/signature smoke check and the existing helper suite, then manual verification). `Company` stays imported (still used by the `company_from_id` resolution at lines ~518-522).

- [ ] **Step 1: Swap the service import**

Line 29 currently:

```python
from app.services.toy_api_service import send_production_order
```

Replace with:

```python
from app.services.toy_api_service import push_and_sync
```

- [ ] **Step 2: Simplify the `create_work_order` push block**

Replace the current block (lines 573-589):

```python
    # F3+Mekasan: push with pairs
    if this_station:
        integration_result = await romiot_db.execute(
            select(CompanyIntegration).where(CompanyIntegration.company == this_station.company)
        )
        integration = integration_result.scalar_one_or_none()
        if integration and integration.api_url and integration.api_key:
            pairs = await _pairs_for_group(romiot_db, work_order_data.work_order_group_id)
            subcontractor_id = None
            if new_work_order.company_from_id is not None:
                code_row = await romiot_db.execute(
                    select(Company.code).where(Company.id == new_work_order.company_from_id)
                )
                subcontractor_id = code_row.scalar_one_or_none()
            asyncio.create_task(send_production_order(
                new_work_order, this_station, integration.api_url, integration.api_key, this_station.company, pairs, subcontractor_id,
            ))
```

with:

```python
    # F3+Mekasan: push the new row's state to Toy and sweep unsent rows.
    # push_and_sync reloads station/pairs/subcontractor by id in its own session.
    if this_station:
        integration_result = await romiot_db.execute(
            select(CompanyIntegration).where(CompanyIntegration.company == this_station.company)
        )
        integration = integration_result.scalar_one_or_none()
        if integration and integration.api_url and integration.api_key:
            asyncio.create_task(push_and_sync(new_work_order.id))
```

- [ ] **Step 3: Reset `sent` when the exit_date is filled**

In `update_exit_date`, the current block (lines 685-689):

```python
    # Update exit_date with current datetime (timezone-aware)
    work_order.exit_date = datetime.now(timezone.utc)
    if update_data.acknowledged_route_violation:
        work_order.route_violation = True
    await romiot_db.commit()
```

Replace with:

```python
    # Update exit_date with current datetime (timezone-aware). Filling exit_date
    # changes the state previously delivered to Toy, so mark the row unsent — the
    # push below (and the piggyback sweep) re-delivers the exit event.
    work_order.exit_date = datetime.now(timezone.utc)
    work_order.sent = False
    if update_data.acknowledged_route_violation:
        work_order.route_violation = True
    await romiot_db.commit()
```

- [ ] **Step 4: Simplify the `update_exit_date` push block**

Replace the current block (lines 754-774):

```python
    # Fire-and-forget: push exit event to external integration (e.g. Mekasan)
    exit_station_result = await romiot_db.execute(
        select(Station).where(Station.id == update_data.station_id)
    )
    exit_station_obj = exit_station_result.scalar_one_or_none()
    if exit_station_obj:
        exit_integration_result = await romiot_db.execute(
            select(CompanyIntegration).where(CompanyIntegration.company == exit_station_obj.company)
        )
        exit_integration = exit_integration_result.scalar_one_or_none()
        if exit_integration and exit_integration.api_url and exit_integration.api_key:
            pairs = await _pairs_for_group(romiot_db, work_order.work_order_group_id)
            subcontractor_id = None
            if work_order.company_from_id is not None:
                code_row = await romiot_db.execute(
                    select(Company.code).where(Company.id == work_order.company_from_id)
                )
                subcontractor_id = code_row.scalar_one_or_none()
            asyncio.create_task(
                send_production_order(work_order, exit_station_obj, exit_integration.api_url, exit_integration.api_key, exit_station_obj.company, pairs, subcontractor_id)
            )
```

with:

```python
    # Fire-and-forget: push the exit state to Toy and sweep unsent rows.
    exit_station_result = await romiot_db.execute(
        select(Station).where(Station.id == update_data.station_id)
    )
    exit_station_obj = exit_station_result.scalar_one_or_none()
    if exit_station_obj:
        exit_integration_result = await romiot_db.execute(
            select(CompanyIntegration).where(CompanyIntegration.company == exit_station_obj.company)
        )
        exit_integration = exit_integration_result.scalar_one_or_none()
        if exit_integration and exit_integration.api_url and exit_integration.api_key:
            asyncio.create_task(push_and_sync(work_order.id))
```

- [ ] **Step 5: Smoke-check imports and the new wiring**

Run: `python -c "import app.api.v1.endpoints.romiot.station.work_order as w; from app.services.toy_api_service import push_and_sync; assert hasattr(w, 'push_and_sync'); print('wired OK')"`
Expected: `wired OK` (no `ImportError`, no circular-import error). This confirms the lazy import in `_resolve_pairs` keeps the service ↔ endpoint cycle from breaking module load.

Run: `python -c "import ast; ast.parse(open('app/api/v1/endpoints/romiot/station/work_order.py').read()); print('syntax OK')"`
Expected: `syntax OK`.

- [ ] **Step 6: Run the full helper test suite (no regressions)**

Run: `python -m unittest test_toy_api_post_helper test_toy_api_sync_helper test_qr_pairs_fallback_helper test_work_order_serialization_helper -v`
Expected: PASS — all tests across the four modules.

- [ ] **Step 7: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "feat(atolye): dispatch push_and_sync from scan endpoints; reset sent on exit"
```

---

## Manual Verification (after all tasks)

With a running backend + romiot DB and a configured `CompanyIntegration`:

1. **Happy path:** Scan a QR (entry). Confirm the `work_orders` row gets `sent=true` shortly after (background task). Exit-scan it; confirm `sent` momentarily flips `false` then back to `true`.
2. **Failure path:** Point the integration `api_url` at an unreachable host. Scan; confirm the row stays `sent=false` and an error is logged (`push_and_sync failed` / `Mekasan API call failed`). Restore the URL, then perform any other scan for the same company; confirm the previously-failed row flips to `sent=true` via the sweep.
3. **Bound:** With >20 unsent rows for one company, confirm each scan drains at most 20 (oldest `id` first).

---

## Self-Review

**1. Spec coverage:**
- Schema `sent` column → Tasks 1-2. ✅
- `sent` meaning "current state synced", reset on state change → Task 2 (column), Task 6 Step 3 (reset on exit); create path defaults false then flips. ✅
- `_post_one`/`send_production_order` return bool, all-or-nothing → Task 3. ✅
- `push_and_sync` owns session, reloads by id, no-op without integration, pushes current, sweeps `LIMIT 20` oldest-first same-company excluding current, single commit → Task 5. ✅
- Per-row reload helper shared between current + swept rows → Task 4 (`_push_one_work_order`). ✅
- Call sites dispatch `push_and_sync(id)`, inline pair/subcontractor lookups removed, integration guard kept → Task 6 Steps 2 & 4. ✅
- Idempotency / piggyback-only / accepted gap → behavioral, no code; covered by design. ✅
- Tests for `_post_one`, `send_production_order`, `push_and_sync` → Tasks 3 & 5. ✅
- Circular-import avoidance (`_pairs_for_group` lazy import) → Task 4 Step 4 + Task 6 Step 5 smoke check. ✅

**2. Placeholder scan:** No TBD/TODO/"handle errors"/"similar to". Every code step shows complete code. ✅

**3. Type consistency:** `push_and_sync(work_order_id: int)` is called with `new_work_order.id` and `work_order.id` (Task 6). `_push_one_work_order(db, work_order, integration)` signature matches its calls in `push_and_sync` and its test. `_resolve_pairs(db, group_id)` / `_resolve_subcontractor_id(db, company_from_id)` names match Task 4 definitions and the Task 4/5 patches (`svc._resolve_pairs`, `svc._resolve_subcontractor_id`). `send_production_order(...) -> bool` returns are consumed by `_push_one_work_order`. `integration.company` is used (CompanyIntegration has `company`, confirmed). Migration `down_revision='08be09af3bfd'` matches the verified current head. ✅
