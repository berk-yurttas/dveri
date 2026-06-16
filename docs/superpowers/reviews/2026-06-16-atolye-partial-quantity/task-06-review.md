# Task 6: Exit endpoint — accumulate exited pieces + audit

## Spec Compliance
- Reviewer: ✅ Spec compliant. `postgres_db` dependency added; fully-exited guard message updated; `_check_exit_scan(scan_quantity, entered_quantity, exited_quantity)` cap check (cannot exit more than entered); `exited_quantity` accumulated; `exit_date` stamped ONLY at full exit (`>= quantity`); pg user resolved; `WorkOrderScan(direction="out")` audit row; commit+refresh. F6 route-on-exit, `packages_exited` count, `all_exited`/delivered rollup + token refund, integration push, response building all untouched. Import ok.

## Code Quality
- Reviewer: Approved. Cap check before mutation (no partial state on failure); `exit_date` keyed correctly to `quantity`; pg-user idiom and single-commit atomicity consistent with the entrance endpoint; downstream rollup/F6 still correct because they key off `exit_date IS NULL/NOT NULL` (partial exit keeps it NULL). Minor notes: exit audit row intentionally omits `qr_code` (not in the exit schema); no new automated tests (wiring of already-tested helpers, per plan).
- Base SHA: 7efb363f35a9112faeadeecc217c94539c755141
- Head SHA: e6e0998ceee92a643d2f31b4973200c145f9931d

## Resolution
- Issues found: 0 blocking
- Issues fixed: 0 (none required)
- Final status: ✅ Approved
