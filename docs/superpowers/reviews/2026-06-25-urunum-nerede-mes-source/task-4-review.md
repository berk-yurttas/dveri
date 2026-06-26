# Task 4: Group MES rows + assemble TrackMatch with status

## Spec Compliance
- Reviewer: ✅ Spec compliant. All helpers (`_to_date`, `_step_status`, `_sort_key`,
  `_int_or_zero`, `_build_one_match`) + `assemble_matches` present; grouping by
  (AselsanOrderCode, WorkOrderItemNo); per-op timeline; full §5.3 field mapping; no
  orchestration/pyodbc contamination; single import block; 13 tests green.
- Assessed deviation (accepted): rollup checks "Gecikmiş" before "Sevke Hazır" so an
  overdue exit-active op reads as late, matching `test_active_and_overdue_is_gecikmis`
  and the step-level `delayed > active` rule. "Sevke Hazır" stays reachable for a
  non-overdue exit-active op.

## Code Quality
- Reviewer: Issues to fix (fixed). Clean decomposition; keyword-only args; tests assert
  real behavior.
- Critical (fixed): `_sort_key`/`last_updated` could raise `TypeError` comparing a
  pyodbc `datetime.date` against `datetime.max`/`datetime`. Added `_as_datetime` helper
  to lift `date`→`datetime` in both spots (defensive; MES DDL currently types these
  DATETIME). RED test `test_date_typed_actual_start_does_not_crash_sorting` reproduced
  the TypeError, GREEN after fix.
- Important (fixed): added missing status-path tests `Sevke Hazır` + `İşlemde` (spec §9),
  plus `company_from` raw-code fallback and `PlannedQuantity` fallback tests.
- Minor (fixed): type hints on `_build_one_match`. Left anticipatory `TrackResponse`
  import (used in Task 5) and the defensive `if steps and` guard.
- Base SHA: ba61056
- Head SHA: e368685 (fix), preceded by 05ee596 (impl)

## Resolution
- Issues found: 1 Critical, 2 Important, 3 Minor
- Issues fixed: 1 Critical + 2 Important + 1 Minor (2 Minor intentionally left)
- Final status: ✅ Approved (18 tests passing)
