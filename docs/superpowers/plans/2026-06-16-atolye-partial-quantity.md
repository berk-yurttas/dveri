# Atölye Partial Quantity Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Atölye operator scan a package QR and work on a partial quantity (entrance and exit) via a quantity modal that defaults to the remaining amount, with `exited ≤ entered ≤ quantity` enforced server-side.

**Architecture:** Keep one `work_orders` row per `(station, group, package)` and add piece-level counters `entered_quantity` / `exited_quantity`; `exit_date` is stamped only when a package is fully exited, so the existing route/active/delivered machinery is untouched. Each scan also appends to a new `work_order_scans` audit table. The frontend opens a `QuantityModal` after each scan, defaulting to the remaining pieces, and sends a `scan_quantity` with the create/exit calls.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic (`alembic_romiot`), PostgreSQL; Next.js (App Router) + React + TypeScript + Tailwind. Backend tests: stdlib `unittest` run as `python -m unittest <module> -v` (pure helpers, DB mocked). Frontend has no test runner — verify with `npx tsc --noEmit`, `npm run lint`, and manual smoke steps.

**Spec:** `docs/superpowers/specs/2026-06-16-atolye-partial-quantity-design.md`

---

## File Structure

**Backend (`dtbackend/`)**
- `app/models/romiot_models.py` — add `entered_quantity`/`exited_quantity` to `WorkOrder`; add new `WorkOrderScan` model.
- `alembic_romiot/versions/add_partial_quantity_to_work_orders.py` — **new**: columns + backfill + `work_order_scans` table.
- `app/schemas/work_order.py` — `scan_quantity` on create/exit schemas; `entered_quantity`/`exited_quantity` on response schemas; new `PackageStatus`.
- `app/api/v1/endpoints/romiot/station/work_order.py` — pure validation helpers; entrance accumulate; exit accumulate; new `package-status` endpoint.
- `app/services/toy_api_service.py` — `ActualQuantity` reads `exited_quantity`.
- `test_partial_quantity_helper.py` — **new**: unit tests for the pure helpers.

**Frontend (`dtfrontend/`)**
- `src/components/atolye/QuantityModal.tsx` — **new** modal component.
- `src/app/[platform]/atolye/operator/page.tsx` — wire the modal into the scan flow; pause the scanner while open; send `scan_quantity`; display piece counters.

---

## Task 1: Pure validation helpers (backend, TDD)

These are the only non-trivial logic units, so they get real Red-Green-Refactor. They are pure (no DB), matching the repo's existing helper-test convention (`test_track_status_helper.py`).

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` (add functions near the other module-level helpers, e.g. after `_company_for_group_local`, around line 347)
- Test: `dtbackend/test_partial_quantity_helper.py` (create)

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_partial_quantity_helper.py`:

```python
"""Unit tests for the partial-quantity (Kısmi Adet) validation helpers. No DB.

Run with: python -m unittest test_partial_quantity_helper -v
"""
import unittest

from app.api.v1.endpoints.romiot.station.work_order import (
    _entrance_remaining,
    _exit_remaining,
    _check_entrance_scan,
    _check_exit_scan,
)


class RemainingTest(unittest.TestCase):
    def test_entrance_remaining(self):
        self.assertEqual(_entrance_remaining(quantity=10, entered_quantity=4), 6)

    def test_entrance_remaining_never_negative(self):
        self.assertEqual(_entrance_remaining(quantity=10, entered_quantity=12), 0)

    def test_exit_remaining(self):
        self.assertEqual(_exit_remaining(entered_quantity=8, exited_quantity=3), 5)

    def test_exit_remaining_never_negative(self):
        self.assertEqual(_exit_remaining(entered_quantity=8, exited_quantity=9), 0)


class EntranceScanCheckTest(unittest.TestCase):
    def test_ok_within_cap(self):
        self.assertIsNone(_check_entrance_scan(scan_quantity=6, entered_quantity=4, quantity=10))

    def test_ok_exactly_full(self):
        self.assertIsNone(_check_entrance_scan(scan_quantity=10, entered_quantity=0, quantity=10))

    def test_zero_rejected(self):
        self.assertIsNotNone(_check_entrance_scan(scan_quantity=0, entered_quantity=0, quantity=10))

    def test_over_cap_rejected(self):
        msg = _check_entrance_scan(scan_quantity=7, entered_quantity=4, quantity=10)
        self.assertIsNotNone(msg)
        self.assertIn("6", msg)  # remaining is 6


class ExitScanCheckTest(unittest.TestCase):
    def test_ok_within_entered(self):
        self.assertIsNone(_check_exit_scan(scan_quantity=4, entered_quantity=8, exited_quantity=0))

    def test_ok_exactly_entered(self):
        self.assertIsNone(_check_exit_scan(scan_quantity=8, entered_quantity=8, exited_quantity=0))

    def test_zero_rejected(self):
        self.assertIsNotNone(_check_exit_scan(scan_quantity=0, entered_quantity=8, exited_quantity=0))

    def test_exit_exceeds_entered_rejected(self):
        # entered 8, already exited 0, trying 9 -> must fail (the user's rule)
        msg = _check_exit_scan(scan_quantity=9, entered_quantity=8, exited_quantity=0)
        self.assertIsNotNone(msg)

    def test_exit_exceeds_remaining_rejected(self):
        # entered 8, already exited 6, trying 3 -> only 2 left
        self.assertIsNotNone(_check_exit_scan(scan_quantity=3, entered_quantity=8, exited_quantity=6))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_partial_quantity_helper -v`
Expected: FAIL — `ImportError: cannot import name '_entrance_remaining'`.

- [ ] **Step 3: Write minimal implementation**

In `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`, add after `_company_for_group_local` (the helper ending around line 347, just before `@router.post("/", ...)`):

```python
# --- Partial-quantity (Kısmi Adet) helpers -------------------------------------
# Invariant enforced by the endpoints: 0 <= exited_quantity <= entered_quantity
# <= quantity (the package's full piece count).

def _entrance_remaining(quantity: int, entered_quantity: int) -> int:
    """Pieces of this package still allowed to be entered at this station."""
    return max(0, quantity - entered_quantity)


def _exit_remaining(entered_quantity: int, exited_quantity: int) -> int:
    """Pieces entered at this station that have not yet been exited (exit cap)."""
    return max(0, entered_quantity - exited_quantity)


def _check_entrance_scan(scan_quantity: int, entered_quantity: int, quantity: int) -> str | None:
    """Validate one entrance scan. Returns a Turkish error message, or None if OK."""
    if scan_quantity < 1:
        return "Giriş miktarı en az 1 olmalıdır"
    if entered_quantity + scan_quantity > quantity:
        return f"Girilen miktar paket adedini aşamaz (kalan: {_entrance_remaining(quantity, entered_quantity)})"
    return None


def _check_exit_scan(scan_quantity: int, entered_quantity: int, exited_quantity: int) -> str | None:
    """Validate one exit scan. Returns a Turkish error message, or None if OK.

    Enforces exited + scan <= entered (you cannot exit more than was entered)."""
    if scan_quantity < 1:
        return "Çıkış miktarı en az 1 olmalıdır"
    if exited_quantity + scan_quantity > entered_quantity:
        return (
            "Çıkış miktarı giriş miktarını aşamaz "
            f"(girilen: {entered_quantity}, çıkan: {exited_quantity})"
        )
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_partial_quantity_helper -v`
Expected: PASS (all tests OK).

- [ ] **Step 5: Commit**

```bash
git add dtbackend/test_partial_quantity_helper.py dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "feat(atolye): add partial-quantity validation helpers"
```

---

## Task 2: Data model — counters + audit table

Pure ORM type declarations (exempt from TDD). Verified by import.

**Files:**
- Modify: `dtbackend/app/models/romiot_models.py:50-51` (quantity columns) and `:76` (after `exit_date`); add new model after `WorkOrder` (before `class PriorityToken` at line 82).

- [ ] **Step 1: Add the two counter columns to `WorkOrder`**

In `dtbackend/app/models/romiot_models.py`, the current quantity block is:

```python
    # Quantity fields
    quantity = Column(Integer, nullable=False)          # This package's piece count
    total_quantity = Column(Integer, nullable=False)     # Total pieces across all packages
```

Change it to:

```python
    # Quantity fields
    quantity = Column(Integer, nullable=False)          # This package's piece count (cap)
    total_quantity = Column(Integer, nullable=False)     # Total pieces across all packages
    # Partial-quantity tracking (Kısmi Adet): 0 <= exited_quantity <= entered_quantity <= quantity
    entered_quantity = Column(Integer, nullable=False, server_default="0")  # pieces entered at this station
    exited_quantity = Column(Integer, nullable=False, server_default="0")   # pieces exited at this station
```

- [ ] **Step 2: Add the `WorkOrderScan` model**

In the same file, immediately after the `WorkOrder` class (after `station = relationship("Station", back_populates="work_orders")` at line 79, before `class PriorityToken`):

```python
class WorkOrderScan(PostgreSQLBase):
    """Append-only audit log of each partial entrance/exit scan."""
    __tablename__ = "work_order_scans"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    work_order_group_id = Column(String(50), nullable=False, index=True)
    package_index = Column(Integer, nullable=False)
    direction = Column(String(3), nullable=False)  # 'in' (entrance) | 'out' (exit)
    quantity = Column(Integer, nullable=False)     # pieces in this single scan
    user_id = Column(Integer, nullable=False, index=True)
    qr_code = Column(String(20), nullable=True)
    scanned_at = Column(DateTime(timezone=True), server_default=func.now())
```

(No new imports needed — `Column, Integer, String, DateTime, ForeignKey, func` are already imported at the top of the file.)

- [ ] **Step 3: Verify the module imports**

Run: `cd dtbackend && python -c "from app.models.romiot_models import WorkOrder, WorkOrderScan; print(WorkOrder.entered_quantity, WorkOrder.exited_quantity, WorkOrderScan.__tablename__)"`
Expected: prints the two column attributes and `work_order_scans` with no error.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/models/romiot_models.py
git commit -m "feat(atolye): add entered/exited counters and work_order_scans model"
```

---

## Task 3: Alembic migration

Schema migration (config-like; verified by upgrade/downgrade round-trip).

**Files:**
- Create: `dtbackend/alembic_romiot/versions/add_partial_quantity_to_work_orders.py`

- [ ] **Step 1: Create the migration**

The current `alembic_romiot` head is `08be09af3bfd` (`add_companies_and_user_companies`). Confirm before writing:

Run: `cd dtbackend && alembic -c alembic_romiot.ini heads`
Expected: prints `08be09af3bfd (head)`. If it prints a different id, use that id as `down_revision` below.

Create `dtbackend/alembic_romiot/versions/add_partial_quantity_to_work_orders.py`:

```python
"""add entered/exited quantity to work_orders + work_order_scans table

Revision ID: 1a2b3c4d5e6f
Revises: 08be09af3bfd
Create Date: 2026-06-16 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1a2b3c4d5e6f'
down_revision = '08be09af3bfd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Piece-level counters on work_orders
    op.add_column('work_orders', sa.Column('entered_quantity', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('work_orders', sa.Column('exited_quantity', sa.Integer(), nullable=False, server_default='0'))
    # Backfill so historical rows read as whole-package
    op.execute("UPDATE work_orders SET entered_quantity = quantity")
    op.execute("UPDATE work_orders SET exited_quantity = quantity WHERE exit_date IS NOT NULL")

    # Append-only per-scan audit log
    op.create_table(
        'work_order_scans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('station_id', sa.Integer(), nullable=False),
        sa.Column('work_order_group_id', sa.String(length=50), nullable=False),
        sa.Column('package_index', sa.Integer(), nullable=False),
        sa.Column('direction', sa.String(length=3), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('qr_code', sa.String(length=20), nullable=True),
        sa.Column('scanned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_work_order_scans_id'), 'work_order_scans', ['id'], unique=False)
    op.create_index(op.f('ix_work_order_scans_work_order_group_id'), 'work_order_scans', ['work_order_group_id'], unique=False)
    op.create_index(op.f('ix_work_order_scans_user_id'), 'work_order_scans', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_work_order_scans_user_id'), table_name='work_order_scans')
    op.drop_index(op.f('ix_work_order_scans_work_order_group_id'), table_name='work_order_scans')
    op.drop_index(op.f('ix_work_order_scans_id'), table_name='work_order_scans')
    op.drop_table('work_order_scans')
    op.drop_column('work_orders', 'exited_quantity')
    op.drop_column('work_orders', 'entered_quantity')
```

- [ ] **Step 2: Apply the migration**

Run: `cd dtbackend && alembic -c alembic_romiot.ini upgrade head`
Expected: applies `1a2b3c4d5e6f`; no error.

- [ ] **Step 3: Verify round-trip (down then up)**

Run: `cd dtbackend && alembic -c alembic_romiot.ini downgrade -1 && alembic -c alembic_romiot.ini upgrade head`
Expected: both succeed with no error (table/columns dropped then recreated).

- [ ] **Step 4: Commit**

```bash
git add dtbackend/alembic_romiot/versions/add_partial_quantity_to_work_orders.py
git commit -m "feat(atolye): migration for partial-quantity counters and scan log"
```

---

## Task 4: Schemas

Pydantic type declarations (exempt from TDD). Verified by import.

**Files:**
- Modify: `dtbackend/app/schemas/work_order.py`

- [ ] **Step 1: Add `scan_quantity` to the create schema**

Current (`work_order.py:34-39`):

```python
class WorkOrderCreate(WorkOrderBase):
    """Schema for creating a work order (one package at one station)"""
    acknowledged_route_violation: bool = Field(
        False,
        description="If True, the operator has acknowledged a route warning and the row is committed with route_violation=True",
    )
```

Change to:

```python
class WorkOrderCreate(WorkOrderBase):
    """Schema for creating a work order (one package at one station)"""
    scan_quantity: int = Field(..., ge=1, description="Bu taramada girilen parça sayısı (kısmi)")
    acknowledged_route_violation: bool = Field(
        False,
        description="If True, the operator has acknowledged a route warning and the row is committed with route_violation=True",
    )
```

- [ ] **Step 2: Add `scan_quantity` to the exit schema**

Current (`work_order.py:42-50`):

```python
class WorkOrderUpdateExitDate(BaseModel):
    """Schema for updating exit_date for a specific package"""
    station_id: int = Field(..., description="Station ID")
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    package_index: int = Field(..., description="Paket sırası (1-based)")
    acknowledged_route_violation: bool = Field(
        False,
        description="If True, the operator has acknowledged a route warning",
    )
```

Change to:

```python
class WorkOrderUpdateExitDate(BaseModel):
    """Schema for updating exit_date for a specific package"""
    station_id: int = Field(..., description="Station ID")
    work_order_group_id: str = Field(..., description="İş Emri Grup ID")
    package_index: int = Field(..., description="Paket sırası (1-based)")
    scan_quantity: int = Field(..., ge=1, description="Bu taramada çıkışı yapılan parça sayısı (kısmi)")
    acknowledged_route_violation: bool = Field(
        False,
        description="If True, the operator has acknowledged a route warning",
    )
```

- [ ] **Step 3: Expose counters on response schemas**

In `class WorkOrder(WorkOrderBase)` (`work_order.py:53-63`), after `route_violation: bool = False` add:

```python
    entered_quantity: int = 0
    exited_quantity: int = 0
```

In `class WorkOrderList(BaseModel)` after `quantity: int` (`work_order.py:99`) add:

```python
    entered_quantity: int = 0
    exited_quantity: int = 0
```

In `class WorkOrderDetail(BaseModel)` after `quantity: int` (`work_order.py:136`) add:

```python
    entered_quantity: int = 0
    exited_quantity: int = 0
```

- [ ] **Step 4: Add the `PackageStatus` schema**

After `class WorkOrderExitResponse(BaseModel)` (ends at `work_order.py:82`), add:

```python
class PackageStatus(BaseModel):
    """Current piece-level progress for one package at one station (for the modal)."""
    exists: bool = Field(..., description="Bu paket için bu atölyede satır var mı")
    entered_quantity: int = Field(..., description="Girilen parça")
    exited_quantity: int = Field(..., description="Çıkan parça")
```

- [ ] **Step 5: Verify imports**

Run: `cd dtbackend && python -c "from app.schemas.work_order import WorkOrderCreate, WorkOrderUpdateExitDate, PackageStatus, WorkOrder; print(WorkOrderCreate.model_fields['scan_quantity'], PackageStatus.model_fields.keys())"`
Expected: prints the field info and `dict_keys(['exists', 'entered_quantity', 'exited_quantity'])` with no error.

- [ ] **Step 6: Commit**

```bash
git add dtbackend/app/schemas/work_order.py
git commit -m "feat(atolye): schemas for scan_quantity, counters, and PackageStatus"
```

---

## Task 5: Entrance endpoint — accumulate entered pieces + audit

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — imports, `create_work_order`.

Depends on Tasks 1, 2, 4.

- [ ] **Step 1: Import the new model and schema**

Current import block (`work_order.py:17-43`) imports from `app.models.romiot_models` and `app.schemas.work_order`. Add `WorkOrderScan` to the models import list and `PackageStatus` to the schema import list.

Models import — change:

```python
from app.models.romiot_models import (
    Company,
    CompanyIntegration,
    PriorityToken,
    QRCodeData,
    Station,
    WorkOrder,
    WorkOrderPair,
    WorkOrderRoute,
)
```

to add `WorkOrderScan`:

```python
from app.models.romiot_models import (
    Company,
    CompanyIntegration,
    PriorityToken,
    QRCodeData,
    Station,
    WorkOrder,
    WorkOrderPair,
    WorkOrderRoute,
    WorkOrderScan,
)
```

Schema import — change the `from app.schemas.work_order import (...)` block to add `PackageStatus`:

```python
from app.schemas.work_order import (
    WorkOrder as WorkOrderSchema,
    WorkOrderCreate,
    WorkOrderCreateResponse,
    WorkOrderDetail,
    WorkOrderExitResponse,
    WorkOrderList,
    WorkOrderStatus,
    WorkOrderUpdateExitDate,
    PaginatedWorkOrderResponse,
    TrackResponse,
    TrackMatch,
    PackageStatus,
)
```

- [ ] **Step 2: Replace the duplicate-package guard with an existing-row lookup**

Current (`work_order.py:369-383`):

```python
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
```

Replace with (keep the row instead of rejecting; validate the entrance scan against the cap):

```python
    # Existing-row lookup (partial-quantity): a package may be re-scanned to enter
    # more pieces, up to its full quantity. No longer a hard duplicate error.
    existing_result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.station_id == work_order_data.station_id,
                WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrder.package_index == work_order_data.package_index,
            )
        )
    )
    existing_wo = existing_result.scalar_one_or_none()

    already_entered = existing_wo.entered_quantity if existing_wo else 0
    entrance_error = _check_entrance_scan(
        work_order_data.scan_quantity, already_entered, work_order_data.quantity
    )
    if entrance_error:
        raise HTTPException(status_code=400, detail=entrance_error)
```

- [ ] **Step 3: Branch the row write into create-or-accumulate**

Current row-creation block (`work_order.py:524-553`):

```python
    # Create WorkOrder row. Legacy scalar columns mirror pairs[0] for back-compat.
    first_pair = work_order_data.pairs[0]
    new_work_order = WorkOrder(
        station_id=work_order_data.station_id,
        user_id=pg_user_id,
        work_order_group_id=work_order_data.work_order_group_id,
        main_customer=work_order_data.main_customer,
        sector=work_order_data.sector,
        company_from=work_order_data.company_from,
        company_from_id=company_from_id,
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
```

Replace with (accumulate onto the existing row, or create a new one with the partial amount; then append the audit row):

```python
    # Create-or-accumulate the package row.
    if existing_wo is not None:
        existing_wo.entered_quantity = existing_wo.entered_quantity + work_order_data.scan_quantity
        if work_order_data.acknowledged_route_violation:
            existing_wo.route_violation = True
        new_work_order = existing_wo
    else:
        # Legacy scalar columns mirror pairs[0] for back-compat.
        first_pair = work_order_data.pairs[0]
        new_work_order = WorkOrder(
            station_id=work_order_data.station_id,
            user_id=pg_user_id,
            work_order_group_id=work_order_data.work_order_group_id,
            main_customer=work_order_data.main_customer,
            sector=work_order_data.sector,
            company_from=work_order_data.company_from,
            company_from_id=company_from_id,
            teklif_number=work_order_data.teklif_number,
            aselsan_order_number=first_pair.aselsan_order_number,
            order_item_number=first_pair.order_item_number,
            part_number=work_order_data.part_number,
            revision_number=work_order_data.revision_number,
            quantity=work_order_data.quantity,
            total_quantity=work_order_data.total_quantity,
            entered_quantity=work_order_data.scan_quantity,
            exited_quantity=0,
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

    # Append-only audit row for this scan
    romiot_db.add(WorkOrderScan(
        station_id=work_order_data.station_id,
        work_order_group_id=work_order_data.work_order_group_id,
        package_index=work_order_data.package_index,
        direction="in",
        quantity=work_order_data.scan_quantity,
        user_id=pg_user_id,
        qr_code=work_order_data.qr_code,
    ))

    await romiot_db.commit()
    await romiot_db.refresh(new_work_order)
```

(Note: the `# Persist pairs once per group` block at `work_order.py:499-513` runs before this and remains as-is — it is idempotent, so re-scans are harmless.)

- [ ] **Step 4: Verify import + a focused manual check**

Run: `cd dtbackend && python -c "import app.api.v1.endpoints.romiot.station.work_order as m; print('ok')"`
Expected: prints `ok` (module imports, no syntax/name errors).

Manual API check (with the dev server running and an operator session — see Task 11 smoke steps): scan a 10-piece package in Giriş with `scan_quantity=6`, then again with `scan_quantity=4`; the second succeeds and the package shows `entered_quantity=10`. A third `scan_quantity=1` returns 400 "Girilen miktar paket adedini aşamaz (kalan: 0)". Two `work_order_scans` rows exist with `direction='in'`.

- [ ] **Step 5: Run the helper tests (regression) and commit**

Run: `cd dtbackend && python -m unittest test_partial_quantity_helper -v`
Expected: PASS.

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "feat(atolye): accumulate entered pieces on entrance scan + audit"
```

---

## Task 6: Exit endpoint — accumulate exited pieces + audit

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — `update_exit_date`.

Depends on Tasks 1, 2, 4. (Imports added in Task 5.)

- [ ] **Step 1: Add the postgres-user dependency for audit attribution**

Current signature (`work_order.py:606-611`):

```python
@router.post("/update-exit-date", response_model=WorkOrderExitResponse)
async def update_exit_date(
    update_data: WorkOrderUpdateExitDate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
```

Change to add a postgres session (used to resolve the operator's user id):

```python
@router.post("/update-exit-date", response_model=WorkOrderExitResponse)
async def update_exit_date(
    update_data: WorkOrderUpdateExitDate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db),
):
```

- [ ] **Step 2: Replace the "already exited" guard with a partial-exit cap check**

Current (`work_order.py:640-644`):

```python
    if work_order.exit_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bu paket (Paket {update_data.package_index}/{work_order.total_packages}) ile çıkış işlemi yapılmıştır"
        )
```

Replace with (block only a *fully* exited package; otherwise validate the partial exit against entered):

```python
    if work_order.exit_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bu paket (Paket {update_data.package_index}/{work_order.total_packages}) tamamen çıkış yapılmıştır"
        )

    exit_error = _check_exit_scan(
        update_data.scan_quantity, work_order.entered_quantity, work_order.exited_quantity
    )
    if exit_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exit_error)
```

- [ ] **Step 3: Accumulate exited pieces; stamp exit_date only at full exit; append audit**

Current (`work_order.py:685-690`):

```python
    # Update exit_date with current datetime (timezone-aware)
    work_order.exit_date = datetime.now(timezone.utc)
    if update_data.acknowledged_route_violation:
        work_order.route_violation = True
    await romiot_db.commit()
    await romiot_db.refresh(work_order)
```

Replace with:

```python
    # Accumulate exited pieces; the package is "fully exited" (exit_date stamped)
    # only when exited_quantity reaches the package's full quantity.
    work_order.exited_quantity = work_order.exited_quantity + update_data.scan_quantity
    if work_order.exited_quantity >= work_order.quantity:
        work_order.exit_date = datetime.now(timezone.utc)
    if update_data.acknowledged_route_violation:
        work_order.route_violation = True

    # Resolve the operator's postgres user id for the audit row
    pg_user = await UserService.get_user_by_username(postgres_db, current_user.username)
    if not pg_user:
        pg_user = await UserService.create_user(postgres_db, current_user.username)
    romiot_db.add(WorkOrderScan(
        station_id=update_data.station_id,
        work_order_group_id=update_data.work_order_group_id,
        package_index=update_data.package_index,
        direction="out",
        quantity=update_data.scan_quantity,
        user_id=pg_user.id,
    ))

    await romiot_db.commit()
    await romiot_db.refresh(work_order)
```

(`UserService` is already imported at `work_order.py:30`; `get_postgres_db` at `work_order.py:15`.)

- [ ] **Step 4: Verify import + manual check**

Run: `cd dtbackend && python -c "import app.api.v1.endpoints.romiot.station.work_order as m; print('ok')"`
Expected: prints `ok`.

Manual API check: for a package with `entered_quantity=8, exited_quantity=0`, an exit with `scan_quantity=9` returns 400 "Çıkış miktarı giriş miktarını aşamaz (girilen: 8, çıkan: 0)". An exit with `scan_quantity=8` succeeds, sets `exited_quantity=8`; since the package's `quantity` is 10 and only 8 entered, `exit_date` stays NULL until the rest is entered+exited. A `work_order_scans` row with `direction='out'` exists.

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "feat(atolye): accumulate exited pieces on exit scan + audit"
```

---

## Task 7: `package-status` endpoint

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — add a GET route.

Depends on Tasks 2, 4.

- [ ] **Step 1: Add the endpoint**

Add immediately after the `update_exit_date` function (before `@router.get("/list/{station_id}", ...)` at `work_order.py:788`):

```python
@router.get("/package-status", response_model=PackageStatus)
async def get_package_status(
    station_id: int = Query(..., description="Station ID"),
    work_order_group_id: str = Query(..., description="İş Emri Grup ID"),
    package_index: int = Query(..., description="Paket sırası (1-based)"),
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Current piece-level progress for one package at one station — used by the
    operator's quantity modal to default to the remaining amount."""
    await check_station_operator_role(station_id, current_user, romiot_db)
    result = await romiot_db.execute(
        select(WorkOrder).where(
            and_(
                WorkOrder.station_id == station_id,
                WorkOrder.work_order_group_id == work_order_group_id,
                WorkOrder.package_index == package_index,
            )
        )
    )
    wo = result.scalar_one_or_none()
    if wo is None:
        return PackageStatus(exists=False, entered_quantity=0, exited_quantity=0)
    return PackageStatus(
        exists=True,
        entered_quantity=wo.entered_quantity,
        exited_quantity=wo.exited_quantity,
    )
```

(`Query`, `check_authenticated`, `and_`, `select` are already imported.)

- [ ] **Step 2: Verify import + route registration**

Run: `cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.work_order import router; print([r.path for r in router.routes if 'package-status' in r.path])"`
Expected: prints `['/package-status']`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "feat(atolye): add package-status endpoint for the quantity modal"
```

---

## Task 8: Mekasan push reflects exited pieces

**Files:**
- Modify: `dtbackend/app/services/toy_api_service.py:37`

Depends on Task 2.

- [ ] **Step 1: Use `exited_quantity` for `ActualQuantity`**

Current (`toy_api_service.py:35-37`):

```python
        "PlannedQuantity": work_order.quantity,
        "WorkOrderAmount": work_order.total_quantity,
        "ActualQuantity": work_order.quantity if work_order.exit_date else 0,
```

Change to:

```python
        "PlannedQuantity": work_order.quantity,
        "WorkOrderAmount": work_order.total_quantity,
        "ActualQuantity": work_order.exited_quantity,
```

- [ ] **Step 2: Verify import**

Run: `cd dtbackend && python -c "import app.services.toy_api_service as m; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/services/toy_api_service.py
git commit -m "feat(atolye): Mekasan ActualQuantity tracks exited pieces"
```

---

## Task 9: `QuantityModal` component (frontend)

No frontend test runner exists in this repo — verify with `npx tsc --noEmit` and `npm run lint`; behavior is smoke-tested in Task 11.

**Files:**
- Create: `dtfrontend/src/components/atolye/QuantityModal.tsx`

- [ ] **Step 1: Create the component**

Create `dtfrontend/src/components/atolye/QuantityModal.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface QuantityModalProps {
  open: boolean;
  mode: "entrance" | "exit";
  partNumber: string;
  packageIndex: number;
  totalPackages: number;
  quantity: number;          // package full piece count (cap)
  enteredQuantity: number;   // pieces already entered at this station
  exitedQuantity: number;    // pieces already exited at this station
  loading?: boolean;
  onConfirm: (scanQuantity: number) => void;
  onCancel: () => void;
}

export function QuantityModal({
  open,
  mode,
  partNumber,
  packageIndex,
  totalPackages,
  quantity,
  enteredQuantity,
  exitedQuantity,
  loading,
  onConfirm,
  onCancel,
}: QuantityModalProps) {
  const isEntrance = mode === "entrance";
  const remaining = isEntrance
    ? Math.max(0, quantity - enteredQuantity)
    : Math.max(0, enteredQuantity - exitedQuantity);

  const [value, setValue] = useState<number>(remaining);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Reset to the remaining default each time the modal opens or the cap changes,
  // and focus Confirm so the whole-package case is one Enter/click.
  useEffect(() => {
    if (open) {
      setValue(remaining);
      // focus after paint
      const id = window.setTimeout(() => confirmRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open, remaining]);

  if (!open || typeof document === "undefined") return null;

  const accent = isEntrance ? "#0f4c3a" : "#C53030";
  const clamp = (n: number) => Math.max(1, Math.min(remaining, Math.floor(n) || 1));
  const valid = value >= 1 && value <= remaining && remaining > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200" style={{ borderTop: `4px solid ${accent}` }}>
          <h3 className="text-lg font-bold text-gray-900">
            {isEntrance ? "Giriş Adedi" : "Çıkış Adedi"}
          </h3>
          <p className="text-sm text-gray-600 mt-0.5">
            {partNumber} — Paket {packageIndex}/{totalPackages}
          </p>
        </div>

        <div className="p-6">
          <div className="mb-4 text-sm text-gray-700">
            {isEntrance ? (
              <span>Girilen: <span className="font-semibold">{enteredQuantity}</span> / {quantity}</span>
            ) : (
              <span>
                Girilen: <span className="font-semibold">{enteredQuantity}</span> · Çıkan:{" "}
                <span className="font-semibold">{exitedQuantity}</span>
              </span>
            )}
            <span className="ml-2 text-gray-500">(Kalan: {remaining})</span>
          </div>

          <label htmlFor="qty-input" className="block text-sm font-medium text-gray-700 mb-2">
            {isEntrance ? "Bu taramada girilecek adet" : "Bu taramada çıkış yapılacak adet"}
          </label>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              aria-label="Azalt"
              onClick={() => setValue((v) => clamp(v - 1))}
              disabled={loading || remaining === 0 || value <= 1}
              className="w-12 h-12 flex items-center justify-center rounded-lg border border-gray-300 text-2xl font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
            >
              −
            </button>
            <input
              id="qty-input"
              type="number"
              min={1}
              max={remaining}
              value={value}
              disabled={loading || remaining === 0}
              onChange={(e) => setValue(clamp(Number(e.target.value)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !loading) onConfirm(value);
              }}
              className="flex-1 h-12 text-center text-2xl font-bold border border-gray-300 rounded-lg"
            />
            <button
              type="button"
              aria-label="Artır"
              onClick={() => setValue((v) => clamp(v + 1))}
              disabled={loading || remaining === 0 || value >= remaining}
              className="w-12 h-12 flex items-center justify-center rounded-lg border border-gray-300 text-2xl font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setValue(remaining)}
              disabled={loading || remaining === 0}
              className="px-3 h-12 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
            >
              Tümü
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            İptal
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onConfirm(value)}
            disabled={loading || !valid}
            className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 cursor-pointer"
            style={{ backgroundColor: accent }}
          >
            {loading ? "İşleniyor..." : "Onayla"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd dtfrontend && npx tsc --noEmit && npm run lint`
Expected: no type errors; lint passes (or only pre-existing warnings unrelated to this file).

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/components/atolye/QuantityModal.tsx
git commit -m "feat(atolye): QuantityModal component for partial scan"
```

---

## Task 10: Wire the modal into the operator scan flow

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/operator/page.tsx`

Depends on Tasks 4, 5, 6, 7, 9.

- [ ] **Step 1: Import the modal and add a PackageStatus type**

At the top of `operator/page.tsx`, after the existing imports (`import QRCodeSVG from "react-qr-code";` at line 11), add:

```tsx
import { QuantityModal } from "@/components/atolye/QuantityModal";
```

After the `QRCodeData` interface (ends at line 34), add:

```tsx
interface PackageStatus {
  exists: boolean;
  entered_quantity: number;
  exited_quantity: number;
}
```

- [ ] **Step 2: Change the map helpers to carry `scan_quantity`**

Current `mapQRCodeToApi` returns an object ending with (`page.tsx:189-206`):

```tsx
  return {
    station_id: stationId,
    work_order_group_id: String(workOrderGroupId).trim(),
    main_customer: String(mainCustomer).trim(),
    sector: String(sector).trim(),
    company_from: String(companyFrom).trim(),
    teklif_number: String(teklifNumber ?? "").trim(),
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
};
```

Change the signature `const mapQRCodeToApi = (qrCodeData: any, stationId: number): any => {` (line 145) to:

```tsx
const mapQRCodeToApi = (qrCodeData: any, stationId: number, scanQuantity: number): any => {
```

and add `scan_quantity: scanQuantity,` to the returned object (right after `target_date: targetDate || null,`):

```tsx
    target_date: targetDate || null,
    scan_quantity: scanQuantity,
  };
};
```

Current `mapQRCodeToExitApi` (line 210) signature and body:

```tsx
const mapQRCodeToExitApi = (qrCodeData: any, stationId: number): any => {
  ...
  return {
    station_id: stationId,
    work_order_group_id: String(workOrderGroupId).trim(),
    package_index: typeof packageIndex === "number" ? packageIndex : Number(packageIndex),
  };
};
```

Change the signature to `const mapQRCodeToExitApi = (qrCodeData: any, stationId: number, scanQuantity: number): any => {` and add `scan_quantity` to the return:

```tsx
  return {
    station_id: stationId,
    work_order_group_id: String(workOrderGroupId).trim(),
    package_index: typeof packageIndex === "number" ? packageIndex : Number(packageIndex),
    scan_quantity: scanQuantity,
  };
};
```

- [ ] **Step 3: Add modal state and a scanner-pause ref**

After the `scanProgress` state declaration (`page.tsx:254-260`), add:

```tsx
  // Quantity modal (partial scan). Holds the resolved QR + current package counters.
  const [quantityModal, setQuantityModal] = useState<{
    mode: "entrance" | "exit";
    parsedData: QRCodeData;
    entered: number;
    exited: number;
  } | null>(null);
  const [quantityModalLoading, setQuantityModalLoading] = useState(false);
  // Ref mirror of "is a quantity modal open" so the global scanner handler can
  // bail out without being re-created on every modal toggle.
  const quantityModalOpenRef = useRef(false);
  useEffect(() => {
    quantityModalOpenRef.current = quantityModal !== null;
  }, [quantityModal]);
```

- [ ] **Step 4: Pause the scanner key-capture while the modal is open**

In the scanner `handleKeyPress` effect, the current guard at the top is (`page.tsx:643-647`):

```tsx
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
```

Change it to also bail while the quantity modal is open:

```tsx
    const handleKeyPress = (e: KeyboardEvent) => {
      // While the quantity modal is open, let keystrokes reach its input and
      // don't let a stray scanner Enter re-fire a scan.
      if (quantityModalOpenRef.current) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
```

- [ ] **Step 5: Make `handleQRCodeScan` open the modal instead of posting directly**

The current `handleQRCodeScan` (lines 404-612) retrieves the QR then immediately posts for entrance/exit. Replace the body **from the line after the QR is resolved** through the end of the exit branch. Concretely, the current code from `page.tsx:452` (`if (mode === "entrance") {`) down to `page.tsx:543` (the closing `}` of the `else if (mode === "exit")` block) is replaced by a single block that fetches package-status and opens the modal:

Current:

```tsx
        if (mode === "entrance") {
          let payload;
          try {
            payload = mapQRCodeToApi(parsedData, stationId);
          } catch (mappingError: any) {
            ...
          }
          ... (entrance POST, scanProgress, route picker) ...
        } else if (mode === "exit") {
          let payload;
          try {
            payload = mapQRCodeToExitApi(parsedData, stationId);
          } catch (mappingError: any) {
            ...
          }
          ... (exit POST, scanProgress) ...
        }
```

Replace that entire `if (mode === "entrance") { ... } else if (mode === "exit") { ... }` region with:

```tsx
        if (mode === "entrance" || mode === "exit") {
          // Fetch current per-package progress, then open the quantity modal.
          const packageIndex = parsedData.package_index;
          let status: PackageStatus;
          try {
            status = await api.get<PackageStatus>(
              `/romiot/station/work-orders/package-status?station_id=${stationId}` +
                `&work_order_group_id=${encodeURIComponent(parsedData.work_order_group_id)}` +
                `&package_index=${packageIndex}`,
              undefined,
              { useCache: false }
            );
          } catch (statusError: any) {
            setError(statusError?.message || "Paket durumu alınamadı");
            return;
          }

          const cap = Number(parsedData.quantity) || 0;
          const remaining =
            mode === "entrance"
              ? Math.max(0, cap - status.entered_quantity)
              : Math.max(0, status.entered_quantity - status.exited_quantity);

          if (remaining === 0) {
            setError(
              mode === "entrance"
                ? `Bu paket tamamen girildi (Paket ${packageIndex})`
                : `Çıkışı yapılacak parça yok (Paket ${packageIndex})`
            );
            setQRCodeInput("");
            return;
          }

          setQuantityModal({
            mode,
            parsedData,
            entered: status.entered_quantity,
            exited: status.exited_quantity,
          });
          setQRCodeInput("");
        }
```

(The QR-retrieval code above this region — the `try { ... } catch (decodeError) { ... }` that sets `parsedData` and `lastScannedPartNumber` — stays unchanged.)

- [ ] **Step 6: Add the scan-submit handler (runs on modal confirm)**

Add a new callback after `handleQRCodeScan` (after its closing `}, [mode, stationId, fetchWorkOrders]);` at line 612). It performs the actual POST with the chosen `scan_quantity`, reusing the existing route-warning handling:

```tsx
  const handleQuantityConfirm = useCallback(
    async (scanQuantity: number) => {
      if (!quantityModal || !stationId) return;
      const { mode: scanMode, parsedData } = quantityModal;
      setError(null);
      setSuccessMessage(null);
      setQuantityModalLoading(true);
      try {
        if (scanMode === "entrance") {
          let payload;
          try {
            payload = mapQRCodeToApi(parsedData, stationId, scanQuantity);
          } catch (mappingError: any) {
            setError(mappingError.message || "QR kod verisi işlenirken hata oluştu");
            return;
          }
          let response: WorkOrderCreateResponse;
          try {
            response = await api.post<WorkOrderCreateResponse>("/romiot/station/work-orders/", payload);
          } catch (postError: any) {
            const detail = parseDetail(postError);
            if (detail && typeof detail === "object" && (detail.type === "route_off" || detail.type === "route_out_of_order")) {
              setRouteWarning({ message: detail.message, pendingPayload: payload, mode: "entrance" });
              setQuantityModal(null);
              return;
            }
            throw postError;
          }
          setScanProgress({
            groupId: response.work_order.work_order_group_id,
            scanned: response.packages_scanned,
            total: response.total_packages,
            allDone: response.all_scanned,
            message: response.message,
          });
          if (response.all_scanned) {
            setSuccessMessage(response.message);
            setTimeout(() => setScanProgress(null), 5000);
          }
          setQuantityModal(null);
          await fetchWorkOrders();
          if (response.is_first_scan_for_group) {
            setRoutePickerGroupId(response.work_order.work_order_group_id);
            setRoutePickerOpen(true);
            setMode(null);
          }
        } else {
          let payload;
          try {
            payload = mapQRCodeToExitApi(parsedData, stationId, scanQuantity);
          } catch (mappingError: any) {
            setError(mappingError.message || "QR kod verisi işlenirken hata oluştu");
            return;
          }
          let response: WorkOrderExitResponse;
          try {
            response = await api.post<WorkOrderExitResponse>("/romiot/station/work-orders/update-exit-date", payload);
          } catch (postError: any) {
            const detail = parseDetail(postError);
            if (detail && typeof detail === "object" && (detail.type === "route_off" || detail.type === "route_out_of_order")) {
              setRouteWarning({ message: detail.message, pendingPayload: payload, mode: "exit" });
              setQuantityModal(null);
              return;
            }
            throw postError;
          }
          setScanProgress({
            groupId: response.work_order.work_order_group_id,
            scanned: response.packages_exited,
            total: response.total_packages,
            allDone: response.all_exited,
            message: response.message,
          });
          if (response.all_exited) {
            setSuccessMessage(response.message);
            setTimeout(() => setScanProgress(null), 5000);
          }
          setQuantityModal(null);
          await fetchWorkOrders();
        }
      } catch (err: any) {
        const detail = parseDetail(err);
        if (detail && typeof detail === "string") {
          setError(detail);
        } else if (detail && typeof detail === "object" && detail.message) {
          setError(detail.message);
        } else {
          setError(err?.message || "İşlem sırasında bir hata oluştu");
        }
      } finally {
        setQuantityModalLoading(false);
      }
    },
    [quantityModal, stationId, fetchWorkOrders]
  );
```

- [ ] **Step 7: Render the modal**

Just before the closing of the route-warning block at the bottom of the JSX — i.e. right after the `<RouteWarningModal ... />` element (`page.tsx:1511-1566`) and before the final `</div>` at line 1567 — add:

```tsx
      {/* Partial-quantity modal shown after each scan */}
      {quantityModal && (
        <QuantityModal
          open={!!quantityModal}
          mode={quantityModal.mode}
          partNumber={`${quantityModal.parsedData.part_number}${quantityModal.parsedData.revision_number ? "/" + quantityModal.parsedData.revision_number : ""}`}
          packageIndex={quantityModal.parsedData.package_index}
          totalPackages={quantityModal.parsedData.total_packages}
          quantity={Number(quantityModal.parsedData.quantity) || 0}
          enteredQuantity={quantityModal.entered}
          exitedQuantity={quantityModal.exited}
          loading={quantityModalLoading}
          onConfirm={handleQuantityConfirm}
          onCancel={() => setQuantityModal(null)}
        />
      )}
```

- [ ] **Step 8: Typecheck + lint**

Run: `cd dtfrontend && npx tsc --noEmit && npm run lint`
Expected: no type errors; lint passes (pre-existing warnings only).

- [ ] **Step 9: Commit**

```bash
git add "dtfrontend/src/app/[platform]/atolye/operator/page.tsx"
git commit -m "feat(atolye): open quantity modal on scan and submit partial scan_quantity"
```

---

## Task 11: Display piece-level progress + smoke test

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/operator/page.tsx`

Depends on Task 10. (Backend must return the new fields — Task 4.)

- [ ] **Step 1: Add the counter fields to the frontend `WorkOrderDetail` interface**

Current `WorkOrderDetail` interface in `operator/page.tsx` has (around line 83-84):

```tsx
  quantity: number;
  total_quantity: number;
```

Change to:

```tsx
  quantity: number;
  total_quantity: number;
  entered_quantity: number;
  exited_quantity: number;
```

- [ ] **Step 2: Show entered/exited in the expanded "Paket Detayları"**

The current per-package detail line is (`page.tsx:1280-1282`):

```tsx
                                            <span className="w-5 h-5 bg-[#0f4c3a] text-white rounded-full flex items-center justify-center text-xs font-bold">{entry.package_index}</span>
                                            <span className="text-gray-500">Paket {entry.package_index}/{entry.total_packages} ({entry.quantity} parça)</span>
```

Change the second `<span>` to include entered/exited counters:

```tsx
                                            <span className="w-5 h-5 bg-[#0f4c3a] text-white rounded-full flex items-center justify-center text-xs font-bold">{entry.package_index}</span>
                                            <span className="text-gray-500">
                                              Paket {entry.package_index}/{entry.total_packages} — Girilen {entry.entered_quantity}/{entry.quantity}, Çıkan {entry.exited_quantity}/{entry.quantity}
                                            </span>
```

- [ ] **Step 3: Make the scan-progress banner piece-aware**

The scanProgress banner currently shows the backend `message` (`page.tsx:940`), which is package-level. Keep the message but append the affected package's piece progress by reading it from the create/exit response. In `handleQuantityConfirm` (Task 10, Step 6), the entrance branch sets `scanProgress` with `message: response.message`. Change that `message` to include piece detail for entrance:

In the entrance branch, replace:

```tsx
            message: response.message,
```

with:

```tsx
            message: `${response.message} · Paket ${response.work_order.package_index}: girilen ${response.work_order.entered_quantity}/${response.work_order.quantity}`,
```

and in the exit branch, replace its:

```tsx
            message: response.message,
```

with:

```tsx
            message: `${response.message} · Paket ${response.work_order.package_index}: çıkan ${response.work_order.exited_quantity}/${response.work_order.quantity}`,
```

(`WorkOrder` interface in this file already has `quantity`, `package_index`; add the counters to it too — see Step 4.)

- [ ] **Step 4: Add counters to the frontend `WorkOrder` interface**

The local `WorkOrder` interface (`page.tsx:47-64`) has `quantity: number;` and `total_quantity: number;`. Add the counters so `response.work_order.entered_quantity` / `.exited_quantity` typecheck:

```tsx
  quantity: number;
  total_quantity: number;
  entered_quantity: number;
  exited_quantity: number;
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd dtfrontend && npx tsc --noEmit && npm run lint`
Expected: no type errors; lint passes (pre-existing warnings only).

- [ ] **Step 6: Manual end-to-end smoke test**

Start backend (`cd dtbackend && uvicorn app.main:app --reload`) and frontend (`cd dtfrontend && npm run dev`); log in as an `atolye:operator`. Then:
1. Click **İş Emri Giriş**, scan a 10-piece package → modal opens with default **10**. Set **6**, Onayla → table shows package entered 6/10.
2. Scan the same package again → modal opens with default **4** (remaining). Onayla → entered 10/10. Scan again → inline message "Bu paket tamamen girildi".
3. Click **İş Emri Çıkış**, scan the package → modal default **10**. Set **9** → still allowed (≤ entered 10). Try entering **11** → input clamps to 10; Onayla with 9 → exited 9/10, package still in station (exit_date null).
4. Scan again in Çıkış → default **1** (10−9). Onayla → exited 10/10; status flips to "Çıkış yapıldı".
5. Verify the whole-package one-click path: scan a fresh package, modal defaults to full quantity, press **Enter** → completes in one action.
6. Confirm the scanner does not double-fire while the modal is open (scanning again does nothing until you confirm/cancel).

- [ ] **Step 7: Commit**

```bash
git add "dtfrontend/src/app/[platform]/atolye/operator/page.tsx"
git commit -m "feat(atolye): show entered/exited piece counters in operator view"
```

---

## Final verification

- [ ] Backend helper tests pass: `cd dtbackend && python -m unittest test_partial_quantity_helper -v`
- [ ] Existing backend helper tests still pass: `cd dtbackend && python -m unittest test_track_status_helper test_qr_pairs_fallback_helper -v`
- [ ] Frontend typecheck + lint: `cd dtfrontend && npx tsc --noEmit && npm run lint`
- [ ] Migration applied on the target DB: `cd dtbackend && alembic -c alembic_romiot.ini current` shows `1a2b3c4d5e6f`.
- [ ] Manual smoke test (Task 11 Step 6) passes end-to-end.
