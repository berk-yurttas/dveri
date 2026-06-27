# Final Review: Toy API `sent` flag + piggyback retry

## Spec Compliance

- ✅ `work_orders.sent` migration (`down_revision=1a2b3c4d5e6f`, single alembic head confirmed)
- ✅ `WorkOrder.sent` model column, `nullable=False, server_default="false"`
- ✅ `_post_one` returns `bool` (True=2xx, False=non-2xx or exception)
- ✅ `send_production_order` returns all-or-nothing bool; empty pairs → False
- ✅ `push_and_sync`: own session, no-op without integration, pushes current row, sweeps `sent=false` same-company excl. current, `ORDER BY id LIMIT 20`, single commit, never raises
- ✅ `_push_one_work_order` shared by current + swept rows; sets `work_order.sent = ok`
- ✅ Endpoints dispatch `push_and_sync(id)`; `send_production_order` not referenced in endpoint file
- ✅ Lazy import in `_resolve_pairs` avoids service↔endpoint circular import
- ✅ `work_order.sent = False` reset on every exit scan (after `exited_quantity +=`, covers partial-quantity scenario)

Accepted deviation from plan: migration chains onto `1a2b3c4d5e6f` (not `08be09af3bfd`) to stay linear with the already-merged partial-quantity feature.

## Code Quality

Reviewer: ✅ Approved — no issues.

- Sweep join (`WorkOrder.station_id == Station.id`) correctly scopes to same company; no cross-company bleed.
- Single commit after both current push and sweep — no wasted transactions.
- All helpers are small and single-purpose.

## Verification

```
Ran 13 tests in 0.094s — OK
circular-import OK
no references remaining (send_production_order)
```

Pre-existing failure: `test_work_order_serialization_helper.test_helper_attaches_pairs_and_validates` — fixture predates partial-quantity feature, fails identically on base `94e4cd1`. Out of scope.

## Commits

```
52ab22f feat(atolye): migration add work_orders.sent flag
49e33f7 fix(atolye): chain sent migration onto current head 1a2b3c4d5e6f
d56ba46 feat(atolye): add WorkOrder.sent column to model
f98d80c feat(atolye): Toy API push returns success boolean (all-or-nothing)
5145954 feat(atolye): per-row Toy push helper that records sent
4ff7f40 feat(atolye): push_and_sync background task with unsent sweep
28c7055 feat(atolye): dispatch push_and_sync from scan endpoints; reset sent on exit
```

## Final Status: ✅ Ready to merge
