# Atölye Cross-Station Partial Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a downstream route station accept the pieces that have exited the previous route station (partial cross-station flow), replacing the group-level "one active station at a time" lock.

**Architecture:** The entrance endpoint's route check (`create_work_order`) is made flow-aware — a routed downstream station is capped at the previous station's `exited_quantity`, and "nothing available yet" becomes an acknowledgeable warning; the group-level active-at-other-station mutex is deleted; the exit endpoint's route-order check is dropped (a package may legitimately sit at several stations at once). Decision logic lives in three pure helpers so it is unit-tested without a DB; `get_package_status` returns the live entrance cap so the operator's quantity modal defaults correctly.

**Tech Stack:** FastAPI + SQLAlchemy (async) backend (`dtbackend`), Next.js/React + TypeScript frontend (`dtfrontend`). Backend tests: `unittest` (pure helpers, no DB). Frontend has no test runner — verified via `next lint` / `next build` + manual scan.

**Spec:** `docs/superpowers/specs/2026-07-02-atolye-cross-station-partial-flow-design.md`

---

## File Structure

- `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — add three pure flow helpers; rewrite the F6 block and delete the mutex in `create_work_order`; extend `get_package_status`; drop the exit route-order block in `update_exit_date`; remove the now-unused `_route_expected_position`.
- `dtbackend/app/schemas/work_order.py` — add `available_to_enter` to `PackageStatus`.
- `dtbackend/test_partial_quantity_helper.py` — unit tests for the new helpers.
- `dtfrontend/src/components/atolye/QuantityModal.tsx` — accept an optional `entranceRemaining` cap.
- `dtfrontend/src/app/[platform]/atolye/operator/page.tsx` — send `quantity` to `package-status`, use `available_to_enter` for the entrance default, pass the cap to the modal.

**Dependency order:** Task 1 (helpers) and Task 2 (schema) are independent; Task 3 (backend wiring) depends on both. Task 4 (modal) is independent; Task 5 (page) depends on Task 2 and Task 4. Recommended sequence: 1 → 2 → 3 → 4 → 5.

---

### Task 1: Pure flow helpers (backend)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` (add helpers after `_check_exit_scan`, which ends at line 405, before the `@router.post("/")` at line 408)
- Test: `dtbackend/test_partial_quantity_helper.py`

- [ ] **Step 1: Write the failing tests**

Update the import block at the top of `dtbackend/test_partial_quantity_helper.py`:

```python
from app.api.v1.endpoints.romiot.station.work_order import (
    _entrance_remaining,
    _exit_remaining,
    _check_entrance_scan,
    _check_exit_scan,
    _available_to_enter,
    _entrance_cap,
    _check_flow_entrance,
)
```

Append these test classes before the `if __name__ == "__main__":` block:

```python
class AvailableToEnterTest(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(_available_to_enter(88, 0), 88)

    def test_partial(self):
        self.assertEqual(_available_to_enter(88, 20), 68)

    def test_never_negative(self):
        self.assertEqual(_available_to_enter(88, 100), 0)


class EntranceCapTest(unittest.TestCase):
    def test_flow_gated_uses_prev_exited(self):
        self.assertEqual(_entrance_cap(quantity=488, prev_exited=88, is_flow_gated=True), 88)

    def test_flow_gated_none_prev_is_zero(self):
        self.assertEqual(_entrance_cap(quantity=488, prev_exited=None, is_flow_gated=True), 0)

    def test_not_flow_gated_uses_quantity(self):
        self.assertEqual(_entrance_cap(quantity=488, prev_exited=88, is_flow_gated=False), 488)


class FlowEntranceCheckTest(unittest.TestCase):
    def test_ok_within_available(self):
        self.assertEqual(_check_flow_entrance(88, 0, 88), ("ok", 88))

    def test_ok_partial(self):
        self.assertEqual(_check_flow_entrance(50, 20, 88), ("ok", 68))

    def test_warn_when_nothing_exited_previous(self):
        outcome, _ = _check_flow_entrance(1, 0, 0)
        self.assertEqual(outcome, "warn")

    def test_warn_when_all_already_pulled_forward(self):
        outcome, _ = _check_flow_entrance(1, 88, 88)  # entered == prev_exited
        self.assertEqual(outcome, "warn")

    def test_error_when_over_available(self):
        outcome, msg = _check_flow_entrance(89, 0, 88)
        self.assertEqual(outcome, "error")
        self.assertIn("88", msg)

    def test_error_over_available_after_partial(self):
        outcome, msg = _check_flow_entrance(70, 20, 88)  # 20+70=90 > 88, remaining 68
        self.assertEqual(outcome, "error")
        self.assertIn("68", msg)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dtbackend && python -m unittest test_partial_quantity_helper -v`
Expected: FAIL — `ImportError: cannot import name '_available_to_enter'`.

- [ ] **Step 3: Add the helpers**

Insert immediately after `_check_exit_scan` (after line 405), before `@router.post("/", ...)`:

```python
def _available_to_enter(entrance_cap: int, entered_quantity: int) -> int:
    """Pieces still enterable at this station right now, given the entrance cap
    (never negative). The cap is the package quantity at the entry/no-route/
    off-route case, or the previous route station's exited count when flow-gated."""
    return max(0, entrance_cap - entered_quantity)


def _entrance_cap(*, quantity: int, prev_exited: int | None, is_flow_gated: bool) -> int:
    """Max pieces enterable at this station. Flow-gated (routed, downstream)
    stations are capped at the previous route station's exited count; everything
    else (entry station, no route, off-route, acknowledged override) at the
    package quantity."""
    if is_flow_gated:
        return prev_exited or 0
    return quantity


def _check_flow_entrance(scan_quantity: int, entered_quantity: int, prev_exited: int):
    """Decide a flow-gated (downstream) entrance scan. Returns one of:
      ("warn", 0)       — nothing has exited the previous station yet; caller
                          raises the soft, acknowledgeable route_out_of_order.
      ("error", msg)    — scan exceeds what is available; caller raises hard 400.
      ("ok", remaining) — allowed.
    """
    remaining = _available_to_enter(prev_exited, entered_quantity)
    if remaining <= 0:
        return ("warn", 0)
    if scan_quantity > remaining:
        return (
            "error",
            f"Girilen miktar önceki istasyondan çıkan adedi aşamaz (kalan: {remaining})",
        )
    return ("ok", remaining)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dtbackend && python -m unittest test_partial_quantity_helper -v`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py dtbackend/test_partial_quantity_helper.py
git commit -m "$(cat <<'EOF'
feat(atolye): add cross-station flow entrance helpers

_available_to_enter / _entrance_cap / _check_flow_entrance encode the
downstream entrance cap (previous route station's exited count) and the
warn/error/ok decision. Pure, unit-tested; wired into the endpoints next.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `PackageStatus` gains `available_to_enter` (backend schema)

**Files:**
- Modify: `dtbackend/app/schemas/work_order.py:89-93`

*(Pure schema/type change — exempt from TDD; validated by Task 3's build and Task 1's suite still passing.)*

- [ ] **Step 1: Add the field**

Replace the `PackageStatus` class (lines 89-93):

```python
class PackageStatus(BaseModel):
    """Current piece-level progress for one package at one station (for the modal)."""
    exists: bool = Field(..., description="Bu paket için bu atölyede satır var mı")
    entered_quantity: int = Field(..., description="Girilen parça")
    exited_quantity: int = Field(..., description="Çıkan parça")
```

with:

```python
class PackageStatus(BaseModel):
    """Current piece-level progress for one package at one station (for the modal)."""
    exists: bool = Field(..., description="Bu paket için bu atölyede satır var mı")
    entered_quantity: int = Field(..., description="Girilen parça")
    exited_quantity: int = Field(..., description="Çıkan parça")
    available_to_enter: int = Field(..., description="Şu an bu istasyonda girilebilecek azami parça (akış limiti)")
```

- [ ] **Step 2: Verify the module imports**

Run: `cd dtbackend && python -c "from app.schemas.work_order import PackageStatus; print(PackageStatus.model_fields.keys())"`
Expected: prints the keys including `available_to_enter`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/schemas/work_order.py
git commit -m "$(cat <<'EOF'
feat(atolye): add available_to_enter to PackageStatus

Carries the live entrance cap so the operator quantity modal defaults to
the cross-station flow limit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rewire the work-order endpoints (backend)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — four edits: (3a) `create_work_order` F6 block `481-514`; (3b) delete mutex `516-533`; (3c) rewrite `get_package_status` `884-911`; (3d) drop exit route block in `update_exit_date` `730-767`; (3e) remove `_route_expected_position` `91-116`.

*(Integration wiring against the DB — no unit harness exists in this repo. Its decision logic is covered by Task 1's helper tests; behavior is verified by the manual scenario in Step 6.)*

- [ ] **Step 1 (3a): Make the entrance route check flow-aware**

Replace the F6 block in `create_work_order` (lines 481-514):

```python
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
```

with (note: `already_entered` is defined just above at line 441, and `and_`, `Station`, `WorkOrder`, `WorkOrderRoute` are already imported):

```python
    # F6: route validation — flow-aware (cross-station partial flow). For a group
    # WITH a route, a downstream station may only pull forward pieces that have
    # EXITED the previous route station. No-route groups and acknowledged
    # overrides skip this and rely on the quantity cap checked above.
    route_rows_result = await romiot_db.execute(
        select(WorkOrderRoute.position, WorkOrderRoute.station_id)
        .where(WorkOrderRoute.work_order_group_id == work_order_data.work_order_group_id)
        .order_by(WorkOrderRoute.position)
    )
    route_rows = route_rows_result.all()
    if route_rows and not work_order_data.acknowledged_route_violation:
        this_pos = next((r.position for r in route_rows if r.station_id == work_order_data.station_id), None)

        if this_pos is None:
            raise HTTPException(status_code=400, detail={
                "type": "route_off",
                "message": "Bu atölye iş emrinin rotasında yok. Yine de devam etmek istiyor musunuz?",
            })
        if this_pos >= 1:
            # Flow gate: cap at the previous route station's exited count. Lock
            # that row so two concurrent entrances can't both pull it forward.
            prev_station_id = next(r.station_id for r in route_rows if r.position == this_pos - 1)
            prev_row = (await romiot_db.execute(
                select(WorkOrder).where(
                    and_(
                        WorkOrder.station_id == prev_station_id,
                        WorkOrder.work_order_group_id == work_order_data.work_order_group_id,
                        WorkOrder.package_index == work_order_data.package_index,
                    )
                ).with_for_update()
            )).scalar_one_or_none()
            prev_exited = prev_row.exited_quantity if prev_row else 0
            outcome, info = _check_flow_entrance(
                work_order_data.scan_quantity, already_entered, prev_exited
            )
            if outcome == "warn":
                prev_name = (await romiot_db.execute(
                    select(Station.name).where(Station.id == prev_station_id)
                )).scalar_one_or_none() or "önceki istasyon"
                raise HTTPException(status_code=400, detail={
                    "type": "route_out_of_order",
                    "message": f"Önceki istasyondan ({prev_name}) çıkış yapılmış parça yok. Yine de devam etmek istiyor musunuz?",
                    "expected_position": this_pos - 1,
                    "actual_position": this_pos,
                })
            if outcome == "error":
                raise HTTPException(status_code=400, detail=info)
```

- [ ] **Step 2 (3b): Delete the active-at-other-station mutex**

Remove this block (lines 516-533):

```python
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
```

Replace it with a single comment:

```python
    # Cross-station partial flow: the group-level active-at-other-station mutex
    # was removed. The flow gate in the F6 block above is the between-station
    # guard (a package may legitimately be active at several stations at once).
```

- [ ] **Step 3 (3e): Remove the now-unused `_route_expected_position`**

Delete the whole helper (lines 91-116, `async def _route_expected_position(...) -> int:` through its `return`). It had exactly one caller — the F6 code deleted in Step 1.

- [ ] **Step 4 (3c): Return `available_to_enter` from `get_package_status`**

Replace the entire `get_package_status` function (lines 884-911) with:

```python
@router.get("/package-status", response_model=PackageStatus)
async def get_package_status(
    station_id: int = Query(..., description="Station ID"),
    work_order_group_id: str = Query(..., description="İş Emri Grup ID"),
    package_index: int = Query(..., description="Paket sırası (1-based)"),
    quantity: int = Query(..., ge=0, description="Paket adedi (cap, QR'dan)"),
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Current piece-level progress + the live entrance cap for one package at one
    station. `available_to_enter` reflects cross-station flow: at a routed
    downstream station it is bounded by the previous station's exited count."""
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
    entered = wo.entered_quantity if wo else 0
    exited = wo.exited_quantity if wo else 0

    # Entrance cap: flow-gated (routed downstream) -> previous station's exited count.
    route_rows = (await romiot_db.execute(
        select(WorkOrderRoute.position, WorkOrderRoute.station_id)
        .where(WorkOrderRoute.work_order_group_id == work_order_group_id)
        .order_by(WorkOrderRoute.position)
    )).all()
    this_pos = next((r.position for r in route_rows if r.station_id == station_id), None)
    is_flow_gated = bool(route_rows) and this_pos is not None and this_pos >= 1
    prev_exited: int | None = None
    if is_flow_gated:
        prev_station_id = next(r.station_id for r in route_rows if r.position == this_pos - 1)
        prev_row = (await romiot_db.execute(
            select(WorkOrder).where(
                and_(
                    WorkOrder.station_id == prev_station_id,
                    WorkOrder.work_order_group_id == work_order_group_id,
                    WorkOrder.package_index == package_index,
                )
            )
        )).scalar_one_or_none()
        prev_exited = prev_row.exited_quantity if prev_row else 0

    entrance_cap = _entrance_cap(quantity=quantity, prev_exited=prev_exited, is_flow_gated=is_flow_gated)
    return PackageStatus(
        exists=wo is not None,
        entered_quantity=entered,
        exited_quantity=exited,
        available_to_enter=_available_to_enter(entrance_cap, entered),
    )
```

- [ ] **Step 5 (3d): Drop the exit-side route-order check**

In `update_exit_date`, remove this block (lines 730-767):

```python
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
```

Replace it with a comment:

```python
    # Cross-station partial flow: no exit-side route-order check. A package may
    # legitimately sit at several route stations at once, so exiting the pieces
    # still at an earlier station is valid. `_check_exit_scan` (exited + scan <=
    # entered) above is the only exit guard.
```

- [ ] **Step 6: Verify — module imports, helper suite, and the reported scenario**

Run: `cd dtbackend && python -c "import app.api.v1.endpoints.romiot.station.work_order"` — Expected: no error (no leftover reference to `_route_expected_position`).
Run: `cd dtbackend && python -m unittest test_partial_quantity_helper -v` — Expected: PASS.
Manual (against a running dev backend + DB), reproducing the report — route A→B→C, one package `quantity=488`:
  1. Enter 88 and exit 88 at B (`entered=88, exited=88, exit_date` stays NULL).
  2. Scan to **enter at C** → previously 400 "…B atölyesinde aktif…"; now the quantity modal opens defaulting to 88; confirming 88 succeeds.
  3. Attempt a 89th piece at C → 400 "Girilen miktar önceki istasyondan çıkan adedi aşamaz (kalan: 0)".
  4. Exit some of the remaining pieces still at B → no "out of order" warning.

- [ ] **Step 7: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "$(cat <<'EOF'
feat(atolye): cross-station partial flow for work order scans

Downstream route stations now accept up to the previous station's exited
count; the group-level active-at-other-station mutex and the exit-side
route-order check are removed; package-status returns the live entrance
cap. Fixes: partial quantities could not move B->C until B fully exited.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `QuantityModal` accepts a flow cap (frontend)

**Files:**
- Modify: `dtfrontend/src/components/atolye/QuantityModal.tsx:6-18` (props) and `:33-36` (remaining calc)

*(No frontend test runner exists; verified by `next lint` + Task 5's manual scan.)*

- [ ] **Step 1: Add the optional prop**

In the `QuantityModalProps` interface (lines 6-18), add `entranceRemaining` after the `exitedQuantity` line:

```typescript
  exitedQuantity: number;    // pieces already exited at this station
  entranceRemaining?: number; // entrance: max pieces enterable now (flow cap). Falls back to quantity-entered.
```

Add it to the destructured params (after `exitedQuantity,`):

```typescript
  enteredQuantity,
  exitedQuantity,
  entranceRemaining,
  loading,
```

- [ ] **Step 2: Use it for the entrance remaining**

Replace the `remaining` computation (lines 34-36):

```typescript
  const remaining = isEntrance
    ? Math.max(0, quantity - enteredQuantity)
    : Math.max(0, enteredQuantity - exitedQuantity);
```

with:

```typescript
  const remaining = isEntrance
    ? (entranceRemaining ?? Math.max(0, quantity - enteredQuantity))
    : Math.max(0, enteredQuantity - exitedQuantity);
```

- [ ] **Step 3: Verify lint/type**

Run: `cd dtfrontend && npx tsc --noEmit -p tsconfig.json` (or `npm run lint`)
Expected: no new type errors from this file.

- [ ] **Step 4: Commit**

```bash
git add dtfrontend/src/components/atolye/QuantityModal.tsx
git commit -m "$(cat <<'EOF'
feat(atolye): QuantityModal accepts entranceRemaining flow cap

Optional prop caps the entrance stepper/default at the cross-station flow
limit; falls back to quantity-entered when absent (exit unchanged).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Operator page uses the flow cap (frontend)

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/operator/page.tsx` — `PackageStatus` interface `37-41`; `quantityModal` state `276-281`; `package-status` GET `488-494`; remaining/modal-open logic `500-521`; `QuantityModal` usage `1651-1663`.

- [ ] **Step 1: Add `available_to_enter` to the `PackageStatus` interface**

Replace lines 37-41:

```typescript
interface PackageStatus {
  exists: boolean;
  entered_quantity: number;
  exited_quantity: number;
}
```

with:

```typescript
interface PackageStatus {
  exists: boolean;
  entered_quantity: number;
  exited_quantity: number;
  available_to_enter: number;
}
```

- [ ] **Step 2: Track the cap in the modal state**

Replace the `quantityModal` state type (lines 276-281):

```typescript
  const [quantityModal, setQuantityModal] = useState<{
    mode: "entrance" | "exit";
    parsedData: QRCodeData;
    entered: number;
    exited: number;
  } | null>(null);
```

with:

```typescript
  const [quantityModal, setQuantityModal] = useState<{
    mode: "entrance" | "exit";
    parsedData: QRCodeData;
    entered: number;
    exited: number;
    availableToEnter: number;
  } | null>(null);
```

- [ ] **Step 3: Send `quantity` to `package-status`**

Replace the GET call (lines 488-494):

```typescript
            status = await api.get<PackageStatus>(
              `/romiot/station/work-orders/package-status?station_id=${stationId}` +
                `&work_order_group_id=${encodeURIComponent(parsedData.work_order_group_id)}` +
                `&package_index=${packageIndex}`,
              undefined,
              { useCache: false }
            );
```

with:

```typescript
            status = await api.get<PackageStatus>(
              `/romiot/station/work-orders/package-status?station_id=${stationId}` +
                `&work_order_group_id=${encodeURIComponent(parsedData.work_order_group_id)}` +
                `&package_index=${packageIndex}` +
                `&quantity=${Number(parsedData.quantity) || 0}`,
              undefined,
              { useCache: false }
            );
```

- [ ] **Step 4: Use the flow cap for remaining + modal state**

Replace lines 500-521:

```typescript
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
```

with:

```typescript
          const cap = Number(parsedData.quantity) || 0;
          const remaining =
            mode === "entrance"
              ? status.available_to_enter
              : Math.max(0, status.entered_quantity - status.exited_quantity);

          if (remaining === 0) {
            setError(
              mode === "exit"
                ? `Çıkışı yapılacak parça yok (Paket ${packageIndex})`
                : status.entered_quantity >= cap
                  ? `Bu paket tamamen girildi (Paket ${packageIndex})`
                  : `Önceki istasyondan çıkış yapılmış parça yok (Paket ${packageIndex})`
            );
            setQRCodeInput("");
            return;
          }

          setQuantityModal({
            mode,
            parsedData,
            entered: status.entered_quantity,
            exited: status.exited_quantity,
            availableToEnter: status.available_to_enter,
          });
```

- [ ] **Step 5: Pass the cap to the modal**

In the `QuantityModal` usage (lines 1651-1663), add `entranceRemaining` after the `exitedQuantity` prop:

```tsx
          enteredQuantity={quantityModal.entered}
          exitedQuantity={quantityModal.exited}
          entranceRemaining={quantityModal.availableToEnter}
          loading={quantityModalLoading}
```

- [ ] **Step 6: Verify build**

Run: `cd dtfrontend && npm run build`
Expected: build succeeds (no type errors).
Manual: repeat the Task 3 Step 6 scenario through the operator UI — entering at C after B's partial exit opens the modal defaulting to 88; the "previous station" message shows when nothing is available yet.

- [ ] **Step 7: Commit**

```bash
git add dtfrontend/src/app/\[platform\]/atolye/operator/page.tsx
git commit -m "$(cat <<'EOF'
feat(atolye): operator entrance modal uses cross-station flow cap

Sends the package quantity to package-status and defaults/caps the
entrance modal at available_to_enter; distinguishes "fully entered" from
"nothing available from the previous station yet".

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- Remove active-at-other mutex → Task 3 Step 2. ✅
- Flow-gated downstream entrance cap (`exited[p-1]`) → Task 1 helpers + Task 3 Step 1. ✅
- No-route / off-route / acknowledged → quantity cap (existing `_check_entrance_scan` at line 442 stays; F6 block skipped) → Task 3 Steps 1-2. ✅
- Flow-aware route-order (warn when nothing available, hard error when over) → Task 1 `_check_flow_entrance` + Task 3 Step 1. ✅
- Drop exit route-order warning → Task 3 Step 5. ✅
- `package-status` returns `available_to_enter` (+ `quantity` param) → Task 2 + Task 3 Step 4. ✅
- Frontend default/cap + message split → Task 4 + Task 5. ✅
- Concurrency: lock previous row → Task 3 Step 1 (`with_for_update()` on `prev_row`). ✅
- `delivered` / `exit_date` / Mekasan / tracker untouched → no task touches them. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows full old→new content. ✅

**3. Type consistency:** Backend helpers `_available_to_enter`, `_entrance_cap` (keyword-only), `_check_flow_entrance` used with matching signatures in Task 3. Schema field `available_to_enter` (Task 2) matches the frontend interface field and the `PackageStatus(...)` construction in Task 3 Step 4. Frontend `entranceRemaining` prop (Task 4) matches the `quantityModal.availableToEnter` passed in Task 5 Step 5, sourced from `status.available_to_enter`. ✅

**Known limitation:** the endpoint wiring (Task 3) has no automated integration test — this repo has no DB test harness for these routes; the decision logic is unit-tested via helpers and behavior is verified manually per Task 3 Step 6.
