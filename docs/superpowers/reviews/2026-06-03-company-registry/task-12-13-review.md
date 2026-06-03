# Tasks 12, 13 — user-mgmt pairing + toy_api fields

## Task 12 — station.py user-management pairing (gok2 `7c8381b`)
- **Spec compliance:** ✅ — all 10 `check_station_yonetici_role` calls pass `romiot_db` (the 3 user-mgmt + 3 operator handlers that were stale now fixed); `company_id` on `ManagedUserUpdateRequest`/`FullAdminUserCreateRequest`/operator `UserCreateRequest`; `:`-in-department validation removed; 4 pairing helpers present (`_company_by_id` 400-on-invalid, `_company_by_name`, `_upsert_user_company` insert-or-update+commit, `_resolve_pairing_company_name` join). Create/edit compute effective company (operator→station company, 400 if absent, company_id must match; non-operator→required company_id; non-fullAdmin yönetici pinned to own company); company name mirrored to PB department/company; `_upsert_user_company` after PB create in all 3 paths. `list_company_users` resolves per-user company + yönetici scoping from the pairing.
- **Code quality:** ✅ — `UNIQUE(pb_user_id)` + select-then-add/update prevents duplicate rows; `import main` OK; no `current_user.department` in romiot; operator handlers correctly don't touch pairing.
- Issues: 0 Critical/Important. Minors: (1) PB-before-postgres ordering → a half-state is possible if the postgres commit fails after pairing commits (pre-existing cross-system risk, not a regression); (2) `_get_main_company_from_department` (line 152) is now dead code — to be removed in the final cleanup pass.
- Final status: ✅ Approved
- (Implemented by an agent that crashed post-work; salvaged + committed by the controller. Reviewer verified entirely from the code, not the lost report.)

## Task 13 — toy_api_service SubcontractorID + SourceCompany (gok2 `a43e444`)
- **Spec compliance:** ✅ — `_build_payload_item` gains `subcontractor_id` + `source_company`; payload includes `"SubcontractorID"` + `"SourceCompany"` after `SubcontractorWorkOrderNo`; `send_production_order` gains trailing `subcontractor_id=None`; both call sites pass `subcontractor_id` + `company`; single/multi-pair branching + `mes_order_id` unchanged.
- **Code quality:** ✅ — `SourceCompany` = the `company` arg (target/scanning-station company, Q14); `SubcontractorID` None-safe → null; 7-param signature. Caller arity confirmed: work_order.py passes 7 positional args in both create_work_order + update_exit_date — no runtime mismatch.
- Final status: ✅ Approved
- (Applied directly by the controller after the implementer agent died on a transient connection error before doing work.)
