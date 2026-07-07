# Multi-QR per pair — consolidated review

Plan: `docs/superpowers/plans/2026-06-30-multi-qr-per-pair.md`
Spec: `docs/superpowers/specs/2026-06-30-multi-qr-per-pair-design.md`
Execution: subagent-driven, two parallel tracks (backend ‖ frontend), committed on `main` (no worktree, per user request). Per-task quality reviews were skipped per user request; one consolidated quality pass at the end (this document).

## Spec compliance

| Spec requirement | Implemented | Where |
| --- | --- | --- |
| Toggle shown only for 2+ pairs; resets to single when pairs < 2 | ✅ | `page.tsx` toggle (label "Her Sipariş/Kalem No için ayrı QR") + `useEffect` reset |
| Per-pair quantity + per-pair parti in multiple mode | ✅ | per-row `Miktar`/`Parti` inputs gated on `qrMode === "multiple"` |
| Global Miktar/Parti hidden in multiple mode | ✅ | wrapped in `{qrMode === "single" && ...}` |
| All header fields stay shared | ✅ | `payload_base` (BE) + shared `barcodeFormData.*` reads in card builder |
| New atomic `generate-batch-multi` endpoint, one group per pair | ✅ | `generate_qr_code_batch_multi` — loop + `try/except HTTPException: rollback; raise` |
| Shared helper reuse; single mode unchanged externally | ✅ | `_compute_package_quantities`, `_generate_unique_code`, `_build_group_packages`, `_authorize_batch_creation`; `generate-batch` rewired, `QRCodeBatchResponse` unchanged |
| Per-item parti > quantity → 400 | ✅ | `_check_item_packaging` |
| Grouped per-pair results + print | ✅ | `generatedMulti` block + `handlePrintAllMulti`; `buildPackageCardHtml` parametrized with `pairs` |
| Scan/retrieve path untouched | ✅ | no changes to `/retrieve`, `/group`, `_resolve_pairs`, `_normalize_pairs` |

## Code quality

- Backend helpers are small, single-responsibility, and documented. Both endpoints share them; package math lives in one place.
- Atomicity verified in both endpoints (`rollback` on any `HTTPException`, then `commit`).
- FE single/multiple results are mutually exclusive (each submit path clears the other's state).
- **Finding (fixed):** dead `else if (barcodeFormData.quantity <= 0)` no-op branch in `handleGenerateBarcode` — unreachable because single-mode quantity is already guarded earlier. Removed in `de0b96a`.

## Verification

- Backend: `python -m unittest test_qr_batch_helpers test_qr_pairs_fallback_helper` → **22 tests OK**.
- Backend lint: `python -m ruff check` on both files → **All checks passed!** (pre-existing unused `import math` removed during rewire).
- Frontend: `npm run build` → **success**; `npm run lint` → clean (only a pre-existing unrelated `config.ts` warning).

## Concurrency notes

- `qr_code.py` was edited by both this feature's backend agent and a concurrent session (`check_group_deletable`); merged cleanly at separate regions.
- One FE task's changes (Task 9) landed in commit `d56725e` due to a `.git/index.lock` race between the two agents; content verified correct and complete — no half-applied state.

## Outstanding

- Task 11 manual browser smoke (operator-scan of a multi QR, print fidelity) is the only step that can't be run headless here — left for the user to confirm in-app.

## Final status: ✅ Approved (pending manual browser smoke)
