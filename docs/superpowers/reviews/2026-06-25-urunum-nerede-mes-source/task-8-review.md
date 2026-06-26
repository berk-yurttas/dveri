# Task 8: Seed SQL for urunum_nerede_mes_sources

## Spec Compliance
- Reviewer: ✅ Spec compliant. `dtbackend/seed_urunum_nerede_mes_sources.sql` created
  with exact content: header comments, `INSERT INTO urunum_nerede_mes_sources` for Bosan,
  Mekasan, Teknopar with correct table names and NULL filters, `ON CONFLICT (company)
  DO UPDATE` for idempotency. Verified by `git show 880a367` — diff matches spec verbatim.

## Code Quality
- Reviewer: ✅ Approved. Single-responsibility file (seed only). Idempotent via ON
  CONFLICT. Comments explain when/how to run and what to adjust. Only one file added;
  no other files touched. No issues found.
- Base SHA: 87a8c3e
- Head SHA: 880a367

## Resolution
- Issues found: 0
- Issues fixed: 0
- Final status: ✅ Approved
