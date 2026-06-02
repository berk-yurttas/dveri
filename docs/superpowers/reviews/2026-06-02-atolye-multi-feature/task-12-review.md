# Task 12: work_order.py endpoint rewrite (F3/F5/F6) + F1 integration fix

## Spec Compliance
- Reviewer: ✅ Spec compliant — helpers `_pairs_for_group` + `_route_expected_position`; create_work_order guard ordering (duplicate → F5 → F6 → active-at-other → priority → QR → persist pairs → insert); update_exit_date F6 exit validation + ack + preserved tail; get_all_work_orders ANY-pair EXISTS + pairs/pair_count/is_entry_station per row; get_work_orders_by_station pairs only (matches WorkOrderList schema). Integration fix: müşteri scoped by `company_from == department`, no `musteri_targets`/`_extract_musteri` remaining.

## Code Quality
- Reviewer: ✅ Approve with follow-ups.
- Base SHA: `e1adc01`
- Task SHA: `6a7eb1f` · F1 fix SHA: `9dd05d8`

## Resolution
- Issues found: 1 Critical-flagged (C1), 3 Important (I1–I3), several Minor.
- **C1** (frontend can't consume the F6 structured dict `detail`): NOT a T12 defect — the backend contract is correct; the consuming UI is **Task 22** (operator page, Wave 4) which wires `RouteWarningModal` + `acknowledged_route_violation`. Tracked as a Wave 4 dependency, not a fix here.
- **I2** (route-with-repeated-stations → position skip in `_route_expected_position`): RESOLVED/moot — T14's `_validate_station_ids` rejects duplicate station_ids (`len(set) != len`), so a route can never revisit a station. Confirmed.
- **I1** (first-scan TOCTOU race at two entry stations): real but low-probability and DB-constraint-bounded (no corrupt data, only a possible second entry row). Documented as backlog; not blocking.
- **I3** (müşteri full-table `select(Station)`/`select(QRCodeData)` then Python `company_from` filter): scoping confirmed airtight (no cross-tenant leak); performance follow-up only — backlog (denormalize `company_from` onto QRCodeData or add a recency bound).
- Minor (in-function/duplicate imports, interval f-string, pre-existing `total` field inconsistency): pre-existing or cosmetic; left as-is.
- Issues fixed: 0 code changes needed in T12 itself (C1→T22, I2→moot, I1/I3→backlog).
- Final status: ✅ Approved (with the C1 dependency owned by T22)

## Backlog items recorded
- F6 frontend consumption → T22 (Wave 4).
- First-scan TOCTOU hardening (partial unique index or retry).
- Müşteri QR full-scan performance (index/denormalize).
