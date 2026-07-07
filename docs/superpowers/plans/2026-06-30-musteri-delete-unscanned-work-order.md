# Müşteri/Yönetici Delete of Unscanned Work Order Groups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a müşteri or yönetici delete a work order group they created (all its QR codes), but only while no operator has scanned any package.

**Architecture:** A new `DELETE /romiot/station/qr-code/group/{id}` endpoint enforces a pure decision helper (`check_group_deletable`) — caller role, company ownership (`company_from`), and a zero-`work_orders` scanned guard — then deletes the group's `qr_code_data` + `work_order_pairs` + `work_order_routes` rows in one transaction. The İş Emirleri page renders an "İş Emrini Sil" button on owned, fully-unscanned groups that calls the endpoint and refetches.

**Tech Stack:** FastAPI + SQLAlchemy async (Postgres `romiot` DB); Next.js / React + TypeScript frontend; `unittest` for backend unit tests (DB mocked, helpers tested in isolation — house pattern).

**Spec:** [docs/superpowers/specs/2026-06-30-musteri-delete-unscanned-work-order-design.md](../specs/2026-06-30-musteri-delete-unscanned-work-order-design.md)

---

## File Structure

- **Modify** `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` — add pure helper `check_group_deletable(...)` and the `DELETE /group/{work_order_group_id}` endpoint; extend imports.
- **Create** `dtbackend/test_qr_group_delete_helper.py` — `unittest` tests for `check_group_deletable` (DB mocked / not needed; pure function).
- **Modify** `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx` — deletability predicate, delete handler, and the "İş Emrini Sil" button + a `deletingGroupId` state.

No DB migration. The router prefix is `/romiot/station/qr-code` ([api.py:35](../../../dtbackend/app/api/v1/api.py#L35)), so the endpoint URL is `/romiot/station/qr-code/group/{id}`.

---

## Task 1: Backend pure decision helper `check_group_deletable`

A pure function the endpoint calls after loading the group's data. It raises `HTTPException` with the right status, or returns `None` when deletion is allowed. Unit-tested in isolation (matches the existing `test_qr_pairs_fallback_helper.py` style).

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` (add the helper near the other module-level helpers, after `_resolve_pairs`, before `generate_short_code` at line 79)
- Test: `dtbackend/test_qr_group_delete_helper.py`

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_qr_group_delete_helper.py`:

```python
"""Unit tests for `check_group_deletable` — the pure authorization/guard decision
for deleting an unscanned work order group. No DB: the function takes plain values.

Run with:
    python -m unittest test_qr_group_delete_helper -v
"""
import unittest

from fastapi import HTTPException

from app.api.v1.endpoints.romiot.station.qr_code import check_group_deletable


class CheckGroupDeletableTest(unittest.TestCase):
    def test_musteri_owns_unscanned_group_allowed(self):
        # No exception means allowed.
        self.assertIsNone(
            check_group_deletable(
                role_values=["atolye:musteri"],
                payload_company_froms=["ACME", "ACME"],
                scanned_count=0,
                caller_company="ACME",
            )
        )

    def test_yonetici_owns_unscanned_group_allowed(self):
        self.assertIsNone(
            check_group_deletable(
                role_values=["atolye:yonetici"],
                payload_company_froms=["DIGINNO"],
                scanned_count=0,
                caller_company="DIGINNO",
            )
        )

    def test_non_creator_role_forbidden(self):
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:operator"],
                payload_company_froms=["ACME"],
                scanned_count=0,
                caller_company="ACME",
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_other_company_group_forbidden(self):
        # Group created by another company (e.g. a yönetici seeing an incoming QR).
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:yonetici"],
                payload_company_froms=["ACME"],
                scanned_count=0,
                caller_company="DIGINNO",
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_mixed_ownership_forbidden(self):
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:musteri"],
                payload_company_froms=["ACME", "OTHER"],
                scanned_count=0,
                caller_company="ACME",
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_scanned_group_conflict(self):
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:musteri"],
                payload_company_froms=["ACME"],
                scanned_count=2,
                caller_company="ACME",
            )
        self.assertEqual(ctx.exception.status_code, 409)

    def test_role_checked_before_scanned_guard(self):
        # An operator on a scanned group still gets 403 (role), not 409.
        with self.assertRaises(HTTPException) as ctx:
            check_group_deletable(
                role_values=["atolye:operator"],
                payload_company_froms=["ACME"],
                scanned_count=5,
                caller_company="ACME",
            )
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dtbackend && python -m unittest test_qr_group_delete_helper -v`
Expected: FAIL — `ImportError: cannot import name 'check_group_deletable'`.

- [ ] **Step 3: Add the helper**

In `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`, insert after the `_resolve_pairs` function (which ends at line 75) and its trailing blank lines, before `def generate_short_code` (line 79):

```python
def check_group_deletable(
    *,
    role_values: list[str],
    payload_company_froms: list[str],
    scanned_count: int,
    caller_company: str,
) -> None:
    """Authorize + guard deletion of an unscanned work order group.

    Raises HTTPException (403/409) when deletion is not allowed; returns None when
    it is. Pure decision logic — the caller loads the group's qr rows (and 404s on
    an empty group) before calling this.

    Rules:
      - caller must hold atolye:musteri or atolye:yonetici (else 403),
      - every qr payload's company_from must equal the caller's company — i.e. the
        caller's company created the group (else 403),
      - the group must be fully unscanned: zero work_orders rows (else 409).
    """
    has_create_role = "atolye:musteri" in role_values or "atolye:yonetici" in role_values
    if not has_create_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için müşteri veya yönetici yetkisi gereklidir.",
        )
    if any(cf != caller_company for cf in payload_company_froms):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu iş emrini silme yetkiniz yok.",
        )
    if scanned_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu iş emri okutulmaya başlandığı için silinemez.",
        )
```

(`HTTPException` and `status` are already imported at the top of the file, lines 7.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dtbackend && python -m unittest test_qr_group_delete_helper -v`
Expected: PASS — all 7 tests OK.

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/test_qr_group_delete_helper.py
git commit -m "feat(qr-code): add check_group_deletable decision helper"
```

---

## Task 2: Backend DELETE endpoint

Wire the endpoint that loads the group, calls the helper, and deletes the rows. This is DB-touching glue (no unit test, consistent with the file's other endpoints which are not unit-tested); verified by an import smoke check plus the manual flow in Task 3.

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` (imports + new endpoint appended after `get_qr_codes_by_work_order_group`, which ends at line 412)

- [ ] **Step 1: Extend imports**

In `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`, change the SQLAlchemy import (line 8) from:

```python
from sqlalchemy import select, text
```

to:

```python
from sqlalchemy import delete, func, select, text
```

And change the models import (line 14) from:

```python
from app.models.romiot_models import CompanyIntegration, QRCodeData, WorkOrderPair
```

to:

```python
from app.models.romiot_models import (
    CompanyIntegration,
    QRCodeData,
    WorkOrder,
    WorkOrderPair,
    WorkOrderRoute,
)
```

- [ ] **Step 2: Append the DELETE endpoint**

At the end of `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` (after the `get_qr_codes_by_work_order_group` function, line 412), add:

```python
@router.delete("/group/{work_order_group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_work_order_group(
    work_order_group_id: str,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Delete an unscanned work order group (all its QR codes) created by the
    caller's company.

    Müşteri/yönetici only. Blocked once any package has been scanned (a work_orders
    row exists). Removes the group's qr_code_data, work_order_pairs and any
    work_order_routes rows in one transaction. See check_group_deletable for rules.
    """
    role_values = current_user.role if isinstance(current_user.role, list) else []
    caller_company = (await require_user_company(current_user, romiot_db)).name

    # qr_code_data has no group column; the id lives in the JSON `data`.
    qr_rows = (
        await romiot_db.execute(
            select(QRCodeData).where(
                text("data::jsonb ->> 'work_order_group_id' = :gid")
            ),
            {"gid": work_order_group_id},
        )
    ).scalars().all()
    if not qr_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="İş emri bulunamadı")

    payload_company_froms: list[str] = []
    for row in qr_rows:
        try:
            payload = json.loads(row.data)
        except (json.JSONDecodeError, ValueError):
            payload = {}
        payload_company_froms.append(str(payload.get("company_from") or "").strip())

    scanned_count = (
        await romiot_db.execute(
            select(func.count())
            .select_from(WorkOrder)
            .where(WorkOrder.work_order_group_id == work_order_group_id)
        )
    ).scalar_one()

    check_group_deletable(
        role_values=role_values,
        payload_company_froms=payload_company_froms,
        scanned_count=scanned_count,
        caller_company=caller_company,
    )

    await romiot_db.execute(
        delete(WorkOrderRoute).where(WorkOrderRoute.work_order_group_id == work_order_group_id)
    )
    await romiot_db.execute(
        delete(WorkOrderPair).where(WorkOrderPair.work_order_group_id == work_order_group_id)
    )
    for row in qr_rows:
        await romiot_db.delete(row)
    await romiot_db.commit()
    return None
```

- [ ] **Step 3: Smoke-check the module imports**

Run: `cd dtbackend && python -c "import app.api.v1.endpoints.romiot.station.qr_code as m; print('delete_work_order_group' in dir(m))"`
Expected: prints `True` with no import error.

- [ ] **Step 4: Re-run the helper tests (regression)**

Run: `cd dtbackend && python -m unittest test_qr_group_delete_helper -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
git commit -m "feat(qr-code): DELETE /group/{id} to remove unscanned work order group"
```

---

## Task 3: Frontend "İş Emrini Sil" button on İş Emirleri

Add the deletability predicate, the delete handler, and the button. Verified manually against the dev server (no unit-test harness for these pages in this repo).

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx`

Context already present in the file: `isMusteri`/`isYonetici` state, `userCompany` state, `ApiError` + `api` imports, `fetchWorkOrders` callback, `setExpandedWorkOrders`, `setError`, and `GroupedWorkOrder` (which has `company_from`, `entries`, `part_number`, `revision_number`, `work_order_group_id`).

- [ ] **Step 1: Add `deletingGroupId` state**

In `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx`, immediately after the `expandedWorkOrders` state declaration (line 133):

```tsx
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<string>>(new Set());
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the deletability predicate and delete handler**

In the same file, add these just before the `// Access check` block (line 847, the `if (!isYonetici && !isOperator && ...)` guard):

```tsx
  // A group is deletable only when the caller created it (company_from) and no
  // package has been scanned yet — fully-unscanned groups have only synthetic
  // entries (entrance_date === null). Mirrors the backend guard.
  const isGroupDeletable = (wo: GroupedWorkOrder): boolean =>
    (isMusteri || isYonetici) &&
    wo.company_from === userCompany &&
    wo.entries.length > 0 &&
    wo.entries.every((e) => e.entrance_date === null);

  const handleDeleteGroup = async (wo: GroupedWorkOrder) => {
    const label = `${wo.part_number}${wo.revision_number ? `/${wo.revision_number}` : ""}`;
    if (!window.confirm(`${label} iş emri ve tüm QR kodları kalıcı olarak silinecek. Emin misiniz?`)) {
      return;
    }
    try {
      setDeletingGroupId(wo.work_order_group_id);
      setError(null);
      await api.delete(`/romiot/station/qr-code/group/${encodeURIComponent(wo.work_order_group_id)}`);
      setExpandedWorkOrders((prev) => {
        const next = new Set(prev);
        next.delete(wo.work_order_group_id);
        return next;
      });
      await fetchWorkOrders();
    } catch (err: any) {
      let msg = "İş emri silinirken hata oluştu";
      if (err instanceof ApiError) {
        try {
          msg = JSON.parse(err.message).detail || msg;
        } catch {
          msg = err.message || msg;
        }
      }
      setError(msg);
      // The group may have been scanned between render and click — refetch so the
      // row (and its now-removed delete button) reflects current state.
      await fetchWorkOrders();
    } finally {
      setDeletingGroupId(null);
    }
  };
```

- [ ] **Step 3: Render the button in the expanded action row**

In the same file, the expanded panel's action row currently is (lines 1199-1231):

```tsx
                              {(isMusteri || isYonetici || isOperator) && (
                                <div className="mb-5 flex flex-wrap gap-2">
                                  {(isMusteri || isYonetici || isOperator) && (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await fetchGroupQrCodes(wo.work_order_group_id);
                                          setQrModalGroupId(wo.work_order_group_id);
                                        } catch (err) {
                                          console.error("Error fetching group QR codes:", err);
                                          setError("QR kodları yüklenirken hata oluştu");
                                        }
                                      }}
                                      className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                      QR Kodları Gör / Yazdır
                                    </button>
                                  )}
                                  {isYonetici && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openRouteModal(wo);
                                      }}
                                      className="px-4 py-2 text-sm font-medium text-[#0f4c3a] border border-[#0f4c3a] hover:bg-[#0f4c3a]/10 rounded-lg transition-colors"
                                    >
                                      {routeExistsByGroup[wo.work_order_group_id] ? "Rota Düzenle" : "Rota Tanımla"}
                                    </button>
                                  )}
                                </div>
                              )}
```

Add the delete button as the last child inside that `<div className="mb-5 flex flex-wrap gap-2">`, immediately after the `{isYonetici && ( ... )}` route button block and before the closing `</div>`:

```tsx
                                  {isGroupDeletable(wo) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteGroup(wo);
                                      }}
                                      disabled={deletingGroupId === wo.work_order_group_id}
                                      className="px-4 py-2 text-sm font-medium text-red-700 border border-red-300 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {deletingGroupId === wo.work_order_group_id ? "Siliniyor..." : "İş Emrini Sil"}
                                    </button>
                                  )}
```

Note: the outer wrapper condition `(isMusteri || isYonetici || isOperator)` already lets müşteri and yönetici reach this row, so no wrapper change is needed.

- [ ] **Step 4: Type-check the frontend**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no new errors referencing `is-emirleri/page.tsx` (`isGroupDeletable`, `handleDeleteGroup`, `deletingGroupId`).

- [ ] **Step 5: Manual verification (dev server)**

Start the backend and `cd dtfrontend && npm run dev`. As an `atolye:musteri` user:
1. On the Müşteri page, create a batch (e.g. 2 packages).
2. Open İş Emirleri. The new group shows station "Girişi yapılmadı" and an "İş Emrini Sil" button in its expanded panel.
3. Click it, confirm → the row disappears after refetch; reopening shows it gone.
4. Create another batch; scan one package as an operator; return to İş Emirleri as the müşteri → the "İş Emrini Sil" button is absent for that group (an entry now has a real `entrance_date`).

Expected: delete works for fully-unscanned owned groups; button hidden once scanned.

- [ ] **Step 6: Commit**

```bash
git add "dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx"
git commit -m "feat(is-emirleri): delete button for unscanned work order groups (müşteri/yönetici)"
```

---

## Self-Review

**Spec coverage:**
- New `DELETE /romiot/station/qr-code/group/{id}` → Task 2. ✓
- Role gate müşteri+yönetici → `check_group_deletable` (Task 1), enforced in endpoint (Task 2), UI gate (Task 3). ✓
- Ownership `company_from == caller company` → helper + endpoint (loads payload company_froms). ✓
- Scanned guard (zero `work_orders`) → helper 409 + endpoint count query. ✓
- Delete qr_code_data + work_order_pairs + work_order_routes in one transaction → Task 2. ✓
- 404 on unknown group → Task 2 endpoint. ✓
- Frontend button on owned + fully-unscanned groups, confirm, refetch, 409 handling → Task 3. ✓
- Visibility/page access already satisfied (no task needed) — noted in spec; `allowed: ... || isMusteri` at [atolye/page.tsx:115](../../../dtfrontend/src/app/[platform]/atolye/page.tsx#L115) and the page renders for müşteri. ✓

**Placeholder scan:** none — every code step has full content.

**Type consistency:** helper name `check_group_deletable` and its keyword args (`role_values`, `payload_company_froms`, `scanned_count`, `caller_company`) are identical across Task 1 (def + tests) and Task 2 (call site). Frontend `isGroupDeletable` / `handleDeleteGroup` / `deletingGroupId` consistent across Task 3 steps. Endpoint path `/romiot/station/qr-code/group/{id}` matches the registered prefix and the frontend call. ✓
