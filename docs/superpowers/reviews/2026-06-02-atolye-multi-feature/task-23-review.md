# Task 23: is-emirleri/page.tsx — pair display + route violation badge + Rota Düzenle/Tanımla

## Spec Compliance
- Reviewer: ✅ Spec compliant (after modal-wiring fix). Interfaces use pairs/pair_count (+ route_violation, is_entry_station), no scalar fields; all render sites use pairs[0] + (+N) badge + expanded table; ⚠ Rota dışı badge on route_violation; yönetici-only Rota Düzenle/Tanımla with GET→mode logic; RoutePickerModal confirmed rendered.

## Code Quality
- Reviewer: ✅ Approved (after fixes). Central tsc + lint PASS. Confirmed: 404-vs-network distinction correct (ApiError.status===404 only, network errors → generic message, no false create); earliest-entrance derivation robust; station shapes correct for the modal; route_violation aggregation undefined-safe; button yönetici-gated; pinnedStation stable for the modal lifetime.
- Base SHA: `0f042d7` → impl `ec29ab5`/`5b32cbd` → fixes `65381a4`/`d25d343`/`5fcb83c`

## Resolution
- Issues found: 1 Spec-gap (modal not rendered — agent died mid-task), 3 Minor.
- **Spec-gap** (RoutePickerModal imported + openRouteModal set state but modal NOT rendered): FIXED in `d25d343` — `{routeModalState && <RoutePickerModal .../>}` rendered, wired to groupId/pinnedStation/companyStations/initialRouteStationIds/mode + onSaved(refetch)/onCancelled. Re-reviewed → ✅.
- **Minor #1** (pair predicate inconsistency — list used `pair_count>1`, print/QR used `pairs.length===1`, could diverge to an empty table): FIXED in `5fcb83c` — unified on `pair_count <= 1` (empty pairs still renders the single "-" value, not an empty table).
- Minor #2 (empty-pairs cosmetic) resolved by the predicate unification. Minor #3 (keyless Fragment dev warning) non-blocking, left as-is.
- Final status: ✅ Approved
