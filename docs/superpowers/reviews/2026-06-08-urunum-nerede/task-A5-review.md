# Task A5: GET /track endpoint (backend)

## Spec Compliance
- Reviewer: ✅ COMPLIANT — import block adds TrackResponse/TrackMatch; `_resolve_track_group_ids` (company_from scope + part ilike + exact order/item EXISTS subquery + distinct); `_company_for_group_local`; `/track` handler with 403 (non-müşteri / blank dept), 400 (no params), scanned-group assembly, QR-only assembly (rows=[], route=[]), returns TrackResponse.
- **Isolation explicitly confirmed:** cross-company data cannot be returned — resolver enforces `company_from == department` at SQL level AND the QR loop re-checks `company_from != department`.

## Code Quality
- Reviewer: ✅ Approved (after one fix). Watertight company scoping, parameterized bindings (no injection), correct async/await.
- Base SHA: 4703bcf
- Head SHA: f9425e6 (branch wt/urunum-backend)

## Resolution
- Issues found: 1 Important (unguarded `int()` casts on QR payload → potential 500) + 2 Minor (accepted: `_company_for_group_local` limit(1) ordering; unscoped `select(QRCodeData)` consistent with `/all`)
- Issues fixed: 1 (wrapped QR int casts in `try/except (TypeError, ValueError): continue`, matching `/all`)
- RED/GREEN: RED ImportError → GREEN 2 resolver tests; full track suite 20 tests OK
- Final status: ✅ Approved
