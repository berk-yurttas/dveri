# Task 2: Alembic migration for urunum_nerede_mes_sources

## Spec Compliance
- Reviewer: ✅ Spec compliant. `revision='d5e6f7a8b9c0'`, `down_revision='b1c2d3e4f5a6'`;
  all 7 columns with exact types/nullability/server_default; PK + unique('company')
  constraints; both indexes (id non-unique, company unique); downgrade reverses in
  correct order; `down_revision='b1c2d3e4f5a6'` unique across versions; nothing extra.

## Code Quality
- Reviewer: Approved. Character-for-character to plan; clean revision chaining (no
  branched head, no duplicate id); downgrade order correct; zero column drift vs the
  Task 1 model; style consistent with `add_company_integrations_table.py`.
- Note (expected, no action): `onupdate=func.now()` is ORM-only and correctly absent
  from DDL; timestamps nullable=True matches the reference migration.
- Base SHA: 768a520
- Head SHA: c87cb59

## Resolution
- Issues found: 0 blocking
- Issues fixed: 0
- Final status: ✅ Approved
