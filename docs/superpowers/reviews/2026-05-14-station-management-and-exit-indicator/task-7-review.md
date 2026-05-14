# Task 7: Yönetici page — edit modal

## Spec Compliance
- Reviewer: ✅ Spec compliant. Single file modified, +131/-2. Edit 1: 4 new state hooks at lines 52-55 (`editingStation`, `editFormData`, `editModalLoading`, `modalError`); `modalError` correctly named generically (NOT `editModalError`) for T8 reuse; original 3 lines untouched at 49-51. Edit 2: three handlers at lines 183-225 between `handleCreateUser` close (181) and `if (!isYonetici)` early return (228). `openEditModal` resets `modalError` to null; `closeEditModal` resets all edit state; `handleUpdateStation` PUT body includes all 4 fields including `station_order_code` from `editingStation.station_order_code`; error handling try-catches `JSON.parse(err.message)` to extract `detail` with the spec'd fallback. Edit 3: Düzenle button at lines 350-357 — `disabled` removed, `onClick={() => openEditModal(station)}`, all other attributes unchanged. Sil button at 358-366 correctly retains `disabled` and the Task 8 placeholder. Edit 4: modal JSX at 483-563, sibling of `max-w-7xl mx-auto` inside the outermost `min-h-screen` wrapper, conditional render on `editingStation`, overlay classes verbatim, header has `Atölye Düzenle` + `×` with `aria-label="Kapat"`, form submits to `handleUpdateStation`, inline `modalError` red banner, İsim input has `required` and `autoFocus`, Şirket has BOTH `readOnly` and `disabled`, Kaydet shows `{editModalLoading ? "Kaydediliyor..." : "Kaydet"}`.

## Code Quality
- Reviewer: **Approved.** Strengths: overlay classes exactly match the established inline-modal pattern in `is-emirleri/page.tsx:1166,1298` and `operator/page.tsx:1240` — no new visual idiom; state design is clean (`editingStation` doubles as data carrier + open-flag); `closeEditModal` clears `modalError` and `editFormData` to prevent stale state; PUT body preserves `station_order_code` (avoiding silent-null bug); `autoFocus` + `aria-label="Kapat"` show a11y consideration; error parsing exactly mirrors `handleCreateStation` for consistent house style.
- Issues (Minor, non-blocking):
  - Escape / click-outside-to-close not implemented — consistent with sibling inline modals in `is-emirleri` and `operator` pages. **Not addressed** (project convention).
  - Shared `modalError` between T7 and T8: only one modal opens at a time and `openEditModal` resets it. Acceptable; generic name documents the sharing. **Not addressed** (intentional).
  - File growth: ~380 → ~566 lines. Approaching extract threshold. T8 will add a delete modal; a single post-T8 refactor pass extracting `EditStationModal` + `DeleteStationModal` + `parseApiError` helper would be cleanest. **Deferred to post-T8.**
  - Error-parsing block now duplicated three times in this file (create station, create user, update station). Candidate for `parseApiError(err, fallback)` helper. **Deferred to post-T8.**
- Base SHA: `6ee5ed98ccc6d8abaf2fcad2f9a0dc074d9a19a6`
- Head SHA: `dd8e37a46650ba2fdf39973b69fe08ca6354c820`

## Resolution
- Issues found: 4 (all Minor)
- Issues fixed: 0 (refactor deferred to after T8 completes the second modal)
- Final status: ✅ Approved

## Notes
- RED + GREEN evidence captured by implementer for state, button, and outermost wrapper regions; modal JSX inserted at correct nesting depth.
- TypeScript compile (`pnpm exec tsc --noEmit`): exit 0.
- Browser flow verification (edit name, flip exit flag, duplicate-name error, station_order_code preservation) deferred to T9.
