# Final whole-branch review — atolye multi-feature (F1–F6)

Branch `gok2`, 46 commits over `main`. After all 26 per-task reviews passed, a
final adversarial reviewer traced the 5 end-to-end data contracts that span
multiple files (which per-task reviews structurally cannot see). Gates at the
time of review: backend `import main` ✅, `alembic heads` single ✅, frontend
`tsc --noEmit` ✅, `npm run lint` ✅, `npm run build` ✅.

## Findings + resolutions

### Critical — `is_entry_station` never persisted (FIXED, commit 141d27c)
`create_station` and `update_station` enumerate fields explicitly rather than
spreading `StationCreate`, so they silently dropped the new `is_entry_station`.
The plan assumed "the field plumbs through with no extra code" — wrong. Impact:
F4 dead (no station could be an entry station), F5 first-scan guard dead
(`company_has_entry` always empty), operator entry badge never shown, yönetici
warning banner permanently on. Fixed by adding `is_entry_station` to the
`Station(...)` constructor and the update assignment.

### Important — DELETE /stations/{id} missing route guard (FIXED, commit 141d27c)
`work_order_routes.station_id` is `ON DELETE RESTRICT`. `delete_station` guarded
operators + work-orders but not routes, so deleting a station that's only
referenced by a route (no scans yet) would 500 on the FK instead of returning a
friendly 400. Added a `WorkOrderRoute` existence guard mirroring the others.

### Minor — F6 exit validation asymmetry (documented, not fixed)
In `update_exit_date`, when a package has no un-exited route entry
(`expected_exit_pos is None`), route validation is skipped and the exit
proceeds. The entrance guard is the primary control and is correct; this exit
path edge case is low-impact. Tracked as a follow-up.

## Contracts verified sound end-to-end (no issues)
- **F3 multi-pair**: field names (`aselsan_order_number`/`order_item_number`)
  match at every hop müşteri→QR JSON→operator→work_order_pairs→is-emirleri→Mekasan;
  `min_length=1` schema can never receive an empty list (guarded on both sides);
  `pairs[0]` accesses are guarded.
- **F5/F6 scan**: `route_off`/`route_out_of_order` type strings match backend↔frontend;
  `acknowledged_route_violation` + `is_first_scan_for_group` field names match.
- **F6 route endpoints**: RoutePickerModal POST/PUT bodies ↔ WorkOrderRoute schemas;
  GET positions→station_ids mapping correct; 404 grandfathered branch correct.
- **F1 company source**: CompanyTypeahead path ↔ backend mount (singular
  `company-integration`, fixed in 496420c); target validated against company_integrations.
- **Migrations ↔ models ↔ runtime**: single linear chain; all columns
  written/read exist with matching nullability.

## Pre-existing (out of scope, noted)
`get_all_work_orders` `total=len(...)` vs `total=total_groups` discrepancy in the
SQL-pagination path exists identically on `main`.

## Net
Two genuine bugs (1 Critical, 1 Important) found and fixed at the final gate that
no per-task review could have caught; the remaining cross-cutting contract surface
is coherent. Branch is merge-ready pending the DB-connected verification deferred
in task-25-review.md (live alembic upgrade + endpoint smoke).
