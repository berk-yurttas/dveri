# Task 05: Models — romiot_models.py updates

## Spec Compliance
- Reviewer: ✅ Spec compliant — `is_entry_station` before `is_exit_station`; `route_violation` after `delivered`; scalar pair columns relaxed to nullable; `WorkOrderPair` + `WorkOrderRoute` classes match M1/M3 exactly (tablenames, UNIQUE constraint names, column types, FK ondelete RESTRICT, `created_at` NOT NULL). No unrelated edits.

## Code Quality
- Reviewer: ✅ Approved — zero issues. Verified model↔migration fidelity column-by-column across M1/M2/M3 (no type/nullability/default/constraint-name/FK drift). Confirmed deliberate omission of ORM `relationship()` back-refs is correct (downstream queries join explicitly on `work_order_group_id`/`station_id`, and the tables link by non-unique string not FK).
- Base SHA: `881ff43`
- Head SHA: `13ead83`

## Resolution
- Issues found: 0
- Issues fixed: 0
- Final status: ✅ Approved
