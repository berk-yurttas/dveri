# Task 22: operator/page.tsx — F4 badge, F5 first-scan, F6 route picker + override, multi-pair

## Spec Compliance
- Reviewer: ✅ Spec compliant (after modal-wiring fix). stationIsEntry/stationCompany/companyStations wired; EntryStationBadge in header; mapQRCodeToApi reads/sends pairs; first-scan opens RoutePickerModal + suspends scanning; 400 route-deviation opens RouteWarningModal; override re-fires with acknowledged_route_violation:true; multi-pair display. Both modals confirmed rendered in JSX.

## Code Quality
- Reviewer: ✅ Approved (after fixes). Central tsc + lint PASS. Confirmed: first-scan suspension correctly gated (scanner effect early-returns on mode===null + swallows keystrokes); override can't coincide with first scan (backend invariant); legacy-QR pairs covered by backend `_normalize_pairs`; multi-pair null-safe; memo deps correct.
- Base SHA: `0f042d7` → impl `3a2a67d` → fixes `65381a4`/`d25d343`/`5fcb83c`

## Resolution
- Issues found: 1 Spec-gap (modals not rendered — agent died mid-task), 2 Important UX, Minors.
- **Spec-gap** (RoutePickerModal + RouteWarningModal imported/wired but NOT rendered; ack re-fire onConfirm missing): FIXED in `d25d343` — both modals rendered; onConfirm re-fires the pending POST with `acknowledged_route_violation:true`. Re-reviewed → ✅.
- **Important I-1** (override path silently succeeded — no scanProgress/success feedback): FIXED in `5fcb83c` — onConfirm now reads the typed response and sets scanProgress + successMessage like the normal entrance/exit path.
- **Important I-2** (override errors showed raw JSON): FIXED — onConfirm now translates via `parseDetail` (structured/string detail) before falling back.
- Minors (M-1 scanner buffer not cleared on cleanup; M-2 duplicated interceptor; M-3 priority array index): non-blocking, M-3 pre-existing; left as backlog.
- Final status: ✅ Approved
