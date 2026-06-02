# Task 21: yonetici/page.tsx — F4 is_entry_station + F5/F6 banners

## Spec Compliance
- Reviewer: ✅ Spec compliant — Station interface + both form states carry `is_entry_station`; Giriş checkbox in create form + edit modal (above Çıkış); PUT body includes is_entry_station; Tip column stacks Entry+Exit badges with "—" only when neither; both warning banners gated on `stations.length>0 && !stations.some(...)`; existing flows preserved.

## Code Quality
- Reviewer: ✅ Approved — no issues. `is_entry_station` present at every init/reset site (no uncontrolled-checkbox warning); PUT body complete; badges self-hide; banners don't flash on empty/loading; create/operator/delete flows untouched.
- Base SHA: `0f042d7` → on gok2: `e6d2594` (`160c052`)

## Resolution
- Issues found: 0
- Issues fixed: 0
- Final status: ✅ Approved
