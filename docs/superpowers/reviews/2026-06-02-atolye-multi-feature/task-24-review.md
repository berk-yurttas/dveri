# Task 24: kullanici-yonetimi/page.tsx — remove musteri_companies UI

## Spec Compliance
- Reviewer: ✅ Spec compliant — in-file grep for `musteri_compan`/`Hedef Firmalar`/`bulk-musteri` = 0; frontend-wide grep = 0; field removed from local user type; "Hedef Firmalar" column, bulk-edit dialog, firma-dropdown filter, and multi-select form control all removed; surviving page (list, create/edit, filters, pagination) coherent.

## Code Quality
- Reviewer: ✅ Approved — no issues. Zero dangling references (grep of all 13 removed symbols returns nothing); surviving Firma column/filter driven by `u.company`/`u.department` (unrelated to musteri_companies); JSX alignment intact (header 7 th / filter / body / empty-state colSpan all gate the Firma cell on isFullAdmin; colSpan 8→7); no dead imports (createPortal still used).
- Base SHA: `0f042d7` → on gok2: `642a864`/`e171c75`

## Resolution
- Issues found: 0
- Issues fixed: 0
- Final status: ✅ Approved
