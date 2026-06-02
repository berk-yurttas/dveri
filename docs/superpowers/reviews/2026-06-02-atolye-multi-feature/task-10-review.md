# Task 10: GET /company-integrations/companies (F1)

## Spec Compliance
- Reviewer: ✅ Spec compliant — new `list_integration_companies` GET returns `list[str]`; 403 guard for non-atolye users; existing GET/PUT untouched; imports add `HTTPException, status`.

## Code Quality
- Reviewer: ✅ Approved (after one fix).
- Base SHA: `e1adc01`
- Impl SHA: `0c90b72` · Fix SHA: `0997bcb`

## Resolution
- Issues found: 1 Important (hardcoded `.collate("tr-TR-x-icu")` is a latent 500 if Postgres built without ICU), 2 Suggestions.
- Issues fixed: 1 — dropped the explicit ICU collation; order by the DB default collation instead (the list feeds a client-side typeahead that filters/sorts in the browser, so exact server-side Turkish collation isn't required). Updated docstring to "unique per row" to match the table's unique constraint (S-1).
- Final status: ✅ Approved
