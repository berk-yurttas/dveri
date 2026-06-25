# Ürünüm Nerede — External MES (AFLOW) Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the "Ürünüm Nerede?" page to read tracking data from the external MES tables (`Mes_ProductionOrders_<company>`) in the AFLOW SQL Server, selected per Hedef Firma via a new Postgres config table, while reusing the existing `TrackResponse` shape and result components.

**Architecture:** A new `mes_tracking_service.py` validates a per-Hedef-Firma config row (`urunum_nerede_mes_sources`), builds a parameterized SQL query against the configured AFLOW table, reads it via pyodbc (in a thread), groups rows by `(AselsanOrderCode, WorkOrderItemNo)`, and assembles `TrackMatch` objects. A new `GET /romiot/station/work-orders/track-mes` endpoint exposes it (müşteri-gated). The frontend adds a Hedef Firma selector and points the page at the new endpoint. The old Postgres `/track` endpoint is untouched.

**Tech Stack:** FastAPI, SQLAlchemy (async, Postgres), Alembic (`alembic_romiot`), pyodbc → SQL Server (AFLOW), Pydantic v2, Next.js (App Router, `"use client"`), TypeScript, Tailwind. Backend tests: `unittest` (mirroring `test_toy_api_post_helper.py`), pyodbc/DB mocked.

**Spec:** [docs/superpowers/specs/2026-06-25-urunum-nerede-mes-source-design.md](../specs/2026-06-25-urunum-nerede-mes-source-design.md)

---

## File Structure

**Create:**
- `dtbackend/app/services/mes_tracking_service.py` — config lookup, SQL builder, pyodbc read, grouping/assembly into `TrackResponse`.
- `dtbackend/alembic_romiot/versions/d5e6f7a8b9c0_add_urunum_nerede_mes_sources_table.py` — migration for the config table.
- `dtbackend/test_mes_tracking_service.py` — unit tests (pyodbc/DB mocked).
- `dtfrontend/src/components/atolye/urunum-nerede/HedefFirmaSelect.tsx` — small dropdown component.

**Modify:**
- `dtbackend/app/models/romiot_models.py` — add `UrunumNeredeMesSource` model.
- `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — add `GET /track-mes`.
- `dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx` — Hedef Firma selector + endpoint switch + `hedef_firma` query param.

**Manual (documented, not executed by tasks):**
- Seed `urunum_nerede_mes_sources` rows per live Hedef Firma.

---

## Task 1: Config model `UrunumNeredeMesSource`

**Files:**
- Modify: `dtbackend/app/models/romiot_models.py`

> Pure model (types/config) — exempt from RED/GREEN TDD per the project rules. Verify by import.

- [ ] **Step 1: Add the model**

Append after the `WorkOrderLinkDirectory` class (the existing config-table models live together near the end of the module; mirror their style — `PostgreSQLBase`, `Column`, `String`, `DateTime(timezone=True)`, `func.now()` are already imported and used by `CompanyIntegration` at line 140):

```python
class UrunumNeredeMesSource(PostgreSQLBase):
    """Per-Hedef-Firma source mapping for the 'Ürünüm Nerede?' tracker.

    Maps a Hedef Firma (target/coating company, matching
    `company_integrations.company`) to its external MES table in AFLOW and an
    optional single-column equality filter. Read by mes_tracking_service.
    """
    __tablename__ = "urunum_nerede_mes_sources"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String(255), nullable=False, unique=True, index=True)
    table_name = Column(String(255), nullable=False)
    filter_column = Column(String(128), nullable=True)
    filter_value = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 2: Verify it imports**

Run: `cd dtbackend && python -c "from app.models.romiot_models import UrunumNeredeMesSource; print(UrunumNeredeMesSource.__tablename__)"`
Expected: prints `urunum_nerede_mes_sources` with no import error.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/models/romiot_models.py
git commit -m "feat(urunum-nerede): add UrunumNeredeMesSource config model"
```

---

## Task 2: Alembic migration for `urunum_nerede_mes_sources`

**Files:**
- Create: `dtbackend/alembic_romiot/versions/d5e6f7a8b9c0_add_urunum_nerede_mes_sources_table.py`

> Pure migration (config) — exempt from RED/GREEN TDD. The current head is `b1c2d3e4f5a6` (add_sent_to_work_orders.py).

- [ ] **Step 1: Create the migration file**

```python
"""add urunum_nerede_mes_sources table

Revision ID: d5e6f7a8b9c0
Revises: b1c2d3e4f5a6
Create Date: 2026-06-25 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd5e6f7a8b9c0'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'urunum_nerede_mes_sources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company', sa.String(length=255), nullable=False),
        sa.Column('table_name', sa.String(length=255), nullable=False),
        sa.Column('filter_column', sa.String(length=128), nullable=True),
        sa.Column('filter_value', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('company'),
    )
    op.create_index(op.f('ix_urunum_nerede_mes_sources_id'), 'urunum_nerede_mes_sources', ['id'], unique=False)
    op.create_index(op.f('ix_urunum_nerede_mes_sources_company'), 'urunum_nerede_mes_sources', ['company'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_urunum_nerede_mes_sources_company'), table_name='urunum_nerede_mes_sources')
    op.drop_index(op.f('ix_urunum_nerede_mes_sources_id'), table_name='urunum_nerede_mes_sources')
    op.drop_table('urunum_nerede_mes_sources')
```

- [ ] **Step 2: Verify it is a single head**

Run: `cd dtbackend && python -m alembic -c alembic_romiot.ini heads 2>/dev/null || echo "alembic not runnable here — verify down_revision matches b1c2d3e4f5a6 by inspection"`
Expected: either alembic reports the single head `d5e6f7a8b9c0`, or (if alembic can't connect) confirm by inspection that no other version file has `down_revision = 'b1c2d3e4f5a6'`.

Run: `cd dtbackend && grep -rl "down_revision = 'b1c2d3e4f5a6'" alembic_romiot/versions/`
Expected: exactly one file — the new migration.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/alembic_romiot/versions/d5e6f7a8b9c0_add_urunum_nerede_mes_sources_table.py
git commit -m "feat(urunum-nerede): migration for urunum_nerede_mes_sources table"
```

---

## Task 3: SQL builder + identifier validation (`build_track_query`)

**Files:**
- Create: `dtbackend/app/services/mes_tracking_service.py`
- Test: `dtbackend/test_mes_tracking_service.py`

This task creates the module with the pure SQL-building function only. Later tasks add assembly and orchestration to the same module.

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_mes_tracking_service.py`:

```python
"""Unit tests for mes_tracking_service. No DB/network: SQL building and
assembly are pure functions; orchestration mocks pyodbc + the session.
Run with: python -m unittest test_mes_tracking_service -v
"""
import unittest

from app.services.mes_tracking_service import build_track_query


class BuildTrackQueryTest(unittest.TestCase):
    def test_order_search_exact_predicates_and_params(self):
        sql, params = build_track_query(
            table_name="Mes_ProductionOrders_bosan",
            filter_column=None, filter_value=None,
            order_number="26Y2173D43", order_item_number="00030",
            part_number=None,
        )
        self.assertIn("FROM dbo.[Mes_ProductionOrders_bosan]", sql)
        self.assertIn("AselsanOrderCode = ?", sql)
        self.assertIn("WorkOrderItemNo = ?", sql)
        self.assertIn("IsDeleted = 0 OR IsDeleted IS NULL", sql)
        self.assertNotIn("ProductCode LIKE", sql)
        self.assertEqual(params, ["26Y2173D43", "00030"])

    def test_part_search_uses_like_with_wildcards(self):
        sql, params = build_track_query(
            table_name="Mes_ProductionOrders_mekasan",
            filter_column=None, filter_value=None,
            order_number=None, order_item_number=None,
            part_number="MM-0009",
        )
        self.assertIn("ProductCode LIKE ?", sql)
        self.assertNotIn("AselsanOrderCode = ?", sql)
        self.assertEqual(params, ["%MM-0009%"])

    def test_optional_filter_prepended_when_configured(self):
        sql, params = build_track_query(
            table_name="Mes_ProductionOrders_mekasan",
            filter_column="SourceCompany", filter_value="ASELSAN",
            order_number=None, order_item_number=None,
            part_number="X",
        )
        self.assertIn("SourceCompany = ?", sql)
        # filter param comes before the search param
        self.assertEqual(params, ["ASELSAN", "%X%"])

    def test_invalid_table_name_raises(self):
        with self.assertRaises(ValueError):
            build_track_query(
                table_name="Mes; DROP TABLE x;--",
                filter_column=None, filter_value=None,
                order_number=None, order_item_number=None, part_number="X",
            )

    def test_invalid_filter_column_raises(self):
        with self.assertRaises(ValueError):
            build_track_query(
                table_name="Mes_ProductionOrders_bosan",
                filter_column="a = 1; --", filter_value="x",
                order_number=None, order_item_number=None, part_number="X",
            )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service.BuildTrackQueryTest -v`
Expected: FAIL — `ImportError`/`ModuleNotFoundError` (`mes_tracking_service` / `build_track_query` not defined).

- [ ] **Step 3: Write minimal implementation**

Create `dtbackend/app/services/mes_tracking_service.py`:

```python
"""Ürünüm Nerede tracker — external MES (AFLOW) data source.

Reads Mes_ProductionOrders_<company> per Hedef Firma (configured in the
`urunum_nerede_mes_sources` Postgres table) and assembles the existing
TrackResponse shape. pyodbc reads run in a worker thread (pyodbc is sync).
"""
import re

# Identifier safety: table/column names are interpolated into SQL (they cannot
# be pyodbc bind parameters), so they must be strictly alphanumeric/underscore.
_IDENT_RE = re.compile(r"^[A-Za-z0-9_]+$")

# Columns selected from the MES table (see spec §4).
_SELECT_COLUMNS = (
    "AselsanOrderCode", "WorkOrderItemNo", "ProductCode", "RevisionNo",
    "OperationDesc", "Mes_MachineGroup", "OperationCode", "OrderStatus",
    "ActualStartDate", "ActualEndDate", "NeedDate", "AselsanSectorCode",
    "SubcontractorID", "WorkOrderAmount", "PlannedQuantity",
)


def _validate_identifier(name: str) -> str:
    if not name or not _IDENT_RE.match(name):
        raise ValueError(f"Geçersiz SQL tanımlayıcısı: {name!r}")
    return name


def build_track_query(
    *,
    table_name: str,
    filter_column: str | None,
    filter_value: str | None,
    order_number: str | None,
    order_item_number: str | None,
    part_number: str | None,
) -> tuple[str, list]:
    """Build the parameterized SELECT against the configured MES table.

    Returns (sql, params). Identifiers (table/column) are validated and
    interpolated; all values are pyodbc ``?`` bind params in `params` order.
    """
    table = _validate_identifier(table_name)
    columns = ", ".join(_SELECT_COLUMNS)
    clauses: list[str] = ["1 = 1"]
    params: list = []

    if filter_column and filter_value is not None:
        col = _validate_identifier(filter_column)
        clauses.append(f"{col} = ?")
        params.append(filter_value)

    if order_number and order_item_number:
        clauses.append("AselsanOrderCode = ?")
        clauses.append("WorkOrderItemNo = ?")
        params.append(order_number)
        params.append(order_item_number)
    elif part_number:
        clauses.append("ProductCode LIKE ?")
        params.append(f"%{part_number}%")

    clauses.append("(IsDeleted = 0 OR IsDeleted IS NULL)")

    sql = (
        f"SELECT {columns} FROM dbo.[{table}] "
        f"WHERE {' AND '.join(clauses)}"
    )
    return sql, params
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service.BuildTrackQueryTest -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/services/mes_tracking_service.py dtbackend/test_mes_tracking_service.py
git commit -m "feat(urunum-nerede): MES SQL builder with identifier validation"
```

---

## Task 4: Row grouping + status + `TrackMatch` assembly (`assemble_matches`)

**Files:**
- Modify: `dtbackend/app/services/mes_tracking_service.py`
- Test: `dtbackend/test_mes_tracking_service.py`

Rows arrive as dicts (column name → value). Group by `(AselsanOrderCode, WorkOrderItemNo)`; each row is one operation/timeline step. Produces `TrackMatch` objects (spec §5.3).

- [ ] **Step 1: Write the failing test**

Append to `dtbackend/test_mes_tracking_service.py`:

```python
from datetime import datetime, date

from app.services.mes_tracking_service import assemble_matches


def _row(order="26Y2173D43", item="00030", op="Kaplama", mg="2",
         start=None, end=None, need=None, product="MM-0009-2244",
         rev="A", sub="1001", amount=9):
    return {
        "AselsanOrderCode": order, "WorkOrderItemNo": item,
        "ProductCode": product, "RevisionNo": rev,
        "OperationDesc": op, "Mes_MachineGroup": mg, "OperationCode": "OP",
        "OrderStatus": None,
        "ActualStartDate": start, "ActualEndDate": end, "NeedDate": need,
        "AselsanSectorCode": "RF", "SubcontractorID": sub,
        "WorkOrderAmount": amount, "PlannedQuantity": 3,
    }


class AssembleMatchesTest(unittest.TestCase):
    def test_two_pairs_yield_two_matches(self):
        rows = [_row(item="00030"), _row(item="00040")]
        matches = assemble_matches(rows, hedef_firma="Bosan",
                                   company_name_by_code={}, today=date(2026, 6, 25))
        self.assertEqual(len(matches), 2)

    def test_single_pair_with_two_ops_one_match_two_steps_in_order(self):
        rows = [
            _row(op="Boya", mg="3", start=datetime(2026, 6, 2)),
            _row(op="Kaplama", mg="1", start=datetime(2026, 6, 1), end=datetime(2026, 6, 2)),
        ]
        matches = assemble_matches(rows, hedef_firma="Bosan",
                                   company_name_by_code={}, today=date(2026, 6, 25))
        self.assertEqual(len(matches), 1)
        steps = matches[0].timeline
        self.assertEqual([s.station_name for s in steps], ["Kaplama", "Boya"])
        self.assertEqual(steps[0].status, "done")
        self.assertEqual(steps[1].status, "active")
        self.assertTrue(steps[-1].is_exit_station)

    def test_all_ops_done_is_tamamlandi(self):
        rows = [_row(start=datetime(2026, 6, 1), end=datetime(2026, 6, 2))]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.status, "Tamamlandı")

    def test_active_and_overdue_is_gecikmis(self):
        rows = [_row(start=datetime(2026, 6, 1), end=None, need=datetime(2026, 6, 10))]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.status, "Gecikmiş")

    def test_nothing_started_is_girisi_yapilmadi(self):
        rows = [_row(start=None, end=None)]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.status, "Girişi yapılmadı")
        self.assertIsNone(m.current_station_name)

    def test_company_from_resolved_from_subcontractor_id(self):
        rows = [_row(sub="1001")]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={"1001": "ASELSAN REHİS"},
                             today=date(2026, 6, 25))[0]
        self.assertEqual(m.company_from, "ASELSAN REHİS")
        self.assertEqual(m.coating_company, "Bosan")
        self.assertEqual(m.packages, [])
        self.assertEqual(m.total_packages, 1)
        self.assertEqual(m.work_order_group_id, "26Y2173D43-00030")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service.AssembleMatchesTest -v`
Expected: FAIL — `ImportError` (`assemble_matches` not defined).

- [ ] **Step 3: Write minimal implementation**

Add to `dtbackend/app/services/mes_tracking_service.py`. First extend the imports at the top of the file:

```python
import re
from datetime import date, datetime

from app.schemas.order_pair import OrderPair
from app.schemas.work_order import TrackMatch, TrackResponse, TrackTimelineStep
```

Then append:

```python
def _to_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _step_status(start, end, need_date: date | None, today: date) -> str:
    if end is not None:
        return "done"
    if start is not None:
        if need_date is not None and need_date < today:
            return "delayed"
        return "active"
    return "waiting"


def _sort_key(row) -> tuple:
    raw = row.get("Mes_MachineGroup")
    try:
        order = (0, int(raw))
    except (TypeError, ValueError):
        order = (1, str(raw or ""))
    start = row.get("ActualStartDate") or datetime.max
    return (order, start)


def _int_or_zero(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _build_one_match(rows: list[dict], *, hedef_firma, company_name_by_code, today) -> TrackMatch:
    ordered = sorted(rows, key=_sort_key)
    first = ordered[0]
    need_date = _to_date(first.get("NeedDate"))

    steps: list[TrackTimelineStep] = []
    for i, row in enumerate(ordered):
        start = row.get("ActualStartDate")
        end = row.get("ActualEndDate")
        steps.append(TrackTimelineStep(
            position=i + 1,
            station_id=i + 1,
            station_name=str(row.get("OperationDesc") or "—"),
            is_exit_station=(i == len(ordered) - 1),
            status=_step_status(start, end, _to_date(row.get("NeedDate")), today),
            entry_date=start,
            exit_date=end,
        ))

    # current location: last active step, else last done step, else None
    active = [s for s in steps if s.status in ("active", "delayed")]
    done = [s for s in steps if s.status == "done"]
    if active:
        current = active[-1]
        current_name, current_entry = current.station_name, current.entry_date
    elif done:
        current_name, current_entry = done[-1].station_name, None
    else:
        current_name, current_entry = None, None

    # group status rollup
    if steps and all(s.status == "done" for s in steps):
        status = "Tamamlandı"
    elif active and steps[-1].status in ("active", "delayed") and steps[-1].is_exit_station:
        status = "Sevke Hazır"
    elif any(s.status == "delayed" for s in steps):
        status = "Gecikmiş"
    elif active:
        status = "İşlemde"
    else:
        status = "Girişi yapılmadı"

    all_dates = [d for r in ordered for d in (r.get("ActualStartDate"), r.get("ActualEndDate")) if d is not None]
    last_updated = max(all_dates) if all_dates else None

    sub_code = str(first.get("SubcontractorID") or "")
    company_from = company_name_by_code.get(sub_code) or sub_code

    return TrackMatch(
        work_order_group_id=f"{first.get('AselsanOrderCode')}-{first.get('WorkOrderItemNo')}",
        part_number=str(first.get("ProductCode") or ""),
        revision_number=(str(first["RevisionNo"]) if first.get("RevisionNo") else None),
        pairs=[OrderPair(
            aselsan_order_number=str(first.get("AselsanOrderCode") or ""),
            order_item_number=str(first.get("WorkOrderItemNo") or ""),
        )],
        main_customer="",
        sector=str(first.get("AselsanSectorCode") or ""),
        company_from=company_from,
        coating_company=hedef_firma,
        teklif_number="",
        total_quantity=_int_or_zero(first.get("WorkOrderAmount")) or _int_or_zero(first.get("PlannedQuantity")),
        total_packages=1,
        target_date=need_date,
        current_station_name=current_name,
        current_entry_date=current_entry,
        status=status,
        last_updated=last_updated,
        has_route=len(steps) > 1,
        timeline=steps,
        packages=[],
    )


def assemble_matches(rows: list[dict], *, hedef_firma: str, company_name_by_code: dict, today: date) -> list[TrackMatch]:
    """Group MES rows by (AselsanOrderCode, WorkOrderItemNo) → one TrackMatch each."""
    groups: dict[tuple, list[dict]] = {}
    for row in rows:
        key = (row.get("AselsanOrderCode"), row.get("WorkOrderItemNo"))
        groups.setdefault(key, []).append(row)
    return [
        _build_one_match(grp, hedef_firma=hedef_firma, company_name_by_code=company_name_by_code, today=today)
        for grp in groups.values()
    ]
```

> Note: `TrackTimelineStep.entry_date`/`exit_date` are `datetime | None` and `TrackMatch.target_date` is `date | None` — pass `datetime`/`date` objects directly (Pydantic v2 accepts them). The `OrderPair` fields require `min_length=1`, so a group must always have a non-empty order/item (guaranteed by grouping on them).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service.AssembleMatchesTest -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full test file**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service -v`
Expected: PASS (all BuildTrackQuery + AssembleMatches tests).

- [ ] **Step 6: Commit**

```bash
git add dtbackend/app/services/mes_tracking_service.py dtbackend/test_mes_tracking_service.py
git commit -m "feat(urunum-nerede): group MES rows and assemble TrackMatch with status"
```

---

## Task 5: Orchestration `track_from_mes` (config lookup + pyodbc read + Company resolve)

**Files:**
- Modify: `dtbackend/app/services/mes_tracking_service.py`
- Test: `dtbackend/test_mes_tracking_service.py`

Ties it together: load the config row, build the query, read AFLOW (in a thread), resolve `SubcontractorID → Company.name`, return `TrackResponse`. The DB session and pyodbc read are mocked in tests.

- [ ] **Step 1: Write the failing test**

Append to `dtbackend/test_mes_tracking_service.py`:

```python
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows
    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None
    def all(self):
        return self._rows


class _FakeSession:
    """Minimal async session: returns queued results per execute() call."""
    def __init__(self, results):
        self._results = list(results)
    async def execute(self, *_args, **_kwargs):
        return self._results.pop(0)


class TrackFromMesTest(unittest.TestCase):
    def test_missing_config_returns_empty_matches(self):
        from app.services.mes_tracking_service import track_from_mes
        session = _FakeSession([_FakeResult([])])  # no config row
        resp = asyncio.run(track_from_mes(
            session, hedef_firma="Yok", order_number=None,
            order_item_number=None, part_number="X",
        ))
        self.assertEqual(resp.matches, [])

    def test_happy_path_returns_assembled_match(self):
        from app.services.mes_tracking_service import track_from_mes
        config = SimpleNamespace(
            company="Bosan", table_name="Mes_ProductionOrders_bosan",
            filter_column=None, filter_value=None,
        )
        company_rows = [("1001", "ASELSAN REHİS")]
        session = _FakeSession([_FakeResult([config]), _FakeResult(company_rows)])
        fake_rows = [_row(sub="1001")]
        with patch("app.services.mes_tracking_service._fetch_rows",
                   new=AsyncMock(return_value=fake_rows)):
            resp = asyncio.run(track_from_mes(
                session, hedef_firma="Bosan", order_number="26Y2173D43",
                order_item_number="00030", part_number=None,
            ))
        self.assertEqual(len(resp.matches), 1)
        self.assertEqual(resp.matches[0].company_from, "ASELSAN REHİS")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service.TrackFromMesTest -v`
Expected: FAIL — `ImportError` (`track_from_mes` / `_fetch_rows` not defined).

- [ ] **Step 3: Write minimal implementation**

Extend the imports at the top of `mes_tracking_service.py`:

```python
import asyncio
import logging
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.core.database import get_aflow_connection
from app.models.romiot_models import Company, UrunumNeredeMesSource
from app.schemas.order_pair import OrderPair
from app.schemas.work_order import TrackMatch, TrackResponse, TrackTimelineStep

logger = logging.getLogger(__name__)
```

Append these functions:

```python
def _rows_via_pyodbc(sql: str, params: list) -> list[dict]:
    """Sync pyodbc read against AFLOW. Returns list of column→value dicts."""
    conn = get_aflow_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        columns = [d[0] for d in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    finally:
        conn.close()


async def _fetch_rows(sql: str, params: list) -> list[dict]:
    """Run the sync pyodbc read in a worker thread (pyodbc is blocking)."""
    return await asyncio.to_thread(_rows_via_pyodbc, sql, params)


async def _resolve_company_names(romiot_db, codes: set[str]) -> dict[str, str]:
    if not codes:
        return {}
    result = await romiot_db.execute(
        select(Company.code, Company.name).where(Company.code.in_(codes))
    )
    return {str(code): name for code, name in result.all()}


async def track_from_mes(
    romiot_db,
    *,
    hedef_firma: str,
    order_number: str | None,
    order_item_number: str | None,
    part_number: str | None,
) -> TrackResponse:
    """Resolve the Hedef Firma's MES config, query AFLOW, assemble TrackResponse.

    Missing config row → empty matches (not an error). Raises ValueError when a
    configured identifier is unsafe (endpoint maps to HTTP 400)."""
    config_result = await romiot_db.execute(
        select(UrunumNeredeMesSource).where(UrunumNeredeMesSource.company == hedef_firma)
    )
    config = config_result.scalar_one_or_none()
    if config is None:
        return TrackResponse(matches=[])

    sql, params = build_track_query(
        table_name=config.table_name,
        filter_column=config.filter_column,
        filter_value=config.filter_value,
        order_number=order_number,
        order_item_number=order_item_number,
        part_number=part_number,
    )
    rows = await _fetch_rows(sql, params)
    if not rows:
        return TrackResponse(matches=[])

    codes = {str(r.get("SubcontractorID")) for r in rows if r.get("SubcontractorID") is not None}
    company_name_by_code = await _resolve_company_names(romiot_db, codes)

    today = datetime.now(timezone.utc).date()
    matches = assemble_matches(
        rows, hedef_firma=hedef_firma,
        company_name_by_code=company_name_by_code, today=today,
    )
    return TrackResponse(matches=matches)
```

> Remove the now-duplicate `import re` / partial imports if they were added twice — the file should have a single import block. Keep `_IDENT_RE`, `_SELECT_COLUMNS`, and all functions.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service.TrackFromMesTest -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full service test file**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service -v`
Expected: PASS (all classes).

- [ ] **Step 6: Commit**

```bash
git add dtbackend/app/services/mes_tracking_service.py dtbackend/test_mes_tracking_service.py
git commit -m "feat(urunum-nerede): track_from_mes orchestration (config + pyodbc + resolve)"
```

---

## Task 6: Endpoint `GET /track-mes`

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`
- Test: `dtbackend/test_mes_tracking_service.py` (endpoint-validation unit tests via direct call)

Add the müşteri-gated endpoint that validates inputs and delegates to the service. Mirror the auth/validation style of the existing `track_product` handler at `work_order.py:1528`.

- [ ] **Step 1: Write the failing test**

Append to `dtbackend/test_mes_tracking_service.py`:

```python
from fastapi import HTTPException

from app.api.v1.endpoints.romiot.station.work_order import track_product_mes


class TrackMesEndpointTest(unittest.TestCase):
    def _user(self, roles):
        return SimpleNamespace(role=roles, department="ASELSAN")

    def test_non_musteri_role_403(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(track_product_mes(
                hedef_firma="Bosan", order_number=None, order_item_number=None,
                part_number="X", current_user=self._user(["atolye:operator"]),
                romiot_db=_FakeSession([]),
            ))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_missing_hedef_firma_400(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(track_product_mes(
                hedef_firma="", order_number="A", order_item_number="B",
                part_number=None, current_user=self._user(["atolye:musteri"]),
                romiot_db=_FakeSession([]),
            ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_missing_search_params_400(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(track_product_mes(
                hedef_firma="Bosan", order_number=None, order_item_number=None,
                part_number=None, current_user=self._user(["atolye:musteri"]),
                romiot_db=_FakeSession([]),
            ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_delegates_to_service_on_valid_request(self):
        from app.schemas.work_order import TrackResponse
        with patch("app.api.v1.endpoints.romiot.station.work_order.track_from_mes",
                   new=AsyncMock(return_value=TrackResponse(matches=[]))) as svc:
            resp = asyncio.run(track_product_mes(
                hedef_firma="Bosan", order_number="A", order_item_number="B",
                part_number=None, current_user=self._user(["atolye:musteri"]),
                romiot_db=_FakeSession([]),
            ))
        self.assertEqual(resp.matches, [])
        svc.assert_awaited_once()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service.TrackMesEndpointTest -v`
Expected: FAIL — `ImportError` (`track_product_mes` not defined).

- [ ] **Step 3: Write minimal implementation**

In `work_order.py`, add the service import near the existing `from app.services.toy_api_service import push_and_sync` line:

```python
from app.services.mes_tracking_service import track_from_mes
```

Add the handler immediately after the existing `track_product` function (which ends at the `return TrackResponse(matches=matches)` around line 1659):

```python
@router.get("/track-mes", response_model=TrackResponse)
async def track_product_mes(
    hedef_firma: str = Query(..., description="Hedef Firma"),
    order_number: str | None = Query(None, description="ASELSAN Sipariş No"),
    order_item_number: str | None = Query(None, description="Sipariş Kalem No"),
    part_number: str | None = Query(None, description="Parça Numarası"),
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Müşteri product tracker reading from the external MES (AFLOW) source
    configured per Hedef Firma. Same TrackResponse shape as /track."""
    role_values = current_user.role if isinstance(current_user.role, list) else []
    if "atolye:musteri" not in role_values:
        raise HTTPException(status_code=403, detail="Bu sayfa yalnızca müşteri kullanıcıları içindir.")

    if not (hedef_firma or "").strip():
        raise HTTPException(status_code=400, detail="Hedef Firma seçilmelidir.")

    has_order = bool(order_number and order_item_number)
    if not has_order and not part_number:
        raise HTTPException(
            status_code=400,
            detail="Sipariş No + Kalem No veya Parça No girilmelidir.",
        )

    try:
        return await track_from_mes(
            romiot_db,
            hedef_firma=hedef_firma.strip(),
            order_number=order_number if has_order else None,
            order_item_number=order_item_number if has_order else None,
            part_number=part_number,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service.TrackMesEndpointTest -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole service+endpoint test file**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service -v`
Expected: PASS (all classes).

- [ ] **Step 6: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py dtbackend/test_mes_tracking_service.py
git commit -m "feat(urunum-nerede): add GET /track-mes endpoint (musteri-gated)"
```

---

## Task 7: Frontend — Hedef Firma selector + endpoint switch

**Files:**
- Create: `dtfrontend/src/components/atolye/urunum-nerede/HedefFirmaSelect.tsx`
- Modify: `dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx`

> Frontend has no RTL infra for this area (per spec §9); verify by `tsc` + build + manual smoke.

- [ ] **Step 1: Create the selector component**

Create `dtfrontend/src/components/atolye/urunum-nerede/HedefFirmaSelect.tsx`:

```tsx
"use client";

export function HedefFirmaSelect({
  companies,
  value,
  onChange,
  disabled,
}: {
  companies: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
        Hedef Firma
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white text-sm disabled:opacity-50"
      >
        <option value="">Hedef firma seçin…</option>
        {companies.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page — imports, state, companies fetch**

In `dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx`:

Add the import alongside the other component imports (after the `PackageStrip` import):

```tsx
import { HedefFirmaSelect } from "@/components/atolye/urunum-nerede/HedefFirmaSelect";
```

Change the `RecentItem` interface to carry the Hedef Firma:

```tsx
interface RecentItem { label: string; sub: string; query: TrackQuery; hedefFirma: string; }
```

Add state next to the existing `useState` hooks (after `const [recent, setRecent] = useState<RecentItem[]>([]);`):

```tsx
  const [companies, setCompanies] = useState<string[]>([]);
  const [hedefFirma, setHedefFirma] = useState("");
```

Add a companies fetch effect after the existing recent-loading `useEffect`:

```tsx
  useEffect(() => {
    api
      .get<string[]>("/romiot/station/company-integration/companies", undefined, { useCache: true })
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => setCompanies([]));
  }, []);
```

- [ ] **Step 3: Update `runSearch` to require Hedef Firma, call `/track-mes`, and pass it**

Replace the body of `runSearch` (the existing `const runSearch = async (q: TrackQuery) => { ... }`) with:

```tsx
  const runSearch = async (q: TrackQuery, firma: string = hedefFirma) => {
    if (!firma) {
      setError("Lütfen önce bir Hedef Firma seçin.");
      return;
    }
    setError(null);
    setView("loading");
    setSelected(null);
    try {
      const params = new URLSearchParams();
      params.set("hedef_firma", firma);
      if (q.method === "order") {
        params.set("order_number", q.order_number);
        params.set("order_item_number", q.order_item_number);
      } else {
        params.set("part_number", q.part_number);
      }
      const res = await api.get<TrackResponse>(
        `/romiot/station/work-orders/track-mes?${params.toString()}`,
        undefined,
        { useCache: false }
      );
      const found = res.matches ?? [];
      setMatches(found);
      if (found.length === 0) {
        setView("notfound");
      } else if (found.length === 1) {
        setSelected(found[0]);
        setView("result");
      } else {
        setView("list");
      }
      if (found.length > 0) {
        const label = q.method === "order" ? `${q.order_number} / ${q.order_item_number}` : q.part_number;
        pushRecent({ label, sub: found[0].part_number, query: q, hedefFirma: firma });
      }
    } catch {
      setError("Sorgu sırasında bir hata oluştu. Lütfen tekrar deneyin.");
      setView("idle");
    }
  };
```

- [ ] **Step 4: Render the selector and fix the recent-query click**

Add the selector just above the `<ProductSearchCard ... />` block. Replace:

```tsx
        <div className="mb-5">
          <ProductSearchCard loading={view === "loading"} onSearch={runSearch} />
        </div>
```

with:

```tsx
        <div className="mb-5">
          <HedefFirmaSelect companies={companies} value={hedefFirma} onChange={setHedefFirma} disabled={view === "loading"} />
          <ProductSearchCard loading={view === "loading"} onSearch={(q) => runSearch(q)} />
        </div>
```

And update the recent-query button's `onClick` so it restores the saved Hedef Firma. Replace:

```tsx
                <button key={i} type="button" onClick={() => runSearch(r.query)}
```

with:

```tsx
                <button key={i} type="button" onClick={() => { setHedefFirma(r.hedefFirma); runSearch(r.query, r.hedefFirma); }}
```

- [ ] **Step 5: Typecheck and build**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no type errors in `urunum-nerede` files.

Run: `cd dtfrontend && npm run build`
Expected: build succeeds (the `[platform]/atolye/urunum-nerede` route compiles).

- [ ] **Step 6: Commit**

```bash
git add dtfrontend/src/components/atolye/urunum-nerede/HedefFirmaSelect.tsx dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx
git commit -m "feat(urunum-nerede): Hedef Firma selector + switch page to /track-mes"
```

---

## Task 8: Seed config rows (documentation + SQL)

**Files:**
- Create: `dtbackend/seed_urunum_nerede_mes_sources.sql`

> Not auto-applied — run manually against the romiot Postgres once the migration is applied. Values (table names, optional filter) confirmed with the data owner before running.

- [ ] **Step 1: Write the seed script**

Create `dtbackend/seed_urunum_nerede_mes_sources.sql`:

```sql
-- Seed urunum_nerede_mes_sources (run after Alembic migration d5e6f7a8b9c0).
-- `company` MUST match the Hedef Firma name in company_integrations.company.
-- filter_column/filter_value are optional (NULL = no base filter).
-- Adjust company names / table names / filters to the live environment.

INSERT INTO urunum_nerede_mes_sources (company, table_name, filter_column, filter_value)
VALUES
    ('Bosan',    'Mes_ProductionOrders_bosan',    NULL, NULL),
    ('Mekasan',  'Mes_ProductionOrders_mekasan',  NULL, NULL),
    ('Teknopar', 'Mes_ProductionOrders_teknopar', NULL, NULL)
ON CONFLICT (company) DO UPDATE
    SET table_name = EXCLUDED.table_name,
        filter_column = EXCLUDED.filter_column,
        filter_value = EXCLUDED.filter_value;
```

- [ ] **Step 2: Commit**

```bash
git add dtbackend/seed_urunum_nerede_mes_sources.sql
git commit -m "chore(urunum-nerede): seed SQL for MES source config rows"
```

---

## Final Verification

- [ ] **Backend unit suite**

Run: `cd dtbackend && python -m unittest test_mes_tracking_service -v`
Expected: PASS (all classes — BuildTrackQuery, AssembleMatches, TrackFromMes, TrackMesEndpoint).

- [ ] **Confirm existing tests unaffected**

Run: `cd dtbackend && python -m unittest test_toy_api_post_helper test_track_status_helper -v`
Expected: PASS (no regression from the shared `work_order.py` / schema imports).

- [ ] **Frontend typecheck + build**

Run: `cd dtfrontend && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Manual smoke (against a seeded Hedef Firma + reachable AFLOW)**
  - Hedef Firma required before searching (validation message when unset).
  - Sipariş+Kalem returns a single result with an ordered operation timeline.
  - Parça No returns the multi-match selector when >1 group matches.
  - Unknown input → "Kayıt bulunamadı".

---

## Notes for the implementer

- **Module import hygiene (Tasks 3–5):** the service file is built up across three tasks. Keep ONE import block at the top — when Task 4 and Task 5 say "extend the imports", merge into the single existing block rather than adding duplicate `import` lines. Final imports: `asyncio`, `logging`, `re`, `from datetime import date, datetime, timezone`, `from sqlalchemy import select`, plus the app imports.
- **No new router wiring:** `/track-mes` is added to the already-mounted `work_order.router` (`api.py:33`), so no `api.py` change.
- **pyodbc is sync:** never call `get_aflow_connection()` directly in the async path — only through `_fetch_rows` → `asyncio.to_thread`.
- **Identifiers vs values:** only `table_name`/`filter_column` are interpolated (after regex validation); every value is a `?` bind parameter.
