# Atolye Multi-Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six related atolye features in one bundled change: open Hedef Firma source, typeahead Hedef Firma input, multi-pair (Sipariş No / Kalem No) work orders, yönetici-editable `is_entry_station` flag, first-scan must-be-entry enforcement, and operator-defined ordered routing with warn-on-deviation audit.

**Architecture:** Backend additions land in `dtbackend/app/{models,schemas,services,api/v1/endpoints/romiot/station}` + 3 Alembic migrations under `alembic_romiot/versions/`. Frontend additions land as four new shared components in `dtfrontend/src/components/atolye/` and targeted edits in the five atolye page files. All six features ride one PR; tasks are decomposed by dependency wave so that independent tasks can be parallelized.

**Tech Stack:**

- Backend: Python 3.11, FastAPI, SQLAlchemy 2.x async, Alembic, httpx, Pydantic v2.
- Frontend: Next.js 15.5.6 (App Router, Turbopack), React 19.1.0, TypeScript 5, Tailwind CSS 4, `lucide-react` 0.536.0 (already in deps).
- New frontend deps: `react-window` (`^1.8.10`) for virtualized typeahead list, `@dnd-kit/core` (`^6.1.0`) + `@dnd-kit/sortable` (`^8.0.0`) for the route picker. Versions verified against npm registry on 2026-06-02 (React 19 compatible).
- DB: PostgreSQL (romiot DB), separate from primary postgres.

**Spec:** `docs/superpowers/specs/2026-06-02-atolye-multi-feature-design.md` (committed in this repo).

**Worktree:** All work is done in a dedicated git worktree per the parent project's subagent-driven-development overlay. Create with `git worktree add ../dveri-atolye-multifeat -b atolye/multi-feature-2026-06-02 main` before starting.

---

## File Structure

**New files (backend):**

```
dtbackend/alembic_romiot/versions/
  add_work_order_pairs.py              T01 (M1) — pairs table + backfill + relax scalars
  add_is_entry_station_to_stations.py  T02 (M2) — new station flag
  add_route_and_violation.py           T03 (M3) — routes table + work_orders.route_violation

dtbackend/app/schemas/
  order_pair.py                        T04 — shared OrderPair schema
  work_order_route.py                  T09 — RouteCreate/RouteUpdate/RouteResponse

dtbackend/app/api/v1/endpoints/romiot/station/
  work_order_route.py                  T14 — POST/PUT /work-order-routes/
```

**Modified files (backend):**

```
dtbackend/app/models/romiot_models.py                                T05
dtbackend/app/schemas/station.py                                     T06
dtbackend/app/schemas/qr_code.py                                     T07
dtbackend/app/schemas/work_order.py                                  T08
dtbackend/app/api/v1/endpoints/romiot/station/company_integration.py T10
dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py             T11
dtbackend/app/api/v1/endpoints/romiot/station/work_order.py          T12
dtbackend/app/api/v1/endpoints/romiot/station/station.py             T13
dtbackend/app/api/v1/endpoints/romiot/station/__init__.py            T14 (mount work_order_route router)
dtbackend/app/services/toy_api_service.py                            T15
```

**New files (frontend):**

```
dtfrontend/src/components/atolye/
  EntryStationBadge.tsx     T16
  CompanyTypeahead.tsx      T17
  RouteWarningModal.tsx     T18
  RoutePickerModal.tsx      T19
```

**Modified files (frontend):**

```
dtfrontend/src/app/[platform]/atolye/musteri/page.tsx          T20
dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx         T21
dtfrontend/src/app/[platform]/atolye/operator/page.tsx         T22
dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx      T23
dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx T24
dtfrontend/package.json (deps add)                              T16/T19 prereq
```

---

## Dependency graph (waves)

```
Wave 0  (independent — parallel):
  T01 M1 work_order_pairs
  T02 M2 is_entry_station
  T03 M3 routes + violation
  T04 OrderPair schema

Wave 1  (depends on Wave 0):
  T05 models — add columns / classes for M1/M2/M3
  T06 station schema — add is_entry_station
  T07 qr_code schema — replace scalars with pairs
  T08 work_order schema — pairs, route_violation, ack flag
  T09 work_order_route schema (new file)

Wave 2  (backend endpoints — depend on Wave 1):
  T10 GET /company-integrations/companies
  T11 qr_code.py — drop musteri_company plumbing; validate target; JSON pairs; retrieve normalize; history filter
  T12 work_order.py — pairs, F5 guard, F6 validation, ack handling
  T13 station.py — my-station + remove musteri_companies plumbing
  T14 work_order_route.py + mount in __init__.py
  T15 toy_api_service.py — pairs handling

Wave 3  (frontend shared components — parallel, type-only deps on backend schemas):
  T16 EntryStationBadge (no backend dep)
  T17 CompanyTypeahead (depends on T10)
  T18 RouteWarningModal (no backend dep)
  T19 RoutePickerModal (depends on T14 endpoint)

Wave 4  (frontend pages — depend on Waves 2 + 3):
  T20 musteri/page.tsx (F1+F2+F3)
  T21 yonetici/page.tsx (F4+banners)
  T22 operator/page.tsx (F5 badge + F6 flow)
  T23 is-emirleri/page.tsx (F3 + route edit + violation badges)
  T24 kullanici-yonetimi/page.tsx (F1 cleanup)

Wave 5  (verification):
  T25 Full backend test suite + alembic upgrade/downgrade round-trip
  T26 Frontend type-check + lint + smoke
```

Wave 0 tasks can be dispatched in parallel under separate worktrees per the project subagent-driven-development overlay. Wave 1 needs to wait for Wave 0 because models import from migration table names indirectly via column metadata, but the schemas themselves only need the migration files merged conceptually — in practice they're independent. Use file-isolation worktrees for any pair of tasks touching the same file (`models/romiot_models.py` in T05 touches three table classes — keep T05 single-task).

---

## Wave 0 — Migrations + shared OrderPair schema

### Task 01: Migration M1 — `work_order_pairs` table + backfill

**Files:**
- Create: `dtbackend/alembic_romiot/versions/add_work_order_pairs.py`

**Step 1: Determine the current head revision (down_revision)**

- [ ] **Step 1**

Run:
```bash
cd dtbackend && alembic -c alembic_romiot.ini heads
```

Expected output: a single revision id, e.g. `f7g8h9i0j1k2` (whatever the most recent head is). If the call shows multiple heads, fix branching first via `alembic -c alembic_romiot.ini merge`.

Record that id as `<CURRENT_HEAD>` for use in Step 2.

**Step 2: Write the migration**

- [ ] **Step 2**

Create `dtbackend/alembic_romiot/versions/add_work_order_pairs.py`:

```python
"""add work_order_pairs table + backfill + relax scalar pair columns

Revision ID: a1b2c3d4e5f6
Revises: <CURRENT_HEAD>
Create Date: 2026-06-02 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = '<CURRENT_HEAD>'  # replace with value from Step 1
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'work_order_pairs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('work_order_group_id', sa.String(length=50), nullable=False, index=True),
        sa.Column('idx', sa.Integer(), nullable=False),
        sa.Column('aselsan_order_number', sa.String(length=255), nullable=False),
        sa.Column('order_item_number', sa.String(length=255), nullable=False),
        sa.UniqueConstraint('work_order_group_id', 'idx', name='uq_work_order_pair'),
    )

    op.execute("""
        INSERT INTO work_order_pairs (work_order_group_id, idx, aselsan_order_number, order_item_number)
        SELECT wo.work_order_group_id,
               0,
               wo.aselsan_order_number,
               wo.order_item_number
        FROM work_orders wo
        INNER JOIN (
            SELECT work_order_group_id, MIN(id) AS first_id
            FROM work_orders
            GROUP BY work_order_group_id
        ) firsts ON firsts.first_id = wo.id
        WHERE wo.aselsan_order_number IS NOT NULL
          AND wo.order_item_number IS NOT NULL
    """)

    op.alter_column('work_orders', 'aselsan_order_number', nullable=True)
    op.alter_column('work_orders', 'order_item_number', nullable=True)


def downgrade() -> None:
    # Reapply NOT NULL only after re-copying pair[0] back from work_order_pairs,
    # else downgrade fails on the rows whose scalar columns were nulled by a
    # later writer.
    op.execute("""
        UPDATE work_orders wo
        SET aselsan_order_number = wop.aselsan_order_number,
            order_item_number    = wop.order_item_number
        FROM work_order_pairs wop
        WHERE wop.work_order_group_id = wo.work_order_group_id
          AND wop.idx = 0
          AND wo.aselsan_order_number IS NULL
    """)
    op.alter_column('work_orders', 'aselsan_order_number', nullable=False)
    op.alter_column('work_orders', 'order_item_number', nullable=False)
    op.drop_table('work_order_pairs')
```

**Step 3: Test upgrade against a local DB**

- [ ] **Step 3**

Run:
```bash
cd dtbackend && alembic -c alembic_romiot.ini upgrade head
```

Expected: prints `Running upgrade <CURRENT_HEAD> -> a1b2c3d4e5f6, add work_order_pairs ...` and exits 0. No exception.

Verify backfill:
```bash
psql "$ROMIOT_DATABASE_URL" -c "SELECT (SELECT COUNT(DISTINCT work_order_group_id) FROM work_orders) AS groups, (SELECT COUNT(*) FROM work_order_pairs) AS pairs;"
```

Expected: `groups == pairs`.

**Step 4: Test downgrade round-trip**

- [ ] **Step 4**

Run:
```bash
cd dtbackend && alembic -c alembic_romiot.ini downgrade -1
```

Expected: prints `Running downgrade ...`. No exception.

Re-upgrade for next tasks:
```bash
cd dtbackend && alembic -c alembic_romiot.ini upgrade head
```

**Step 5: Commit**

- [ ] **Step 5**

```bash
git add dtbackend/alembic_romiot/versions/add_work_order_pairs.py
git commit -m "feat(romiot): M1 work_order_pairs table + backfill"
```

---

### Task 02: Migration M2 — `stations.is_entry_station`

**Files:**
- Create: `dtbackend/alembic_romiot/versions/add_is_entry_station_to_stations.py`

- [ ] **Step 1: Get head revision after M1**

```bash
cd dtbackend && alembic -c alembic_romiot.ini heads
```

Record as `<HEAD_AFTER_M1>` (should be `a1b2c3d4e5f6` if M1 was applied; otherwise this task runs in parallel and uses the same `<CURRENT_HEAD>` from T01 Step 1, with branch resolution at merge).

- [ ] **Step 2: Write the migration**

Create `dtbackend/alembic_romiot/versions/add_is_entry_station_to_stations.py`:

```python
"""add is_entry_station to stations

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-02 10:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6g7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'stations',
        sa.Column('is_entry_station', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('stations', 'is_entry_station')
```

- [ ] **Step 3: Upgrade + verify**

```bash
cd dtbackend && alembic -c alembic_romiot.ini upgrade head
psql "$ROMIOT_DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='stations' AND column_name='is_entry_station';"
```

Expected: one row `is_entry_station`.

- [ ] **Step 4: Downgrade round-trip + re-upgrade**

```bash
cd dtbackend && alembic -c alembic_romiot.ini downgrade -1 && alembic -c alembic_romiot.ini upgrade head
```

- [ ] **Step 5: Commit**

```bash
git add dtbackend/alembic_romiot/versions/add_is_entry_station_to_stations.py
git commit -m "feat(romiot): M2 stations.is_entry_station flag"
```

---

### Task 03: Migration M3 — `work_order_routes` + `work_orders.route_violation`

**Files:**
- Create: `dtbackend/alembic_romiot/versions/add_route_and_violation.py`

- [ ] **Step 1: Get head revision after M2**

```bash
cd dtbackend && alembic -c alembic_romiot.ini heads
```

- [ ] **Step 2: Write the migration**

Create `dtbackend/alembic_romiot/versions/add_route_and_violation.py`:

```python
"""add work_order_routes table + work_orders.route_violation

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-06-02 10:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'c3d4e5f6g7h8'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'work_orders',
        sa.Column('route_violation', sa.Boolean(), nullable=False, server_default='false'),
    )

    op.create_table(
        'work_order_routes',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('work_order_group_id', sa.String(length=50), nullable=False, index=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('station_id', sa.Integer(), sa.ForeignKey('stations.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('work_order_group_id', 'position', name='uq_route_position'),
    )


def downgrade() -> None:
    op.drop_table('work_order_routes')
    op.drop_column('work_orders', 'route_violation')
```

- [ ] **Step 3: Upgrade + verify**

```bash
cd dtbackend && alembic -c alembic_romiot.ini upgrade head
psql "$ROMIOT_DATABASE_URL" -c "\d work_order_routes"
psql "$ROMIOT_DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='work_orders' AND column_name='route_violation';"
```

Expected: the routes table description, and one `route_violation` column row.

- [ ] **Step 4: Downgrade round-trip + re-upgrade**

```bash
cd dtbackend && alembic -c alembic_romiot.ini downgrade -1 && alembic -c alembic_romiot.ini upgrade head
```

- [ ] **Step 5: Commit**

```bash
git add dtbackend/alembic_romiot/versions/add_route_and_violation.py
git commit -m "feat(romiot): M3 work_order_routes + route_violation flag"
```

---

### Task 04: Shared `OrderPair` schema

**Files:**
- Create: `dtbackend/app/schemas/order_pair.py`

This is a pure-type DTO — no test required per the project's TDD overlay (pure types are exempt).

- [ ] **Step 1: Create the schema**

Create `dtbackend/app/schemas/order_pair.py`:

```python
from pydantic import BaseModel, Field


class OrderPair(BaseModel):
    """A (Sipariş No, Kalem No) pair on a work order group.

    Used in the QR JSON payload, QRCodeBatchCreate, WorkOrderBase, and the
    work_order_pairs table serialization. One work order group has 1..N pairs;
    every package of the group shares the same pair list.
    """
    aselsan_order_number: str = Field(..., description="ASELSAN Sipariş Numarası", min_length=1, max_length=255)
    order_item_number: str = Field(..., description="Sipariş Kalem Numarası", min_length=1, max_length=255)

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd dtbackend && python -c "from app.schemas.order_pair import OrderPair; print(OrderPair.model_fields)"
```

Expected: prints a dict containing `aselsan_order_number` and `order_item_number`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/schemas/order_pair.py
git commit -m "feat(schemas): shared OrderPair pydantic model"
```

---

## Wave 1 — Models + remaining schemas

### Task 05: Models — `romiot_models.py` updates

**Files:**
- Modify: `dtbackend/app/models/romiot_models.py` (lines 1–138 inspected; see spec for current shape)

Current `Station` columns (lines 8–17): `id, name, company, is_exit_station, station_order_code` + `work_orders` rel. Current `WorkOrder` (lines 20–73): all the scan fields. No `WorkOrderRoute` or `WorkOrderPair` class today.

- [ ] **Step 1: Add `is_entry_station` to `Station`**

Edit `dtbackend/app/models/romiot_models.py` line 14, inserting BEFORE `is_exit_station`:

```python
    is_entry_station = Column(Boolean, nullable=False, server_default="false")
    is_exit_station = Column(Boolean, nullable=False, server_default="false")
```

- [ ] **Step 2: Add `route_violation` to `WorkOrder`**

In the `WorkOrder` class (around current line 66 — right after `delivered`), insert:

```python
    # Whether operator overrode a route warning when this row was committed
    route_violation = Column(Boolean, nullable=False, server_default="false")
```

- [ ] **Step 3: Add `WorkOrderPair` class**

Append at the end of the file (after `WorkOrderLinkDirectory`):

```python
class WorkOrderPair(PostgreSQLBase):
    """One (Sipariş No, Kalem No) pair belonging to a work order group.

    Every package of a group shares the same pair list. F3 introduces
    multi-pair work orders; legacy single-pair WorkOrder rows have one
    matching WorkOrderPair row with idx=0 created by the M1 backfill.
    """
    __tablename__ = "work_order_pairs"
    __table_args__ = (
        UniqueConstraint("work_order_group_id", "idx", name="uq_work_order_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    work_order_group_id = Column(String(50), nullable=False, index=True)
    idx = Column(Integer, nullable=False)
    aselsan_order_number = Column(String(255), nullable=False)
    order_item_number = Column(String(255), nullable=False)
```

- [ ] **Step 4: Add `WorkOrderRoute` class**

Append after `WorkOrderPair`:

```python
class WorkOrderRoute(PostgreSQLBase):
    """An ordered station for a work order group's planned route.

    Position 0 is the entry station (operator's station at first scan).
    Subsequent positions are 1, 2, 3, ... in the order the operator
    expects the QR to be scanned. F6 references this table on every
    subsequent scan to detect off-route and out-of-order events.
    """
    __tablename__ = "work_order_routes"
    __table_args__ = (
        UniqueConstraint("work_order_group_id", "position", name="uq_route_position"),
    )

    id = Column(Integer, primary_key=True, index=True)
    work_order_group_id = Column(String(50), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    station_id = Column(Integer, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False)
    created_by_user_id = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 5: Make `WorkOrder.aselsan_order_number` and `WorkOrder.order_item_number` nullable**

Edit lines 41–42 of `romiot_models.py`:

```python
    aselsan_order_number = Column(String(255), nullable=True)   # legacy fallback only; F3 reads from work_order_pairs
    order_item_number = Column(String(255), nullable=True)      # legacy fallback only; F3 reads from work_order_pairs
```

- [ ] **Step 6: Quick smoke import**

```bash
cd dtbackend && python -c "from app.models.romiot_models import Station, WorkOrder, WorkOrderRoute, WorkOrderPair; print(Station.is_entry_station, WorkOrder.route_violation, WorkOrderRoute.__tablename__, WorkOrderPair.__tablename__)"
```

Expected: prints column objects + table names, no exception.

- [ ] **Step 7: Commit**

```bash
git add dtbackend/app/models/romiot_models.py
git commit -m "feat(models): add is_entry_station, route_violation, WorkOrderPair, WorkOrderRoute"
```

---

### Task 06: `station` schema — `is_entry_station` field

**Files:**
- Modify: `dtbackend/app/schemas/station.py` (lines 4–32 inspected — `StationBase`, `StationCreate`, `Station`, `StationList`)

- [ ] **Step 1: Add field to `StationBase` and `StationList`**

Edit `dtbackend/app/schemas/station.py`:

```python
from pydantic import BaseModel, Field


class StationBase(BaseModel):
    name: str = Field(..., description="Station name", min_length=1, max_length=255)
    company: str = Field(..., description="Company name", min_length=1, max_length=255)
    is_entry_station: bool = Field(False, description="Whether this is an entry station (Giriş Atölyesi)")
    is_exit_station: bool = Field(False, description="Whether this is an exit station (Çıkış Atölyesi)")
    station_order_code: int | None = Field(None, description="Station order code for external integrations (Mes_MachineGroup)")


class StationCreate(StationBase):
    """Schema for creating a station"""
    pass


class Station(StationBase):
    id: int

    class Config:
        from_attributes = True


class StationList(BaseModel):
    """Schema for listing stations"""
    id: int
    name: str
    company: str
    is_entry_station: bool = False
    is_exit_station: bool = False
    station_order_code: int | None = None

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Smoke import**

```bash
cd dtbackend && python -c "from app.schemas.station import StationCreate; print(StationCreate.model_fields.keys())"
```

Expected: `dict_keys(['name', 'company', 'is_entry_station', 'is_exit_station', 'station_order_code'])`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/schemas/station.py
git commit -m "feat(schemas): add is_entry_station to Station schemas"
```

---

### Task 07: `qr_code` schema — replace scalars with `pairs`

**Files:**
- Modify: `dtbackend/app/schemas/qr_code.py` (current shape inspected at lines 1–61)

Current `QRCodeBatchCreate` carries `aselsan_order_number: str` and `order_item_number: str`. We replace them with `pairs: list[OrderPair]`.

- [ ] **Step 1: Edit schema**

Edit `dtbackend/app/schemas/qr_code.py`:

```python
from datetime import date, datetime
from typing import Any, Dict

from pydantic import BaseModel, Field

from app.schemas.order_pair import OrderPair


class QRCodeDataCreate(BaseModel):
    """Schema for creating a new QR code with compressed data - accepts any JSON structure"""
    data: Dict[str, Any]


class QRCodeDataResponse(BaseModel):
    code: str
    expires_at: datetime | None = None

    class Config:
        from_attributes = True


class QRCodeDataRetrieve(BaseModel):
    """Full QR code data retrieved by code - returns the original JSON structure"""
    data: Dict[str, Any]


class QRCodeBatchCreate(BaseModel):
    """Schema for batch QR code generation from the work order form.

    `target_company` is the customer the QR is created FOR (storage tenant).
    The QR's printed "Gönderen Firma" (sender) is filled in server-side from
    the caller's department; clients must NOT send a `company_from` field.
    """
    model_config = {"extra": "forbid"}

    main_customer: str = Field(..., description="Ana Müşteri")
    sector: str = Field(..., description="Sektör")
    target_company: str = Field(..., description="Hedef Firma — QR'ın oluşturulduğu hedef şirket")
    teklif_number: str = Field(..., description="Teklif Numarası")
    pairs: list[OrderPair] = Field(..., min_length=1, description="(Sipariş No, Kalem No) çiftleri")
    part_number: str = Field(..., description="Parça Numarası")
    revision_number: str | None = Field(None, description="Revizyon Numarası")
    quantity: int = Field(..., gt=0, description="Toplam Sipariş Miktarı")
    package_quantity: int = Field(1, gt=0, description="Parti Sayısı")
    target_date: date = Field(..., description="Hedef Bitirme Tarihi")


class QRCodePackageInfo(BaseModel):
    code: str
    package_index: int
    quantity: int


class QRCodeBatchResponse(BaseModel):
    work_order_group_id: str
    total_packages: int
    total_quantity: int
    packages: list[QRCodePackageInfo]
    expires_at: datetime | None = None
```

- [ ] **Step 2: Smoke import**

```bash
cd dtbackend && python -c "from app.schemas.qr_code import QRCodeBatchCreate; print(QRCodeBatchCreate.model_fields['pairs'])"
```

Expected: a `FieldInfo` whose annotation is `list[OrderPair]`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/schemas/qr_code.py
git commit -m "feat(schemas): replace QR scalar pair fields with OrderPair list"
```

---

### Task 08: `work_order` schema — pairs, route_violation, ack flag

**Files:**
- Modify: `dtbackend/app/schemas/work_order.py` (current shape: lines 1–164 inspected)

Current `WorkOrderBase` has scalar `aselsan_order_number` and `order_item_number`. We replace them with `pairs`. `WorkOrderCreate` inherits from base — add the new `acknowledged_route_violation: bool = False` field there only. `WorkOrderUpdateExitDate` adds the same ack flag. `WorkOrder`, `WorkOrderList`, `WorkOrderDetail` get `pairs` and `route_violation`. `WorkOrderDetail` also gets `pair_count`.

- [ ] **Step 1: Edit schema**

Replace `dtbackend/app/schemas/work_order.py` with:

```python
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.order_pair import OrderPair


class WorkOrderStatus(str, Enum):
    ENTRANCE = "Entrance"
    EXIT = "Exit"


class WorkOrderBase(BaseModel):
    station_id: int = Field(..., description="Station ID")
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    main_customer: str = Field(..., description="Ana Müşteri")
    sector: str = Field(..., description="Sektör")
    company_from: str = Field(..., description="Gönderen Firma")
    teklif_number: str = Field(..., description="Teklif Numarası")
    pairs: list[OrderPair] = Field(..., min_length=1, description="(Sipariş No, Kalem No) çiftleri")
    part_number: str = Field(..., description="Parça Numarası")
    revision_number: str | None = Field(None, description="Revizyon Numarası")
    quantity: int = Field(..., description="Bu paketin parça sayısı")
    total_quantity: int = Field(..., description="Toplam sipariş miktarı")
    package_index: int = Field(..., description="Parti sırası (1-based)")
    total_packages: int = Field(..., description="Toplam parti sayısı")
    target_date: date | None = Field(None, description="Hedef Bitirme Tarihi")
    qr_code: str | None = Field(None, description="QR kodu (tarama sırasında kullanılan kısa kod)")
    qr_created_at: datetime | None = Field(None, description="QR kodunun oluşturulma tarihi")


class WorkOrderCreate(WorkOrderBase):
    """Schema for creating a work order (one package at one station)"""
    acknowledged_route_violation: bool = Field(
        False,
        description="If True, the operator has acknowledged a route warning and the row is committed with route_violation=True",
    )


class WorkOrderUpdateExitDate(BaseModel):
    station_id: int = Field(..., description="Station ID")
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    package_index: int = Field(..., description="Paket sırası (1-based)")
    acknowledged_route_violation: bool = Field(
        False,
        description="If True, the operator has acknowledged a route warning",
    )


class WorkOrder(WorkOrderBase):
    id: int
    priority: int = 0
    prioritized_by: int | None = None
    delivered: bool = False
    route_violation: bool = False
    entrance_date: datetime | None = None
    exit_date: datetime | None = None

    class Config:
        from_attributes = True


class WorkOrderCreateResponse(BaseModel):
    work_order: WorkOrder
    packages_scanned: int = Field(..., description="Bu gruptaki okunan paket sayısı")
    total_packages: int = Field(..., description="Toplam paket sayısı")
    all_scanned: bool = Field(..., description="Tüm paketler okundu mu")
    is_first_scan_for_group: bool = Field(..., description="Bu, grubun ilk taraması mıydı (F6 rota seçici tetikleyicisi)")
    message: str = Field(..., description="Durum mesajı")


class WorkOrderExitResponse(BaseModel):
    work_order: WorkOrder
    packages_exited: int = Field(..., description="Bu gruptaki çıkışı yapılan paket sayısı")
    total_packages: int = Field(..., description="Toplam paket sayısı")
    all_exited: bool = Field(..., description="Tüm paketlerin çıkışı yapıldı mı")
    message: str = Field(..., description="Durum mesajı")


class WorkOrderList(BaseModel):
    """Schema for listing work orders"""
    id: int
    station_id: int
    user_id: int
    work_order_group_id: str
    main_customer: str
    sector: str
    company_from: str
    teklif_number: str
    pairs: list[OrderPair]
    part_number: str
    revision_number: str | None = None
    quantity: int
    total_quantity: int
    package_index: int
    total_packages: int
    priority: int = 0
    prioritized_by: int | None = None
    delivered: bool = False
    route_violation: bool = False
    target_date: date | None = None
    entrance_date: datetime | None = None
    exit_date: datetime | None = None
    qr_code: str | None = None
    qr_created_at: datetime | None = None

    class Config:
        from_attributes = True


class WorkOrderDetail(BaseModel):
    """Schema for detailed work order information with user and station details"""
    id: int
    station_id: int
    station_name: str
    is_entry_station: bool = False
    is_exit_station: bool = False
    user_id: int
    user_name: str | None = None
    work_order_group_id: str
    main_customer: str
    sector: str
    company_from: str
    teklif_number: str
    pairs: list[OrderPair]
    pair_count: int = Field(..., description="Toplam çift sayısı (collapsed row badge'i için denormalize)")
    part_number: str
    revision_number: str | None = None
    quantity: int
    total_quantity: int
    package_index: int
    total_packages: int
    priority: int = 0
    prioritized_by: int | None = None
    delivered: bool = False
    route_violation: bool = False
    target_date: date | None = None
    entrance_date: datetime | None = None
    exit_date: datetime | None = None
    qr_code: str | None = None
    qr_created_at: datetime | None = None

    class Config:
        from_attributes = True


class PaginatedWorkOrderResponse(BaseModel):
    items: list[WorkOrderDetail]
    total: int
    page: int
    page_size: int
    total_pages: int


class PriorityAssignment(BaseModel):
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    priority: int = Field(..., ge=0, le=5, description="Öncelik (0-5 jeton, 0=kaldır)")


class PriorityAssignRequest(BaseModel):
    assignments: list[PriorityAssignment] = Field(..., description="Öncelik atamaları")


class PriorityTokenInfo(BaseModel):
    total_tokens: int
    used_tokens: int
    remaining_tokens: int
```

- [ ] **Step 2: Smoke import**

```bash
cd dtbackend && python -c "from app.schemas.work_order import WorkOrderCreate, WorkOrderDetail; print('ok')"
```

Expected: `ok` printed.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/schemas/work_order.py
git commit -m "feat(schemas): work_order pairs + route_violation + ack flag"
```

---

### Task 09: New `work_order_route` schema

**Files:**
- Create: `dtbackend/app/schemas/work_order_route.py`

- [ ] **Step 1: Create the schema**

Create `dtbackend/app/schemas/work_order_route.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field


class WorkOrderRoutePosition(BaseModel):
    position: int
    station_id: int
    station_name: str

    class Config:
        from_attributes = True


class WorkOrderRouteCreate(BaseModel):
    """Body for POST /work-order-routes/

    `station_ids[0]` MUST equal:
      - the operator's current station when an `atolye:operator` is calling, OR
      - the earliest historical entrance station for the group when a yönetici
        is initialising a grandfathered group (F6.5 — "Rota Tanımla")
    `station_ids[-1]` MUST be `is_exit_station == True` UNLESS the group's
    company has zero exit stations (graceful fallback per F6.8).
    """
    model_config = {"extra": "forbid"}

    work_order_group_id: str = Field(..., min_length=1, max_length=50)
    station_ids: list[int] = Field(..., min_length=1, description="Ordered list of station ids")


class WorkOrderRouteUpdate(BaseModel):
    """Body for PUT /work-order-routes/{work_order_group_id}

    `station_ids[0]` MUST equal the existing route's position-0 station_id.
    """
    model_config = {"extra": "forbid"}

    station_ids: list[int] = Field(..., min_length=1, description="Ordered list of station ids")


class WorkOrderRouteResponse(BaseModel):
    work_order_group_id: str
    positions: list[WorkOrderRoutePosition]
    created_at: datetime | None = None

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Smoke import**

```bash
cd dtbackend && python -c "from app.schemas.work_order_route import WorkOrderRouteCreate; print('ok')"
```

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/schemas/work_order_route.py
git commit -m "feat(schemas): WorkOrderRoute request/response schemas"
```

---

## Wave 2 — Backend endpoints

### Task 10: `GET /company-integrations/companies`

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/company_integration.py` (currently 76 lines, just GET + PUT on a single integration record)
- Test: `dtbackend/test_company_integrations_helper.py` (companion test for the new endpoint — there is no test infrastructure for these routes today, so the verification is curl-based until a proper pytest layer is added; use the existing `test_musteri_companies_helper.py` as a pattern)

- [ ] **Step 1: Add the new endpoint to the existing module**

Insert at the bottom of `dtbackend/app/api/v1/endpoints/romiot/station/company_integration.py`:

```python
@router.get("/companies", response_model=list[str])
async def list_integration_companies(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    List every company that has a row in `company_integrations`.

    F1: this is the new source of the Hedef Firma dropdown for müşteri users
    and replaces the per-user `atolye:musteri_company:<X>` role allowlist.
    Returns the deduplicated company names alphabetically (Turkish locale).
    Open to any authenticated user with an `atolye:*` role.
    """
    role_values = current_user.role if isinstance(current_user.role, list) else []
    has_atolye_role = any(
        isinstance(r, str) and r.startswith("atolye:") for r in role_values
    )
    if not has_atolye_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Atölye yetkisi gereklidir.",
        )

    result = await romiot_db.execute(
        select(CompanyIntegration.company).order_by(CompanyIntegration.company.collate("tr-TR-x-icu"))
    )
    return [row[0] for row in result.all()]
```

Add the imports at the top (HTTPException, status):

```python
from fastapi import APIRouter, Depends, HTTPException, status
```

- [ ] **Step 2: Smoke-test against a running backend**

Start backend dev server (in another shell):
```bash
cd dtbackend && uvicorn main:app --reload --port 8000
```

In another shell:
```bash
curl -H "Cookie: <auth-cookie>" http://localhost:8000/api/v1/romiot/station/company-integrations/companies
```

Expected: a JSON array of company strings. 403 if not logged in with an atolye role.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/company_integration.py
git commit -m "feat(company-integrations): GET /companies for F1 Hedef Firma source"
```

---

### Task 11: `qr_code.py` — drop musteri_companies, validate against integrations, JSON pairs, retrieve normalization, history filter

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` (lines 1–428 inspected)

Quoted current symbols (from the file):

```
_extract_musteri_companies_from_roles(role_values)         # lines 27–45
generate_short_code(length)                                 # 48
generate_work_order_group_id()                              # 58
generate_qr_code (POST /generate)                           # 68
generate_qr_code_batch (POST /generate-batch)               # 135
retrieve_qr_data (GET /retrieve/{code})                     # 280
get_qr_codes_by_work_order_group (GET /group/{group_id})    # 322
```

- [ ] **Step 1: Delete `_extract_musteri_companies_from_roles`**

Delete lines 27–45 of `qr_code.py` (the whole helper function).

- [ ] **Step 2: Rewrite `generate_qr_code_batch` validation + JSON payload**

Replace lines 135–277 (entire function) with this implementation. The structural changes vs current code:

- Validation against `company_integrations` row presence (F1).
- Yönetici-only branch still locks target to own company (F1.4).
- QR JSON payload uses `pairs` (F3).
- `pairs` are persisted into `work_order_pairs` once per group (idempotent on UNIQUE).

```python
@router.post("/generate-batch", response_model=QRCodeBatchResponse, status_code=status.HTTP_201_CREATED)
async def generate_qr_code_batch(
    batch_data: QRCodeBatchCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Generate multiple QR codes for a work order, splitting by package quantity.
    F1: target validated against company_integrations.
    F3: payload carries pairs[], persisted into work_order_pairs.
    """
    sender_company = (current_user.department or "").strip()
    role_values = current_user.role if isinstance(current_user.role, list) else []
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    has_create_role = is_musteri or is_yonetici

    if not has_create_role or not sender_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri veya yönetici rolü gereklidir.",
        )

    submitted_target = batch_data.target_company.strip()
    if not submitted_target:
        raise HTTPException(status_code=400, detail="Hedef firma boş olamaz.")

    # F1.4: yönetici-only locks target to own company
    if is_yonetici and not is_musteri:
        if submitted_target != sender_company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu hedef firma için QR kod oluşturma yetkiniz yok.",
            )

    # F1: target must exist in company_integrations
    integration_check = await romiot_db.execute(
        select(CompanyIntegration.id).where(CompanyIntegration.company == submitted_target).limit(1)
    )
    if integration_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail="Hedef firma bulunamadı")

    # Package math (unchanged)
    total_quantity = batch_data.quantity
    total_packages = batch_data.package_quantity
    if total_packages > total_quantity:
        raise HTTPException(
            status_code=400,
            detail="Paket sayısı toplam parça sayısından büyük olamaz",
        )

    base_qty = total_quantity // total_packages
    remainder = total_quantity % total_packages

    work_order_group_id = generate_work_order_group_id()
    expires_at = datetime.now(timezone.utc) + timedelta(days=365)

    # Persist pairs once for this group
    pair_dicts = [
        {"aselsan_order_number": p.aselsan_order_number, "order_item_number": p.order_item_number}
        for p in batch_data.pairs
    ]
    for idx, p in enumerate(pair_dicts):
        romiot_db.add(
            WorkOrderPair(
                work_order_group_id=work_order_group_id,
                idx=idx,
                aselsan_order_number=p["aselsan_order_number"],
                order_item_number=p["order_item_number"],
            )
        )

    packages: list[QRCodePackageInfo] = []
    for i in range(1, total_packages + 1):
        pkg_qty = base_qty + (1 if i <= remainder else 0)

        qr_data = {
            "work_order_group_id": work_order_group_id,
            "main_customer": batch_data.main_customer,
            "sector": batch_data.sector,
            "company_from": sender_company,
            "teklif_number": batch_data.teklif_number,
            "pairs": pair_dicts,
            "part_number": batch_data.part_number,
            "revision_number": batch_data.revision_number,
            "quantity": pkg_qty,
            "total_quantity": total_quantity,
            "package_index": i,
            "total_packages": total_packages,
            "target_date": batch_data.target_date.isoformat(),
        }

        data_json = json.dumps(qr_data)

        # Unique short code (5 retries)
        code = None
        for _ in range(5):
            candidate = generate_short_code(12)
            existing = await romiot_db.execute(
                select(QRCodeData).where(QRCodeData.code == candidate)
            )
            if not existing.scalar_one_or_none():
                code = candidate
                break

        if not code:
            await romiot_db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"QR kod oluşturulamadı (paket {i}). Lütfen tekrar deneyin.",
            )

        romiot_db.add(QRCodeData(
            code=code,
            data=data_json,
            company=submitted_target,
            expires_at=expires_at,
        ))

        packages.append(QRCodePackageInfo(code=code, package_index=i, quantity=pkg_qty))

    await romiot_db.commit()

    return QRCodeBatchResponse(
        work_order_group_id=work_order_group_id,
        total_packages=total_packages,
        total_quantity=total_quantity,
        packages=packages,
        expires_at=expires_at,
    )
```

Add `WorkOrderPair` to the model imports at the top of the file:

```python
from app.models.romiot_models import CompanyIntegration, QRCodeData, WorkOrderPair
```

- [ ] **Step 3: Normalize legacy QR payloads in `retrieve_qr_data`**

Replace `retrieve_qr_data` (lines 280–319) so legacy QRs (with scalar `aselsan_order_number` + `order_item_number`) are returned with a synthesized `pairs` field:

```python
@router.get("/retrieve/{code}", response_model=QRCodeDataRetrieve)
async def retrieve_qr_data(
    code: str,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Retrieve full QR data using the short code. F3: legacy QR payloads that
    contain `aselsan_order_number`/`order_item_number` are normalized into the
    new `pairs:[{...}]` shape on the fly so old printed QRs keep working.
    """
    result = await romiot_db.execute(select(QRCodeData).where(QRCodeData.code == code))
    qr_record = result.scalar_one_or_none()
    if not qr_record:
        raise HTTPException(status_code=404, detail="QR kod bulunamadı")
    if qr_record.expires_at and qr_record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="QR kodun süresi dolmuş")

    try:
        data_dict = json.loads(qr_record.data)
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=500, detail="QR kod verisi okunamadı")

    # Legacy normalization
    if "pairs" not in data_dict:
        legacy_order = data_dict.pop("aselsan_order_number", None)
        legacy_item = data_dict.pop("order_item_number", None)
        if legacy_order and legacy_item:
            data_dict["pairs"] = [{
                "aselsan_order_number": legacy_order,
                "order_item_number": legacy_item,
            }]
        else:
            data_dict["pairs"] = []

    return QRCodeDataRetrieve(data=data_dict)
```

- [ ] **Step 4: Simplify `get_qr_codes_by_work_order_group`**

Replace the function (lines 322–427). The müşteri allowlist branch is gone; the access rule simplifies to "müşteri sees groups whose JSON `company_from = department`", which mirrors the yönetici/operator/satinalma branch on department:

```python
@router.get("/group/{work_order_group_id}", response_model=list[dict])
async def get_qr_codes_by_work_order_group(
    work_order_group_id: str,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Retrieve all QR codes for a work order group.

    F1: müşteri sees groups they originated (JSON `company_from = department`).
    Other atolye roles see groups stored under their own company.
    """
    role_values = current_user.role if current_user.role and isinstance(current_user.role, list) else []
    has_atolye_role = any(
        r in {"atolye:operator", "atolye:yonetici", "atolye:musteri", "atolye:satinalma"}
        for r in role_values
    )
    if not has_atolye_role:
        raise HTTPException(status_code=403, detail="Atölye yetkisi gereklidir.")

    department_value = (current_user.department or "").strip()
    if not department_value:
        raise HTTPException(status_code=403, detail="Kullanıcı şirket bilgisi bulunamadı.")

    is_musteri = "atolye:musteri" in role_values

    if is_musteri:
        query = text(
            """
            SELECT code, data
            FROM qr_code_data
            WHERE data::jsonb ->> 'work_order_group_id' = :group_id
              AND data::jsonb ->> 'company_from' = :dept
            ORDER BY (data::jsonb ->> 'package_index')::int
            """
        )
        result = await romiot_db.execute(query, {"group_id": work_order_group_id, "dept": department_value})
    else:
        query = text(
            """
            SELECT code, data
            FROM qr_code_data
            WHERE company = :company
              AND data::jsonb ->> 'work_order_group_id' = :group_id
            ORDER BY (data::jsonb ->> 'package_index')::int
            """
        )
        result = await romiot_db.execute(query, {"company": department_value, "group_id": work_order_group_id})

    rows = result.fetchall()
    if not rows:
        return []

    response_items: list[dict] = []
    for row in rows:
        try:
            payload = json.loads(row.data)
        except (json.JSONDecodeError, ValueError):
            continue

        # Normalize legacy single-pair payloads
        pairs = payload.get("pairs")
        if pairs is None:
            legacy_order = payload.get("aselsan_order_number")
            legacy_item = payload.get("order_item_number")
            if legacy_order and legacy_item:
                pairs = [{"aselsan_order_number": legacy_order, "order_item_number": legacy_item}]
            else:
                pairs = []

        response_items.append({
            "code": row.code,
            "work_order_group_id": payload.get("work_order_group_id"),
            "main_customer": payload.get("main_customer"),
            "sector": payload.get("sector"),
            "company_from": payload.get("company_from"),
            "teklif_number": payload.get("teklif_number"),
            "pairs": pairs,
            "part_number": payload.get("part_number"),
            "quantity": payload.get("quantity"),
            "total_quantity": payload.get("total_quantity"),
            "package_index": payload.get("package_index"),
            "total_packages": payload.get("total_packages"),
            "target_date": payload.get("target_date"),
        })

    return response_items
```

- [ ] **Step 5: Smoke import**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.qr_code import router; print(len(router.routes))"
```

Expected: integer ≥ 3 (generate, generate-batch, retrieve, group). No `_extract_musteri_companies_from_roles` referenced.

```bash
cd dtbackend && grep -n "_extract_musteri_companies_from_roles" app/api/v1/endpoints/romiot/station/qr_code.py
```

Expected: no output (function fully removed from this file).

- [ ] **Step 6: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
git commit -m "feat(qr-code): F1 + F3 — target validated against integrations, pairs payload, legacy normalize"
```

---

### Task 12: `work_order.py` — pairs storage, F5 guard, F6 validation, ack flag

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` (915 lines; current endpoints: POST /, POST /update-exit-date, GET /list/{station_id}, GET /all, GET /companies)

Quoted current symbols:

```
create_work_order (POST /)              — lines 53–210
update_exit_date (POST /update-exit-date) — lines 213–~340
get_work_orders_by_station (GET /list/{station_id}) — lines 344+
get_all_work_orders (GET /all)          — lines 395+
get_companies (GET /companies)          — lines 888+
```

- [ ] **Step 1: Add imports for new models/schemas**

At the top of the file, ensure imports include:

```python
from app.models.romiot_models import (
    CompanyIntegration,
    QRCodeData,
    Station,
    WorkOrder,
    WorkOrderPair,
    WorkOrderRoute,
)
from app.schemas.order_pair import OrderPair
```

- [ ] **Step 2: Add helper `_pairs_for_group`**

Insert above `create_work_order`:

```python
async def _pairs_for_group(romiot_db: AsyncSession, work_order_group_id: str) -> list[OrderPair]:
    """Fetch pairs for a group ordered by idx. Falls back to the legacy scalar
    columns of the oldest WorkOrder row when work_order_pairs is empty (defensive
    only; the M1 backfill should populate everything)."""
    result = await romiot_db.execute(
        select(WorkOrderPair)
        .where(WorkOrderPair.work_order_group_id == work_order_group_id)
        .order_by(WorkOrderPair.idx)
    )
    rows = result.scalars().all()
    if rows:
        return [OrderPair(
            aselsan_order_number=r.aselsan_order_number,
            order_item_number=r.order_item_number,
        ) for r in rows]

    # Fallback: oldest WorkOrder row for the group
    legacy_result = await romiot_db.execute(
        select(WorkOrder.aselsan_order_number, WorkOrder.order_item_number)
        .where(WorkOrder.work_order_group_id == work_order_group_id)
        .order_by(WorkOrder.id)
        .limit(1)
    )
    legacy = legacy_result.first()
    if legacy and legacy[0] and legacy[1]:
        return [OrderPair(aselsan_order_number=legacy[0], order_item_number=legacy[1])]
    return []
```

- [ ] **Step 3: Add helper `_route_expected_position`**

```python
async def _route_expected_position(
    romiot_db: AsyncSession,
    work_order_group_id: str,
    package_index: int,
) -> int:
    """Return the position the NEXT scan should be at for this package.

    Highest route position whose station this package has exited + 1; 0 if
    the package has never exited any route station.
    """
    result = await romiot_db.execute(
        select(WorkOrderRoute.position)
        .join(WorkOrder, and_(
            WorkOrder.station_id == WorkOrderRoute.station_id,
            WorkOrder.work_order_group_id == WorkOrderRoute.work_order_group_id,
            WorkOrder.package_index == package_index,
        ))
        .where(
            WorkOrderRoute.work_order_group_id == work_order_group_id,
            WorkOrder.exit_date.is_not(None),
        )
        .order_by(WorkOrderRoute.position.desc())
        .limit(1)
    )
    highest_exited = result.scalar_one_or_none()
    return 0 if highest_exited is None else highest_exited + 1
```

- [ ] **Step 4: Rewrite `create_work_order`**

Replace lines 53–210 with the new handler. Key changes:

- After the duplicate-package guard, inject **F5 first-scan check** then **F6 route validation**.
- Persist `work_order_pairs` rows on first scan of a group (idempotent on UNIQUE constraint).
- Use `pairs[0]` for the WorkOrder row's legacy scalar columns (kept for backward read paths during the cleanup window).
- Add `is_first_scan_for_group` to the response so the frontend can open the route picker.
- Pass `pairs` to `send_production_order` from Task 15.

```python
@router.post("/", response_model=WorkOrderCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_work_order(
    work_order_data: WorkOrderCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db),
):
    """Create a new work order entry for a specific package at a station.

    F3: pairs are persisted on the first scan of the group via work_order_pairs.
    F5: first scan of a group must be at an is_entry_station (or company has none).
    F6: subsequent scans validated against work_order_routes per-package.
    """
    await check_station_operator_role(work_order_data.station_id, current_user, romiot_db)

    pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
    if not pg_user:
        pg_user = await UserService.create_user(postgres_db, current_user.username)
    pg_user_id = pg_user.id

    # Duplicate-package check (existing)
    existing_result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.station_id == work_order_data.station_id,
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrder.package_index == work_order_data.package_index,
            )
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Bu paket (Paket {work_order_data.package_index}/{work_order_data.total_packages}) ile işlem yapılmıştır",
        )

    # Determine if this is the first scan for the group
    first_scan_check = await romiot_db.execute(
        select(WorkOrder.id).where(WorkOrder.work_order_group_id == work_order_data.work_order_group_id).limit(1)
    )
    is_first_scan_for_group = first_scan_check.scalar_one_or_none() is None

    # Look up this station for F5/F6 checks
    this_station_result = await romiot_db.execute(
        select(Station).where(Station.id == work_order_data.station_id)
    )
    this_station = this_station_result.scalar_one_or_none()

    # F5: first-scan-at-entry-station rule
    if is_first_scan_for_group and this_station is not None:
        company_has_entry_result = await romiot_db.execute(
            select(Station.id).where(
                Station.company == this_station.company,
                Station.is_entry_station == True,
            ).limit(1)
        )
        company_has_entry = company_has_entry_result.scalar_one_or_none() is not None
        if company_has_entry and not this_station.is_entry_station:
            raise HTTPException(
                status_code=400,
                detail="İlk tarama bir Giriş Atölyesinde yapılmalıdır.",
            )
        if not company_has_entry:
            import logging
            logging.getLogger(__name__).warning(
                "First scan at non-entry station accepted because company %s has no entry stations configured",
                this_station.company,
            )

    # F6: route validation (only for groups WITH a route; grandfathered skipped)
    route_rows_result = await romiot_db.execute(
        select(WorkOrderRoute.position, WorkOrderRoute.station_id)
        .where(WorkOrderRoute.work_order_group_id == work_order_data.work_order_group_id)
        .order_by(WorkOrderRoute.position)
    )
    route_rows = route_rows_result.all()
    if route_rows and not work_order_data.acknowledged_route_violation:
        expected_pos = await _route_expected_position(
            romiot_db, work_order_data.work_order_group_id, work_order_data.package_index,
        )
        this_pos = next((r.position for r in route_rows if r.station_id == work_order_data.station_id), None)

        if this_pos is None:
            raise HTTPException(status_code=400, detail={
                "type": "route_off",
                "message": "Bu atölye iş emrinin rotasında yok. Yine de devam etmek istiyor musunuz?",
            })
        if this_pos != expected_pos:
            expected_station_name_result = await romiot_db.execute(
                select(Station.name)
                .join(WorkOrderRoute, WorkOrderRoute.station_id == Station.id)
                .where(
                    WorkOrderRoute.work_order_group_id == work_order_data.work_order_group_id,
                    WorkOrderRoute.position == expected_pos,
                )
            )
            expected_name = expected_station_name_result.scalar_one_or_none() or "—"
            raise HTTPException(status_code=400, detail={
                "type": "route_out_of_order",
                "message": f"Sıradaki atölye: {expected_name} (pozisyon {expected_pos + 1}). Yine de devam etmek istiyor musunuz?",
                "expected_position": expected_pos,
                "actual_position": this_pos,
            })

    # Active-at-other-station check (existing)
    active_at_other_result = await romiot_db.execute(
        select(WorkOrder.station_id, Station.name)
        .join(Station, WorkOrder.station_id == Station.id)
        .where(
            and_(
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrder.station_id != work_order_data.station_id,
                WorkOrder.exit_date.is_(None),
            )
        ).limit(1)
    )
    active_at_other = active_at_other_result.first()
    if active_at_other:
        raise HTTPException(
            status_code=400,
            detail=f"Bu iş emri grubu şu anda \"{active_at_other[1]}\" atölyesinde aktif. Önce mevcut atölyeden çıkış yapılmalıdır.",
        )

    # Inherit priority (existing)
    existing_priority = 0
    existing_prioritized_by = None
    existing_group_result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrder.priority > 0,
                WorkOrder.prioritized_by.isnot(None),
            )
        ).limit(1)
    )
    existing_group_record = existing_group_result.scalar_one_or_none()
    if existing_group_record:
        existing_priority = existing_group_record.priority
        existing_prioritized_by = existing_group_record.prioritized_by

    # Look up QR creation time (existing)
    qr_created_at = None
    if work_order_data.qr_code:
        qr_record_result = await romiot_db.execute(
            select(QRCodeData).where(QRCodeData.code == work_order_data.qr_code)
        )
        qr_record = qr_record_result.scalar_one_or_none()
        if qr_record:
            qr_created_at = qr_record.created_at

    # Persist pairs once per group (idempotent; UNIQUE catches dup inserts)
    for idx, pair in enumerate(work_order_data.pairs):
        existing_pair_check = await romiot_db.execute(
            select(WorkOrderPair.id).where(
                WorkOrderPair.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrderPair.idx == idx,
            ).limit(1)
        )
        if existing_pair_check.scalar_one_or_none() is None:
            romiot_db.add(WorkOrderPair(
                work_order_group_id=work_order_data.work_order_group_id,
                idx=idx,
                aselsan_order_number=pair.aselsan_order_number,
                order_item_number=pair.order_item_number,
            ))

    # Create WorkOrder row. Legacy scalar columns mirror pairs[0] for back-compat.
    first_pair = work_order_data.pairs[0]
    new_work_order = WorkOrder(
        station_id=work_order_data.station_id,
        user_id=pg_user_id,
        work_order_group_id=work_order_data.work_order_group_id,
        main_customer=work_order_data.main_customer,
        sector=work_order_data.sector,
        company_from=work_order_data.company_from,
        teklif_number=work_order_data.teklif_number,
        aselsan_order_number=first_pair.aselsan_order_number,
        order_item_number=first_pair.order_item_number,
        part_number=work_order_data.part_number,
        revision_number=work_order_data.revision_number,
        quantity=work_order_data.quantity,
        total_quantity=work_order_data.total_quantity,
        package_index=work_order_data.package_index,
        total_packages=work_order_data.total_packages,
        target_date=work_order_data.target_date,
        qr_code=work_order_data.qr_code,
        qr_created_at=qr_created_at,
        exit_date=None,
        priority=existing_priority,
        prioritized_by=existing_prioritized_by,
        route_violation=work_order_data.acknowledged_route_violation,
    )
    romiot_db.add(new_work_order)
    await romiot_db.commit()
    await romiot_db.refresh(new_work_order)

    # Count scanned (existing)
    scanned_count_result = await romiot_db.execute(
        select(func.count()).where(
            and_(
                WorkOrder.station_id == work_order_data.station_id,
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
            )
        )
    )
    packages_scanned = scanned_count_result.scalar() or 0
    total_packages = work_order_data.total_packages
    all_scanned = packages_scanned >= total_packages

    if all_scanned:
        message = f"Tüm paketler okundu! İş emri girişi tamamlandı. ({packages_scanned}/{total_packages})"
    else:
        message = f"Paket {work_order_data.package_index} okundu. ({packages_scanned}/{total_packages})"

    # F3+Mekasan: push with pairs
    if this_station:
        integration_result = await romiot_db.execute(
            select(CompanyIntegration).where(CompanyIntegration.company == this_station.company)
        )
        integration = integration_result.scalar_one_or_none()
        if integration and integration.api_url and integration.api_key:
            pairs = await _pairs_for_group(romiot_db, work_order_data.work_order_group_id)
            asyncio.create_task(send_production_order(
                new_work_order, this_station, integration.api_url, integration.api_key, this_station.company, pairs,
            ))

    work_order_schema = WorkOrderSchema.model_validate(new_work_order)
    # Stuff pairs into the response model (read from DB to use canonical list)
    pairs_for_response = await _pairs_for_group(romiot_db, work_order_data.work_order_group_id)
    work_order_schema = work_order_schema.model_copy(update={"pairs": pairs_for_response})

    return WorkOrderCreateResponse(
        work_order=work_order_schema,
        packages_scanned=packages_scanned,
        total_packages=total_packages,
        all_scanned=all_scanned,
        is_first_scan_for_group=is_first_scan_for_group,
        message=message,
    )
```

- [ ] **Step 5: Update `update_exit_date`** (current lines 213–~340)

Insert the F6 route validation block before the `work_order.exit_date = ...` line, plus the ack flag handling:

```python
@router.post("/update-exit-date", response_model=WorkOrderExitResponse)
async def update_exit_date(
    update_data: WorkOrderUpdateExitDate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Fill exit_date for a package. F6: validates the exit station is the
    current expected position for the package (per-package check)."""
    await check_station_operator_role(update_data.station_id, current_user, romiot_db)

    work_order_result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.station_id == update_data.station_id,
                WorkOrder.work_order_group_id == update_data.work_order_group_id,
                WorkOrder.package_index == update_data.package_index,
            )
        )
    )
    work_order = work_order_result.scalar_one_or_none()
    if not work_order:
        raise HTTPException(status_code=400, detail="Girişi yapılmayan iş emri çıkışı yapılamaz.")
    if work_order.exit_date is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Bu paket (Paket {update_data.package_index}/{work_order.total_packages}) ile çıkış işlemi yapılmıştır",
        )

    # F6 route validation on exit
    route_rows_result = await romiot_db.execute(
        select(WorkOrderRoute.position, WorkOrderRoute.station_id)
        .where(WorkOrderRoute.work_order_group_id == update_data.work_order_group_id)
        .order_by(WorkOrderRoute.position)
    )
    route_rows = route_rows_result.all()
    if route_rows and not update_data.acknowledged_route_violation:
        # Expected exit position = whatever position the package is currently at
        # (highest non-exited entry); fallback to per-package expected position - 1
        current_entry_result = await romiot_db.execute(
            select(WorkOrderRoute.position)
            .join(WorkOrder, and_(
                WorkOrder.station_id == WorkOrderRoute.station_id,
                WorkOrder.work_order_group_id == WorkOrderRoute.work_order_group_id,
                WorkOrder.package_index == update_data.package_index,
            ))
            .where(
                WorkOrderRoute.work_order_group_id == update_data.work_order_group_id,
                WorkOrder.exit_date.is_(None),
            )
            .order_by(WorkOrderRoute.position.desc())
            .limit(1)
        )
        expected_exit_pos = current_entry_result.scalar_one_or_none()
        this_pos = next((r.position for r in route_rows if r.station_id == update_data.station_id), None)
        if expected_exit_pos is not None and this_pos != expected_exit_pos:
            if this_pos is None:
                raise HTTPException(status_code=400, detail={
                    "type": "route_off",
                    "message": "Bu atölye iş emrinin rotasında yok. Yine de devam etmek istiyor musunuz?",
                })
            raise HTTPException(status_code=400, detail={
                "type": "route_out_of_order",
                "message": "Çıkış pozisyonu sıralı değil. Yine de devam etmek istiyor musunuz?",
                "expected_position": expected_exit_pos,
                "actual_position": this_pos,
            })

    work_order.exit_date = datetime.now(timezone.utc)
    if update_data.acknowledged_route_violation:
        work_order.route_violation = True
    await romiot_db.commit()
    await romiot_db.refresh(work_order)

    # Count exits (existing)
    exited_count_result = await romiot_db.execute(
        select(func.count()).where(
            and_(
                WorkOrder.station_id == update_data.station_id,
                WorkOrder.work_order_group_id == update_data.work_order_group_id,
                WorkOrder.exit_date.isnot(None),
            )
        )
    )
    packages_exited = exited_count_result.scalar() or 0
    total_packages = work_order.total_packages
    all_exited = packages_exited >= total_packages

    # Existing exit-station delivered marking continues below — keep unchanged.
    # (The rest of update_exit_date from current line ~270 onward stays as-is,
    # plus pairs in the response WorkOrderSchema like in create_work_order.)
    # ... existing tail (delivered marker, Mekasan push, response build) ...
```

The "existing tail" continues to set `delivered=True` when the station is exit + all packages exited, and posts to Mekasan via `send_production_order` (now with `pairs`). Use Read on lines ~270–340 of the current `work_order.py` to copy the rest verbatim into this rewrite, adapting `send_production_order` call to pass `pairs` and constructing the response with `pairs` populated via `_pairs_for_group`.

- [ ] **Step 6: Update `get_all_work_orders` filter** (current line 395+)

Find the `filter_customer` and any sipariş/kalem column filter blocks. Replace the `WorkOrder.aselsan_order_number ILIKE :q` clause with an EXISTS subquery against `work_order_pairs`. Also: every row in the response needs `pairs: list[OrderPair]` and `pair_count: int`. Use a single query that LEFT JOINs `work_order_pairs` and aggregates by `work_order_group_id`, then post-processes per row.

Concretely, when constructing `WorkOrderDetail` items, for each work_order row fetch pairs via `_pairs_for_group(romiot_db, row.work_order_group_id)` (cache by group_id within the request to avoid N+1). Set `pair_count = len(pairs)`.

For the search filter on aselsan_order_number / order_item_number (whichever columns the page sends):

```python
# Before: filter on WorkOrder.aselsan_order_number
# After: EXISTS on work_order_pairs (ANY pair match wins, F3.8)
if filter_aselsan_order_number:
    query = query.where(
        select(WorkOrderPair.id).where(
            WorkOrderPair.work_order_group_id == WorkOrder.work_order_group_id,
            WorkOrderPair.aselsan_order_number.ilike(f"%{filter_aselsan_order_number}%"),
        ).exists()
    )
```

(Identical for `order_item_number`.)

Also add a per-row `is_entry_station` field source — the station JOIN is already there for `station_name`/`is_exit_station`; extend with `is_entry_station`.

- [ ] **Step 7: Update `get_work_orders_by_station`** (line 344+)

Same per-row treatment: pairs + pair_count + is_entry_station.

- [ ] **Step 8: Smoke import + endpoint enumeration**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.work_order import router; print([r.path for r in router.routes])"
```

Expected: list contains `/`, `/update-exit-date`, `/list/{station_id}`, `/all`, `/companies` — same as before.

- [ ] **Step 9: Manual end-to-end smoke**

With migrations applied and dev server running, POST a sample WorkOrder body via curl:

```bash
curl -X POST -H "Content-Type: application/json" -H "Cookie: <auth>" \
  -d '{"station_id": <id>, "work_order_group_id":"TESTGROUP1","main_customer":"ASELSAN","sector":"AGS","company_from":"X","teklif_number":"MKS-1","pairs":[{"aselsan_order_number":"23Y0021A53","order_item_number":"10"}],"part_number":"PN1","quantity":1,"total_quantity":1,"package_index":1,"total_packages":1}' \
  http://localhost:8000/api/v1/romiot/station/work-orders/
```

Expected: 201 with `is_first_scan_for_group: true` in the response.

- [ ] **Step 10: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "feat(work-orders): F3 pairs storage, F5 first-scan guard, F6 route validation, is_first_scan_for_group"
```

---

### Task 13: `station.py` — `is_entry_station` in `my-station` + remove `musteri_companies` plumbing

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py` (1585 lines; see spec for the touch points lines 47, 80–84, 162–180, 1090–1148, 1152+, plus full-admin create routes)

- [ ] **Step 1: Remove `musteri_companies` field from `ManagedUserResponse`**

Edit line 47 of `station.py` — remove `musteri_companies: list[str] = []`.

- [ ] **Step 2: Remove `musteri_companies` field from `ManagedUserUpdateRequest`**

Edit lines 80–84 — remove the field. Also remove the corresponding validation in `validate_request` (the `if self.musteri_companies is not None: ... ` block at the bottom of the validator).

- [ ] **Step 3: Delete `_extract_musteri_companies_from_roles`**

Remove the helper at lines 162–180 entirely. Audit the rest of the file for callers and delete them.

- [ ] **Step 4: Update `list_company_users`, `update_company_user`, `full_admin_create_user`**

Strip every read/write of `musteri_companies` and every emission of `atolye:musteri_company:<X>` role values. Use Grep first:

```bash
cd dtbackend && grep -n "musteri_company\|musteri_companies" app/api/v1/endpoints/romiot/station/station.py
```

Walk the matches and delete or replace each. For `list_company_users`, the response no longer includes the field. For `update_company_user`, drop the role-list mutation that sets `atolye:musteri_company:<X>`. For `full_admin_create_user`, same.

After cleanup, the file must contain zero `musteri_company` substrings:

```bash
cd dtbackend && grep -c "musteri_company" app/api/v1/endpoints/romiot/station/station.py
```

Expected: `0`.

- [ ] **Step 5: Search the rest of `dtbackend/` for any remaining references**

```bash
cd dtbackend && grep -rn "musteri_company\|musteri_companies" app/ alembic_romiot/ alembic/
```

Expected: zero matches (the `qr_code.py` site was cleaned in Task 11). Resolve any remaining hits.

- [ ] **Step 6: Update `get_my_station`** (current lines 1090–1148)

Return `is_entry_station` in the dict:

```python
return {
    "station_id": station.id,
    "name": station.name,
    "company": station.company,
    "is_entry_station": station.is_entry_station,
    "is_exit_station": station.is_exit_station,
}
```

- [ ] **Step 7: Smoke import**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.station import router; print('ok', len(router.routes))"
```

Expected: `ok <number>`.

- [ ] **Step 8: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "feat(stations): is_entry_station in /my-station; remove musteri_companies plumbing end-to-end"
```

---

### Task 14: New `work_order_route.py` endpoints + router mount

**Files:**
- Create: `dtbackend/app/api/v1/endpoints/romiot/station/work_order_route.py`
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/__init__.py` (mount the new router) — first read the file to see how the existing routers are mounted

- [ ] **Step 1: Read the router-mounting file**

```bash
cd dtbackend && cat app/api/v1/endpoints/romiot/station/__init__.py
```

Expected: empty (0 lines). The router mounts likely live in `app/api/v1/__init__.py` or a similar central router. Confirm with:

```bash
cd dtbackend && grep -rn "station.qr_code\|station.work_order\|station.station\|station.company_integration" app/api/v1/
```

Note the file/line where the existing station sub-routers are `include_router(...)`'d — the new module mounts in the same place.

- [ ] **Step 2: Create the new endpoint module**

Create `dtbackend/app/api/v1/endpoints/romiot/station/work_order_route.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.auth import check_station_operator_role
from app.core.auth import check_authenticated
from app.core.database import get_postgres_db, get_romiot_db
from app.models.romiot_models import Station, WorkOrder, WorkOrderRoute
from app.models.postgres_models import User as PostgresUser
from app.schemas.user import User
from app.schemas.work_order_route import (
    WorkOrderRouteCreate,
    WorkOrderRoutePosition,
    WorkOrderRouteResponse,
    WorkOrderRouteUpdate,
)
from app.services.user_service import UserService

router = APIRouter()


async def _company_for_group(romiot_db: AsyncSession, group_id: str) -> str | None:
    """Returns the (single) company that owns the group's existing stations."""
    result = await romiot_db.execute(
        select(Station.company)
        .join(WorkOrder, WorkOrder.station_id == Station.id)
        .where(WorkOrder.work_order_group_id == group_id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _earliest_entry_station_id(romiot_db: AsyncSession, group_id: str) -> int | None:
    """Returns the station_id of the earliest entrance scan for the group."""
    result = await romiot_db.execute(
        select(WorkOrder.station_id)
        .where(WorkOrder.work_order_group_id == group_id)
        .order_by(WorkOrder.entrance_date.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _validate_station_ids(
    romiot_db: AsyncSession,
    company: str,
    station_ids: list[int],
) -> list[Station]:
    """Validates uniqueness, all-belong-to-company, last-is-exit (or company has none).
    Returns the Station rows in the order matching station_ids."""
    if len(set(station_ids)) != len(station_ids):
        raise HTTPException(status_code=400, detail="Aynı atölye birden fazla seçilemez.")

    stations_result = await romiot_db.execute(
        select(Station).where(Station.id.in_(station_ids), Station.company == company)
    )
    stations_by_id = {s.id: s for s in stations_result.scalars().all()}
    if len(stations_by_id) != len(station_ids):
        raise HTTPException(status_code=400, detail="Bir veya daha fazla atölye bu şirkete ait değil.")

    company_exit_check = await romiot_db.execute(
        select(Station.id).where(Station.company == company, Station.is_exit_station == True).limit(1)
    )
    company_has_exit = company_exit_check.scalar_one_or_none() is not None
    if company_has_exit:
        last_station = stations_by_id[station_ids[-1]]
        if not last_station.is_exit_station:
            raise HTTPException(
                status_code=400,
                detail="Rota bir Çıkış Atölyesinde bitmelidir.",
            )

    return [stations_by_id[sid] for sid in station_ids]


def _build_response(group_id: str, ordered_stations: list[Station]) -> WorkOrderRouteResponse:
    return WorkOrderRouteResponse(
        work_order_group_id=group_id,
        positions=[
            WorkOrderRoutePosition(position=i, station_id=s.id, station_name=s.name)
            for i, s in enumerate(ordered_stations)
        ],
    )


@router.post("/", response_model=WorkOrderRouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(
    body: WorkOrderRouteCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db),
):
    """Create a route for a work order group.

    Position 0 is pinned. The pin source depends on the caller's role:
      - `atolye:operator`: position 0 = operator's station (looked up from
        their user record's `workshop_id`).
      - `atolye:yonetici` (creating a route for a grandfathered group):
        position 0 = earliest historical entrance station for the group.
    Conflicts with an existing route → 409.
    """
    role_values = current_user.role if isinstance(current_user.role, list) else []
    is_operator = "atolye:operator" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    if not (is_operator or is_yonetici):
        raise HTTPException(status_code=403, detail="Operatör veya yönetici yetkisi gereklidir.")

    # Conflict guard
    existing_check = await romiot_db.execute(
        select(WorkOrderRoute.id).where(WorkOrderRoute.work_order_group_id == body.work_order_group_id).limit(1)
    )
    if existing_check.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Bu grup için zaten bir rota tanımlı.")

    company = await _company_for_group(romiot_db, body.work_order_group_id)
    if company is None:
        raise HTTPException(status_code=400, detail="Bu iş emri grubu için tarama kaydı bulunamadı.")

    if is_operator:
        pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
        if pg_user is None or pg_user.workshop_id is None:
            raise HTTPException(status_code=403, detail="Operatörün atölyesi bulunamadı.")
        expected_first = pg_user.workshop_id
    else:
        # is_yonetici (grandfathered group flow)
        expected_first = await _earliest_entry_station_id(romiot_db, body.work_order_group_id)
        if expected_first is None:
            raise HTTPException(status_code=400, detail="Bu grubun geçmiş tarama kaydı bulunamadı.")

    if body.station_ids[0] != expected_first:
        raise HTTPException(status_code=400, detail="İlk atölye geçerli giriş atölyesiyle eşleşmiyor.")

    ordered_stations = await _validate_station_ids(romiot_db, company, body.station_ids)

    pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
    creator_id = pg_user.id if pg_user else 0

    for i, station in enumerate(ordered_stations):
        romiot_db.add(WorkOrderRoute(
            work_order_group_id=body.work_order_group_id,
            position=i,
            station_id=station.id,
            created_by_user_id=creator_id,
        ))
    await romiot_db.commit()

    return _build_response(body.work_order_group_id, ordered_stations)


@router.put("/{work_order_group_id}", response_model=WorkOrderRouteResponse)
async def update_route(
    work_order_group_id: str,
    body: WorkOrderRouteUpdate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Replace a route for a group. Yönetici-only. Position 0 cannot change."""
    role_values = current_user.role if isinstance(current_user.role, list) else []
    if "atolye:yonetici" not in role_values:
        raise HTTPException(status_code=403, detail="Yönetici yetkisi gereklidir.")

    existing_rows_result = await romiot_db.execute(
        select(WorkOrderRoute).where(WorkOrderRoute.work_order_group_id == work_order_group_id).order_by(WorkOrderRoute.position)
    )
    existing_rows = existing_rows_result.scalars().all()
    if not existing_rows:
        raise HTTPException(status_code=404, detail="Bu grup için tanımlı rota yok.")

    if body.station_ids[0] != existing_rows[0].station_id:
        raise HTTPException(status_code=400, detail="Giriş istasyonu değiştirilemez.")

    company = await _company_for_group(romiot_db, work_order_group_id)
    if company is None:
        raise HTTPException(status_code=400, detail="Bu iş emri grubu için tarama kaydı bulunamadı.")

    ordered_stations = await _validate_station_ids(romiot_db, company, body.station_ids)

    # Replace in a single transaction
    for row in existing_rows:
        await romiot_db.delete(row)
    await romiot_db.flush()

    for i, station in enumerate(ordered_stations):
        romiot_db.add(WorkOrderRoute(
            work_order_group_id=work_order_group_id,
            position=i,
            station_id=station.id,
            created_by_user_id=existing_rows[0].created_by_user_id,
        ))
    await romiot_db.commit()

    return _build_response(work_order_group_id, ordered_stations)


@router.get("/{work_order_group_id}", response_model=WorkOrderRouteResponse)
async def get_route(
    work_order_group_id: str,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Read the route for a group. Returns 404 if grandfathered (no route)."""
    role_values = current_user.role if isinstance(current_user.role, list) else []
    has_atolye_role = any(
        isinstance(r, str) and r.startswith("atolye:") for r in role_values
    )
    if not has_atolye_role:
        raise HTTPException(status_code=403, detail="Atölye yetkisi gereklidir.")

    rows_result = await romiot_db.execute(
        select(WorkOrderRoute, Station.name)
        .join(Station, Station.id == WorkOrderRoute.station_id)
        .where(WorkOrderRoute.work_order_group_id == work_order_group_id)
        .order_by(WorkOrderRoute.position)
    )
    rows = rows_result.all()
    if not rows:
        raise HTTPException(status_code=404, detail="Bu grup için tanımlı rota yok.")

    positions = [
        WorkOrderRoutePosition(position=route.position, station_id=route.station_id, station_name=name)
        for (route, name) in rows
    ]
    return WorkOrderRouteResponse(work_order_group_id=work_order_group_id, positions=positions)
```

- [ ] **Step 3: Mount the router**

Find the central router-include file (per Step 1 grep). Add:

```python
from app.api.v1.endpoints.romiot.station import work_order_route as station_work_order_route
# ...
station_router.include_router(
    station_work_order_route.router,
    prefix="/work-order-routes",
    tags=["station:work-order-routes"],
)
```

- [ ] **Step 4: Smoke**

```bash
cd dtbackend && uvicorn main:app --reload --port 8000 &
sleep 3
curl http://localhost:8000/openapi.json | python -c "import json,sys; d=json.load(sys.stdin); print([p for p in d['paths'] if 'work-order-routes' in p])"
```

Expected: list contains `/api/v1/romiot/station/work-order-routes/` and `/api/v1/romiot/station/work-order-routes/{work_order_group_id}` paths.

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order_route.py dtbackend/app/api/v1/<router-mount-file>
git commit -m "feat(work-order-routes): POST/PUT/GET endpoints with operator/yonetici flows"
```

---

### Task 15: `toy_api_service.py` — multi-pair Mekasan push

**Files:**
- Modify: `dtbackend/app/services/toy_api_service.py` (59 lines; full content quoted at the start of this section)

- [ ] **Step 1: Update the function signature + body**

Replace the file contents:

```python
import asyncio
import logging

import httpx

from app.schemas.order_pair import OrderPair

logger = logging.getLogger(__name__)


def _build_payload_item(
    work_order,
    station,
    pair: OrderPair,
    mes_order_id: str,
) -> dict:
    return {
        "AselsanOrderCode": pair.aselsan_order_number,
        "WorkOrderItemNo": pair.order_item_number,
        "ProductCode": work_order.part_number,
        "Mes_ProductCode": work_order.part_number,
        "RevisionNo": work_order.revision_number,
        "Mes_MachineGroup": str(station.station_order_code) if station.station_order_code is not None else None,
        "OperationDesc": station.name,
        "Mes_OrderId": mes_order_id,
        "SubcontractorWorkOrderNo": work_order.work_order_group_id,
        "ActualStartDate": work_order.entrance_date.isoformat() if work_order.entrance_date else None,
        "ActualEndDate": work_order.exit_date.isoformat() if work_order.exit_date else None,
        "PlannedQuantity": work_order.quantity,
        "WorkOrderAmount": work_order.total_quantity,
        "ActualQuantity": work_order.quantity if work_order.exit_date else 0,
        "MES_CreatedDate": work_order.qr_created_at.isoformat() if work_order.qr_created_at else None,
        "NeedDate": work_order.target_date.isoformat() if work_order.target_date else None,
        "AselsanSectorCode": work_order.sector,
    }


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


async def send_production_order(
    work_order,
    station,
    api_url: str,
    api_key: str,
    company: str,
    pairs: list[OrderPair],
) -> None:
    """
    Fire-and-forget Mekasan push.

    F3:
      - `len(pairs) == 1`: one POST with Mes_OrderId = "{group_id}-{station.id}"
        (unchanged single-pair behavior).
      - `len(pairs) > 1`: N parallel POSTs, each with
        Mes_OrderId = "{group_id}-{station.id}-{pair.aselsan_order_number}".

    Never raises — logs and swallows.
    """
    if not pairs:
        logger.warning("send_production_order skipped: empty pairs for work_order_id=%s", work_order.id)
        return

    base_id = f"{work_order.work_order_group_id}-{station.id}"

    if len(pairs) == 1:
        item = _build_payload_item(work_order, station, pairs[0], base_id)
        await _post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id)
        return

    # Multi-pair: N independent POSTs in parallel
    tasks = []
    for pair in pairs:
        mes_order_id = f"{base_id}-{pair.aselsan_order_number}"
        item = _build_payload_item(work_order, station, pair, mes_order_id)
        tasks.append(_post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id))
    await asyncio.gather(*tasks)
```

- [ ] **Step 2: Smoke**

```bash
cd dtbackend && python -c "from app.services.toy_api_service import send_production_order; import inspect; print(list(inspect.signature(send_production_order).parameters))"
```

Expected: `['work_order', 'station', 'api_url', 'api_key', 'company', 'pairs']`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/services/toy_api_service.py
git commit -m "feat(toy-api): pair-aware Mekasan push (1 pair unchanged, N pairs fanned out)"
```

---

## Wave 3 — Frontend shared components

### Task 16: `EntryStationBadge.tsx`

**Files:**
- Create: `dtfrontend/src/components/atolye/EntryStationBadge.tsx`

This is a pure presentational component — no unit test needed in this project (frontend has no test runner today).

- [ ] **Step 1: Create the component**

Create `dtfrontend/src/components/atolye/EntryStationBadge.tsx`:

```tsx
"use client";

import { LogIn } from "lucide-react";

interface EntryStationBadgeProps {
  isEntry: boolean | undefined;
  size?: "sm" | "md";
}

export function EntryStationBadge({ isEntry, size = "sm" }: EntryStationBadgeProps) {
  if (!isEntry) return null;
  const sizing =
    size === "md"
      ? "text-sm px-2.5 py-1"
      : "text-xs px-2 py-0.5";
  const iconClass = size === "md" ? "h-4 w-4" : "h-3 w-3";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 text-emerald-800 font-medium ${sizing}`}
    >
      <LogIn className={iconClass} aria-hidden="true" />
      Giriş Atölyesi
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/components/atolye/EntryStationBadge.tsx
git commit -m "feat(atolye/ui): EntryStationBadge component"
```

---

### Task 17: `CompanyTypeahead.tsx`

**Files:**
- Create: `dtfrontend/src/components/atolye/CompanyTypeahead.tsx`
- Modify: `dtfrontend/package.json` (add `react-window` dep)

- [ ] **Step 1: Add `react-window` dependency**

```bash
cd dtfrontend && npm install react-window@^1.8.10
cd dtfrontend && npm install --save-dev @types/react-window
```

Verify install:

```bash
cd dtfrontend && node -e "console.log(require('react-window/package.json').version)"
```

Expected: a version starting with `1.8.`.

- [ ] **Step 2: Create the component**

Create `dtfrontend/src/components/atolye/CompanyTypeahead.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import { api } from "@/lib/api";

interface CompanyTypeaheadProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
}

const ROW_HEIGHT = 36;
const MAX_VISIBLE_ROWS = 8;
const VIRTUALIZE_THRESHOLD = 20;

export function CompanyTypeahead({
  value,
  onChange,
  disabled,
  required,
  placeholder = "Hedef firma seçin veya arayın",
  id,
}: CompanyTypeaheadProps) {
  const [companies, setCompanies] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>(value);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(value);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<FixedSizeList | null>(null);

  // Fetch the list once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<string[]>(
          "/romiot/station/company-integrations/companies",
          undefined,
          { useCache: true },
        );
        if (!cancelled) setCompanies(data || []);
      } catch (err) {
        if (!cancelled) {
          setCompanies([]);
          setLoadError("Firma listesi yüklenemedi");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce the filter (250 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Keep input text in sync with controlled value when parent changes externally
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click-outside closes dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!companies) return [];
    if (!debouncedQuery) return companies;
    const q = debouncedQuery.toLocaleLowerCase("tr-TR");
    return companies.filter((c) => c.toLocaleLowerCase("tr-TR").includes(q));
  }, [companies, debouncedQuery]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [debouncedQuery, companies]);

  const isValid = useMemo(() => {
    if (!value || !companies) return true;
    return companies.includes(value.trim());
  }, [value, companies]);

  const commitSelection = useCallback((next: string) => {
    setQuery(next);
    setDebouncedQuery(next);
    onChange(next);
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
      listRef.current?.scrollToItem(Math.min(highlightedIndex + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      listRef.current?.scrollToItem(Math.max(highlightedIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightedIndex]) commitSelection(filtered[highlightedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(value);
    } else if (e.key === "Tab") {
      if (filtered[highlightedIndex]) commitSelection(filtered[highlightedIndex]);
    }
  };

  const Row = ({ index, style }: ListChildComponentProps) => {
    const company = filtered[index];
    const isHighlighted = index === highlightedIndex;
    const isSelected = value === company;
    return (
      <div
        id={`company-typeahead-option-${index}`}
        role="option"
        aria-selected={isSelected}
        style={style}
        onMouseDown={(e) => {
          e.preventDefault();
          commitSelection(company);
        }}
        onMouseEnter={() => setHighlightedIndex(index)}
        className={`flex items-center px-4 cursor-pointer ${
          isHighlighted ? "bg-blue-50 text-blue-900" : ""
        } ${isSelected ? "border-l-2 border-blue-500" : ""}`}
      >
        {company}
      </div>
    );
  };

  const isLoading = companies === null;
  const emptyCatalog = companies !== null && companies.length === 0;

  return (
    <div className="relative" ref={containerRef}>
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={open ? `company-typeahead-option-${highlightedIndex}` : undefined}
        value={query}
        placeholder={emptyCatalog ? "Sistemde tanımlı firma yok" : placeholder}
        disabled={disabled || isLoading || emptyCatalog}
        required={required}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
      />

      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
          {filtered.length > VIRTUALIZE_THRESHOLD ? (
            <FixedSizeList
              ref={listRef}
              height={Math.min(filtered.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT}
              itemCount={filtered.length}
              itemSize={ROW_HEIGHT}
              width="100%"
            >
              {Row}
            </FixedSizeList>
          ) : (
            <ul role="listbox" className="max-h-72 overflow-auto">
              {filtered.map((c, i) => (
                <li key={c} style={{ height: ROW_HEIGHT }}>
                  <Row index={i} style={{ height: ROW_HEIGHT }} data={null} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && filtered.length === 0 && companies && companies.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200 px-4 py-2 text-sm text-gray-500">
          Eşleşen firma yok
        </div>
      )}

      {!open && value && !isValid && (
        <p className="mt-1 text-xs text-red-600">Bu firma listede yok</p>
      )}
      {emptyCatalog && (
        <p className="mt-1 text-xs text-red-600">Yönetici bir firma entegrasyonu tanımlamalıdır</p>
      )}
      {loadError && !emptyCatalog && (
        <p className="mt-1 text-xs text-red-600">{loadError}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add dtfrontend/package.json dtfrontend/package-lock.json dtfrontend/src/components/atolye/CompanyTypeahead.tsx
git commit -m "feat(atolye/ui): CompanyTypeahead component + react-window dep"
```

---

### Task 18: `RouteWarningModal.tsx`

**Files:**
- Create: `dtfrontend/src/components/atolye/RouteWarningModal.tsx`

- [ ] **Step 1: Create the component**

Create `dtfrontend/src/components/atolye/RouteWarningModal.tsx`:

```tsx
"use client";

interface RouteWarningModalProps {
  open: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function RouteWarningModal({ open, message, onCancel, onConfirm, loading }: RouteWarningModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Rota Uyarısı</h3>
        </div>
        <div className="p-6">
          <div className="p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm text-yellow-800 whitespace-pre-line">
            ⚠ {message}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? "İşleniyor..." : "Yine de Devam Et"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
git add dtfrontend/src/components/atolye/RouteWarningModal.tsx
git commit -m "feat(atolye/ui): RouteWarningModal component"
```

---

### Task 19: `RoutePickerModal.tsx`

**Files:**
- Create: `dtfrontend/src/components/atolye/RoutePickerModal.tsx`
- Modify: `dtfrontend/package.json` (add `@dnd-kit/core` + `@dnd-kit/sortable`)

- [ ] **Step 1: Add dnd-kit deps**

```bash
cd dtfrontend && npm install @dnd-kit/core@^6.1.0 @dnd-kit/sortable@^8.0.0
```

Verify:

```bash
cd dtfrontend && node -e "console.log(require('@dnd-kit/core/package.json').version, require('@dnd-kit/sortable/package.json').version)"
```

Expected: two `6.x.x` `8.x.x` versions.

- [ ] **Step 2: Create the component**

Create `dtfrontend/src/components/atolye/RoutePickerModal.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EntryStationBadge } from "./EntryStationBadge";
import { ExitStationBadge } from "./ExitStationBadge";

interface Station {
  id: number;
  name: string;
  company: string;
  is_entry_station: boolean;
  is_exit_station: boolean;
}

interface RoutePickerModalProps {
  open: boolean;
  workOrderGroupId: string;
  pinnedFirstStation: Station;            // operator's current station OR (for grandfathered) earliest historical entry
  companyStations: Station[];
  initialRouteStationIds?: number[];       // pre-fill for edit mode (yönetici)
  mode: "create" | "update";
  onSaved: () => void;
  onCancelled: () => void;
}

interface SortableItemProps {
  station: Station;
  isPinned: boolean;
  onRemove?: () => void;
}

function SortableItem({ station, isPinned, onRemove }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: station.id, disabled: isPinned });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white ${isPinned ? "opacity-90" : ""}`}
    >
      {!isPinned && (
        <span
          className="cursor-grab text-gray-400 select-none"
          {...attributes}
          {...listeners}
          aria-label="Sırayı taşımak için sürükle"
        >
          ≡
        </span>
      )}
      {isPinned && <span aria-hidden="true">🔒</span>}
      <span className="flex-1 font-medium text-gray-900">{station.name}</span>
      <EntryStationBadge isEntry={station.is_entry_station} size="sm" />
      <ExitStationBadge isExit={station.is_exit_station} size="sm" />
      {!isPinned && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-red-600 hover:bg-red-50 rounded px-2 py-1 text-sm"
          aria-label="Atölyeyi listeden çıkar"
        >
          ×
        </button>
      )}
    </li>
  );
}

export function RoutePickerModal({
  open,
  workOrderGroupId,
  pinnedFirstStation,
  companyStations,
  initialRouteStationIds,
  mode,
  onSaved,
  onCancelled,
}: RoutePickerModalProps) {
  const initialIds = useMemo(() => {
    if (initialRouteStationIds && initialRouteStationIds.length > 0) return initialRouteStationIds;
    return [pinnedFirstStation.id];
  }, [initialRouteStationIds, pinnedFirstStation]);

  const [orderedIds, setOrderedIds] = useState<number[]>(initialIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stationsById = useMemo(() => {
    const map = new Map<number, Station>();
    [pinnedFirstStation, ...companyStations].forEach((s) => map.set(s.id, s));
    return map;
  }, [pinnedFirstStation, companyStations]);

  const availableToAdd = useMemo(() => {
    const inRoute = new Set(orderedIds);
    return companyStations.filter((s) => !inRoute.has(s.id));
  }, [orderedIds, companyStations]);

  const hasExitStationInCompany = companyStations.some((s) => s.is_exit_station) || pinnedFirstStation.is_exit_station;
  const lastStation = stationsById.get(orderedIds[orderedIds.length - 1]);
  const endsAtExit = !!lastStation?.is_exit_station;

  const canSave =
    orderedIds.length >= 2 && (!hasExitStationInCompany || endsAtExit);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(Number(active.id));
    const newIndex = orderedIds.indexOf(Number(over.id));
    if (oldIndex === 0 || newIndex === 0) return; // never move past pinned
    setOrderedIds((ids) => arrayMove(ids, oldIndex, newIndex));
  };

  const handleAdd = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    if (!id) return;
    setOrderedIds((ids) => [...ids, id]);
    e.target.value = "";
  };

  const handleRemove = (id: number) => {
    setOrderedIds((ids) => ids.filter((i) => i !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        await api.post("/romiot/station/work-order-routes/", {
          work_order_group_id: workOrderGroupId,
          station_ids: orderedIds,
        });
      } else {
        await api.put(`/romiot/station/work-order-routes/${encodeURIComponent(workOrderGroupId)}`, {
          station_ids: orderedIds,
        });
      }
      onSaved();
    } catch (err: any) {
      let message = "Rota kaydedilemedi";
      if (err.message) {
        try {
          const parsed = JSON.parse(err.message);
          message = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">
            {mode === "create" ? "Rota Belirle" : "Rota Düzenle"}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Bu iş emrinin gideceği atölyeleri sırayla seçin.
          </p>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded text-sm text-red-700 whitespace-pre-line">
              {error}
            </div>
          )}
          {!hasExitStationInCompany && (
            <div className="p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm text-yellow-800">
              Sistemde Çıkış Atölyesi yok; rota istediğiniz herhangi bir atölyede bitebilir.
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2">
                {orderedIds.map((id, i) => {
                  const s = stationsById.get(id);
                  if (!s) return null;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-sm text-gray-400 w-6 text-right">{i + 1}.</span>
                      <SortableItem
                        station={s}
                        isPinned={i === 0}
                        onRemove={i === 0 ? undefined : () => handleRemove(id)}
                      />
                    </div>
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>

          {availableToAdd.length > 0 && (
            <div>
              <select
                onChange={handleAdd}
                defaultValue=""
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                aria-label="Rotaya atölye ekle"
              >
                <option value="">+ Atölye Ekle</option>
                {availableToAdd.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_exit_station ? " (Çıkış)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasExitStationInCompany && !endsAtExit && orderedIds.length >= 2 && (
            <p className="text-xs text-amber-700">⚠ Rota bir Çıkış Atölyesinde bitmelidir</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelled}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add dtfrontend/package.json dtfrontend/package-lock.json dtfrontend/src/components/atolye/RoutePickerModal.tsx
git commit -m "feat(atolye/ui): RoutePickerModal with dnd-kit ordering + create/update modes"
```

---

## Wave 4 — Frontend page edits

### Task 20: `musteri/page.tsx` — F1 typeahead + F3 multi-pair

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx` (711 lines; touch points covered in spec)

- [ ] **Step 1: Replace state**

Change the `BarcodeFormData` interface to drop the scalar pair fields and add `pairs`:

```ts
interface OrderPair {
  aselsan_order_number: string;
  order_item_number: string;
}

interface BarcodeFormData {
  main_customer: string;
  sector: string;
  target_company: string;
  teklif_number: string;
  pairs: OrderPair[];
  part_number: string;
  revision_number: string;
  quantity: number;
  package_quantity: number;
  target_date: string;
}
```

Replace `aselsan_order_number: ""` / `order_item_number: ""` defaults with `pairs: [{ aselsan_order_number: "", order_item_number: "" }]`.

- [ ] **Step 2: Delete the role-based `userCompanies` plumbing**

Remove `userCompanies` state (line 41), the role-parsing useEffect (lines 47–86) entirely. Replace `setUserOwnCompany` logic with a minimal pass for `ownCompany`:

```ts
useEffect(() => {
  if (user?.role && Array.isArray(user.role)) {
    const musteriRole = user.role.find((r) => typeof r === "string" && r === "atolye:musteri");
    const yoneticiRole = user.role.find((r) => typeof r === "string" && r === "atolye:yonetici");
    if (musteriRole || yoneticiRole) {
      setIsMusteri(!!musteriRole);
      setIsYonetici(!!yoneticiRole);
      setUserOwnCompany((user.department || user.company || "").trim());
    }
  }
}, [user]);
```

Remove `setUserCompanies(...)` calls and the default-target effect at lines 107–116.

- [ ] **Step 3: Replace the Hedef Firma select**

Import `CompanyTypeahead` at the top:

```ts
import { CompanyTypeahead } from "@/components/atolye/CompanyTypeahead";
```

Replace the `<select>` block at lines 440–467 with:

```tsx
<div>
  <label htmlFor="target_company" className="block text-sm font-medium text-gray-700 mb-2">Hedef Firma *</label>
  <CompanyTypeahead
    id="target_company"
    value={barcodeFormData.target_company}
    onChange={(v) => setBarcodeFormData({ ...barcodeFormData, target_company: v })}
    required
  />
</div>
```

For yönetici-only users (no müşteri role) the existing requirement is target == own company. Lock the typeahead in that case by passing `disabled={isYonetici && !isMusteri}` and pre-filling `value={isYonetici && !isMusteri ? userOwnCompany : barcodeFormData.target_company}`.

- [ ] **Step 4: Replace the single sipariş/kalem inputs with the Malzemeler section**

Find the existing sipariş + kalem fields (lines 480–511). Replace both with:

```tsx
<div className="md:col-span-2">
  <label className="block text-sm font-medium text-gray-700 mb-2">Malzemeler *</label>
  <div className="space-y-2">
    {barcodeFormData.pairs.map((pair, idx) => {
      const errors = validatePair(pair, barcodeFormData.pairs, idx, barcodeFormData.main_customer);
      return (
        <div key={idx} className="flex flex-wrap gap-2 items-start">
          <div className="flex-1 min-w-[180px]">
            <input
              type="text"
              value={pair.aselsan_order_number}
              onKeyDown={(e) => {
                if (e.key.length === 1 && !/^[A-Za-z0-9]$/.test(e.key)) e.preventDefault();
              }}
              onPaste={(e) => {
                e.preventDefault();
                const sanitized = e.clipboardData.getData("text").replace(/[^A-Za-z0-9]/g, "");
                const next = [...barcodeFormData.pairs];
                next[idx] = { ...next[idx], aselsan_order_number: sanitized };
                setBarcodeFormData({ ...barcodeFormData, pairs: next });
              }}
              onChange={(e) => {
                const next = [...barcodeFormData.pairs];
                next[idx] = { ...next[idx], aselsan_order_number: e.target.value };
                setBarcodeFormData({ ...barcodeFormData, pairs: next });
              }}
              placeholder="Sipariş No"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              required
            />
          </div>
          <div className="w-32">
            <input
              type="text"
              inputMode="numeric"
              value={pair.order_item_number}
              onKeyDown={(e) => {
                if (e.key.length === 1 && !/^[0-9]$/.test(e.key)) e.preventDefault();
              }}
              onPaste={(e) => {
                e.preventDefault();
                const sanitized = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
                const next = [...barcodeFormData.pairs];
                next[idx] = { ...next[idx], order_item_number: sanitized };
                setBarcodeFormData({ ...barcodeFormData, pairs: next });
              }}
              onChange={(e) => {
                const next = [...barcodeFormData.pairs];
                next[idx] = { ...next[idx], order_item_number: e.target.value };
                setBarcodeFormData({ ...barcodeFormData, pairs: next });
              }}
              placeholder="Kalem No"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              required
            />
          </div>
          {barcodeFormData.pairs.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setBarcodeFormData({
                  ...barcodeFormData,
                  pairs: barcodeFormData.pairs.filter((_, i) => i !== idx),
                })
              }
              className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
              aria-label="Malzemeyi kaldır"
            >
              ×
            </button>
          )}
          {errors.length > 0 && (
            <div className="basis-full text-xs text-red-600 pl-1">{errors.join(", ")}</div>
          )}
        </div>
      );
    })}
    <button
      type="button"
      onClick={() =>
        setBarcodeFormData({
          ...barcodeFormData,
          pairs: [...barcodeFormData.pairs, { aselsan_order_number: "", order_item_number: "" }],
        })
      }
      className="px-3 py-1 text-sm border border-dashed border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
    >
      + Malzeme Ekle
    </button>
  </div>
</div>
```

Above the JSX, add the validator helper inside the component (or as a module-level fn):

```ts
function validatePair(pair: OrderPair, all: OrderPair[], idx: number, mainCustomer: string): string[] {
  const errs: string[] = [];
  if (!pair.aselsan_order_number.trim()) errs.push("Sipariş No boş");
  if (!pair.order_item_number.trim()) errs.push("Kalem No boş");
  if (mainCustomer === "ASELSAN" && pair.aselsan_order_number && !/^2\d[YD]/.test(pair.aselsan_order_number.trim())) {
    errs.push("Sipariş No 20Y/D–29Y/D ile başlamalı");
  }
  if (mainCustomer === "ASELSAN" && pair.order_item_number) {
    const n = Number(pair.order_item_number);
    if (!/^\d+$/.test(pair.order_item_number) || n <= 0 || n % 10 !== 0) {
      errs.push("Kalem No 10'un katı olmalı");
    }
  }
  // duplicate detection
  const isDup = all.some((p, i) =>
    i !== idx &&
    p.aselsan_order_number.trim() === pair.aselsan_order_number.trim() &&
    p.order_item_number.trim() === pair.order_item_number.trim() &&
    pair.aselsan_order_number.trim() !== "",
  );
  if (isDup) errs.push("Bu çift birden fazla eklenmiş");
  return errs;
}
```

- [ ] **Step 5: Update `handleGenerateBarcode` payload**

Replace the existing `aselsan_order_number` / `order_item_number` reads in `payload`. Also run cross-row validation before submitting:

```ts
const pairErrors = barcodeFormData.pairs.flatMap((p, i) => validatePair(p, barcodeFormData.pairs, i, barcodeFormData.main_customer));
if (pairErrors.length > 0) {
  setError(pairErrors.join("; "));
  return;
}

const payload = {
  main_customer: barcodeFormData.main_customer,
  sector: barcodeFormData.sector,
  target_company: barcodeFormData.target_company,
  teklif_number: barcodeFormData.teklif_number.trim(),
  pairs: barcodeFormData.pairs.map((p) => ({
    aselsan_order_number: p.aselsan_order_number.trim(),
    order_item_number: p.order_item_number.trim(),
  })),
  part_number: barcodeFormData.part_number,
  revision_number: barcodeFormData.revision_number,
  quantity: barcodeFormData.quantity,
  package_quantity: barcodeFormData.package_quantity > 0 ? barcodeFormData.package_quantity : 1,
  target_date: barcodeFormData.target_date,
};
```

- [ ] **Step 6: Update print template and on-screen preview**

In `buildPackageCardHtml` (current lines 231–256), replace the two `<tr>`s for sipariş / kalem with a conditional:

```ts
const pairsRowHtml = barcodeFormData.pairs.length === 1
  ? `
    <tr><td style="border:1px solid #d1d5db; padding:6px; font-weight:600;">${barcodeFormData.main_customer} Sipariş Numarası</td><td style="border:1px solid #d1d5db; padding:6px;">${totalPackages > 1 ? barcodeFormData.pairs[0].aselsan_order_number + "_" + pkg.package_index : barcodeFormData.pairs[0].aselsan_order_number}</td></tr>
    <tr><td style="border:1px solid #d1d5db; padding:6px; font-weight:600;">Sipariş Kalem Numarası</td><td style="border:1px solid #d1d5db; padding:6px;">${barcodeFormData.pairs[0].order_item_number}</td></tr>
  `
  : `
    <tr>
      <td style="border:1px solid #d1d5db; padding:6px; font-weight:600;">Malzemeler</td>
      <td style="border:1px solid #d1d5db; padding:6px;">
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr>
            <th style="border:1px solid #d1d5db; padding:4px; font-weight:600; text-align:left;">Sipariş No</th>
            <th style="border:1px solid #d1d5db; padding:4px; font-weight:600; text-align:left;">Kalem No</th>
          </tr></thead>
          <tbody>
            ${barcodeFormData.pairs.map(p => `
              <tr>
                <td style="border:1px solid #d1d5db; padding:4px;">${p.aselsan_order_number}</td>
                <td style="border:1px solid #d1d5db; padding:4px;">${p.order_item_number}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </td>
    </tr>
  `;
```

Replace the static two-row block with `${pairsRowHtml}`.

Do the same for the on-screen preview table (lines 666–680) using React conditional rendering:

```tsx
{barcodeFormData.pairs.length === 1 ? (
  <>
    <tr className="border-b border-gray-200">
      <td className="py-2 px-3 font-semibold text-gray-700">{barcodeFormData.main_customer} Sipariş Numarası</td>
      <td className="py-2 px-3 text-gray-900">
        {generatedBatch && generatedBatch.total_packages > 1
          ? `${barcodeFormData.pairs[0].aselsan_order_number}_${pkg.package_index}`
          : barcodeFormData.pairs[0].aselsan_order_number}
      </td>
    </tr>
    <tr className="border-b border-gray-200">
      <td className="py-2 px-3 font-semibold text-gray-700">Sipariş Kalem Numarası</td>
      <td className="py-2 px-3 text-gray-900">{barcodeFormData.pairs[0].order_item_number}</td>
    </tr>
  </>
) : (
  <tr className="border-b border-gray-200">
    <td className="py-2 px-3 font-semibold text-gray-700 align-top">Malzemeler</td>
    <td className="py-2 px-3 text-gray-900">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left">Sipariş No</th>
            <th className="px-2 py-1 text-left">Kalem No</th>
          </tr>
        </thead>
        <tbody>
          {barcodeFormData.pairs.map((p, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-2 py-1">{p.aselsan_order_number}</td>
              <td className="px-2 py-1">{p.order_item_number}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </td>
  </tr>
)}
```

- [ ] **Step 7: Type-check + manual UI smoke**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
cd dtfrontend && npm run dev
```

Open `http://localhost:3000/<platform>/atolye/musteri` → confirm typeahead loads companies, the Malzemeler section accepts only alphanumeric for sipariş + digits for kalem, "Malzeme Ekle" adds rows, and a single-pair form prints the original layout.

- [ ] **Step 8: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/musteri/page.tsx
git commit -m "feat(musteri): F1 typeahead + F3 Malzemeler multi-pair input + conditional print/preview"
```

---

### Task 21: `yonetici/page.tsx` — F4 entry flag + F5 banners

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx` (651 lines; full content quoted)

- [ ] **Step 1: Extend the local `Station` interface and form state**

In the `Station` interface (lines 25–31), add:

```ts
  is_entry_station: boolean;
```

In `stationFormData` initial value, add `is_entry_station: false`. In `editFormData`, add `is_entry_station: false`.

- [ ] **Step 2: Add the Giriş Atölyesi checkbox to the Create form**

Above the existing `is_exit_station` checkbox block (lines 335–348), add:

```tsx
<div className="flex items-center gap-3">
  <input
    type="checkbox"
    id="is_entry_station"
    checked={stationFormData.is_entry_station}
    onChange={(e) => setStationFormData({ ...stationFormData, is_entry_station: e.target.checked })}
    className="h-4 w-4 text-[#0f4c3a] border-gray-300 rounded focus:ring-[#0f4c3a]"
    disabled={yoneticiLoading}
  />
  <label htmlFor="is_entry_station" className="text-sm font-medium text-gray-700">Giriş Atölyesi</label>
  <span className="text-xs text-gray-500">(Bu atölyeden iş emrinin ilk girişi yapılabilir)</span>
</div>
```

- [ ] **Step 3: Update `openEditModal` and the Edit modal JSX**

In `openEditModal` (line 185):

```ts
setEditFormData({ name: station.name, is_entry_station: station.is_entry_station, is_exit_station: station.is_exit_station });
```

In `handleUpdateStation` (line 197), include `is_entry_station` in the PUT body. In the Edit modal JSX (lines 542–578), add the new checkbox above the existing exit one with `id="edit_is_entry_station"`.

- [ ] **Step 4: Update the Mevcut Atölyeler Tip column**

Import the new component:

```ts
import { EntryStationBadge } from "@/components/atolye/EntryStationBadge";
```

Replace the cell at lines 379–385:

```tsx
<td className="px-3 py-2">
  <div className="flex flex-col gap-1 items-start">
    <EntryStationBadge isEntry={station.is_entry_station} size="sm" />
    <ExitStationBadge isExit={station.is_exit_station} size="sm" />
    {!station.is_entry_station && !station.is_exit_station && (
      <span className="text-gray-400 text-sm">—</span>
    )}
  </div>
</td>
```

- [ ] **Step 5: Add F5/F6.8 warning banners**

Below the existing success/error banners (around line 304), insert:

```tsx
{stations.length > 0 && !stations.some(s => s.is_entry_station) && (
  <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm text-yellow-800">
    ⚠ Henüz Giriş Atölyesi tanımlanmamış. İlk taramalar herhangi bir atölyede yapılabilir.
  </div>
)}
{stations.length > 0 && !stations.some(s => s.is_exit_station) && (
  <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm text-yellow-800">
    ⚠ Henüz Çıkış Atölyesi tanımlanmamış. İş emirleri teslim edilmiş olarak işaretlenemez ve rotalar son durağı doğrulanamaz.
  </div>
)}
```

- [ ] **Step 6: Type-check + manual smoke + commit**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
git add dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx
git commit -m "feat(yonetici): F4 is_entry_station create/edit/list + F5/F6 warning banners"
```

---

### Task 22: `operator/page.tsx` — F4 badge + F5 + F6 flow

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/operator/page.tsx` (1373 lines; touch points: `mapQRCodeToApi`, `stationIsEntry`, modal triggers, route warning interceptor)

- [ ] **Step 1: Add `stationIsEntry` state + read it from /my-station**

After `setStationIsExit` (current line 219), add:

```ts
const [stationIsEntry, setStationIsEntry] = useState<boolean>(false);
const [stationCompany, setStationCompany] = useState<string>("");
const [companyStations, setCompanyStations] = useState<Array<{ id: number; name: string; company: string; is_entry_station: boolean; is_exit_station: boolean }>>([]);
```

In the my-station fetch (line 267), update the response type and setters:

```ts
const stationData = await api.get<{ station_id: number; name: string; company: string; is_entry_station: boolean; is_exit_station: boolean }>(
  "/romiot/station/stations/my-station"
);
setStationId(stationData.station_id);
setStationName(stationData.name);
setStationIsEntry(stationData.is_entry_station);
setStationIsExit(stationData.is_exit_station);
setStationCompany(stationData.company);
```

In the all-stations fetch (line 281), extend the typed shape with `is_entry_station: boolean` and also call:

```ts
.then((data) => {
  setAllStationNames((data || []).map((s) => s.name));
  setCompanyStations(data || []);
})
```

- [ ] **Step 2: Render the EntryStationBadge in the header**

Import:

```ts
import { EntryStationBadge } from "@/components/atolye/EntryStationBadge";
import { RoutePickerModal } from "@/components/atolye/RoutePickerModal";
import { RouteWarningModal } from "@/components/atolye/RouteWarningModal";
```

In the header block at lines ~760–762:

```tsx
{stationName && (
  <p className="text-gray-600 mt-1 flex items-center gap-2">
    Atölye: <span className="font-semibold">{stationName}</span>
    <EntryStationBadge isEntry={stationIsEntry} size="md" />
    <ExitStationBadge isExit={stationIsExit} size="md" />
  </p>
)}
```

- [ ] **Step 3: Update `mapQRCodeToApi` to read `pairs`**

In `mapQRCodeToApi` (lines 125–188), replace the `aselsanOrderNumber` / `orderItemNumber` extraction with:

```ts
const pairs = Array.isArray(qrCodeData.pairs) ? qrCodeData.pairs : [];
if (pairs.length === 0) errors.push("Sipariş bilgisi eksik");
```

Update the returned object:

```ts
return {
  station_id: stationId,
  work_order_group_id: String(workOrderGroupId).trim(),
  main_customer: String(mainCustomer).trim(),
  sector: String(sector).trim(),
  company_from: String(companyFrom).trim(),
  teklif_number: String(teklifNumber).trim(),
  pairs: pairs.map((p: any) => ({
    aselsan_order_number: String(p.aselsan_order_number || "").trim(),
    order_item_number: String(p.order_item_number || "").trim(),
  })),
  part_number: String(partNumber).trim(),
  quantity: quantityNum,
  total_quantity: totalQuantityNum,
  package_index: packageIndexNum,
  total_packages: totalPackagesNum,
  target_date: targetDate || null,
};
```

Update `QRCodeData` interface (lines 12–27) to replace scalars with `pairs: OrderPair[]`.

- [ ] **Step 4: Add route picker + route warning state and handlers**

Above the JSX `return`:

```ts
const [routePickerOpen, setRoutePickerOpen] = useState(false);
const [routePickerGroupId, setRoutePickerGroupId] = useState<string | null>(null);
const [routeWarning, setRouteWarning] = useState<{ message: string; pendingPayload: any; mode: "entrance" | "exit" } | null>(null);
const [routeWarningLoading, setRouteWarningLoading] = useState(false);
```

In `handleQRCodeScan` after the entrance POST succeeds (line ~428):

```ts
const response = await api.post<WorkOrderCreateResponse>("/romiot/station/work-orders/", payload);
// ... existing scanProgress code ...
if (response.is_first_scan_for_group) {
  setRoutePickerGroupId(response.work_order.work_order_group_id);
  setRoutePickerOpen(true);
  setMode(null); // suspend further scans until route is saved/cancelled
}
```

For the override flow, wrap the entrance and exit POST calls so that a 400 with `detail.type` opens the warning modal:

```ts
try {
  const response = await api.post<WorkOrderCreateResponse>("/romiot/station/work-orders/", payload);
  // ... existing handler ...
} catch (err: any) {
  const detail = parseDetail(err);
  if (detail && typeof detail === "object" && (detail.type === "route_off" || detail.type === "route_out_of_order")) {
    setRouteWarning({ message: detail.message, pendingPayload: payload, mode: "entrance" });
    return;
  }
  throw err;
}
```

Add a `parseDetail` helper near the top of the file body:

```ts
function parseDetail(err: any): any {
  try {
    const parsed = JSON.parse(err?.message || "");
    return parsed.detail ?? null;
  } catch {
    return null;
  }
}
```

Add the modal JSX near the existing modals:

```tsx
{routePickerOpen && routePickerGroupId && stationId && (
  <RoutePickerModal
    open={routePickerOpen}
    workOrderGroupId={routePickerGroupId}
    pinnedFirstStation={{
      id: stationId,
      name: stationName,
      company: stationCompany,
      is_entry_station: stationIsEntry,
      is_exit_station: stationIsExit,
    }}
    companyStations={companyStations.filter(s => s.id !== stationId)}
    mode="create"
    onSaved={() => {
      setRoutePickerOpen(false);
      setRoutePickerGroupId(null);
      fetchWorkOrders();
    }}
    onCancelled={() => {
      setRoutePickerOpen(false);
      setRoutePickerGroupId(null);
    }}
  />
)}

<RouteWarningModal
  open={!!routeWarning}
  message={routeWarning?.message || ""}
  loading={routeWarningLoading}
  onCancel={() => setRouteWarning(null)}
  onConfirm={async () => {
    if (!routeWarning) return;
    setRouteWarningLoading(true);
    const ackPayload = { ...routeWarning.pendingPayload, acknowledged_route_violation: true };
    try {
      if (routeWarning.mode === "entrance") {
        await api.post("/romiot/station/work-orders/", ackPayload);
      } else {
        await api.post("/romiot/station/work-orders/update-exit-date", ackPayload);
      }
      await fetchWorkOrders();
      setRouteWarning(null);
    } catch (err: any) {
      setError(err?.message || "Hata");
    } finally {
      setRouteWarningLoading(false);
    }
  }}
/>
```

- [ ] **Step 5: Apply the same `pairs` shape to the work-orders table rendering**

Search for `aselsan_order_number` / `order_item_number` in the WorkOrderDetail rendering. Replace with `wo.pairs[0]` + a `pair_count > 1 ? +{pair_count - 1} : null` badge in the collapsed row. In the expanded panel render the full pairs table when `pair_count > 1`.

- [ ] **Step 6: Type-check + manual smoke + commit**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
git add dtfrontend/src/app/[platform]/atolye/operator/page.tsx
git commit -m "feat(operator): F4 badge, F5+F6 first-scan flow, route warning override, multi-pair display"
```

---

### Task 23: `is-emirleri/page.tsx` — pairs display + route view + violation badges + Rota Düzenle/Tanımla

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx` (1358 lines)

- [ ] **Step 1: Update interfaces**

Replace `aselsan_order_number` / `order_item_number` fields in `WorkOrderDetail` and `GroupedWorkOrder` interfaces with:

```ts
pairs: { aselsan_order_number: string; order_item_number: string }[];
pair_count: number;
is_entry_station?: boolean;
route_violation?: boolean;
```

- [ ] **Step 2: Rewrite collapsed-row sipariş / kalem cells**

At every render site (lines 931, 986–990, 1236–1241, plus print template lines 633–634), replace scalar reads with `wo.pairs[0]?.aselsan_order_number ?? "-"` / `.order_item_number ?? "-"`. After the value, render:

```tsx
{wo.pair_count > 1 && (
  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
    +{wo.pair_count - 1}
  </span>
)}
```

- [ ] **Step 3: Add full pair table to expanded panels**

In the expanded view where the sipariş / kalem cells live (lines 986–990, 1236–1241), wrap with conditional:

```tsx
{wo.pair_count > 1 ? (
  <div>
    <p className="text-xs text-gray-500 mb-1">Malzemeler</p>
    <table className="w-full border-collapse text-xs">
      <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">Sipariş No</th><th className="px-2 py-1 text-left">Kalem No</th></tr></thead>
      <tbody>
        {wo.pairs.map((p, i) => (
          <tr key={i} className="border-t"><td className="px-2 py-1">{p.aselsan_order_number}</td><td className="px-2 py-1">{p.order_item_number}</td></tr>
        ))}
      </tbody>
    </table>
  </div>
) : (
  <>
    <p className="font-medium text-gray-900">{wo.pairs[0]?.aselsan_order_number ?? "-"}</p>
    <p className="font-medium text-gray-900">{wo.pairs[0]?.order_item_number ?? "-"}</p>
  </>
)}
```

- [ ] **Step 4: Add violation badge and Rota Düzenle/Tanımla button**

For each work-order row, after the existing status badges:

```tsx
{wo.entries?.some(e => e.route_violation) && (
  <span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200" title="Operatör rotaya uymadan tarama yaptı">
    ⚠ Rota dışı
  </span>
)}
```

For yönetici (use `isYonetici` derived from `user.role`), add a button in the row's action area:

```tsx
{isYonetici && (
  <button
    type="button"
    onClick={() => openRouteModal(wo)}
    className="px-2 py-1 text-xs font-medium text-[#0f4c3a] hover:bg-[#0f4c3a]/10 rounded transition-colors"
  >
    {wo.hasRoute ? "Rota Düzenle" : "Rota Tanımla"}
  </button>
)}
```

`wo.hasRoute` is set by fetching `/romiot/station/work-order-routes/{group_id}` on row expansion — returns 404 for grandfathered groups. Cache the result per group in component state. Pass the existing positions to `RoutePickerModal` when editing.

Wire the modal:

```tsx
{routeModalState && (
  <RoutePickerModal
    open
    workOrderGroupId={routeModalState.groupId}
    pinnedFirstStation={routeModalState.pinnedStation}
    companyStations={routeModalState.companyStations}
    initialRouteStationIds={routeModalState.initialStationIds}
    mode={routeModalState.mode}
    onSaved={() => { setRouteModalState(null); fetchWorkOrders(); }}
    onCancelled={() => setRouteModalState(null)}
  />
)}
```

`openRouteModal(wo)` GETs the route (404 → mode "create" with grandfathered pinned station from history) and the company stations list, populates `routeModalState`, then opens.

- [ ] **Step 5: Update is-emirleri search filter**

The page currently filters by `filter_aselsan_order_number` / `filter_order_item_number` URL params. The backend already changed in T12 to EXISTS on pairs. The frontend already sends those params — no further frontend change required for ANY-pair search semantics.

- [ ] **Step 6: Type-check + commit**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
git add dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx
git commit -m "feat(is-emirleri): pair display + route violation badge + Rota Düzenle/Tanımla flow"
```

---

### Task 24: `kullanici-yonetimi/page.tsx` — drop musteri_companies UI

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx` (1097 lines)

- [ ] **Step 1: Grep for the symbol**

```bash
cd dtfrontend && grep -n "musteri_companies\|musteriCompanies\|Hedef Firmalar" src/app/\[platform\]/atolye/kullanici-yonetimi/page.tsx
```

Walk each match. Expected sites (from spec): the column header "Hedef Firmalar", the per-row badges/list, the bulk-edit dialog, the firma-dropdown filter, the form fields in the create/edit modals, and the type entries on `ManagedUser`.

- [ ] **Step 2: Remove the field from the local types**

The local interface(s) (likely `ManagedUser` near top) drop `musteri_companies: string[]`.

- [ ] **Step 3: Remove the column, dialog, filter, and form fields**

Delete each match identified in Step 1. For the column, remove the `<th>` and the `<td>` in the row body. For the dialog, remove the entire bulk-edit modal block. For the filter, remove the firma-dropdown plus any state and effect that drives it (search for `firmaFilter`, `setFirmaFilter`, similar). For the form fields, remove the multi-select control.

After cleanup:

```bash
cd dtfrontend && grep -c "musteri_compan\|Hedef Firmalar" src/app/\[platform\]/atolye/kullanici-yonetimi/page.tsx
```

Expected: 0.

- [ ] **Step 4: Verify other usages**

```bash
cd dtfrontend && grep -rn "musteri_compan" src/
```

Expected: 0 matches across the frontend (the typeahead does not reference this symbol).

- [ ] **Step 5: Type-check + commit**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
git commit -m "refactor(kullanici-yonetimi): remove musteri_companies column, dialog, filter, form fields"
```

---

## Wave 5 — Verification

### Task 25: Backend verification

- [ ] **Step 1: Run alembic upgrade/downgrade round-trip**

```bash
cd dtbackend && alembic -c alembic_romiot.ini downgrade base && alembic -c alembic_romiot.ini upgrade head
```

Expected: no errors. Each migration upgrades cleanly from a fresh DB.

- [ ] **Step 2: Full backend smoke** — start the server, walk every modified endpoint with curl:

| Endpoint | Body | Expected |
|----------|------|----------|
| `GET /api/v1/romiot/station/company-integrations/companies` | — | 200, list of strings |
| `POST /api/v1/romiot/station/qr-code/generate-batch` w/ unknown target | `{..., "target_company": "DOES_NOT_EXIST", "pairs":[{"aselsan_order_number":"23Y0021A53","order_item_number":"10"}], ...}` | 400 "Hedef firma bulunamadı" |
| `POST /api/v1/romiot/station/qr-code/generate-batch` w/ valid target | same w/ valid target | 201, response carries `packages[]` |
| `GET /api/v1/romiot/station/qr-code/retrieve/<old_legacy_code>` | — | 200, `data.pairs` synthesized from legacy scalar fields |
| `POST /api/v1/romiot/station/work-orders/` first scan at non-entry (company has ≥1 entry) | — | 400 "İlk tarama bir Giriş Atölyesinde yapılmalıdır." |
| `POST /api/v1/romiot/station/work-orders/` first scan at entry | — | 201 w/ `is_first_scan_for_group=true` |
| `POST /api/v1/romiot/station/work-order-routes/` w/ wrong first station | — | 400 |
| `POST /api/v1/romiot/station/work-order-routes/` valid | — | 201 |
| `POST /api/v1/romiot/station/work-orders/` w/ off-route station (no ack) | — | 400 detail.type=`route_off` |
| `POST /api/v1/romiot/station/work-orders/` same w/ `acknowledged_route_violation: true` | — | 201, row has `route_violation=true` |

Record each curl + status code in a temporary scratch file; attach to the task completion notes per project subagent-driven-development overlay.

- [ ] **Step 3: Search for any remaining musteri_companies plumbing**

```bash
cd dtbackend && grep -rn "musteri_compan" app/ alembic_romiot/ alembic/
```

Expected: 0 hits.

- [ ] **Step 4: Commit a verification log (optional)**

```bash
git add docs/superpowers/reviews/2026-06-02-atolye-multi-feature/task-25-review.md  # per overlay protocol
git commit -m "test: backend verification log for atolye multi-feature"
```

---

### Task 26: Frontend verification

- [ ] **Step 1: Type-check + lint**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json && npm run lint
```

Expected: both exit 0. Fix any errors before proceeding.

- [ ] **Step 2: Dev server smoke**

```bash
cd dtfrontend && npm run dev
```

Visit each page and verify:

| Page | Check |
|------|-------|
| `/<platform>/atolye/musteri` | Typeahead loads, debounces filter, blocks `,-;/\| ` etc. in pair inputs, "Malzeme Ekle" adds rows, print modal renders single-pair OR multi-pair table. |
| `/<platform>/atolye/yonetici` | Create form has Giriş + Çıkış checkboxes; Mevcut Atölyeler shows stacked badges; banner appears when company has zero entry or exit stations. |
| `/<platform>/atolye/operator` | Header shows Giriş badge for entry stations; first scan triggers RoutePickerModal; deviating scan triggers RouteWarningModal with override path. |
| `/<platform>/atolye/is-emirleri` | Collapsed rows show first pair + (+N) when >1; expanded panel renders full pair table; yönetici sees "Rota Düzenle" or "Rota Tanımla"; violation rows show ⚠ badge. |
| `/<platform>/atolye/kullanici-yonetimi` | No more "Hedef Firmalar" column, no firma filter, no bulk-edit dialog. |

- [ ] **Step 3: Final commit**

```bash
git add docs/superpowers/reviews/2026-06-02-atolye-multi-feature/task-26-review.md
git commit -m "test: frontend verification log for atolye multi-feature"
```

---

## Notes for the executing engineer

- **Worktree first.** Per project overlay, create the worktree before dispatching tasks: `git worktree add ../dveri-atolye-multifeat -b atolye/multi-feature-2026-06-02 main`. Each Wave's tasks may run in parallel under that worktree (or sub-worktrees for tasks that touch the same file).
- **Per-task review artifacts** are required under `docs/superpowers/reviews/2026-06-02-atolye-multi-feature/task-<N>-review.md` per project overlay.
- **TDD exemptions** apply to pure-type tasks (T04, T06, T07, T08, T09) and to the Alembic migrations (T01–T03) where the verification step is a DB round-trip rather than a unit test. T10–T15 are integration-oriented; verification via curl is acceptable until pytest infrastructure for the romiot router lands as a follow-up.
- **Dependency-graph reminders**:
  - T05 must wait until T01–T03 are merged because the SQLAlchemy classes reference the migrated table shape.
  - T07 and T08 import from T04.
  - T09 imports nothing from other schemas.
  - T11–T15 import models from T05.
  - T17 depends on T10.
  - T19 depends on the dnd-kit deps installed in its own Step 1.
  - T20 depends on T07, T10, T17.
  - T21 depends on T06, T16.
  - T22 depends on T08, T14, T16, T18, T19.
  - T23 depends on T08, T14, T19.
  - T24 depends on T13.
- **Stop-the-world points**: after T05 and after T14, run the full backend test suite. After T20–T24, run frontend `tsc --noEmit && npm run lint`.

---

## Self-review

Ran the self-review checklist against the spec:

1. **Spec coverage** — every section of the design doc maps to one or more tasks:
   - F1 backend → T10, T11, T13. F1 frontend → T20, T24.
   - F2 → T17, T20.
   - F3 schema + storage → T01, T04, T05, T07, T08. F3 endpoints → T11, T12, T15. F3 frontend → T20, T22, T23.
   - F4 → T02, T05, T06, T16, T21, T22.
   - F5 → T12, T21, T22.
   - F6 schema + endpoints → T03, T05, T09, T14. F6 frontend → T18, T19, T22, T23.
   - Grandfather rule (F6.15) → covered by T12 (route-existence check) and T14/T23 (Rota Tanımla path).
2. **Placeholder scan** — no TBD/TODO markers. The phrase "existing tail" in T12 Step 5 is a directive to copy the unchanged code from the current handler (lines ~270–340 already inspected); the executing engineer reads those lines and pastes them. Mark this as an acceptable concrete-discovery step rather than a placeholder.
3. **Type consistency** — `OrderPair` is the same class across `qr_code.py` schema, `work_order.py` schema, and the frontend interface (`{aselsan_order_number, order_item_number}` field names). `is_first_scan_for_group` field name consistent across backend response and frontend consumer. `acknowledged_route_violation` field name consistent across `WorkOrderCreate`, `WorkOrderUpdateExitDate`, frontend retry calls, and the operator override modal.
4. **Scope check** — bundle is large but every task lands in the same PR / branch per the user's choice (F6.14). Each task self-contained and reverts cleanly.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-02-atolye-multi-feature.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Project's overlay requires this for any multi-task plan: fresh subagent per task, RED→GREEN evidence required in every implementer report, two-stage review (spec compliance + code quality) with review artifacts written to `docs/superpowers/reviews/2026-06-02-atolye-multi-feature/task-<N>-review.md`. Independent waves parallelized per the dependency graph.

**2. Inline Execution** — Single session walks each task sequentially via the `superpowers:executing-plans` skill, with checkpoints at the end of each Wave.

**Which approach?**
