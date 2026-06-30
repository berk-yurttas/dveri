# Multi-QR per pair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a work-order form has 2+ `(Sipariş No, Kalem No)` pairs, let the user choose between one combined QR (today's behavior) or a separate, independently-tracked work order group per pair, each with its own quantity and Parti Sayısı.

**Architecture:** Extract the per-group package-building logic out of the existing single-mode `generate-batch` endpoint into shared helpers (`_compute_package_quantities`, `_generate_unique_code`, `_build_group_packages`, `_authorize_batch_creation`). The existing endpoint is rewired to call them with byte-for-byte identical behavior. A new `generate-batch-multi` endpoint reuses the same helpers in a loop, one group per pair, atomically. The frontend gains a `qrMode` toggle (shown only for 2+ pairs), per-pair quantity/parti inputs, and a per-pair grouped result/print view.

**Tech Stack:** Backend — FastAPI, SQLAlchemy async, Pydantic v2; tests via `unittest` with `unittest.mock.AsyncMock` (no live DB). Frontend — Next.js (App Router) + React + Tailwind; verification via `next lint` + `next build` + manual browser check (no JS test runner in this repo).

---

## Spec reference

`docs/superpowers/specs/2026-06-30-multi-qr-per-pair-design.md`

## File structure

- `dtbackend/app/schemas/qr_code.py` — add `MultiQRPairItem`, `QRCodeMultiBatchCreate`, `QRCodeMultiGroupResult`, `QRCodeMultiBatchResponse`.
- `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` — add helpers; rewire `generate_qr_code_batch`; add `generate_qr_code_batch_multi`.
- `dtbackend/test_qr_batch_helpers.py` — NEW unittest file for the extracted helpers.
- `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx` — toggle, per-pair inputs, per-mode submit, grouped results/print.

---

### Task 1: Pure helper — `_compute_package_quantities`

Extract the package-quantity split (currently inline at `qr_code.py:219-221,242`) into a pure, DB-free function so both endpoints share it and it can be unit-tested.

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`
- Test: `dtbackend/test_qr_batch_helpers.py` (create)

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_qr_batch_helpers.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers -v`
Expected: FAIL — `ImportError: cannot import name '_compute_package_quantities'`.

- [ ] **Step 3: Write minimal implementation**

In `qr_code.py`, after `generate_work_order_group_id` (around line 97), add:

```python
def _compute_package_quantities(total_quantity: int, total_packages: int) -> list[int]:
    """Split `total_quantity` across `total_packages` packages, giving the
    remainder to the earliest packages. e.g. (10, 3) -> [4, 3, 3]. Pure: no DB.
    Single-mode and multi-mode share this so package math can't drift."""
    base_qty = total_quantity // total_packages
    remainder = total_quantity % total_packages
    return [base_qty + (1 if i <= remainder else 0) for i in range(1, total_packages + 1)]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/test_qr_batch_helpers.py
git commit -m "refactor(qr): extract _compute_package_quantities helper"
```

---

### Task 2: Async helper — `_generate_unique_code`

Extract the 5-retry unique short-code loop (currently inline at `qr_code.py:263-279`).

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`
- Test: `dtbackend/test_qr_batch_helpers.py`

- [ ] **Step 1: Write the failing test**

Append to `test_qr_batch_helpers.py` (add imports `_generate_unique_code` to the existing import block):

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers.GenerateUniqueCodeTest -v`
Expected: FAIL — `ImportError: cannot import name '_generate_unique_code'`.

- [ ] **Step 3: Write minimal implementation**

In `qr_code.py`, after `_compute_package_quantities`, add:

```python
async def _generate_unique_code(romiot_db: AsyncSession, retries: int = 5) -> str | None:
    """A 12-char short code not currently present in qr_code_data, or None after
    `retries` collisions. Shared by both batch endpoints."""
    for _ in range(retries):
        candidate = generate_short_code(12)
        existing = await romiot_db.execute(
            select(QRCodeData).where(QRCodeData.code == candidate)
        )
        if not existing.scalar_one_or_none():
            return candidate
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers.GenerateUniqueCodeTest -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/test_qr_batch_helpers.py
git commit -m "refactor(qr): extract _generate_unique_code helper"
```

---

### Task 3: Async helper — `_build_group_packages`

Extract per-group package creation: persist `WorkOrderPair` rows, build per-package payload, generate codes, add `QRCodeData` records, return `QRCodePackageInfo` list. This is the shared core both endpoints call.

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`
- Test: `dtbackend/test_qr_batch_helpers.py`

- [ ] **Step 1: Write the failing test**

Append to `test_qr_batch_helpers.py` (add `_build_group_packages` to imports; also `import json` and `from fastapi import HTTPException` at top):

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers.BuildGroupPackagesTest -v`
Expected: FAIL — `ImportError: cannot import name '_build_group_packages'`.

- [ ] **Step 3: Write minimal implementation**

In `qr_code.py`, after `_generate_unique_code`, add:

```python
async def _build_group_packages(
    romiot_db: AsyncSession,
    *,
    work_order_group_id: str,
    pairs: list[dict],
    payload_base: dict,
    total_quantity: int,
    total_packages: int,
    target_company: str,
    expires_at,
) -> list[QRCodePackageInfo]:
    """Create one work order group: persist its pair rows and one QRCodeData
    record per package. `payload_base` carries the shared header fields
    (main_customer, sector, company_from[/_id], teklif_number, part_number,
    revision_number, target_date). Returns the package list. Raises
    HTTPException(500) if a unique code can't be generated — callers roll back.
    Does NOT commit."""
    for idx, p in enumerate(pairs):
        romiot_db.add(
            WorkOrderPair(
                work_order_group_id=work_order_group_id,
                idx=idx,
                aselsan_order_number=p["aselsan_order_number"],
                order_item_number=p["order_item_number"],
            )
        )

    quantities = _compute_package_quantities(total_quantity, total_packages)
    packages: list[QRCodePackageInfo] = []
    for i, pkg_qty in enumerate(quantities, start=1):
        qr_data = {
            **payload_base,
            "work_order_group_id": work_order_group_id,
            "pairs": pairs,
            "quantity": pkg_qty,
            "total_quantity": total_quantity,
            "package_index": i,
            "total_packages": total_packages,
        }
        code = await _generate_unique_code(romiot_db)
        if not code:
            raise HTTPException(
                status_code=500,
                detail=f"QR kod oluşturulamadı (paket {i}). Lütfen tekrar deneyin.",
            )
        romiot_db.add(QRCodeData(
            code=code,
            data=json.dumps(qr_data),
            company=target_company,
            expires_at=expires_at,
        ))
        packages.append(QRCodePackageInfo(code=code, package_index=i, quantity=pkg_qty))
    return packages
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers.BuildGroupPackagesTest -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/test_qr_batch_helpers.py
git commit -m "refactor(qr): extract _build_group_packages helper"
```

---

### Task 4: Async helper — `_authorize_batch_creation`

Extract the shared auth/role/target validation used by both batch endpoints (currently inline at `qr_code.py:178-208`).

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`
- Test: `dtbackend/test_qr_batch_helpers.py`

- [ ] **Step 1: Write the failing test**

Append to `test_qr_batch_helpers.py`. NOTE: `_authorize_batch_creation` calls `require_user_company`; the test patches it. Add at top: `from unittest.mock import patch` and `from types import SimpleNamespace`.

```python
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
```

Add `_authorize_batch_creation` to the imports block.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers.AuthorizeBatchCreationTest -v`
Expected: FAIL — `ImportError: cannot import name '_authorize_batch_creation'`.

- [ ] **Step 3: Write minimal implementation**

In `qr_code.py`, after `_build_group_packages`, add (returns the resolved sender company object):

```python
async def _authorize_batch_creation(current_user, romiot_db: AsyncSession, submitted_target: str):
    """Shared guard for both batch endpoints: requires müşteri/yönetici role,
    a non-empty target that exists in company_integrations, and locks
    yönetici-only callers to their own company. Returns the sender company
    object (with `.name` and `.id`). Raises HTTPException on any failure."""
    sender = await require_user_company(current_user, romiot_db)
    role_values = current_user.role if isinstance(current_user.role, list) else []
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    if not (is_musteri or is_yonetici):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri veya yönetici rolü gereklidir.",
        )

    target = submitted_target.strip()
    if not target:
        raise HTTPException(status_code=400, detail="Hedef firma boş olamaz.")

    if is_yonetici and not is_musteri and target != sender.name:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu hedef firma için QR kod oluşturma yetkiniz yok.",
        )

    integration_check = await romiot_db.execute(
        select(CompanyIntegration.id).where(CompanyIntegration.company == target).limit(1)
    )
    if integration_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail="Hedef firma bulunamadı")

    return sender
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers.AuthorizeBatchCreationTest -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/test_qr_batch_helpers.py
git commit -m "refactor(qr): extract _authorize_batch_creation helper"
```

---

### Task 5: Rewire `generate_qr_code_batch` onto the shared helpers

Replace the inline auth + package loop in the existing single-mode endpoint with the helpers from Tasks 1–4. Behavior must stay identical. (Pure refactor of an endpoint with no endpoint-level test harness — verified by `python -c` import + the helper tests + manual smoke.)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py:167-298`

- [ ] **Step 1: Replace the body of `generate_qr_code_batch`**

Replace everything from the docstring's end through the `return QRCodeBatchResponse(...)` (current lines ~178-298) with:

```python
    submitted_target = batch_data.target_company.strip()
    sender = await _authorize_batch_creation(current_user, romiot_db, submitted_target)

    total_quantity = batch_data.quantity
    total_packages = batch_data.package_quantity
    if total_packages > total_quantity:
        raise HTTPException(
            status_code=400,
            detail="Paket sayısı toplam parça sayısından büyük olamaz",
        )

    work_order_group_id = generate_work_order_group_id()
    expires_at = datetime.now(timezone.utc) + timedelta(days=365)

    pair_dicts = [
        {"aselsan_order_number": p.aselsan_order_number, "order_item_number": p.order_item_number}
        for p in batch_data.pairs
    ]
    payload_base = {
        "main_customer": batch_data.main_customer,
        "sector": batch_data.sector,
        "company_from": sender.name,
        "company_from_id": sender.id,
        "teklif_number": batch_data.teklif_number,
        "part_number": batch_data.part_number,
        "revision_number": batch_data.revision_number,
        "target_date": batch_data.target_date.isoformat(),
    }

    try:
        packages = await _build_group_packages(
            romiot_db,
            work_order_group_id=work_order_group_id,
            pairs=pair_dicts,
            payload_base=payload_base,
            total_quantity=total_quantity,
            total_packages=total_packages,
            target_company=submitted_target,
            expires_at=expires_at,
        )
    except HTTPException:
        await romiot_db.rollback()
        raise

    await romiot_db.commit()

    return QRCodeBatchResponse(
        work_order_group_id=work_order_group_id,
        total_packages=total_packages,
        total_quantity=total_quantity,
        packages=packages,
        expires_at=expires_at,
    )
```

Note: the `payload_base` key order differs from the pre-refactor dict, but JSON object key order is irrelevant to consumers (`_normalize_pairs`, `/group`, `/retrieve` read by key). `package_index`/`pairs`/`quantity` are still added by `_build_group_packages`.

- [ ] **Step 2: Verify the module imports and helper tests still pass**

Run: `cd dtbackend && python -c "import app.api.v1.endpoints.romiot.station.qr_code" && python -m unittest test_qr_batch_helpers test_qr_pairs_fallback_helper -v`
Expected: import succeeds (no output from `-c`); all helper tests PASS.

- [ ] **Step 3: Lint**

Run: `cd dtbackend && ruff check app/api/v1/endpoints/romiot/station/qr_code.py`
Expected: no errors. Note: `import math` (line 2) is a pre-existing unused import; if ruff flags it as F401, remove that line as part of this commit. The refactor must not introduce any new unused imports.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
git commit -m "refactor(qr): rewire generate-batch onto shared helpers"
```

---

### Task 6: Multi schemas + `generate-batch-multi` endpoint

**Files:**
- Modify: `dtbackend/app/schemas/qr_code.py`
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`
- Test: `dtbackend/test_qr_batch_helpers.py`

- [ ] **Step 1: Add the schemas**

In `dtbackend/app/schemas/qr_code.py`, after `QRCodeBatchResponse`, add:

```python
class MultiQRPairItem(BaseModel):
    """One pair with its own quantity + package split, for multi-QR mode."""
    aselsan_order_number: str = Field(..., min_length=1, max_length=255)
    order_item_number: str = Field(..., min_length=1, max_length=255)
    quantity: int = Field(..., gt=0, description="Bu çiftin sipariş miktarı")
    package_quantity: int = Field(1, gt=0, description="Bu çiftin parti sayısı")


class QRCodeMultiBatchCreate(BaseModel):
    """Multi-QR creation: shared header + per-pair quantity/parti. Each item
    becomes its own work order group."""
    model_config = {"extra": "forbid"}

    main_customer: str = Field(..., description="Ana Müşteri")
    sector: str = Field(..., description="Sektör")
    target_company: str = Field(..., description="Hedef Firma")
    teklif_number: str | None = Field(None, description="Teklif Numarası")
    part_number: str = Field(..., description="Parça Numarası")
    revision_number: str | None = Field(None, description="Revizyon Numarası")
    target_date: date = Field(..., description="Hedef Bitirme Tarihi")
    items: list[MultiQRPairItem] = Field(..., min_length=1)


class QRCodeMultiGroupResult(BaseModel):
    work_order_group_id: str
    pair: OrderPair
    total_packages: int
    total_quantity: int
    packages: list[QRCodePackageInfo]


class QRCodeMultiBatchResponse(BaseModel):
    groups: list[QRCodeMultiGroupResult]
    expires_at: datetime | None = None
```

- [ ] **Step 2: Write the failing test for the endpoint's per-item guard**

The endpoint itself isn't covered by an HTTP test harness here, but its per-item `parti > quantity` guard is pure logic worth locking down. Add a tiny helper and test it. In `test_qr_batch_helpers.py`, append:

```python
from app.api.v1.endpoints.romiot.station.qr_code import _check_item_packaging


class CheckItemPackagingTest(unittest.TestCase):
    def test_ok_when_parti_le_quantity(self):
        self.assertIsNone(_check_item_packaging(quantity=10, package_quantity=3))

    def test_rejected_when_parti_gt_quantity(self):
        msg = _check_item_packaging(quantity=2, package_quantity=3)
        self.assertIsNotNone(msg)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers.CheckItemPackagingTest -v`
Expected: FAIL — `ImportError: cannot import name '_check_item_packaging'`.

- [ ] **Step 4: Implement `_check_item_packaging` and the endpoint**

In `qr_code.py`, add the guard helper after `_authorize_batch_creation`:

```python
def _check_item_packaging(quantity: int, package_quantity: int) -> str | None:
    """None if the per-pair parti split is valid, else an error message."""
    if package_quantity > quantity:
        return "Paket sayısı toplam parça sayısından büyük olamaz"
    return None
```

Add the imports for the new schemas to the existing `from app.schemas.qr_code import (...)` block:
`QRCodeMultiBatchCreate`, `QRCodeMultiBatchResponse`, `QRCodeMultiGroupResult`, `OrderPair` (import `OrderPair` from `app.schemas.order_pair`).

Then add the endpoint after `generate_qr_code_batch`:

```python
@router.post("/generate-batch-multi", response_model=QRCodeMultiBatchResponse, status_code=status.HTTP_201_CREATED)
async def generate_qr_code_batch_multi(
    batch_data: QRCodeMultiBatchCreate,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Generate one independent work order group per (Sipariş No, Kalem No) pair,
    each with its own quantity + parti. Shared header fields apply to every group.
    Atomic: any failure rolls back the whole batch."""
    submitted_target = batch_data.target_company.strip()
    sender = await _authorize_batch_creation(current_user, romiot_db, submitted_target)

    for item in batch_data.items:
        msg = _check_item_packaging(item.quantity, item.package_quantity)
        if msg:
            raise HTTPException(status_code=400, detail=msg)

    expires_at = datetime.now(timezone.utc) + timedelta(days=365)
    payload_base = {
        "main_customer": batch_data.main_customer,
        "sector": batch_data.sector,
        "company_from": sender.name,
        "company_from_id": sender.id,
        "teklif_number": batch_data.teklif_number,
        "part_number": batch_data.part_number,
        "revision_number": batch_data.revision_number,
        "target_date": batch_data.target_date.isoformat(),
    }

    groups: list[QRCodeMultiGroupResult] = []
    try:
        for item in batch_data.items:
            work_order_group_id = generate_work_order_group_id()
            pair_dicts = [{
                "aselsan_order_number": item.aselsan_order_number,
                "order_item_number": item.order_item_number,
            }]
            packages = await _build_group_packages(
                romiot_db,
                work_order_group_id=work_order_group_id,
                pairs=pair_dicts,
                payload_base=payload_base,
                total_quantity=item.quantity,
                total_packages=item.package_quantity,
                target_company=submitted_target,
                expires_at=expires_at,
            )
            groups.append(QRCodeMultiGroupResult(
                work_order_group_id=work_order_group_id,
                pair=OrderPair(
                    aselsan_order_number=item.aselsan_order_number,
                    order_item_number=item.order_item_number,
                ),
                total_packages=item.package_quantity,
                total_quantity=item.quantity,
                packages=packages,
            ))
    except HTTPException:
        await romiot_db.rollback()
        raise

    await romiot_db.commit()
    return QRCodeMultiBatchResponse(groups=groups, expires_at=expires_at)
```

- [ ] **Step 5: Run tests + import check**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers -v && python -c "import app.api.v1.endpoints.romiot.station.qr_code; import app.schemas.qr_code"`
Expected: all tests PASS; import succeeds.

- [ ] **Step 6: Lint**

Run: `cd dtbackend && ruff check app/api/v1/endpoints/romiot/station/qr_code.py app/schemas/qr_code.py`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add dtbackend/app/schemas/qr_code.py dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/test_qr_batch_helpers.py
git commit -m "feat(qr): add generate-batch-multi endpoint (one group per pair)"
```

---

### Task 7: Frontend types, state, and mode toggle

Add `qrMode`, extend the pair row with optional `quantity`/`package_quantity`, and render the toggle only for 2+ pairs.

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx`

- [ ] **Step 1: Extend the `OrderPair` form interface and add result types**

In `page.tsx`, change the `OrderPair` interface (lines 25-28) to:

```typescript
interface OrderPair {
  aselsan_order_number: string;
  order_item_number: string;
  // Multiple-mode only; ignored in single mode.
  quantity?: number;
  package_quantity?: number;
}
```

After `BatchQRResponse` (line 23), add:

```typescript
interface MultiGroupResult {
  work_order_group_id: string;
  pair: { aselsan_order_number: string; order_item_number: string };
  total_packages: number;
  total_quantity: number;
  packages: PackageInfo[];
}

interface MultiBatchResponse {
  groups: MultiGroupResult[];
  expires_at: string | null;
}
```

- [ ] **Step 2: Add `qrMode` + `generatedMulti` state**

After the `generatedBatch` state (line 107) add:

```typescript
  const [qrMode, setQrMode] = useState<"single" | "multiple">("single");
  const [generatedMulti, setGeneratedMulti] = useState<MultiBatchResponse | null>(null);
  const [selectedMultiGroup, setSelectedMultiGroup] = useState<number>(0);
```

Add a `useEffect` (after the existing effects, near line 92) that resets the mode when fewer than 2 pairs remain:

```typescript
  // The single/multiple choice only exists with 2+ pairs.
  useEffect(() => {
    if (barcodeFormData.pairs.length < 2 && qrMode !== "single") {
      setQrMode("single");
    }
  }, [barcodeFormData.pairs.length, qrMode]);
```

- [ ] **Step 3: Render the toggle above the Malzemeler block**

Inside the Malzemeler `<div className="md:col-span-2">` (line 480), immediately after the `<label>...Malzemeler *</label>` line, insert:

```tsx
                {barcodeFormData.pairs.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setQrMode("single")}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        qrMode === "single"
                          ? "bg-[#0f4c3a] text-white border-[#0f4c3a]"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      Tek QR (birleşik)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrMode("multiple")}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        qrMode === "multiple"
                          ? "bg-[#0f4c3a] text-white border-[#0f4c3a]"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      Her Sipariş/Kalem No için ayrı QR
                    </button>
                  </div>
                )}
```

- [ ] **Step 4: Verify build + lint**

Run: `cd dtfrontend && npm run lint && npm run build`
Expected: lint clean; build succeeds. (No behavior change yet beyond a visible toggle.)

- [ ] **Step 5: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/musteri/page.tsx
git commit -m "feat(musteri): add single/multiple QR mode toggle for 2+ pairs"
```

---

### Task 8: Per-pair quantity/parti inputs + conditional global fields

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx`

- [ ] **Step 1: Add per-pair inputs inside each pair row (multiple mode)**

In the pair `.map` (the row `<div key={idx} className="flex flex-wrap gap-2 items-start">`, line 486), after the Kalem No input's wrapping `<div className="w-32">…</div>` (closes at line 540) and before the remove button block (line 541), insert:

```tsx
                        {qrMode === "multiple" && (
                          <>
                            <div className="w-28">
                              <input
                                type="number"
                                min="1"
                                value={pair.quantity || ""}
                                onChange={(e) => {
                                  const next = [...barcodeFormData.pairs];
                                  next[idx] = { ...next[idx], quantity: parseInt(e.target.value) || 0 };
                                  setBarcodeFormData({ ...barcodeFormData, pairs: next });
                                }}
                                placeholder="Miktar"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                              />
                            </div>
                            <div className="w-28">
                              <input
                                type="number"
                                min="1"
                                value={pair.package_quantity || ""}
                                onChange={(e) => {
                                  const next = [...barcodeFormData.pairs];
                                  next[idx] = { ...next[idx], package_quantity: parseInt(e.target.value) || 0 };
                                  setBarcodeFormData({ ...barcodeFormData, pairs: next });
                                }}
                                placeholder="Parti"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                              />
                            </div>
                          </>
                        )}
```

- [ ] **Step 2: Hide the global quantity + parti fields in multiple mode**

Wrap the global "Toplam Sipariş Miktarı" `<div>` (line 598-608) and the "Parti Sayısı" `<div>` (line 609-624) each in `{qrMode === "single" && ( … )}`. Example for the quantity field:

```tsx
              {qrMode === "single" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Toplam Sipariş Miktarı *</label>
                  <input
                    type="number"
                    min="1"
                    value={barcodeFormData.quantity || ""}
                    onChange={(e) => setBarcodeFormData({ ...barcodeFormData, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
              )}
```

Apply the same `{qrMode === "single" && ( … )}` wrapper to the Parti Sayısı `<div>`.

- [ ] **Step 3: Verify build + lint**

Run: `cd dtfrontend && npm run lint && npm run build`
Expected: lint clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/musteri/page.tsx
git commit -m "feat(musteri): per-pair quantity/parti inputs in multiple mode"
```

---

### Task 9: Per-mode submit + multiple-mode validation

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx`

- [ ] **Step 1: Add multiple-mode pair validation in `handleGenerateBarcode`**

In `handleGenerateBarcode`, after the existing `pairErrors` block (lines 134-141) add a multiple-mode quantity/parti check:

```typescript
    if (qrMode === "multiple") {
      const qtyErrors: string[] = [];
      barcodeFormData.pairs.forEach((p, i) => {
        const q = p.quantity ?? 0;
        const pk = p.package_quantity ?? 0;
        if (q <= 0) qtyErrors.push(`Satır ${i + 1}: Miktar 0'dan büyük olmalı`);
        if (pk <= 0) qtyErrors.push(`Satır ${i + 1}: Parti 0'dan büyük olmalı`);
        if (q > 0 && pk > 0 && pk > q) qtyErrors.push(`Satır ${i + 1}: Parti, miktardan büyük olamaz`);
      });
      if (qtyErrors.length > 0) {
        setError(qtyErrors.join("; "));
        return;
      }
    } else if (barcodeFormData.quantity <= 0) {
      // single mode keeps its existing total-quantity guard (already checked above);
      // no-op here, retained for clarity.
    }
```

Note: the existing single-mode `quantity <= 0` guard at lines 121-124 runs for both modes today. Move it under a `qrMode === "single"` condition so multiple mode (which hides the global field) isn't blocked. Change lines 121-124 from:

```typescript
    if (barcodeFormData.quantity <= 0) {
      setError("Toplam sipariş miktarı 0'dan büyük olmalıdır");
      return;
    }
```

to:

```typescript
    if (qrMode === "single" && barcodeFormData.quantity <= 0) {
      setError("Toplam sipariş miktarı 0'dan büyük olmalıdır");
      return;
    }
```

- [ ] **Step 2: Branch the submit on `qrMode`**

Replace the `try { … }` block that builds `payload` and calls `/generate-batch` (lines 154-205) so single mode is unchanged and multiple mode calls the new endpoint. Insert, at the top of the `try` (after `setLoading(true); setError(null);`):

```typescript
      if (qrMode === "multiple") {
        const multiPayload = {
          main_customer: barcodeFormData.main_customer,
          sector: barcodeFormData.sector,
          target_company: effectiveTarget,
          teklif_number: barcodeFormData.teklif_number.trim() || null,
          part_number: barcodeFormData.part_number,
          revision_number: barcodeFormData.revision_number,
          target_date: barcodeFormData.target_date,
          items: barcodeFormData.pairs.map((p) => ({
            aselsan_order_number: p.aselsan_order_number.trim(),
            order_item_number: p.order_item_number.trim(),
            quantity: p.quantity ?? 0,
            package_quantity: (p.package_quantity ?? 0) > 0 ? p.package_quantity : 1,
          })),
        };
        const multiResponse = await api.post<MultiBatchResponse>(
          "/romiot/station/qr-code/generate-batch-multi",
          multiPayload
        );
        setGeneratedMulti(multiResponse);
        setGeneratedBatch(null);
        setSelectedMultiGroup(0);
        return;
      }
```

Keep the existing single-mode body below it unchanged, but add `setGeneratedMulti(null);` right before `setGeneratedBatch(response);` (line 184) so switching modes clears the other result.

- [ ] **Step 2b: Use `effectiveTarget` for multiple payload**

`effectiveTarget` is already computed at the top of `handleGenerateBarcode` (lines 115-116). The multiPayload above references it — confirm it is in scope (it is, declared before the validations).

- [ ] **Step 3: Verify build + lint**

Run: `cd dtfrontend && npm run lint && npm run build`
Expected: lint clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/musteri/page.tsx
git commit -m "feat(musteri): submit multiple-mode batch to generate-batch-multi"
```

---

### Task 10: Parametrize print builder + render grouped multi results

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx`

- [ ] **Step 1: Make `buildPackageCardHtml` take an explicit pairs list**

Change `buildPackageCardHtml` (line 225) signature and its two internal reads of `barcodeFormData.pairs` to a parameter so multi cards show only their own pair:

```typescript
  const buildPackageCardHtml = (
    svgMarkup: string,
    pkg: PackageInfo,
    qrSize: number,
    totalQuantity: number,
    totalPackages: number,
    pairs: OrderPair[]
  ) => {
    const pairsRowHtml = pairs.length === 1
      ? `
        <tr><td style="border:1px solid #d1d5db; padding:6px; font-weight:600;">${barcodeFormData.main_customer} Sipariş Numarası</td><td style="border:1px solid #d1d5db; padding:6px;">${totalPackages > 1 ? pairs[0].aselsan_order_number + "_" + pkg.package_index : pairs[0].aselsan_order_number}</td></tr>
        <tr><td style="border:1px solid #d1d5db; padding:6px; font-weight:600;">Sipariş Kalem Numarası</td><td style="border:1px solid #d1d5db; padding:6px;">${pairs[0].order_item_number}</td></tr>
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
                ${pairs.map(p => `
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

Leave the rest of the function body unchanged (the `${barcodeFormData.*}` reads for header fields stay — those are shared in both modes).

- [ ] **Step 2: Update the two existing single-mode call sites**

In `handlePrintSingleBarcode` (line 320) and `handlePrintAllBarcodes` (line 347), pass `barcodeFormData.pairs` as the new last argument:

```typescript
// handlePrintSingleBarcode:
buildPackageCardHtml(svgMarkup, pkg, qrSize, generatedBatch.total_quantity, generatedBatch.total_packages, barcodeFormData.pairs)
// handlePrintAllBarcodes:
buildPackageCardHtml(svgMarkup, pkg, qrSize, generatedBatch.total_quantity, generatedBatch.total_packages, barcodeFormData.pairs)
```

- [ ] **Step 3: Add multi-mode print + render**

After `handlePrintAllBarcodes` (line 368) add a multi print-all that flattens every group's packages. Each group's card DOM ids are `qr-multi-${groupIndex}-${pkgIndex}`:

```typescript
  const handlePrintAllMulti = () => {
    if (!generatedMulti) return;
    const qrSize = 200;
    const renderPromises = generatedMulti.groups.flatMap((g, gi) =>
      g.packages.map((pkg, pi) =>
        getQrSvgMarkup(`qr-multi-${gi}-${pi}`, qrSize).then((svgMarkup) => ({
          svgMarkup, pkg, group: g,
        }))
      )
    );
    Promise.all(renderPromises)
      .then((results) => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;
        const packagesHtml = results
          .map(({ svgMarkup, pkg, group }) =>
            buildPackageCardHtml(svgMarkup, pkg, qrSize, group.total_quantity, group.total_packages, [group.pair])
          )
          .join("");
        printWindow.document.write(`<!DOCTYPE html><html><head><title>QR Kodlar</title><style>${printPageStyles}</style></head><body>${packagesHtml}</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      })
      .catch((err) => console.error("Error rendering multi QR codes for print:", err));
  };
```

Then add the multi results JSX. Immediately after the closing of the single-mode `{generatedBatch && ( … )}` block (line 797), add:

```tsx
        {generatedMulti && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Oluşturulan QR Kodlar</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {generatedMulti.groups.length} ayrı iş emri oluşturuldu
                </p>
              </div>
              <button
                onClick={handlePrintAllMulti}
                className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                Tümünü Yazdır
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {generatedMulti.groups.map((g, gi) => (
                <button
                  key={gi}
                  onClick={() => setSelectedMultiGroup(gi)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedMultiGroup === gi ? "bg-[#0f4c3a] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {g.pair.aselsan_order_number} / {g.pair.order_item_number}
                </button>
              ))}
            </div>

            {generatedMulti.groups.map((g, gi) => (
              <div key={gi} className={gi === selectedMultiGroup ? "block" : "hidden"}>
                <p className="text-sm text-gray-600 mb-3">
                  İş Emri: {g.work_order_group_id} — {g.total_packages} paket, toplam {g.total_quantity} parça
                </p>
                <div className="flex flex-col gap-6">
                  {g.packages.map((pkg, pi) => (
                    <div key={pi} className="border-2 border-gray-300 p-6 rounded-lg bg-gray-50">
                      <div className="flex flex-col items-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#0f4c3a] text-white mb-2">
                          Paket {pkg.package_index} / {g.total_packages}
                        </span>
                        <div
                          id={`qr-multi-${gi}-${pi}`}
                          className="w-full max-w-md flex items-center justify-center bg-white p-4 rounded-lg"
                        >
                          <QRCodeSVG value={pkg.code} size={300} level="H" />
                        </div>
                        <p className="mt-2 text-sm text-gray-700">
                          {g.pair.aselsan_order_number}{g.total_packages > 1 ? `_${pkg.package_index}` : ""} / {g.pair.order_item_number} — {pkg.quantity}/{g.total_quantity}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 4: Verify build + lint**

Run: `cd dtfrontend && npm run lint && npm run build`
Expected: lint clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/musteri/page.tsx
git commit -m "feat(musteri): grouped per-pair QR results and print"
```

---

### Task 11: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend helper suite**

Run: `cd dtbackend && python -m unittest test_qr_batch_helpers test_qr_pairs_fallback_helper -v`
Expected: all PASS.

- [ ] **Step 2: Backend lint**

Run: `cd dtbackend && ruff check app/`
Expected: no new errors in `qr_code.py` / `qr_code` schema.

- [ ] **Step 3: Frontend build**

Run: `cd dtfrontend && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Manual smoke (browser), as a müşteri/yönetici user**

Verify each:
1. One pair → no toggle shown; create works exactly as before (single mode).
2. Add a 2nd pair → toggle appears, defaults to "Tek QR (birleşik)"; global Miktar/Parti visible; combined QR(s) generated as before.
3. Switch to "Her Sipariş/Kalem No için ayrı QR" → global Miktar/Parti hidden; each row shows Miktar + Parti inputs.
4. Enter per-pair quantities/parti, submit → results show one tab per pair; each tab lists that pair's packages; "Tümünü Yazdır" prints every group's packages; each card shows only its own pair (with `_index` suffix when that pair's parti > 1).
5. Validation: a pair with parti > miktar, or miktar 0, blocks submit with a row-specific message.
6. Delete pairs back to 1 → toggle disappears and mode resets to single.
7. Scan a generated multi QR in the operator flow → resolves its single pair correctly (no "Sipariş bilgisi eksik").

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore(qr): multi-QR per pair verification pass"
```

---

## Self-review notes

- **Spec coverage:** mode toggle (Task 7), per-pair quantity+parti (Task 8), shared header fields (Tasks 8/10 keep header reads global), new atomic endpoint (Task 6), shared helper reuse (Tasks 1–5), single-mode unchanged (Task 5 keeps `QRCodeBatchResponse` shape), grouped results/print (Task 10), scan path untouched (no task needed — verified in Task 11 step 4.7).
- **Type consistency:** `_build_group_packages` / `_compute_package_quantities` / `_generate_unique_code` / `_authorize_batch_creation` / `_check_item_packaging` signatures are defined once and called with matching args. Frontend `MultiBatchResponse` mirrors backend `QRCodeMultiBatchResponse` (`groups[].pair/packages/total_*`).
- **Atomicity:** both endpoints wrap building in `try/except HTTPException: rollback; raise` then `commit()`.
