# "Ürünüm Nerede?" — Müşteri Product Tracking Page

**Date:** 2026-06-08
**Status:** Design approved (pending spec review)
**Platform area:** Atölye (workshop) — müşteri role

## 1. Summary

Add a customer-facing product-tracking page, **"Ürünüm Nerede?"**, to the Atölye
platform. A müşteri (the *Gönderen Firma* who creates work orders + QR codes on the
[Barkod Oluştur page](../../../dtfrontend/src/app/[platform]/atolye/musteri/page.tsx))
searches for a product they sent and sees **where it currently is** in the coating
company's station pipeline, with a visual route timeline.

The concept is taken from a standalone reference HTML
(`200015711742_aileti_.html`): a cargo-tracking-style search → result → timeline
flow. We adapt the *concept* to our existing design language (Tailwind, green
`#0f4c3a` + orange `#fe9526`, gray-50, Turkish UI) — not the reference's blue
ASELSAN skin — and to our real data model (work-order **groups** of N packages,
per-order **routes**, and QR-created-but-unscanned orders).

This reframes the same station-tracking data that powers the dense
[is-emirleri table](../../../dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx)
into a single-product, search-driven visual tracker.

## 2. Goals / Non-Goals

### Goals
- Müşteri can look up one of *their own* products by **Sipariş No + Kalem No** or
  **Parça No** and see its current station, status, and full route progress.
- Works for orders that are QR-created but **not yet scanned** (status
  *Girişi yapılmadı*).
- Visual route timeline (horizontal desktop / vertical mobile) overlaying the
  planned route with actual entry/exit history.
- Handles real-world data: multiple matching groups (selector), and multi-package
  groups whose packages sit at different stations (group summary + per-package strip).
- Strictly visible to **müşteri** accounts only.

### Non-Goals
- No new auth/login (platform auth + role context already exist).
- No changes to operator scanning, route definition, or priority flows.
- No editing/actions on the tracked product — read-only.
- No yönetici/operator/satınalma access to this page (they have is-emirleri).
- No real-time push; data is fetched per query (manual refresh only).

## 3. Decisions (resolved with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Search methods | Tab 1: **Sipariş No + Kalem No** (both required, matched on the same pair). Tab 2: **Parça No** (`part_number`). |
| 2 | Timeline basis | **Route + history overlay**; future route stations shown as *Bekliyor*. Fallback to history-only when the group has no route. |
| 3 | Visibility | **Müşteri only** (strict). Yönetici excluded. |
| 4 | Backend | **Dedicated endpoint** (`GET /romiot/station/work-orders/track`). |
| 5 | Multi-match | If >1 group matches → **short result list → open one**. Exactly 1 → open tracker directly. |
| 6 | Package detail | **Group summary + per-package strip** on one timeline (not one timeline per package, not group-only). |

## 4. Architecture

```
[atolye hub page]  → new card "Ürünüm Nerede?" (isMusteri only)
        │
        ▼
/{platform}/atolye/urunum-nerede   (new Next.js route, "use client")
        │  GET /romiot/station/work-orders/track?order_number=&order_item_number=  (or ?part_number=)
        ▼
[backend GET /track]  müşteri-only, scoped company_from == department
   ├─ resolve matching groups (WorkOrderPair / part_number / QRCodeData payloads)
   ├─ for each group: pairs, current-location summary, status, package summary
   └─ build route-overlaid timeline (WorkOrderRoute ⨝ WorkOrder history)
        │
        ▼
[response] → matches[] (list) OR single TrackResult with timeline + packages
```

### 4.1 Backend — new endpoint

Add to [work_order.py](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order.py)
(router already mounted at `/romiot/station/work-orders` in
[api.py:33](../../../dtbackend/app/api/v1/api.py#L33)):

```
GET /romiot/station/work-orders/track
  query: order_number: str | None
         order_item_number: str | None
         part_number: str | None
  auth:  check_authenticated; requires "atolye:musteri" in role
  scope: company_from == current_user.department  (the müşteri's own sent products)
```

**Validation**
- Require either (`order_number` AND `order_item_number`) **or** `part_number`.
  Otherwise `400`.
- Non-müşteri (no `atolye:musteri` role) → `403`.
- Empty `department` → `403` (cannot scope).

**Resolution (which groups match)** — reuse existing helpers/patterns:
1. **Scanned groups**: query `WorkOrder` rows where `company_from == department`,
   joined to matching criterion:
   - order+item: `EXISTS` on `WorkOrderPair` where `aselsan_order_number == order_number`
     AND `order_item_number == order_item_number` for the same `work_order_group_id`
     (exact match, not ilike, to identify a specific item).
   - part_number: `WorkOrder.part_number ilike %part_number%`.
   Collect distinct `work_order_group_id`s.
2. **Unscanned QR groups**: scan `QRCodeData` payloads the same way
   [/all does for müşteri](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L839-L954)
   — filter `company_from == department`, match pairs/part_number from the JSON
   payload, add groups not already in (1).
3. Exclude `delivered == True` groups? **No** — delivered/completed products should
   still be trackable (status *Tamamlandı*). (Differs from `/all`, which hides
   delivered.) This is intentional for a tracker.

**Per-group assembly**
For each matched group, gather all `WorkOrder` rows (all packages, all stations) +
station metadata (`name`, `is_entry_station`, `is_exit_station`) + the route
(`WorkOrderRoute` ordered by `position`, joined to `Station`).

- **Current location & status** — derived per group from package states (see §5).
- **Timeline** — route positions as the planned spine; for each route station,
  overlay the actual entry/exit history (earliest entry, latest exit across
  packages) and a per-step status (`done` / `active` / `delayed` / `waiting`).
  No route → ordered list of actually-visited stations (history-only).
- **Packages** — per package: `package_index`, current station name, status.

**New Pydantic schemas** (in
[app/schemas/work_order.py](../../../dtbackend/app/schemas/work_order.py),
reusing `OrderPair`):

```python
class TrackTimelineStep(BaseModel):
    position: int | None          # route position; None for history-only
    station_id: int
    station_name: str
    is_exit_station: bool
    status: str                   # "done" | "active" | "delayed" | "waiting"
    entry_date: datetime | None   # earliest package entry at this station
    exit_date: datetime | None    # latest package exit at this station

class TrackPackage(BaseModel):
    package_index: int
    total_packages: int
    quantity: int
    current_station_name: str | None   # None / "Girişi yapılmadı" when unscanned
    status: str                        # same status vocabulary as group

class TrackMatch(BaseModel):
    work_order_group_id: str
    part_number: str
    revision_number: str | None
    pairs: list[OrderPair]
    main_customer: str
    sector: str
    company_from: str               # Gönderen Firma (the müşteri)
    coating_company: str | None     # company that owns the stations (None if unscanned)
    teklif_number: str
    total_quantity: int
    total_packages: int
    target_date: date | None
    current_station_name: str | None
    current_entry_date: datetime | None
    status: str                     # group-level status (see §5)
    last_updated: datetime | None   # latest entry/exit across packages
    has_route: bool
    timeline: list[TrackTimelineStep]
    packages: list[TrackPackage]

class TrackResponse(BaseModel):
    matches: list[TrackMatch]       # 0 = not found; 1 = direct; >1 = selector
```

> Note on `coating_company`: derived from the stations the group was scanned at
> (single company, per `_company_for_group` logic in
> [work_order_route.py:22](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order_route.py#L22)).
> For unscanned groups it is `None` (target company is known from the QR payload's
> `company`/target if needed, but not required for v1).

### 4.2 Frontend — new page + components

New route: `dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx`
(`"use client"`), following the structure of
[musteri/page.tsx](../../../dtfrontend/src/app/[platform]/atolye/musteri/page.tsx)
(role check via `useUser`, `api.get` from `@/lib/api`).

Components under `dtfrontend/src/components/atolye/urunum-nerede/` (kept small,
single-purpose):

| Component | Responsibility |
|-----------|----------------|
| `ProductSearchCard` | Method tabs (Sipariş+Kalem / Parça No), inputs, validation, sample-chip hints, submit/clear |
| `TrackMatchList` | Compact selectable list shown when `matches.length > 1` |
| `TrackResultCard` | Gradient-green header (current location + icon + status badge + entry/target dates), detail grid, last-updated footer |
| `RouteTimeline` | Horizontal (≥640px) / vertical (mobile) stepper from `timeline[]` |
| `PackageStrip` | Per-package chips (package_index → current station + status) for multi-package groups |
| `StatusBadge` | Maps status → label + color (shared) |

Page-level states (mirroring the reference): **idle**, **loading** (spinner
`#0f4c3a`), **not-found** (empty state), **result** (single), **list** (multi-match).
"Access denied" is enforced server-side (403 / empty scope) — surfaced as not-found
/ a generic message; no separate denied screen needed because scoping is implicit.

**Recent queries**: stored in `localStorage` (key e.g. `urunum_nerede_recent`),
rendered as chips, max 5. Client-only convenience, mirrors reference.

### 4.3 Navigation card

Add to the `cards` array in
[atolye/page.tsx](../../../dtfrontend/src/app/[platform]/atolye/page.tsx#L60-L122):

```ts
{
  title: "Ürünüm Nerede?",
  description: "Ürünlerinizin atölye sürecindeki anlık konumu",
  href: `/${platform}/atolye/urunum-nerede`,
  allowed: isMusteri,          // strict: müşteri only
  color: "#fe9526",            // orange, echoing the Müşteri card
  icon: (/* map-pin / location SVG, Heroicons style, w-7 h-7 */),
}
```

The page itself also guards: if `!isMusteri` → the existing "Erişim Yetkisi Yok"
screen (same pattern as musteri/page.tsx).

## 5. Status derivation

Status vocabulary (group-level and package-level), mapped to palette:

| Status | Condition | Color |
|--------|-----------|-------|
| `Girişi yapılmadı` | QR exists, no `WorkOrder` scan yet (entrance_date null) | gray |
| `Bekliyor` | route step not yet reached / package idle between stations | gray |
| `İşlemde` | package active (entrance_date set, exit_date null) at a non-exit station | orange / blue-active node |
| `Gecikmiş` | active AND `target_date` < today | red |
| `Sevke Hazır` | active at an `is_exit_station` | green |
| `Tamamlandı` | `delivered == True` OR all packages exited the exit station | green |

**Group rollup** (when packages differ): group status = the *least-advanced active*
package's status, except `Gecikmiş` wins if any package is delayed, and
`Tamamlandı` only when all packages are complete. Current location = the station
where the most packages are currently active (ties → least-advanced). The header
summary lists the distribution (e.g. *"4/6 paket Kaplama, 2 paket Boya"*).

**Per-timeline-step status**: `done` (all/most packages exited this station),
`active` (a package is currently here), `delayed` (active here and group is
`Gecikmiş`), `waiting` (no package has reached it yet).

## 6. Data flow (happy path)

1. Müşteri opens hub → clicks "Ürünüm Nerede?" card → lands on page.
2. Enters Sipariş No + Kalem No (or Parça No) → submit.
3. Frontend `GET /track?...` → backend scopes to `company_from == department`,
   resolves matches.
4. `matches.length === 0` → not-found state.
   `=== 1` → render `TrackResultCard` + `RouteTimeline` + `PackageStrip`.
   `> 1` → render `TrackMatchList`; selecting one renders its detail (already in
   the payload — no second request).
5. Result is added to recent queries (localStorage).

## 7. Error handling

- `400` (missing/!invalid params) → inline validation message in `ProductSearchCard`.
- `403` (not müşteri / no department) → page-level access screen / generic error.
- Network/5xx → toast "Sorgu sırasında hata oluştu." + return to idle.
- Not found (`matches: []`) → empty state with guidance to check inputs.

## 8. Testing strategy

**Backend (pytest, async):**
- order+item exact match returns the right single group (scoped to department).
- part_number matching multiple groups returns multiple matches.
- a different company's order is **not** returned (scoping / isolation).
- QR-created-but-unscanned group resolves with status `Girişi yapılmadı`.
- delivered group is still returned with status `Tamamlandı`.
- group with a route → timeline uses route spine + correct step statuses;
  group without a route → history-only timeline.
- multi-package group split across stations → correct group rollup + per-package list.
- non-müşteri role → 403; missing params → 400.

**Frontend (component/RTL where infra exists, else manual):**
- search validation (both fields required on tab 1).
- single vs. multi-match rendering.
- timeline renders done/active/delayed/waiting nodes; h/v responsive switch.
- not-found + error states.
- card visible only when `isMusteri`.

**Verification before completion:** run backend test suite + frontend typecheck/build;
manual smoke of the four states.

## 9. Open questions / assumptions

- **Assumption:** exact (not fuzzy) match on `order_number` + `order_item_number`
  to pinpoint a single item; `part_number` uses ilike (can be multi-match).
- **Assumption:** delivered products remain trackable (intentional divergence from
  `/all`). If undesired, add a flag later.
- **Assumption:** `coating_company` may be `None` for unscanned-only groups; the UI
  shows "—". Acceptable for v1.
- **Deferred:** real-time updates, push notifications, per-package full timelines,
  export/print of the tracking view.

## 10. Affected files

**Backend (modify):**
- `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — add `GET /track`
  handler + resolution/timeline helpers.
- `dtbackend/app/schemas/work_order.py` — add `TrackTimelineStep`, `TrackPackage`,
  `TrackMatch`, `TrackResponse`.

**Frontend (create):**
- `dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx`
- `dtfrontend/src/components/atolye/urunum-nerede/` — the 6 components in §4.2.

**Frontend (modify):**
- `dtfrontend/src/app/[platform]/atolye/page.tsx` — add the role-gated card.
