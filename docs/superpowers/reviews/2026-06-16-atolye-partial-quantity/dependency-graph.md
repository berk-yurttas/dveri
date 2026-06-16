# Dependency Graph & Wave Plan — Atölye Partial Quantity

Base SHA: `7f6a94ebeab7165a265f18dc4c98a4fb498633a0` · Branch: `atolye-partial-quantity`

## Files per task (overlap analysis)

| Task | Primary file(s) |
|---|---|
| 1 helpers (TDD) | `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`, `dtbackend/test_partial_quantity_helper.py` |
| 2 model | `dtbackend/app/models/romiot_models.py` |
| 3 migration | `dtbackend/alembic_romiot/versions/add_partial_quantity_to_work_orders.py` (new) |
| 4 schemas | `dtbackend/app/schemas/work_order.py` |
| 5 entrance | `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` |
| 6 exit | `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` |
| 7 package-status | `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` |
| 8 mekasan | `dtbackend/app/services/toy_api_service.py` |
| 9 modal | `dtfrontend/src/components/atolye/QuantityModal.tsx` (new) |
| 10 wiring | `dtfrontend/src/app/[platform]/atolye/operator/page.tsx` |
| 11 display | `dtfrontend/src/app/[platform]/atolye/operator/page.tsx` |

## Dependencies

- 1, 2, 3, 4, 9 → no deps (foundational).
- 5 → 1 (helpers), 2 (columns), 4 (scan_quantity + PackageStatus import).
- 6 → 1, 2, 4. (same file as 5 → serial after 5)
- 7 → 2, 4. (same file as 5/6 → serial after 6)
- 8 → 2 (reads `exited_quantity`).
- 10 → 4, 5, 6, 7, 9.
- 11 → 10 (same file), 4.

## Waves (file isolation honored: same-file tasks never share a wave)

- **Wave A (parallel ×5):** 1, 2, 3, 4, 9 — provably non-overlapping files.
- **Wave B (parallel ×2):** 5, 8 — endpoint file vs toy_api file, disjoint.
- **Wave C:** 6 (endpoint file).
- **Wave D:** 7 (endpoint file).
- **Wave E:** 10 (frontend page).
- **Wave F:** 11 (frontend page).

## Execution rules

- Run in the main checkout on branch `atolye-partial-quantity` (node_modules + Python deps live here; isolated worktrees would break `tsc`/`lint`/`unittest`). The override permits same-worktree parallel when files are provably non-overlapping — they are.
- In parallel waves (A, B), implementers DO NOT run git. The orchestrator commits each task as its own commit (one SHA per task) after the wave's implementers return, before reviews.
- Each task gets its own spec-compliance review then code-quality review; reviews are never batched. Review artifact written to `task-<N>-review.md` before the task is marked complete.
- TDD (RED→GREEN with pasted output) is required for Task 1 only. Tasks 2/3/4/8 are pure types/config (exempt; verified by import / migration check). Tasks 9/10/11 have no frontend test runner (verified by `tsc`/`lint` + manual smoke).
