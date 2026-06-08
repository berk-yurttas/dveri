# Task B2: Status styling + StatusBadge (frontend)

## Spec Compliance
- Reviewer: ✅ COMPLIANT — `STATUS_STYLES` covers all 6 statuses (badge/dot/label), `STEP_STYLES` covers all 4 step statuses (node/line/text), imports from types module; `StatusBadge` renders pill + dot + label with `?? "Bekliyor"` fallback.

## Code Quality
- Reviewer: ✅ Approved
- Base SHA: 68ad0c8
- Head SHA: 46c6570 (branch feat/urunum-nerede)

## Resolution
- Issues found: 2 (Minor) — `#fe9526` hex vs Tailwind scale; `?? "Bekliyor"` fallback flagged as unreachable.
- Issues fixed: 0 (accepted) — `#fe9526` matches existing codebase convention (Müşteri page uses the same hex); the fallback is a deliberate guard against malformed API JSON (status is an untyped string at the network boundary).
- Final status: ✅ Approved
