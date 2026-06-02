# Task 01: M1 work_order_pairs migration

## Spec Compliance
- Reviewer: ✅ Spec compliant — verified line-by-line against the plan. Every column, the UNIQUE constraint name, the backfill SQL shape, the nullable-relaxation order, and the symmetric downgrade all match. No extra code; no missing requirements. Branch `gok2`, commit message exact.

## Code Quality
- Reviewer: ✅ Approved as code-quality-passing.
- Base SHA: `abdda24cfe8d366de60b61aa0ff867029139d9d0`
- Head SHA: `7a7f5457eafe9370ffe5d6c7271c0c1edc33125e`

## Resolution
- Issues found: 1 Important (non-blocking) + 4 Suggestions
- Issues fixed: 0 (all non-blocking; addressed inline below)
- Final status: ✅ Approved

## Notes on the Important observation (I1)

The reviewer questioned whether the inline `index=True` on `work_order_group_id` was intentional given that the UNIQUE constraint `uq_work_order_pair(work_order_group_id, idx)` already covers left-prefix lookups. **It is intentional.** The plan's M1 design explicitly says `work_order_group_id VARCHAR(50) indexed`, and Task 12's `_pairs_for_group` helper performs the most common read (`WHERE work_order_group_id = :gid ORDER BY idx`), which benefits from the narrower single-column index. Leaving as-is.

## Notes on Suggestions

- **S1** (backfill defensive `IS NOT NULL` guards): theoretical at runtime — schema enforces NOT NULL at backfill time. Not changing for this task; added to backlog as a doc-clarity comment if S4 is acted on.
- **S2** (idempotency): Alembic's natural behavior — `op.create_table` will raise on double-run. No action needed.
- **S3** (`existing_type` on `alter_column`): matches house style across the existing chain (`update_work_orders_package_split.py` does the same). No action needed.
- **S4** (verification query in the plan undercounts): doc fix only. Will address in a small follow-up if S1 lands.

## Concerns to flag forward (environmental)

- The DB upgrade itself was not executed against a live romiot postgres (the implementer's host can't reach the DB). The migration file is syntactically valid and recognized by `alembic heads`. Same constraint will apply to T02 and T03; we run the upgrade chain end-to-end from a network-connected environment before Wave 1 verification.
