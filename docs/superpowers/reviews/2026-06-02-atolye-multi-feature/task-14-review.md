# Task 14: work_order_route endpoints + router mount

## Spec Compliance
- Reviewer: ✅ Spec compliant — POST/PUT/GET endpoints + 4 helpers; create_route operator/yönetici position-0 pin + 409 + validation; update_route yönetici-only + position-0 immutability + transactional replace; get_route 404 for grandfathered; mounted at `/romiot/station/work-order-routes` in `api.py` (adapted to the real direct-`api_router` pattern since the plan's `station_router` object didn't exist).

## Code Quality
- Reviewer: ✅ Approved (after fixes).
- Base SHA: `e1adc01`
- Impl SHA: `438b905` · Fix SHA: `0997bcb`

## Resolution
- Issues found: 0 Critical, 2 Important, several Minor.
- **I1** (concurrency race surfaces as raw 500 not 409): FIXED — wrapped both create and update commits in `try/except IntegrityError: rollback + raise HTTPException(409)`. DB integrity was already guaranteed by `uq_route_position`; now the loser gets a clean 409.
- **I2** (two genuinely-unused imports `and_`, `check_station_operator_role`): FIXED — removed both.
- Confirmed by reviewer: `_validate_station_ids` rejects duplicates + enforces company membership + last-is-exit (with F6.8 fallback); position-0 pin has no unresolved-source hole (operator null workshop_id → 403; yönetici no-history → 400); update_route delete+reinsert is atomic.
- Minor (not actioned — backlog): `_company_for_group` single-company `limit(1)` assumption (added reasoning to review only); redundant `get_user_by_username` lookup in create_route; `creator_id=0` sentinel for missing yönetici user; `created_at` unpopulated in response.
- Final status: ✅ Approved
