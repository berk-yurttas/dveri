# Task 19: RoutePickerModal component

## Spec Compliance
- Reviewer: ✅ Spec compliant — named export; full prop shape; named badge imports + dnd-kit core/sortable/utilities + api; `SortableItem` with `useSortable({disabled: isPinned})`, lock on position 0, no remove when pinned; reorder guard `if (oldIndex===0 || newIndex===0) return`; "+ Atölye Ekle" appends from `availableToAdd`; `canSave = orderedIds.length>=2 && (!hasExitStationInCompany || endsAtExit)`; no-exit yellow banner + exit-end amber warning; create→POST / update→PUT(encoded id); error parses `err.message` JSON detail.

## Code Quality
- Reviewer: ✅ Approved (with minor follow-ups). Central `tsc --noEmit` passes (dnd-kit 6.3.1/8.0.0 types resolve; numeric station ids round-trip cleanly as `UniqueIdentifier`). Verified: dnd-kit id stability/uniqueness, arrayMove index correctness, pinned-position double-guard (drag disabled + index-0 drop guard), functional-updater state (no stale closures), save payloads match the backend contract, double-submit guarded by `saving`, robust error parsing.
- Base SHA: `e8c53d3` → on gok2: `7c49e1d`

## Resolution
- Issues found: 0 Critical, 0 Important, 3 Minor + 4 Suggestions.
- Minor (accepted, backlog): M1 `<li>` nested under `<ol>` via a `<div>` wrapper (invalid HTML nesting; dnd-kit still works — cosmetic/semantic); M2 imperative `select` reset via `e.target.value=""` (works; fragile if made controlled); M3 latent asymmetry between `stationsById` source set and `availableToAdd` source set (correct in all traced cases; deserves a clarifying comment).
- Suggestions (backlog): `err: unknown` narrowing; Escape/backdrop-click to cancel; stable `pinnedFirstStation` prop from consumers; lucide icons instead of glyphs.
- Issues fixed: 0 (none blocking; matches plan verbatim).
- Final status: ✅ Approved

## Forward note for Wave 4 (T22/T23)
Consumers MUST pass a stable `pinnedFirstStation` reference (memoize or derive once) so a future re-seed effect can't clobber user edits.
