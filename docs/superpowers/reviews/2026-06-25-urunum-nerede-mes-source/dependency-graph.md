# Dependency graph — Ürünüm Nerede MES source

Worktree: `.worktrees/urunum-mes` (branch `feat/urunum-nerede-mes-source`).

## Tasks & dependencies

| Task | Produces | Files | Depends on |
|------|----------|-------|------------|
| T1 | `UrunumNeredeMesSource` model | `app/models/romiot_models.py` | — |
| T2 | Alembic migration | `alembic_romiot/versions/d5e6f7a8b9c0_*.py` | T1 (column parity) |
| T3 | `build_track_query` + module | `app/services/mes_tracking_service.py`, `test_mes_tracking_service.py` | — |
| T4 | `assemble_matches` | same files as T3 | T3 (same file) |
| T5 | `track_from_mes` | same files as T3 | T4 (same file), T1 (imports model) |
| T6 | `GET /track-mes` | `app/api/.../work_order.py`, `test_mes_tracking_service.py` | T5 (imports service) |
| T7 | Frontend selector + switch | `dtfrontend/.../HedefFirmaSelect.tsx`, `page.tsx` | contract only (TrackResponse) |
| T8 | Seed SQL | `dtbackend/seed_urunum_nerede_mes_sources.sql` | — |

## Critical path

`T1 → T3 → T4 → T5 → T6` is a forced serial chain: T3/T4/T5 all edit the
**same** service+test files, and T6 imports the finished service.

## Execution decision: sequential

T2, T7, T8 are independent and could parallelize, but they are small and the
dominant chain is serial. Per the project's "conservative default", running all
tasks **sequentially in one worktree** avoids multi-worktree merge coordination
for marginal wall-clock gain. Each task still gets its own spec-compliance +
code-quality review (never batched) and a per-task review artifact.

Order: **T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → final review.**
