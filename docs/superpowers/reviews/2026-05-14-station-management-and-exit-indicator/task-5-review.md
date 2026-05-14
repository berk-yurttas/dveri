# Task 5: İş emirleri page — badge in Durum column + station-history rows

## Spec Compliance
- Reviewer: ✅ Spec compliant. Single file modified, +17/-10. Edit 1: `ExitStationBadge` import at line 8. Edit 2: `getCurrentStationInfo` at lines 359-373 returns `{ name, isExit }` with the correct three-branch fallback (active-first, then most-recent, then `{ name: "-", isExit: false }`). Edit 3: call site at line 918 uses the new helper. Edit 4: Durum cell at lines 938-945 uses `flex items-center gap-2 flex-wrap` with order name → badge (`size="sm"`) → conditional Aktif badge. Edit 5: OrderFilesViewer prop at line 962 accesses `currentStation.name`. Edit 6: station-history `<h5>` at lines 1041-1044 renders the badge inside it (not a sibling) with `inline-flex items-center gap-2 flex-wrap`. Grep of the full file confirms zero remaining references to the old `getCurrentStation` name and all four `currentStation` usages correctly access `.name`/`.isExit`. Both badge instances use `size="sm"`.

## Code Quality
- Reviewer: **Approved.** Strengths: single focused diff confined to one render path; honest helper rename (`Info` suffix signals object return); all call sites migrated correctly with the `"-"` sentinel check preserved on the OrderFilesViewer prop; `WorkOrderDetail.is_exit_station` already on the interface (no widening needed); `ExitStationBadge` returns null when false so layout is unchanged in the common case.
- Issues (Minor, non-blocking):
  - Per-render `[...entries].sort(...)` in the fallback path — pre-existing behavior, not introduced. Acceptable at current scale; future `useMemo` candidate. **Not addressed** (pre-existing).
  - `<span>` badge inside `<h5>` is valid HTML (phrasing content in heading), and the badge's `title` tooltip may be announced alongside the heading by screen readers. No regression vs. spec. **Not addressed** (acceptable).
  - `flex-wrap` on Durum has no visual effect when no badge renders (2 inline children). No regression.
- Base SHA: `70e327ac467ea48bac6c07beb4e8a37ade373925`
- Head SHA: `f0aa57007e59ab9ea97a5690fc0da39c179a7239`

## Resolution
- Issues found: 3 (all Minor, all acceptable)
- Issues fixed: 0
- Final status: ✅ Approved

## Notes
- RED + GREEN evidence captured verbatim by implementer (6 regions).
- TypeScript compile (`pnpm exec tsc --noEmit`): silent success.
- The rename `getCurrentStation` → `getCurrentStationInfo` makes the type change discoverable at the call site (no silent shape drift).
- Browser visual verification deferred to T9 user-driven walkthrough.
