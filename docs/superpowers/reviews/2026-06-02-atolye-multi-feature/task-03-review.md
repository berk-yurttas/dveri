# Task 03: M3 work_order_routes + work_orders.route_violation

## Spec Compliance
- Reviewer: ✅ Spec compliant — every column, FK ON DELETE RESTRICT, UNIQUE constraint name, upgrade/downgrade ordering, and commit message verified. Followed by a follow-up fix (see Resolution) that strengthens — does not change — spec compliance.

## Code Quality
- Reviewer: ✅ Approved (after one fix-up).
- Base SHA: `5844daa1cacb0e8b2116bc957629b1c24d806fe5`
- Initial commit SHA: `040f03ff7878b65fdf75b7405ad58ff9dfaa6f13`
- Fix-up commit SHA: `98aa35b5559d6da402cdc02a833d898e0777faec`

## Resolution
- Issues found: 1 Important (`created_at` was implicitly nullable on an audit column), 3 Suggestions (informational only)
- Issues fixed: 1 (the Important — added `nullable=False` to `created_at`)
- Re-review: confirmed via direct diff inspection. The fix is mechanically the exact single-line change the reviewer asked for; no other behavior is altered. Alembic still reports `f6a7b8c9d0e1 (head)`.
- Final status: ✅ Approved

## Notes on Suggestions

- **S2** (ON DELETE RESTRICT vs WorkOrder.station_id's implicit NO ACTION): asymmetry is intentional and an upgrade in clarity. No action — the design doc calls this out explicitly. The follow-up note for T15 (pre-check + friendly 409) is captured in the plan's T13/T14 dependency notes.
- **S3** (upgrade/downgrade ordering safety): confirmed safe — PostgreSQL DDL is transactional and the project's alembic env runs in default transactional mode.
- **S4** (`created_by_user_id` plain Integer, no FK): matches the well-established cross-DB pattern (WorkOrder.user_id, PriorityToken.user_id, etc.). T05 will copy the explanatory comment from WorkOrder.user_id to the new WorkOrderRoute model.

## Environmental concern

DB upgrade not executed (same as T01/T02 — romiot postgres unreachable from this machine). The chain `c3d4e5f6a7b8 → d4e5f6a7b8c9 → e5f6a7b8c9d0 → f6a7b8c9d0e1` is verified syntactically via `python -m alembic heads`. Full upgrade-against-real-DB will run when a developer is on a network with access.
