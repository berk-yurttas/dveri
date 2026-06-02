# Task 25: Backend verification

## Status: ✅ PASS (static), with DB-dependent steps deferred

The romiot PostgreSQL is not reachable from this build environment, so the
live `alembic upgrade` and curl endpoint smoke tests could not run here. All
DB-independent verification passed, and one real integration bug was caught
and fixed.

## Checks run

1. **App import** — `python -c "import main"` → `main OK`. The full FastAPI app
   (all routers, models, schemas) imports without error.
2. **Alembic chain integrity** — `python -m alembic -c alembic_romiot.ini heads`
   → single head `f6a7b8c9d0e1`. The M1→M2→M3 chain
   (`d4e5f6a7b8c9` → `e5f6a7b8c9d0` → `f6a7b8c9d0e1`) is linear, no branches.
3. **musteri_company removal** — repo-wide `grep "musteri_company" app/ --include=*.py`
   returns only doc comments; zero live code references. The
   `_extract_musteri_companies_from_roles` helper and the
   `bulk-musteri-companies` endpoint are gone.
4. **py_compile** — all 12 changed backend files compile.
5. **Route registration** — the live app exposes the new endpoints:
   - `GET /api/v1/romiot/station/company-integration/companies`
   - `POST /api/v1/romiot/station/work-order-routes/`
   - `PUT|GET /api/v1/romiot/station/work-order-routes/{work_order_group_id}`
   and the existing scan/station/qr-code endpoints are intact. The removed
   `bulk-musteri-companies` route is absent.

## Bug caught + fixed during verification

**Endpoint path mismatch (frontend ↔ backend).** The OpenAPI dump showed the
new companies endpoint mounted at `/romiot/station/company-integration/companies`
(**singular** — the existing router's prefix), but `CompanyTypeahead` called the
**plural** `/romiot/station/company-integrations/companies` (as the plan/spec
wrote it). That would have produced a 404 and an empty typeahead. Fixed the
frontend call to the singular path (commit `496420c`). Cross-checked ALL
frontend atolye endpoint calls against the registered backend routes —
`work-order-routes` (POST/PUT/GET), `qr-code/*`, `stations/*`, `work-orders/*`
all match.

## Deferred to a DB-connected environment (must run before deploy)

- `alembic -c alembic_romiot.ini upgrade head` (apply M1 backfill + M2 + M3).
- Endpoint smoke per the plan's T25 Step 2 table (target-not-found 400,
  first-scan-not-entry 400, route 409/route_off/route_out_of_order, ack override).
- Confirm the M1 backfill invariant (`COUNT(DISTINCT work_order_group_id) == COUNT(work_order_pairs)`).
