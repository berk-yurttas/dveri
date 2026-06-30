# Multi-QR per pair — design

**Date:** 2026-06-30
**Status:** Approved (design)

## Problem

When creating a work-order QR, the user can add multiple `(Sipariş No, Kalem No)`
pairs ("Malzemeler"). Today all pairs are bundled into **one** work order group:
`generate-batch` creates a single group, embeds the full pair list into every
package, and splits the total quantity into `Parti Sayısı` packages — one QR per
package, each carrying all pairs.

We want, when there are 2+ pairs, to let the user choose:

- **Single QR (combined):** current behavior — all pairs share one work order
  group / package set.
- **Multiple QRs (per pair):** each pair becomes its own independent work order
  group, with its **own quantity** and **own Parti Sayısı**, generating its own
  QR codes.

## Decisions (from brainstorming)

1. Multiple mode = **per-pair quantity AND per-pair Parti Sayısı**. Each pair is
   an independent work order group, split into its own parti packages. Total QRs
   in multiple mode = Σ over pairs of that pair's parti count.
2. **All header fields stay shared** across pairs: Ana Müşteri, Sektör, Hedef
   Firma, Teklif Numarası, Parça Numarası, Revizyon, Hedef Bitirme Tarihi. Only
   quantity + parti are per-pair.
3. Backend approach: **new dedicated endpoint** `generate-batch-multi`. The
   existing `generate-batch` (single mode) stays behaviorally unchanged. Chosen
   for atomicity, single round trip, and isolating new logic. (Approach B.)

## Architecture

### Backend — `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`

New schemas in `app/schemas/qr_code.py`:

- `MultiQRPairItem`: `aselsan_order_number: str`, `order_item_number: str`,
  `quantity: int = Field(..., gt=0)`, `package_quantity: int = Field(1, gt=0)`.
- `QRCodeMultiBatchCreate` (`extra:"forbid"`): shared header — `main_customer`,
  `sector`, `target_company`, `teklif_number`, `part_number`, `revision_number`,
  `target_date` — plus `items: list[MultiQRPairItem] = Field(..., min_length=1)`.
- `QRCodeMultiGroupResult`: `work_order_group_id: str`, `pair: OrderPair`,
  `total_packages: int`, `total_quantity: int`,
  `packages: list[QRCodePackageInfo]`.
- `QRCodeMultiBatchResponse`: `groups: list[QRCodeMultiGroupResult]`,
  `expires_at: datetime | None`.

New endpoint `POST /generate-batch-multi`:

- Reuses the **exact** auth/role checks, `target_company` validation against
  `company_integrations`, and the yönetici-only target lock from
  `generate_qr_code_batch`.
- In a **single transaction**, loops `items`. Each item:
  - its own `work_order_group_id` (`generate_work_order_group_id()`),
  - one `WorkOrderPair` row (idx 0) for its single pair,
  - package math (`base_qty = quantity // parti`, `remainder = quantity % parti`),
  - per-package `QRCodeData` records whose JSON payload is identical in shape to
    single mode, with `pairs` holding just that one pair, `total_quantity` = the
    item's quantity, `package_index`/`total_packages` scoped to the item.
  - Per-item guard: `package_quantity > quantity` → HTTP 400 (mirrors single mode).
- Any unique-code exhaustion → `rollback()` of the whole batch (atomic).
- Returns `QRCodeMultiBatchResponse`.

**Shared helper (reuse / DRY):** extract `_build_group_packages(...)` covering
package math + unique short-code generation + payload construction + record
`add`s for one group, and call it from **both** the single and multi endpoints.
Single mode's externally observable behavior must remain identical, guarded by
its existing tests.

**Scan/retrieve path unchanged:** each per-pair group looks exactly like a
normal single-pair work order. `/retrieve/{code}`, `/group/{work_order_group_id}`,
and the operator scan flow need no changes — `_resolve_pairs` / `_normalize_pairs`
already handle single-pair payloads.

### Frontend — `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx`

- New state `qrMode: "single" | "multiple"` (default `"single"`).
- A mode toggle renders **only when `pairs.length > 1`**, offering "Tek QR
  (birleşik)" vs "Her Sipariş/Kalem No için ayrı QR". When pairs are deleted
  back to 1, `qrMode` silently resets to `"single"` and the toggle disappears.
- Each pair row object gains optional `quantity` / `package_quantity` (used only
  in multiple mode). In multiple mode, each row shows two extra inputs (Miktar,
  Parti Sayısı) and the global *Toplam Sipariş Miktarı* + *Parti Sayısı* fields
  are hidden.
- Validation (multiple mode): every pair needs `quantity > 0`, `parti ≥ 1`,
  `parti ≤ quantity`. Existing per-pair format/duplicate checks and the shared
  date / revision / part-number checks still run.
- Submit branches: single → existing `/generate-batch` (unchanged); multiple →
  new `/generate-batch-multi`.
- Results: new `generatedMulti` state rendered as **one section per pair** (pair
  header + its own package tabs), reusing the existing single-pair card layout.
  `buildPackageCardHtml` is parametrized to accept the card's pair(s) instead of
  reading global `barcodeFormData.pairs`, so each multi card shows its own pair.
  "Tümünü Yazdır" prints every group's every package; per-group and per-package
  print reuse the same builder.

## Testing

- **Backend:** unit tests for `_build_group_packages` (quantity split, remainder,
  `_index` suffix); multi-endpoint happy path (N groups, correct package/quantity
  counts); per-item `parti > quantity` → 400; atomic rollback on simulated
  code-gen exhaustion; auth/role/target rejections. Confirm single-endpoint tests
  still pass after the helper extraction.
- **Frontend:** per-pair quantity/parti validation; mode reset when pairs → 1;
  correct payload shape per mode.

## Out of scope

- Per-pair header fields (Parça No, Revizyon, etc. stay shared).
- Editing / regenerating existing work order groups.
- Changes to the operator scan UI.
- Single-pair forms — they behave exactly as today (no toggle shown).
