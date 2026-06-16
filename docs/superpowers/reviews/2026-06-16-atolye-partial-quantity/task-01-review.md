# Task 1: Pure validation helpers

## Spec Compliance
- Reviewer: ✅ Spec compliant. All four helpers (`_entrance_remaining`, `_exit_remaining`, `_check_entrance_scan`, `_check_exit_scan`) present with exact signatures and cap math; additive-only change to `work_order.py`; test file covers all required cases; `python -m unittest test_partial_quantity_helper -v` → 13/13 OK.

## Code Quality
- Reviewer: Approved. Pure functions, boundary + never-negative cases tested, follows `test_track_status_helper.py` convention. Minor notes only (some rejection tests assert only non-None; no negative-`scan_quantity` test) — non-blocking.
- Base SHA: ab02575ff2bdf3471366bce102f701ffecbb318a
- Head SHA: 977ae889021d9241bcc336ad23ba653b402c63a1

## Resolution
- Issues found: 0 blocking (a few minor test-rigor notes)
- Issues fixed: 0 (none required)
- Final status: ✅ Approved
