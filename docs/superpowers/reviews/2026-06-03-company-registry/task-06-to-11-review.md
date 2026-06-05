# Tasks 06–11 — auth rip-out + endpoints + module call-site threading

All six pass spec compliance ✅ and code quality ✅. `import main` succeeds on gok2.

## T06 — auth helpers (gok2 `0fd2dba`)
- ✅ `check_station_operator_role` compares `station.company == (await require_user_company(current_user, db)).name` (operator role check preserved). `check_station_yonetici_role(current_user, romiot_db)` + `get_station_company(current_user, romiot_db)` async, return resolved `.name`, role checks preserved. `is_full_admin` unchanged. No `current_user.department` in the file.

## T07 — company_integration + priority (gok2 `eb313e2`)
- ✅ Both `check_station_yonetici_role` calls pass `romiot_db`. The satinalma `_get_satinalma_company` helper correctly made async + `romiot_db`-aware, using `require_user_company(...).name.strip()`, satinalma gate preserved. No `department` left.

## T08 — company endpoints (gok2 `6d4eef7`)
- ✅ `GET /` (list_companies, 403 non-atolye, `order_by(Company.name)`) + `GET /my-company` (`resolve_user_company` → 404 when None); both atolye-gated. Mounted `/romiot/station/companies` in api.py. Resolver split correct (require=403, resolve=None→404). `import main` shows both paths.

## T09 — qr_code (gok2 `2ea8b94`)
- ✅ Sender via `require_user_company(...).name` in both generate endpoints (role + yönetici-target-lock preserved); QR JSON includes `"company_from_id": sender.id`; `get_qr_codes_by_work_order_group` department via resolver; redundant empty-company 403s removed; no `department` left.

## T10 — work_order + schema (gok2 `a581f59`)
- ✅ `company_from_id` on WorkOrderBase/Detail/List; `create_work_order` resolves (body id → else `Company.name` lookup) + persists it; subcontractor `Company.code` looked up by `company_from_id` and passed as the 7th positional arg to `send_production_order` in create + exit; `get_all_work_orders` AND the work-orders `/companies` endpoint scoped via resolver; no `department` left.
- The 7-arg call vs send_production_order's current 6 params is an **intentional pending mismatch** resolved by T13 (runtime-only; imports fine).
- Bonus: the agent caught + fixed an extra `current_user.department` in `get_companies` not named in the plan.

## T11 — station handlers (gok2 `20862e7`)
- ✅ ONLY station/link-directory handlers threaded romiot_db / use resolver; link-dir GET uses `require_user_company(...).name`. User-mgmt + operator handlers deliberately left for T12 (their stale single-arg calls are T12-pending, not a T11 regression).
- The agent flagged the 3 operator handlers (list_station_operators/update_operator/delete_operator) as also stale → **T12 scope expanded** to thread all 6 remaining stale calls.

## Resolution
- Issues found: 0 blocking (2 intentional pending mismatches by design; 1 plan-gap — operator handlers — folded into T12).
- Final status: ✅ Approved (T06–T11).
