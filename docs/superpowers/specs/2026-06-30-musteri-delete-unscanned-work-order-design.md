# Müşteri/Yönetici delete of unscanned work order groups

**Date:** 2026-06-30
**Scope:** atolye is-emirleri page; backend `romiot/station/qr-code`. No DB migration.

## Problem

A müşteri (and yönetici, the other batch-creator role) can create a work order
batch on the Müşteri page (`POST /romiot/station/qr-code/generate-batch`), which
writes `qr_code_data` rows (one per package) and `work_order_pairs` rows, keyed by
`work_order_group_id`. There is currently **no way to undo a mistaken creation**.
Once printed/created, the only path is to ignore it.

The İş Emirleri page (`GET /romiot/station/work-orders/all`) already lists these
created-but-unscanned groups: for müşteri/yönetici it merges synthetic entries from
`qr_code_data` whose payload `company_from` matches the caller's company, rendered
with `station_name = "Girişi yapılmadı"`, `entrance_date = null`, negative `id`.
So the surface to delete from already exists and is already company-scoped — we
only need the delete action.

## Goals

- Müşteri and yönetici can delete a work order group **they created** (whole group,
  all package QR codes) directly from the İş Emirleri page.
- Deletion is allowed **only while the group is fully unscanned** — no `work_orders`
  rows exist for the `work_order_group_id`. Once any operator scans a package,
  deletion is blocked (protects station tracking, scan audit, and MES/Toy push state).

## Non-goals

- Per-package deletion (whole group only).
- Deleting scanned/in-progress work orders.
- Operator/satınalma delete (view-only roles for this action).
- Any DB schema change.

## Ownership rule (uniform for both roles)

A group is deletable by the caller iff:

1. Caller has role `atolye:musteri` or `atolye:yonetici`.
2. Every `qr_code_data` row for the group has payload `company_from == caller's
   company` (resolved via `require_user_company`). This is "created by their
   company" — identical to the visibility scope müşteri already has, and for
   yönetici-created groups `company_from` is their own company (F1.4 locks a
   yönetici's target to their own company at creation).
3. Zero `work_orders` rows exist for the `work_order_group_id`.

A yönetici therefore cannot delete another company's incoming QR that merely
*targets* their workshop — they did not create it.

## Backend

New endpoint in
[qr_code.py](../../../dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py),
symmetric with the existing `GET /group/{work_order_group_id}`:

```
DELETE /romiot/station/qr-code/group/{work_order_group_id}  -> 204 No Content
```

Logic:

1. Role check: caller must have `atolye:musteri` or `atolye:yonetici`; else 403.
2. Resolve caller company via `require_user_company`.
3. Load `qr_code_data` rows for the group. If none → 404 (`İş emri bulunamadı`).
4. Ownership: if any row's payload `company_from != caller company` → 403
   (`Bu iş emrini silme yetkiniz yok`).
5. Scanned guard: if any `work_orders` row exists for the group → 409
   (`Bu iş emri okutulmaya başlandığı için silinemez`).
6. In one transaction, delete for the group:
   - `qr_code_data` rows (matched by payload `work_order_group_id`),
   - `work_order_pairs` rows (`work_order_group_id ==`),
   - `work_order_routes` rows (`work_order_group_id ==`) — a yönetici may have
     pre-defined a route on the unscanned group. Deleting route rows is safe; the
     `ON DELETE RESTRICT` FK on `work_order_routes.station_id` only blocks deleting
     *stations*, not route rows.
   No `work_order_scans` or external MES rows can exist for an unscanned group, so
   nothing external needs cleanup — the scanned guard is what protects MES state.
7. Commit; return 204.

`qr_code_data` has no `work_order_group_id` column — the group id lives inside the
JSON `data`. Match rows the same way the existing GET does:
`data::jsonb ->> 'work_order_group_id' = :group_id`, plus
`data::jsonb ->> 'company_from' = :company` for the ownership filter, scoped in SQL
so the delete only ever touches the caller's own rows.

## Frontend

[is-emirleri/page.tsx](../../../dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx):

- A group is **unscanned/deletable** in the UI when
  `wo.entries.every(e => e.entrance_date === null)` (synthetic entries have null
  entrance and negative id) **and** `wo.company_from === userCompany`
  (`userCompany` already comes from `useMyCompany`) **and** `(isMusteri || isYonetici)`.
- In the expanded group panel's action row (next to "QR Kodları Gör / Yazdır"),
  render a red **"İş Emrini Sil"** button when deletable.
- Click → `window.confirm` (`"<group/part> iş emri ve tüm QR kodları kalıcı olarak
  silinecek. Emin misiniz?"`).
- On confirm: `await api.delete('/romiot/station/qr-code/group/' +
  encodeURIComponent(wo.work_order_group_id))`, then `await fetchWorkOrders()` and
  collapse the row.
- On 409 (already scanned, e.g. an operator scanned between render and click): show
  the server message in the existing `error` banner and refetch so the row updates.

Verify `api.delete` exists in [lib/api.ts](../../../dtfrontend/src/lib/api.ts); add a
thin `delete` method if missing (mirroring `get`/`post`).

## Testing

Backend (pytest, mirrors existing qr_code tests):
- müşteri deletes own unscanned group → 204; `qr_code_data`/`work_order_pairs`/
  `work_order_routes` rows for the group are gone.
- group with ≥1 `work_orders` row → 409, nothing deleted.
- group owned by another company (`company_from` mismatch) → 403, nothing deleted.
- unknown group id → 404.
- operator/satınalma caller → 403.
- yönetici deletes own unscanned group → 204.

Frontend (manual, dev server):
- As müşteri: create a batch on Müşteri page; open İş Emirleri; the "Girişi
  yapılmadı" group shows "İş Emrini Sil"; delete → row disappears after refetch.
- Scan one package as operator, return as müşteri → button is gone (entrance_date set).

## Open questions

None.
