# Task 17: CompanyTypeahead component

## Spec Compliance
- Reviewer: ✅ Spec compliant — named export; props `{ value, onChange, disabled?, required?, placeholder?, id? }`; fetches `/company-integrations/companies` once via `api.get(url, undefined, {useCache:true})` (signature confirmed against lib/api.ts); 250ms debounce; Turkish-locale filter; FixedSizeList virtualization >20 items; "Bu firma listede yok" / empty-catalog / loading states; ARIA combobox/listbox/option.

## Code Quality
- Reviewer: ✅ Approved (after 2 fixes). Central `tsc --noEmit` passes (react-window 1.8.11 types resolve; `data={null}` satisfies required `ListChildComponentProps.data`). Click-outside mousedown ordering correct; fetch effect has cancel guard; no out-of-range indexing.
- Base SHA: `5cfb7c5` → impl on gok2: `c57f6fa` → fix: `720e5f3`

## Resolution
- Issues found: 2 Important (latent — no consumers yet), Minors.
- **I1** (controlled `value`-sync effect could clobber in-progress typing if parent normalizes the value): FIXED — sync now only runs when the input is NOT focused (`document.activeElement !== inputRef.current`) and the value actually differs.
- **I2** (`isValid` trimmed but commit/onChange/filter use untrimmed value → asymmetry): FIXED — `isValid` now compares the raw value against the catalog, consistent with how values are stored/filtered.
- Minors not actioned: M1 arrow-key `scrollToItem` uses pre-update index (highlight state is correct; scroll may lag one frame); M2 Tab-commit has no preventDefault (per-spec "Tab commits"); both noted, non-blocking.
- Final status: ✅ Approved

## Forward note for Wave 4 (T20)
The parent wiring CompanyTypeahead must store `onChange`'s argument verbatim (no trim/uppercase) — the value-sync guard handles external resets but the contract is "store raw."
