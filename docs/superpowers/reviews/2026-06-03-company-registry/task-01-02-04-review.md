# Tasks 01, 02, 04 — migration, models, CompanyOut schema

## Task 01 — migration (companies, user_companies, work_orders.company_from_id)
- **Spec compliance:** ✅ — `companies` (name/code both NOT NULL + UNIQUE), `user_companies` (pb_user_id UNIQUE, company_id FK RESTRICT), `work_orders.company_from_id` nullable FK RESTRICT; downgrade reverses. `down_revision='f6a7b8c9d0e1'`.
- **Code quality:** ✅ — autoincrement PKs, server_default now() timestamps.
- **Deviation (correct):** the plan's prescribed revision id `a7b8c9d0e1f2` **collides** with the existing `add_qr_code_data_table.py`. The implementer used a fresh, verified-unique id **`08be09af3bfd`** instead — the new single head. Downstream verification (T17) must reference `08be09af3bfd`, not the plan's placeholder.
- gok2 commit: `7c99e4c`

## Task 02 — models
- **Spec compliance:** ✅ — `company_from_id` after `company_from` (nullable FK RESTRICT); `Company` + `UserCompany` classes correct (constraint names, types, FK ondelete). Smoke import OK. Diff +37/-0, no other classes touched.
- **Code quality:** ✅ — migration↔model fidelity verified column-by-column (String(255)/String(64), nullability, `uq_companies_name`/`uq_companies_code`/`uq_user_companies_pb_user_id`, FK RESTRICT all match). Minor non-blocking: models add `onupdate=func.now()` on `updated_at` (ORM-only, not a schema divergence).
- gok2 commit: `81f6610`

## Task 04 — CompanyOut schema
- **Spec compliance:** ✅ — `CompanyOut(BaseModel)` with `id:int, name:str, code:str` + `class Config: from_attributes = True`.
- **Code quality:** ✅ — only `BaseModel` imported (no unused `Field`).
- gok2 commit: `e823364`

## Resolution
- Issues found: 1 (the revision-id collision) — fixed by the implementer using `08be09af3bfd`.
- Final status: ✅ Approved (all three).
