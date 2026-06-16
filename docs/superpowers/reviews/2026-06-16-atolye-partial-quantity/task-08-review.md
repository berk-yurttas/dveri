# Task 8: Mekasan push reflects exited pieces

## Spec Compliance
- Reviewer: ✅ Spec compliant. Only the `ActualQuantity` line changed to `work_order.exited_quantity`; `PlannedQuantity` and `ActualEndDate` (from exit_date) untouched; nothing else edited. Import ok.

## Code Quality
- Reviewer: Approved. Correct, minimal, matches plan; `exited_quantity` is non-nullable with server_default 0 (no None ambiguity); semantically reports true running exit count. Minor note: no unit test around `_build_payload_item` (pre-existing gap, not a regression).
- Base SHA: d16a2f088ba9d08f4193f191fc9b026626f28df8
- Head SHA: c5378d887f7df4f309fe41ff322e7d64c65a3a18

## Resolution
- Issues found: 0 blocking
- Issues fixed: 0 (none required)
- Final status: ✅ Approved
