# Task 05 — company_resolver helper

## Spec Compliance
- ✅ — `resolve_user_company(current_user, romiot_db) -> Company | None` (join `UserCompany` on `company_id == Company.id`, filter `pb_user_id == current_user.id`, `scalar_one_or_none()`) and `require_user_company(...)` raising `HTTPException(403, "Kullanıcı bir firmaya atanmamış")` on None. All required imports present.

## Code Quality
- ✅ — join/filter correct; `UserCompany.pb_user_id` (String(255)) matched against `User.id: str` (confirmed); `UNIQUE(pb_user_id)` makes `scalar_one_or_none()` correct; no unused imports; smoke `ok`.
- gok2 commit: `3142943` (cherry-picked from `7cd941b`)

## Resolution
- Issues found: 0
- Final status: ✅ Approved
