# Task 7: Frontend Hedef Firma selector + endpoint switch

## Spec Compliance
- Reviewer: ✅ Spec compliant. `HedefFirmaSelect.tsx` created (controlled `<select>`,
  placeholder option, companies mapped); `page.tsx` updated: import, `RecentItem.hedefFirma`,
  `companies`/`hedefFirma` state, companies-fetch effect, `runSearch` replaces
  `/track` with `/track-mes?hedef_firma=...`, guard on empty firma, firma stored in
  pushRecent, selector rendered above ProductSearchCard, recent-query onClick restores
  firma; old `/track` URL gone; all existing views intact; only 2 files changed.

## Code Quality
- Reviewer: Approved with 2 fixes. Stale-closure analysis: safe (no useCallback with
  stale deps; wrapper recreated each render). Companies fetch uses `useCache: true`.
  Selector disabled during loading. Guard fires before setView("loading").
- Fixed (Important): `htmlFor="hedef-firma-select"` on `<label>` + `id` on `<select>`
  for screen-reader association.
- Fixed (Minor): recent-query onClick uses `const firma = r.hedefFirma ?? ""` so stale
  localStorage entries (pre-migration, no hedefFirma field) degrade to the guard's
  error message instead of sending `hedef_firma=undefined` to the backend.
- Minor non-blocked: `onSearch={(q) => runSearch(q)}` wrapper matches plan prescription;
  left as-is.
- Base SHA: 993f2aa
- Head SHA: 87a8c3e (fixes), preceded by d6a2709 (impl)

## Resolution
- Issues found: 1 Important (accessibility), 1 Minor (localStorage migration), 1 Minor cosmetic
- Issues fixed: 2 (both label+id and ?? fallback); cosmetic minor left
- Final status: ✅ Approved (tsc clean, build passes)
