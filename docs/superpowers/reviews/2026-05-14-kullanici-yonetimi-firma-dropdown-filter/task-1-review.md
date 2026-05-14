# Task 1: Swap the filter logic and the input element

## Spec Compliance
- Reviewer: ✅ Spec compliant. Both edits match the plan/spec byte-for-byte. `git status` shows only the target file staged; HEAD remains at the base SHA (no commit yet — by design, the commit happens after manual verification in Task 2). No other filters, modals, or fetch logic touched.

## Code Quality
- Reviewer: Approved. Strengths: exact spec fidelity, structural parity with the existing `filterRole` `<select>`, sound null-safety reasoning (`!filterCompany` short-circuit makes `u.department === filterCompany` safe for `string | null`), defensive `[...companies]` clone before sort, Turkish-locale sort applied, zero collateral changes.
- Issues (Minor, non-blocking):
  - Sort allocation per render: `[...companies].sort(...)` runs on every parent render. Acceptable at current scale (fullAdmin-only, ~tens of companies). Could be wrapped in `useMemo` for consistency with how the codebase memoizes `filteredUsers`. Not addressed in this task — deferred as optional follow-up.
  - Stale-selection edge case: explicitly acknowledged and accepted in the spec; implementation correctly follows that decision.
- Base SHA: `78752e4` (head of `feature/kullanici-yonetimi-firma-dropdown-filter` at task start)
- Head SHA: N/A — change is staged but not committed by design (commit deferred to Task 2 after manual browser verification per the plan)

## Resolution
- Issues found: 2 (both Minor)
- Issues fixed: 0 (neither was a blocker; the memoization suggestion is deferred, the stale-selection note matches spec intent)
- Final status: ✅ Approved

## Notes
- Typecheck (`npx tsc --noEmit`): clean.
- Lint (`npm run lint`): one pre-existing unrelated warning in `src/services/config.ts`; zero new warnings or errors in `kullanici-yonetimi/page.tsx`.
- Diff scope: exactly two hunks in `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`.
- Commit happens in Task 2 after manual browser verification — not premature.
