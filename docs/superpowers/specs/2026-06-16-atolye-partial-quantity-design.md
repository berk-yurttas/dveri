# Atölye — Partial Quantity Scan (Kısmi Adet)

**Date:** 2026-06-16
**Status:** Design approved (pending spec review)

## Problem

Today, when an operator scans a package QR code in the Atölye operator screen,
the system assumes the operator is working on the **whole package**. Entrance
creates exactly one `work_orders` row per `(station, group, package)` and exit
just stamps `exit_date` on it — both are all-or-nothing at the package level.

Operators need to work on **part** of a package and continue the rest later. We
will show a quantity modal after each scan so the operator picks how many pieces
they're working on, while keeping the common "whole package" case to a single
click.

## Confirmed requirements

1. **Accumulative partial, re-scan allowed.** A package can be scanned multiple
   times at the same station. Each scan logs a partial quantity. The package is
   "done" (for that direction) when the running total reaches the package's full
   piece count.
2. **Both directions, symmetric.** The modal appears on both *İş Emri Giriş*
   (entrance) and *İş Emri Çıkış* (exit). Entrance accumulates **entered**
   pieces; exit accumulates **exited** pieces.
3. **Invariant `exited ≤ entered ≤ quantity`.** You can never exit more pieces
   than have been entered at that station, and never enter/exit more than the
   package's full piece count. Example: if 8 pieces are entered, at most 8 can be
   exited.
4. **Default = remaining, one click for the whole package.** The modal pre-fills
   the maximum remaining for that package and autofocuses Confirm, so an operator
   working the whole package just confirms once.
5. **Storage = counters + audit log.** Running totals live on the existing
   `work_orders` row; every individual scan is also written to a new append-only
   `work_order_scans` table for traceability (who worked how many pieces, when).

## Architecture decision

We keep **one `work_orders` row per `(station, group, package)`** (the existing
`uq_work_order_package` unique constraint stays) and add piece-level counters,
rather than creating one row per scan ("lot" rows). This keeps the route/F6,
"active-at-other-station", `delivered`, and `is_first_scan_for_group` machinery —
all of which key off `exit_date` and row existence — essentially unchanged. The
per-scan audit need is met by the separate `work_order_scans` table instead of
multiplying core rows.

`exit_date` keeps its meaning of "this package has fully left this station"; it is
stamped only when `exited_quantity == quantity`. A partially-exited package still
has `exit_date IS NULL`, so it correctly reads as "active at this station" and
cannot be started at another station until fully exited.

## Section 1 — Data model & migration

### `work_orders` — add two columns
- `entered_quantity` INTEGER NOT NULL, server_default `'0'` — pieces entered at
  this station for this package.
- `exited_quantity` INTEGER NOT NULL, server_default `'0'` — pieces exited.
- Existing `quantity` stays = the package's full piece count (the cap, carried in
  the QR payload). Existing `entrance_date` = first entrance scan; `exit_date`
  stamped only at full exit.
- Invariant maintained in code: `0 ≤ exited_quantity ≤ entered_quantity ≤ quantity`.

### New table `work_order_scans` (append-only audit)
| column | type | notes |
|---|---|---|
| `id` | INTEGER PK | |
| `station_id` | INTEGER FK `stations.id` NOT NULL | |
| `work_order_group_id` | VARCHAR(50) NOT NULL, indexed | |
| `package_index` | INTEGER NOT NULL | |
| `direction` | VARCHAR(3) NOT NULL | `'in'` (entrance) or `'out'` (exit) |
| `quantity` | INTEGER NOT NULL | pieces in *this* scan |
| `user_id` | INTEGER NOT NULL | PostgreSQL user id (as elsewhere) |
| `qr_code` | VARCHAR(20) NULL | short code scanned, when available |
| `scanned_at` | TIMESTAMPTZ server_default now() | |

### Alembic migration (`alembic_romiot/versions`)
- Add the two `work_orders` columns and create `work_order_scans`.
- Backfill so existing history reads as whole-package:
  - `entered_quantity = quantity`
  - `exited_quantity = quantity` where `exit_date IS NOT NULL`, else `0`.

## Section 2 — Backend logic

### Schemas (`app/schemas/work_order.py`)
- `WorkOrderCreate`: add `scan_quantity: int` (pieces entered this scan, `≥ 1`).
  Keep `quantity` = package full count (the cap → stored on the row at creation).
- `WorkOrderUpdateExitDate`: add `scan_quantity: int` (pieces exited this scan,
  `≥ 1`).
- `WorkOrder`, `WorkOrderList`, `WorkOrderDetail`: add `entered_quantity`,
  `exited_quantity`.
- `WorkOrderCreateResponse` / `WorkOrderExitResponse`: add the affected package's
  `entered_quantity`, `exited_quantity`, `quantity` (for piece-level UI feedback).
- New `PackageStatus` response: `{ exists: bool, entered_quantity: int,
  exited_quantity: int }`.

### `POST /work-orders/` (entrance) — `create_work_order`
- Look up the existing row for `(station_id, work_order_group_id, package_index)`.
  - **No row:** create it with `quantity` (cap from payload),
    `entered_quantity = scan_quantity`, `exited_quantity = 0`, `entrance_date = now`.
    The first row for a group still sets `is_first_scan_for_group = True`
    (route picker trigger) — unchanged.
  - **Row exists:** **remove the hard duplicate-`400`**. Validate
    `entered_quantity + scan_quantity ≤ quantity` (else `400` "Girilen miktar
    paket adedini aşamaz"); then `entered_quantity += scan_quantity`. Do not
    change `entrance_date`.
- Validate `scan_quantity ≥ 1`.
- F5/F6 (entry-station + route) and active-at-other-station checks are unchanged
  (they key off row existence / `exit_date`); they remain correct for re-scans of
  an already-present, not-yet-exited package.
- Write a `work_order_scans` row with `direction='in', quantity=scan_quantity`.
- `packages_scanned` still counts rows (packages touched). Response carries the
  package's piece counters in addition.

### `POST /work-orders/update-exit-date` (exit) — `update_exit_date`
- Find the row (still `400` "Girişi yapılmayan iş emri çıkışı yapılamaz" if none).
- Validate `scan_quantity ≥ 1` and `exited_quantity + scan_quantity ≤
  entered_quantity` → `400` "Çıkış miktarı giriş miktarını aşamaz" otherwise.
- `exited_quantity += scan_quantity`; if `exited_quantity == quantity`, set
  `exit_date = now` (fully exited). Otherwise leave `exit_date` NULL.
- F6 route-on-exit check unchanged. `delivered` rollup at the exit station still
  fires when all packages of the group have `exit_date` set (i.e. fully exited),
  and priority-token refund logic is untouched.
- Write a `work_order_scans` row with `direction='out', quantity=scan_quantity`.
- `packages_exited` still counts rows with `exit_date IS NOT NULL`
  (fully-exited packages).

### New `GET /work-orders/package-status`
Query params: `station_id`, `work_order_group_id`, `package_index`. Returns
`PackageStatus`. Operator-role checked as elsewhere. The modal calls this right
after the QR is resolved to compute the default; the package cap (`quantity`)
comes from the scanned QR payload, so this endpoint only needs the counters
(`0/0` when no row yet).

### Mekasan integration (`app/services/toy_api_service.py`)
- `_build_payload_item`: `ActualQuantity = work_order.exited_quantity` (was
  `quantity if exit_date else 0`); `PlannedQuantity = quantity` (unchanged).
  `ActualEndDate` still comes from `exit_date`, so it is only populated at full
  exit.
- **Push cadence (chosen default):** keep firing the push on *every* scan
  (entrance and exit). Because `Mes_OrderId = {group_id}-{station.id}[-pair]` is
  stable, each push **updates** the same Mekasan order with the live
  `exited_quantity`. More accurate than today, at the cost of more calls.
  *(Alternative considered: push only when fully exited. Rejected for accuracy;
  revisit if Mekasan call volume is a concern.)*

## Section 3 — Frontend flow + Quantity Modal

File: `dtfrontend/src/app/[platform]/atolye/operator/page.tsx` and a new
`dtfrontend/src/components/atolye/QuantityModal.tsx`.

### New scan flow
1. Operator selects mode (entrance/exit).
2. Scans QR → existing retrieve resolves `QRCodeData` (gives `package_index`,
   `quantity` = package cap, etc.).
3. Call `GET /work-orders/package-status` for `(station, group, package_index)`.
4. Compute remaining:
   - entrance: `remaining = quantity − entered_quantity`
   - exit: `remaining = entered_quantity − exited_quantity`
5. `remaining === 0` → skip the modal, show an inline info message
   ("Bu paket tamamen girildi" / "Çıkışı yapılacak parça yok").
6. Otherwise open the **Quantity Modal** with `default = remaining`.
7. On confirm → POST (`/work-orders/` or `/update-exit-date`) with `scan_quantity`.

### `QuantityModal` component
- Header tinted by mode: entrance green `#0f4c3a`, exit red `#C53030` (matches the
  existing mode buttons).
- Context line: `part_number` + `Paket {package_index}/{total_packages}`, and the
  running state — `Girilen: {entered}/{quantity}` (entrance) or
  `Kalan çıkış: {entered − exited}` (exit).
- Large number stepper: `−` / value / `+` controls with touch targets ≥ 44px;
  input clamped `1..remaining`, **pre-filled with `remaining`**; a "Tümü" chip
  sets the value to `remaining`.
- Primary **Onayla** button autofocused so the whole-package case is one
  click/Enter; disabled when value is `< 1` or `> remaining`. **İptal** cancels.
- Esc cancels; focus trapped within the modal; `<label>`/`aria` on the input.
- While the modal is open, the global scanner key-capture effect is **paused**
  (guard flag) so keystrokes reach the input and a stray scanner Enter cannot
  double-fire a scan.

## Section 4 — Display / counters

- **Status badge:** show pieces with package context, e.g. *"Atölyede — 8/10
  parça"*.
- **Per-package progress bar (expanded row):** annotate entered vs exited pieces.
- **Expanded "Paket Detayları":** per package show `Girilen {entered}/{quantity}`
  and `Çıkan {exited}/{quantity}`.
- **scanProgress banner:** *"Paket {n}: {entered}/{quantity} girildi"* (entrance)
  / *"...{exited}/{quantity} çıkış yapıldı"* (exit).
- Frontend `WorkOrderDetail`/`WorkOrder` types and the table mapping gain
  `entered_quantity` / `exited_quantity` (now returned by the API).

## Section 5 — Edge cases, validation, testing

- Caps enforced **server-side** (source of truth) and mirrored client-side for UX.
- Interleaving allowed: enter 6 → exit 4 → enter 4 → exit 6, provided
  `exited ≤ entered ≤ quantity` holds at every step.
- The route-deviation re-post (`RouteWarningModal` → `pendingPayload`) must carry
  `scan_quantity` so an acknowledged scan applies the same partial amount.
- Concurrency: two operators scanning the same package could both read the same
  counters and over-apply. Enforce the cap in the same transaction that updates
  the row (re-read/guard before commit) so the DB rejects an over-cap update.

### Tests (backend)
- Partial entrance accumulates `entered_quantity` across re-scans; cap rejection
  when `entered + scan > quantity`.
- Exit-cap rejection when `exited + scan > entered`.
- `exit_date` is set only when `exited_quantity` reaches `quantity`; `delivered`
  rollup only when all packages fully exited.
- A `work_order_scans` row is written for each entrance and exit scan with the
  right `direction`/`quantity`/`user_id`.
- `package-status` returns correct counters (and `0/0` when no row).
- Migration backfill: pre-existing exited rows → `entered=exited=quantity`;
  active rows → `entered=quantity, exited=0`.

### Tests (frontend)
- Modal default equals remaining; confirm disabled at `0`/over-cap.
- `remaining === 0` path shows the inline message and skips the modal.
- Scanner key-capture is paused while the modal is open.

## Out of scope

- Partial-quantity display in the müşteri tracker / yönetici views beyond what the
  shared schemas naturally expose.
- Per-batch operator attribution surfaced in the UI (data is captured in
  `work_order_scans`; no new screen to browse it in this iteration).
