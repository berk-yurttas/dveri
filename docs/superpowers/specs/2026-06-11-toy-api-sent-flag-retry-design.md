# Design: Robust Toy API delivery with `sent` flag + piggyback retry

**Date:** 2026-06-11
**Area:** Atölye — QR scan → Toy/Mekasan API push
**Status:** Approved (design), pending implementation plan

## Problem

When an Atölye QR scan happens, the backend pushes a production-order record to
the company's external Toy/Mekasan API. Today this is fire-and-forget: the push
runs in a detached `asyncio.create_task`, and on any HTTP error or exception the
result is only logged and then **silently discarded**
([toy_api_service.py:44-58](../../../dtbackend/app/services/toy_api_service.py#L44-L58)).
A network blip, a 500 from Toy, or Toy being down means that scan's data never
reaches Toy and there is no record that it failed, no retry, and no way to know
which rows are out of sync.

We want the push to be **robust**: track per-row whether the current state was
delivered, and opportunistically retry rows that previously failed.

## Goals

- Record, per work-order row, whether its current state has been delivered to Toy.
- On a failed push, the row is marked not-delivered and is retried later.
- On the next scan for the same company, sweep and re-push previously-failed rows.
- No regression to scan-response latency.

## Non-goals

- No background scheduler / periodic sweep. Retry is **piggyback-only** (on the
  next scan for that company). If a company stops scanning entirely, its unsent
  rows wait until its next scan. This is an accepted gap.
- No per-attempt audit log / outbox table. A single boolean on the work order is
  the chosen granularity.
- No change to the Toy API payload or contract.

## Current flow (as-is)

1. **Entry scan** → `create_work_order` (`POST /`) creates a `WorkOrder` row,
   commits, then for companies with a configured `CompanyIntegration` fires
   `asyncio.create_task(send_production_order(...))`
   ([work_order.py:574-589](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L574-L589)).
2. **Exit scan** → `update_exit_date` (`POST /update-exit-date`) fills
   `exit_date`, commits, then fires `send_production_order(...)` **again** with a
   payload that now carries `ActualEndDate` / `ActualQuantity`
   ([work_order.py:754-774](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L754-L774)).
3. `send_production_order` builds one payload per pair and POSTs to the integration
   URL. Single-pair → one POST; multi-pair → N parallel POSTs. `Mes_OrderId` is
   `"{group_id}-{station.id}"` (single) or `"{group_id}-{station.id}-{sipariş}-{kalem}"`
   (multi). It returns `None` and never raises — failures are logged and lost
   ([toy_api_service.py:61-102](../../../dtbackend/app/services/toy_api_service.py#L61-L102)).

The same row is therefore pushed **twice** (entry, then exit), to the **same**
`Mes_OrderId` — i.e. Toy treats the two pushes as an upsert of one logical record.

## Design decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Meaning of `sent` | **"Current state synced"** — one boolean: true = the row's latest state is delivered. Reset to false whenever the row changes (entry created, exit filled); set true when a push of the current state succeeds. | Simplest model that still survives the double-push. The exit push carries the full final state, so "latest successful push" is exactly what Toy needs. |
| Retry trigger | **Piggyback on next scan only** (no scheduler). | Requested scope; no new infra. Gap accepted (see Non-goals). |
| Push execution | **Keep async fire-and-forget; the task writes `sent` back** using its own DB session. | Scan responses stay fast (Toy's 10s timeout never blocks the operator's screen). |
| Multi-pair failure | **All-or-nothing.** `sent=true` only if every pair POST succeeds. | Toy upserts by `Mes_OrderId`, so re-pushing already-delivered pairs is idempotent — a full re-push is safe and simpler than per-pair tracking. |
| Sweep bound | **`LIMIT 20`** unsent rows per scan event, oldest first. | Caps extra work per scan and prevents a flood if a company newly gains an integration (its backlog drains 20 rows per scan). |

## Design

### 1. Schema

Add one column to `work_orders` (romiot Postgres DB):

- `sent` — `Boolean`, `nullable=False`, `server_default='false'`.
  Semantics: **the row's current state has been delivered to Toy.**
  `false` = needs (re)sending.

Changes:
- Model: add `sent` in
  [romiot_models.py](../../../dtbackend/app/models/romiot_models.py) next to
  `route_violation` (line 72).
- Migration: new file in `alembic_romiot/versions/` with
  `down_revision = '08be09af3bfd'` (current head), `op.add_column('work_orders',
  sa.Column('sent', sa.Boolean(), nullable=False, server_default='false'))`,
  and a matching `op.drop_column` in `downgrade`. Follows the pattern of
  [add_route_and_violation.py](../../../dtbackend/alembic_romiot/versions/add_route_and_violation.py).

Existing rows backfill to `sent=false` via the server default. That is harmless:
they are only ever swept if their company has an integration, and the `LIMIT 20`
bound drains any such backlog gradually.

### 2. Service layer (`toy_api_service.py`)

- `_post_one(...)` → return `bool`: `True` on a 2xx response, `False` on a
  non-2xx response or an exception. (Currently returns `None`; keep the existing
  logging.)
- `send_production_order(...)` → return `bool` = **all-or-nothing**: `True` only
  if every pair POST returned `True`. (Single-pair: the one result. Multi-pair:
  `all(...)` over the gathered results.) Still never raises.
- **New** `push_and_sync(work_order_id: int) -> None` — the only coroutine the
  endpoints dispatch. Runs in the background and owns its own session via
  `RomiotAsyncSessionLocal`
  ([database.py:43](../../../dtbackend/app/core/database.py#L43)):
  1. Open `async with RomiotAsyncSessionLocal() as db:`.
  2. Reload by id: the `WorkOrder`, its `Station`, the `CompanyIntegration` for
     `station.company`, the group's pairs (`_pairs_for_group` logic), and
     `subcontractor_id` (= `Company.code` for `work_order.company_from_id`).
     Reloading by id means nothing depends on the request's already-closed session.
  3. If no integration (or no `api_url`/`api_key`) → return. The row stays
     `sent=false`, inert; it is never swept because the sweep is
     integration-scoped to a company that *has* an integration.
  4. Push the current row via `send_production_order`; set `work_order.sent =`
     the returned bool.
  5. **Sweep:** select other `WorkOrder` rows where `sent = false` AND the row's
     station belongs to this integration's company, `ORDER BY id` (oldest first),
     `LIMIT 20`, excluding the current row. For each, reconstruct its station /
     pairs / subcontractor and re-push; set `sent = true` on success (leave
     `false` on failure).
  6. `await db.commit()` once.

  Helper extraction: the per-row "reload station + pairs + subcontractor, push,
  return success" logic is shared between step 4 and step 5 — factor it into a
  small internal helper that takes a `WorkOrder` and the session and returns the
  push bool, so the current row and swept rows go through the same path.

### 3. Call sites

Both `create_work_order` and `update_exit_date` currently build pairs +
subcontractor inline and call `send_production_order` directly inside an
integration guard. Replace each call with:

- Keep the existing guard that only proceeds when a `CompanyIntegration` with
  `api_url` and `api_key` exists for the station's company.
- Dispatch `asyncio.create_task(push_and_sync(work_order.id))`.

The inline pair/subcontractor lookups at the call sites are removed — they move
into `push_and_sync` (which reloads them). This simplifies both endpoints.

**`update_exit_date` additionally sets `work_order.sent = False`** (in the same
transaction that fills `exit_date`, before committing/dispatching), because
filling `exit_date` changes the state that was previously synced — the row must
be re-pushed to deliver the exit event.

### 4. Behavior notes / trade-offs

- **Latency:** unchanged. All Toy I/O remains in the background task; the scan
  endpoints return as fast as today.
- **Idempotency** is what makes the simplifications safe:
  - Multi-pair partial failure re-pushes the already-succeeded pairs, but Toy
    upserts by `Mes_OrderId` (which includes the pair suffix), so it is harmless.
  - Two concurrent scans for the same company can each sweep and re-push the same
    unsent row; both target the same `Mes_OrderId`, so Toy sees one upsert. No
    locking needed.
- **Newly-integrated company:** all its historical `sent=false` rows become
  sweep-eligible at once; the `LIMIT 20` per scan drains them gradually rather
  than in one burst.
- **Accepted gap:** a company that stops scanning leaves unsent rows until its
  next scan (piggyback-only, by choice).

### 5. Testing

- `_post_one` returns `True` for a 2xx response and `False` for a non-2xx
  response and for a raised exception (mock `httpx.AsyncClient`).
- `send_production_order` returns `True` only when all pair POSTs succeed;
  `False` if any pair fails (single- and multi-pair cases).
- `push_and_sync`:
  - sets `sent=True` on the current row when the push succeeds;
  - leaves `sent=False` when the push fails;
  - re-pushes in-scope `sent=false` rows and flips them to `True` on success,
    while ignoring rows belonging to other companies and respecting the
    `LIMIT 20` bound;
  - no-ops cleanly when the company has no integration.
  (Mock the HTTP layer; use a real test session against the work-order tables.)

## Files touched

- `dtbackend/app/models/romiot_models.py` — add `sent` column.
- `dtbackend/alembic_romiot/versions/<new>.py` — migration (`down_revision =
  '08be09af3bfd'`).
- `dtbackend/app/services/toy_api_service.py` — `_post_one`/`send_production_order`
  return bools; add `push_and_sync` + shared per-row helper.
- `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — both call sites
  dispatch `push_and_sync`; `update_exit_date` resets `sent=False`.
- Tests — new `test_toy_api_*` helper test(s) following the repo's existing
  `test_*_helper.py` convention.
