# Atölye — Cross-Station Partial Flow (Kısmi Adet İstasyonlar Arası Akış)

**Date:** 2026-07-02
**Status:** Design approved (pending spec review)
**Follows:** `2026-06-16-atolye-partial-quantity-design.md`

## Problem

The partial-quantity feature (2026-06-16) let an operator scan **part** of a
package at a station and continue the rest later — but only *within* a single
station. Moving partial quantities *between* stations is still blocked.

Reproduction (operator's report):

- A work order group has route **A → B → C** and one package of `quantity = 488`.
- At **B**, the operator enters 88 pieces and exits 88 pieces
  (`entered_quantity = 88`, `exited_quantity = 88`).
- Scanning to **enter at C** is rejected: *"Bu iş emri grubu şu anda 'B'
  atölyesinde aktif. Önce mevcut atölyeden çıkış yapılmalıdır."*

The operator expects the 88 pieces that have left B to be enterable at C, while
the remaining pieces continue through B.

## Root cause

Two mechanisms, both keyed off **full** package exit:

1. **`exit_date` is stamped only at full exit.** In `update_exit_date`
   (`work_order.py`): `if work_order.exited_quantity >= work_order.quantity: work_order.exit_date = now`.
   With `exited=88 < quantity=488`, B's row keeps `exit_date IS NULL`.

2. **The between-station gate is a group-level mutual-exclusion lock keyed off
   `exit_date IS NULL`.** The "active-at-other-station" check in
   `create_work_order` (`work_order.py`, the block raising *"…atölyesinde aktif.
   Önce mevcut atölyeden çıkış yapılmalıdır."*) rejects any entrance at C while
   *any* row of the group at another station has `exit_date IS NULL`. B's
   partially-exited row still reads as "fully active at B," so C is blocked.

The route-order helper `_route_expected_position` has the same defect: it treats
progress by `exit_date IS NOT NULL` (full exit), so a partially-exited station
counts as "not yet passed."

This behavior was the **documented** decision in the 2026-06-16 spec
("A partially-exited package … cannot be started at another station until fully
exited"). Partial handoff between stations was out of scope then; this design
adds it.

## Confirmed decisions

1. **Gate by pieces exited from the previous route station.** A downstream
   station may accept at most the pieces that have exited the immediately
   preceding route station (piece-flow accounting), replacing the group-level
   mutex.
2. **No-route groups: remove between-station gating entirely.** Groups without a
   route have no defined station order, so there is no "previous station." They
   get no cross-station gate at all — each station accepts pieces up to the
   package `quantity`. (This changes legacy/no-route behavior from
   one-station-at-a-time to unrestricted; accepted because routes are the norm
   for current work orders.)
3. **Make the route-order check piece-aware** (both entrance and exit), so
   moving partial quantities forward does not trip a spurious "out of order"
   warning on every scan.

## The flow model

For a **routed** group, stations are ordered by `work_order_routes.position`
(0..N). Route rows are per-group; route progress is evaluated **per-package**.
Define per-package, per-position counters from the `WorkOrder` row at each
position's station: `entered[p]`, `exited[p]`.

- **Entry station (position 0):** entrance cap = package `quantity`. Unchanged.
- **Downstream in-route station (position p ≥ 1):** entrance cap = `exited[p-1]`
  (pieces that have left the previous route station). So
  `entered[p] + scan ≤ exited[p-1]`.
- **Off-route station** (station not in the group's route) **and no-route
  group:** entrance cap = `quantity` (no flow gate).
- **Exit (any station):** unchanged — `exited[p] + scan ≤ entered[p]`.

Invariant for a routed group:
`exited[p] ≤ entered[p] ≤ exited[p-1] ≤ … ≤ entered[0] ≤ quantity`.

The group-level "one active station at a time" lock is removed; a package
legitimately occupies multiple stations at once and the flow cap is the safety
mechanism in its place.

## Section 1 — Entrance endpoint (`create_work_order`)

File: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`.

1. **Remove the active-at-other-station mutex block** (the query selecting a
   different-station row with `exit_date IS NULL`, and the `HTTPException` it
   raises). It is fully deleted — for both routed and no-route groups.

2. **Single ordered algorithm** for the entrance decision. `route_rows`
   (position, station_id) are already loaded for the F6 block. Let `this_pos` be
   this station's position in `route_rows` (or `None` if off-route), `entered` be
   the current row's `entered_quantity` (0 if no row yet), and `quantity` the
   package cap from the payload. Evaluate in this order:

   1. `scan_quantity ≥ 1`, else 400 "Giriş miktarı en az 1 olmalıdır".
   2. **Determine the branch:**
      - **Flow-gated** iff the group has a route **and** `this_pos is not None`
        **and** `this_pos ≥ 1` **and not** `acknowledged_route_violation`.
      - Otherwise **capped-at-quantity** (entry station `this_pos == 0`, no
        route, off-route, or acknowledged override).
   3. **Flow-gated branch:** resolve `prev_station_id` = station at
      `this_pos - 1`; read `WorkOrder.exited_quantity` for
      `(prev_station_id, group, package_index)` (0 when no row) → `prev_exited`.
      Let `flow_remaining = prev_exited − entered`.
      - If `flow_remaining ≤ 0` → **soft** `route_out_of_order` warning
        (acknowledgeable), replacing the old `_route_expected_position`
        comparison:
        `{ "type": "route_out_of_order", "message": "Önceki istasyondan ({prev_name}) çıkış yapılmış parça yok. Yine de devam etmek istiyor musunuz?", "expected_position": this_pos − 1, "actual_position": this_pos }`.
        Acknowledging re-POSTs with `acknowledged_route_violation = True`, which
        re-routes to the capped-at-quantity branch (override).
      - Else (`flow_remaining > 0`, in-order, no warning): require
        `scan_quantity ≤ flow_remaining`, else **hard** 400 "Girilen miktar
        önceki istasyondan çıkan adedi aşamaz (kalan: {flow_remaining})".
   4. **Capped-at-quantity branch:** the existing F6 handling for `this_pos is
      None` (soft `route_off` warning when not acknowledged) is preserved.
      Then require `entered + scan_quantity ≤ quantity`, else **hard** 400
      "Girilen miktar paket adedini aşamaz (kalan: {quantity − entered})".

   The current `_check_entrance_scan` (cap = `quantity` only) is generalized into
   this branch logic; the soft-warning check now runs *before* the hard cap check
   so "nothing available yet" is acknowledgeable rather than a hard reject.

3. **Concurrency:** read `prev_exited` inside the same transaction as the
   existing `with_for_update()` on the current row, and lock the previous
   station's row (`SELECT … FOR UPDATE`) so two concurrent entrances at the same
   downstream station cannot both pull the same pieces forward.

`_route_expected_position` is used only here; it is replaced by the previous-
station-exited lookup and can be removed (or kept only if another use appears).

## Section 2 — Exit endpoint (`update_exit_date`)

File: same.

- `_check_exit_scan` (`exited + scan ≤ entered`) is unchanged.
- **Drop the exit route-order warning block** (the query computing
  `expected_exit_pos` from the highest non-exited route position and the
  `route_out_of_order` / `route_off` it raises). Once a package can occupy B and
  C simultaneously, "exit at B while C is also active" is legitimate; exiting is
  valid wherever `entered > exited`, which `_check_exit_scan` already enforces.
- `exit_date`-at-full-exit (`exited_quantity >= quantity`) and the `delivered`
  rollup + priority-token refund are **untouched**. A group still becomes
  `delivered` only when every package's `exit_date` is set at the exit station —
  i.e. all pieces have flowed all the way through — which remains correct.

## Section 3 — `package-status` endpoint + frontend

### Backend

- `PackageStatus` schema (`dtbackend/app/schemas/work_order.py`): add
  `available_to_enter: int`.
- `get_package_status` (`work_order.py`): add a `quantity` query param (the
  package cap, which the frontend has from the scanned QR payload) and compute
  `available_to_enter = max(0, entrance_cap − entered_quantity)` using the same
  `entrance_cap` rule as Section 1 (no `acknowledged_route_violation` context
  here — it reflects the non-override cap). `exists`, `entered_quantity`,
  `exited_quantity` are unchanged.

### Frontend

File: `dtfrontend/src/app/[platform]/atolye/operator/page.tsx`.

- The entrance branch passes `quantity` to `package-status` and uses
  `available_to_enter` as the modal default **and** max, instead of
  `quantity − entered_quantity`.
- The `remaining === 0` branch distinguishes the two zero cases for the info
  message: "Bu paket tamamen girildi" when `entered_quantity >= quantity`, vs.
  "Önceki istasyondan çıkış yapılmış parça yok" for a downstream station with
  nothing available yet.
- The exit path (`entered_quantity − exited_quantity`) is unchanged.
- The `QuantityModal` max/clamp already binds to the passed remaining value; no
  component change beyond the value it receives.

## Section 4 — Deliberately unchanged / known nuances

- **Mekasan push** (`toy_api_service.py`) is per-station-row and already sends
  each row's `exited_quantity`; no change.
- **Tracker** (`/track`, `urunum-nerede`): a package active at B and C shows
  both as active on the timeline; `_assemble_track_match` "current location"
  picks the lowest active route position. Acceptable; not modified here.
- **Scrap:** if pieces are lost mid-route, `exit_date` never stamps and the
  group never marks delivered. No scrap concept exists today; out of scope.
- **Route loops** (a station appearing at two route positions) remain
  unsupported, consistent with the existing per-station unique constraint.

## Section 5 — Edge cases, validation, testing

- Caps enforced **server-side** (source of truth), mirrored client-side for the
  modal default via `available_to_enter`.
- Acknowledged override (`acknowledged_route_violation`) bypasses the flow cap
  and uses `quantity`, preserving the existing off-route override path.

### Tests (backend, pure helpers where possible)

- Downstream entrance cap equals `prev_exited`; `entered + scan > prev_exited`
  rejected; `entered + scan ≤ prev_exited` accepted.
- Flow-aware in-order vs. out-of-order: `prev_exited − entered > 0` ⇒ in-order
  (no warning); `≤ 0` ⇒ `route_out_of_order` warning.
- No-route group: entrance ungated across stations (cap = `quantity` per
  station); no active-at-other-station rejection.
- `available_to_enter`: entry station = `quantity − entered`; downstream =
  `prev_exited − entered`; off-route = `quantity − entered`; never negative.
- Exit still capped by `entered`; exiting at B while C is active is accepted
  (no route-order warning).
- Regression: the 88-of-488 scenario — enter 88/exit 88 at B, then enter 88 at
  C succeeds; a 89th piece at C is rejected until B exits more.
- Update `test_partial_quantity_helper.py` where the entrance-cap assumption
  changed from `quantity` to the flow cap.

### Tests (frontend)

- Entrance modal default/max = `available_to_enter` for a downstream station.
- `available_to_enter === 0` shows the "previous station" message and skips the
  modal.

## Out of scope

- Tracker "current location" refinement for packages spanning multiple stations.
- Any scrap / loss accounting.
- An explicit operator "force enter beyond flow" button (the acknowledged-
  override API path remains for data-correction edge cases).
