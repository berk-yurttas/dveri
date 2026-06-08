# Task B7: Search card (frontend)

## Spec Compliance
- Reviewer: ✅ COMPLIANT — `"use client"`, exported `TrackQuery` union, two tabs (green active), order=2 inputs (both required) / part=1 input (required) with exact error strings, trimmed submit with correct discriminated shape, Enter triggers submit, Temizle resets, loading disables button + "Sorgulanıyor...", amber error box.

## Code Quality
- Reviewer: ✅ Approved — correct discriminated-union construction, fully controlled inputs, clean disabled-while-loading, no `any`.
- Base SHA: 9c6a0c3
- Head SHA: 4a2a7e4 (branch feat/urunum-nerede)

## Resolution
- Issues found: 3 (2 Minor a11y: labels lack `htmlFor`/`id`, SVG lacks `aria-hidden`; 1 Low: clear() doesn't reset tab — intentional UX)
- Issues fixed: 0 (accepted) — a11y notes are Minor and consistent with the app's existing label usage; tab-retention on clear is the expected UX.
- Final status: ✅ Approved
