# Review: Müşteri/Yönetici delete of unscanned work order groups

Consolidated review (per-task spec compliance + a single code-quality pass at the
end, as requested). Executed subagent-driven on `main`, Wave 0 (Task 1 ‖ Task 3)
then Task 2.

**Note on entanglement:** A separate session was concurrently refactoring
`qr_code.py` (extracting `_compute_package_quantities` and `_generate_unique_code`,
commits `8477e94` / part of `cb85686`, plus `test_qr_batch_helpers.py`). Those
changes are NOT part of this feature and are out of scope for this review. This
review covers only the delete-feature slice.

## Tasks

### Task 1: `check_group_deletable` helper + unit tests
- Files: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`,
  `dtbackend/test_qr_group_delete_helper.py`
- Commit: `a53a826`
- Spec Compliance: ✅ — pure decision helper raising 403 (role), 403 (ownership),
  409 (scanned); returns None when allowed.
- RED/GREEN: ✅ — RED ImportError, GREEN 7/7 tests pass.

### Task 2: `DELETE /group/{work_order_group_id}` endpoint
- Files: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`
- Commit: landed in `cb85686` (interleaved with the other session's commit).
- Spec Compliance: ✅ — loads group qr rows (404 if none), extracts payload
  `company_from`, counts `work_orders`, calls `check_group_deletable`, then deletes
  `work_order_routes` + `work_order_pairs` + `qr_code_data` and commits once.
- Verification: ✅ — module imports cleanly; route registered as
  `(DELETE, /group/{work_order_group_id})` → `/romiot/station/qr-code/group/{id}`;
  helper regression 7/7.

### Task 3: Frontend "İş Emrini Sil" button
- Files: `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx`
- Commit: `c64c980`
- Spec Compliance: ✅ — `isGroupDeletable` (caller role + `company_from ===
  userCompany` + all entries `entrance_date === null`), `handleDeleteGroup`
  (confirm → `api.delete` → collapse + refetch; 409/error parsed from
  `{"detail"}` and refetch to resync), red button gated by the predicate.
- Verification: ✅ — `tsc --noEmit` clean for this file. (Pre-existing unrelated
  tsc errors exist in `musteri/page.tsx`, an in-progress file from before this work.)

## Code Quality (single final pass)

- Helper: pure, documented, fully branch-tested including check ordering. Approved.
- Endpoint: follows the file's existing `data::jsonb ->> 'work_order_group_id'`
  idiom; single transaction (all deletes then one `commit`); 404 before authorize;
  returns `None` for 204. Bounded work (per-group). Approved.
- Frontend: predicate mirrors the backend guard exactly; error path refetches so a
  row scanned between render and click corrects itself; disabled-while-deleting
  state. Approved.

Issues found: 0. Issues fixed: 0.

## Final status: ✅ Approved (delete-feature slice)
