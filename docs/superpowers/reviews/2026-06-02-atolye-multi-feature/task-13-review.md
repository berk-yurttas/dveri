# Task 13: station.py — is_entry_station in /my-station + remove musteri_companies plumbing

## Spec Compliance
- Reviewer: ✅ Spec compliant — zero `musteri_company` refs; `_extract_musteri_companies_from_roles` deleted; field removed from `ManagedUserResponse`/`ManagedUserUpdateRequest`/`FullAdminUserCreateRequest` + validators; obsolete `bulk-musteri-companies` endpoint + 2 schemas removed (aligns with T24); `get_my_station` returns `is_entry_station` + `is_exit_station`; import clean (15 routes).

## Code Quality
- Reviewer: ✅ Approved — no changes required.
- Base SHA: `e1adc01`
- Head SHA: `d9feeb9`

## Resolution
- Issues found: 0 (2 pre-existing unused imports at lines 932-933 confirmed present at base SHA — not a T13 regression; noted as a separate housekeeping item).
- Issues fixed: 0
- Final status: ✅ Approved

## Related cleanup (done separately)
- Obsolete `dtbackend/test_musteri_companies_helper.py` (which imported the deleted helper) removed in commit `5622cfb` so pytest collection doesn't break.
