# Task 08: work_order schema — pairs, route_violation, ack flag

## Spec Compliance
- Reviewer: ✅ Spec compliant — all 9 requirements verified: scalars removed from Base/List/Detail; `pairs` added to all three; `acknowledged_route_violation` only on Create + UpdateExitDate; `route_violation` on WorkOrder/List/Detail; required `pair_count` on Detail; `is_entry_station`/`is_exit_station` on Detail; `is_first_scan_for_group` on CreateResponse; enum/exit/paginated/priority classes structurally unchanged.

## Code Quality
- Reviewer: ✅ Approved (after one fix). Confirmed `pair_count` and `is_first_scan_for_group` being required (no default) is the correct, deliberate choice — forces T12 to populate them and fails loudly otherwise. Naming + defaults consistent with the T05 model and the T12/T22 create-response contract.
- Base SHA: `881ff43`
- Initial Head SHA: `cc3b21f`
- Fix-up Head SHA: `6946e15`

## Resolution
- Issues found: 1 Important — implementer trimmed one-line docstrings from classes it did not otherwise change (`WorkOrderUpdateExitDate`, `PaginatedWorkOrderResponse`, `PriorityAssignment`, `PriorityAssignRequest`, `PriorityTokenInfo`) — unrelated churn.
- Issues fixed: 1 — restored docstrings on all unchanged classes plus added appropriate docstrings to the two response classes that gained a field (`WorkOrderCreateResponse`, `WorkOrderExitResponse`). Verified import still passes.
- Final status: ✅ Approved

## Forward dependency note
The three existing `WorkOrderDetail(...)` construction sites in `work_order.py` (lines 574, 667, 852) still pass scalar fields and omit `pairs`/`pair_count` — they will raise `ValidationError` until T12 rewrites them. Expected Wave 2 interdependency; backend is non-runnable between T08 and T12. T25 full-suite verification must run before merge.
