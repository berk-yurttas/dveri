# Company Registry + toy_api Fields — Design

**Date:** 2026-06-03
**Scope:** atolye subsystem — new `companies` + `user_companies` tables (romiot DB), rip-out of PocketBase as the company source for atolye, company typeahead in user forms, and two new Mekasan/toy_api fields (`SubcontractorID`, `SourceCompany`).

## Goal

1. Introduce a first-class **company registry** (`companies`: id, name, code) and a **1:1 user→company pairing** (`user_companies`), both in the romiot DB. These become the authoritative source of a user's company for the atolye subsystem, replacing PocketBase's `department`/`company`.
2. In the user create/edit forms (kullanici-yonetimi), select the company from this registry via a **typeahead** (reusing the existing `CompanyTypeahead`).
3. Send two new fields to the Mekasan/toy_api endpoint: **`SubcontractorID`** = the company code of the work order's `company_from`, and **`SourceCompany`** = the work order's target company name.

## Non-goals

- **No company-management UI.** Companies are populated by SQL after deploy (empty seed). Adding/editing companies later is a direct DB operation (a future feature may add CRUD).
- **No global rip-out.** Only the **atolye subsystem** stops reading `current_user.department`/`company`. The global `User` model keeps those PocketBase fields intact for non-atolye platforms (reports, dashboards, seyir, etc.).
- **No removal of `work_orders.company_from` (string) in this pass.** A new `company_from_id` FK is added alongside it; the string is dropped in a later development.
- **No change to `company_integrations`** (stays name-keyed; out of scope).
- **No M:N user↔company.** Each user belongs to exactly one company.

## Key decisions (from brainstorming)

| # | Decision |
|---|---|
| Q1/Q5 | Rip-out is **atolye-subsystem-only**, via a `resolve_user_company()` helper over the pairing table. Global `User.department`/`company` untouched. |
| Q2 | `companies` + `user_companies` live in the **romiot DB**. |
| Q3 | **1:1** user→company (UNIQUE on `pb_user_id`). |
| Q4/Q9 | **Empty seed.** Companies populated via SQL post-deploy. |
| Q6 | An **operator's** paired company **must equal their station's company**; enforced on user create/edit. |
| Q7 | A user with **no pairing row** → atolye company-dependent endpoints return **403** ("Kullanıcı bir firmaya atanmamış"). No PocketBase fallback. |
| Q8 | `companies.name` UNIQUE NOT NULL; `companies.code` UNIQUE NOT NULL (short free-text VARCHAR). |
| Q10 | Existing users paired via a **one-time standalone backfill script** that reads PocketBase. |
| Q11 | On create/edit, **still mirror** the chosen company → PB `department`/`company` (coherence/rollback). |
| Q12 | **New `GET /companies`** endpoint backed by the companies table; reuse `CompanyTypeahead`. |
| Q13 | `company_from` becomes an **FK** (`company_from_id`) on `work_orders`; `SubcontractorID` derives from `company_from_id → companies.code`; if null/missing, send `"SubcontractorID": null`. |
| Q14 | `SourceCompany` = the existing `company` argument to `send_production_order` (target company name = scanning station's company). |
| Q15 | Frontend reads its own company from a new **`GET /my-company`** endpoint, not `user.department`. |
| Q16 | kullanici-yonetimi list + yönetici scoping resolve per-user company from the **pairing table**. |

## Section 1 — Data model (romiot DB)

```
companies                              (new)
  id          INT PK
  name        VARCHAR(255) NOT NULL UNIQUE
  code        VARCHAR(64)  NOT NULL UNIQUE
  created_at  TIMESTAMPTZ  server_default now()
  updated_at  TIMESTAMPTZ  server_default now() onupdate now()

user_companies                         (new — 1:1)
  id          INT PK
  pb_user_id  VARCHAR(255) NOT NULL UNIQUE   -- PocketBase user id; no cross-DB FK
  company_id  INT NOT NULL FK→companies.id ON DELETE RESTRICT
  created_at  TIMESTAMPTZ  server_default now()
  updated_at  TIMESTAMPTZ  server_default now() onupdate now()

work_orders                            (modified)
  + company_from_id  INT NULL FK→companies.id ON DELETE RESTRICT
```

- `companies.name` is the **single canonical company string** that everything previously compared against `current_user.department` now resolves through (station.company, qr `company`, work_orders.company_from). The SQL seed must cover every distinct company name in use.
- `user_companies.pb_user_id` keys on the **PocketBase user id** (string), matching the existing cross-DB pattern (`WorkOrder.user_id` stores a primary-DB id with no FK). `company_id` is a real same-DB FK. `UNIQUE(pb_user_id)` enforces 1:1.
- `work_orders.company_from_id` is **nullable** so legacy rows / unmatched company_from degrade gracefully.

**Models** (`app/models/romiot_models.py`): new `Company` and `UserCompany` classes; `WorkOrder` gains `company_from_id = Column(Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=True)`.

## Section 2 — Company resolution + backend rip-out

**New module** `app/api/v1/endpoints/romiot/station/company_resolver.py`:

```python
async def resolve_user_company(current_user, romiot_db) -> Company | None:
    """The user's company from user_companies (NOT PocketBase). None if unpaired."""
    result = await romiot_db.execute(
        select(Company)
        .join(UserCompany, UserCompany.company_id == Company.id)
        .where(UserCompany.pb_user_id == current_user.id)
    )
    return result.scalar_one_or_none()

async def require_user_company(current_user, romiot_db) -> Company:
    company = await resolve_user_company(current_user, romiot_db)
    if company is None:
        raise HTTPException(status_code=403, detail="Kullanıcı bir firmaya atanmamış")
    return company
```

**The three auth helpers** (`auth.py`) are rewired (each currently returns `current_user.department`):

| Helper | After |
|---|---|
| `check_station_yonetici_role(user, romiot_db)` | checks `atolye:yonetici` role, then returns `require_user_company(...).name` |
| `get_station_company(user, romiot_db)` | returns `require_user_company(...).name` |
| `check_station_operator_role(station_id, user, romiot_db)` | compares `station.company == require_user_company(...).name` |

All three become **async + `romiot_db`-aware**. Their **29 call sites** thread the existing `romiot_db` session through. `is_full_admin` is unchanged (role-based).

**Direct `current_user.department` reads (11)** become `resolve_user_company` / `require_user_company` calls:

- **`qr_code.py`** — `generate_qr_code`, `generate_qr_code_batch`: `sender_company = require_user_company(...).name`; capture `.id` to embed `company_from_id` in the QR JSON. `get_qr_codes_by_work_order_group`: müşteri `company_from` filter uses the resolved name.
- **`work_order.py`** — `get_all_work_orders`: company/department scoping uses the resolved name. `create_work_order`: writes `company_from_id` (from QR payload, see Section 4).
- **`station.py`** — `list_stations`, `create_station`, `update_station`, `delete_station`, `get_my_station`, `management/users` endpoints, work-order-link-directory: company via the helpers.
- **`company_integration.py`**, **`priority.py`** — company via the helpers.

Non-atolye consumers of `User.department`/`company` are untouched.

## Section 3 — User management + endpoints

**New read endpoints:**

```
GET /romiot/station/companies   → list[{id, name, code}]   (companies table; for the typeahead)
GET /romiot/station/my-company  → {id, name, code} (200) | 404 (caller via resolve_user_company)
```

Auth: any authenticated user with an `atolye:*` role.

**Create/edit managed user** (`POST /management/users`, `PUT /management/users/{pocketbase_user_id}` and the legacy `/user` create path):

- The request carries an optional **`company_id`** (the typeahead resolves a name → id from `GET /companies`).
- **Non-operator (müşteri / yönetici / satinalma):** `company_id` is **required**; the paired company is the chosen one.
- **Operator:** the paired company is **derived server-side from the selected station's company** (look up `companies` WHERE `name == station.company`) — this is authoritative. `company_id` is **optional** for operators; if the client sends one, it must match the station-derived company or the request is rejected. If no `companies` row matches the station's company → 400 with a clear message. The form hides/locks the typeahead for operators.
- On success: (1) create/update the PB user (unchanged), (2) **upsert `user_companies`** (`pb_user_id → company_id`) — the atolye source of truth, (3) **mirror** `companies.name` into PB `department`/`company` (Q11).
- Yönetici (non-fullAdmin) create/edit remains scoped to their own resolved company.

**List managed users** (`GET /management/users`): each user's company is resolved by **joining `user_companies` by `pb_user_id`**. The "Firma" column and the yönetici "my company only" filter use the pairing-resolved company (not PB department).

**Schemas:** managed-user create/update requests add `company_id: int | None`; the old free-text `department` field on those requests is no longer the company source (kept only as the mirror target, derived server-side from `companies.name`). The `":" in department` validation is dropped (company comes from a fixed list).

**Frontend** ([kullanici-yonetimi/page.tsx](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx)):
- Replace the free-text "Firma" inputs (create + edit forms) with `<CompanyTypeahead>` bound to `GET /companies`, storing the selected `company_id`. For operators, the company auto-sets from the chosen station and the typeahead is locked.
- Remove the `:`-in-name validation.

**Frontend own-company** — replace `user.department || user.company` with a fetch from `GET /my-company`:
- müşteri "Gönderen Firma" ([musteri/page.tsx:82](dtfrontend/src/app/[platform]/atolye/musteri/page.tsx#L82))
- yönetici company ([yonetici/page.tsx:69](dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx#L69))
- is-emirleri company ([is-emirleri/page.tsx:239](dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx#L239)) (incl. the ASELSAN-satinalma `toUpperCase` check at line 244)

## Section 4 — toy_api fields

In `_build_payload_item` ([toy_api_service.py:17](dtbackend/app/services/toy_api_service.py#L17)) add two keys:

```python
"SubcontractorID": subcontractor_id,   # company_from's code (param)
"SourceCompany":   company,            # target company name (existing `company` arg)
```

- **`SourceCompany`** = the `company` argument already passed to `send_production_order` (= scanning station's company = the work order's target company, Q14). No new lookup.
- **`SubcontractorID`** = the **code** of `company_from`, resolved by the **caller** (`create_work_order` / `update_exit_date` in `work_order.py`, which has a `romiot_db` session and the `WorkOrder` row): `WorkOrder.company_from_id → companies.code`. The caller passes a new `subcontractor_id: str | None` arg into `send_production_order`, which forwards it to `_build_payload_item`. (Keeps `send_production_order` DB-session-free, consistent with how `pairs` are fetched by the caller and passed in.)
- If `company_from_id` is null or its company has no code → `subcontractor_id = None` → payload sends `"SubcontractorID": null`; a warning is logged; the fire-and-forget push still proceeds (Q13).

**Populating `company_from_id`:**
- At QR creation, the müşteri's company is resolved (Section 2), so the QR JSON carries `company_from_id` alongside `company_from`.
- At scan time, `create_work_order` writes both `company_from` (string, back-compat) and `company_from_id` (FK) from the QR payload onto the `WorkOrder` row.
- Legacy QRs without `company_from_id`: resolve by `company_from` name → `companies.id`; else null.

## Section 5 — Migrations, backfill, rollout

**Migration** `alembic_romiot/versions/add_companies_and_user_companies.py` — schema only, no seed:
- `op.create_table("companies", ...)` (name unique, code unique, both NOT NULL, timestamps).
- `op.create_table("user_companies", ...)` (pb_user_id unique, company_id FK→companies RESTRICT, timestamps).
- `op.add_column("work_orders", Column("company_from_id", Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=True))`.
- Downgrade: drop the column, then `user_companies`, then `companies`.

**Backfill script** `scripts/backfill_user_companies.py` (standalone, run once; NOT Alembic — must read PocketBase):
1. Authenticate to PocketBase (admin creds from settings).
2. List atolye users (any `atolye:*` role).
3. For each, match PB `department` → `companies.name`; insert a `user_companies` row (skip if one already exists — idempotent).
4. Report every user whose department has no matching company, and any company name used by stations/work_orders missing from `companies`.

**`company_from_id` backfill** (same script or SQL): `UPDATE work_orders SET company_from_id = c.id FROM companies c WHERE work_orders.company_from = c.name AND work_orders.company_from_id IS NULL`.

**Rollout order** (DB-connected env):
1. Deploy code + `alembic -c alembic_romiot.ini upgrade head` (creates empty tables/column).
2. SQL-`INSERT` the real `companies` (name + code) — must cover every company name currently in use.
3. Run `backfill_user_companies.py`; review the unmatched report; fix (add missing companies / correct departments).
4. Backfill `work_orders.company_from_id` (SQL/script).
5. Verify: no atolye user without a pairing; `GET /my-company` returns the company; a scan's Mekasan push carries `SubcontractorID` + `SourceCompany`.

Until steps 2–3 are done, atolye company-dependent endpoints return 403 for unpaired users — expected (Q7, no PocketBase fallback).

## Error handling

- Unpaired user on a company-dependent endpoint → 403 "Kullanıcı bir firmaya atanmamış".
- Operator create/edit whose `company_id` ≠ station's company, or station company absent from `companies` → 400 with a clear message.
- toy_api missing code → `SubcontractorID: null` + warning log; never blocks the scan.
- `GET /my-company` for an unpaired user → 404 (frontend shows an appropriate empty/blocked state).

## Testing notes

**Backend:**
- `resolve_user_company` / `require_user_company`: paired → company; unpaired → None / 403.
- Rewired auth helpers return the resolved company name; 29 call sites compile + thread `romiot_db`.
- `generate_qr_code_batch` embeds `company_from_id` in the QR JSON; `create_work_order` persists it on the row (incl. legacy fallback by name).
- Operator create/edit: company-must-match-station enforced; non-operator picks from `/companies`.
- toy_api: payload carries `SubcontractorID` (code, or null when unknown) and `SourceCompany` (target name) for single- and multi-pair pushes.
- `GET /companies` returns the registry; `GET /my-company` returns the caller's company / 404 when unpaired.

**Frontend:**
- kullanici-yonetimi create/edit use CompanyTypeahead(/companies); operator company locked to station; no `:`-validation.
- Managed-user list shows pairing-resolved company; yönetici filter scopes by it.
- müşteri "Gönderen Firma", yönetici, is-emirleri read `/my-company`.

**Backfill:**
- Script pairs existing users; idempotent on re-run; unmatched report is accurate.

## Open questions

None — resolved during brainstorming. The only operational dependency is the post-deploy SQL company seed + backfill run (Section 5), which is intentional given the empty-seed / no-CRUD-UI decision.
