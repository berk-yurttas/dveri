# "Ürünüm Nerede?" — Switch data source to external MES (AFLOW) DB

**Date:** 2026-06-25
**Status:** Design approved
**Platform area:** Atölye (workshop) — müşteri role
**Supersedes (data source only):** [2026-06-08-urunum-nerede-design.md](2026-06-08-urunum-nerede-design.md)

## 1. Summary

The "Ürünüm Nerede?" page currently reads from **our own romiot Postgres**
(`WorkOrder` / `WorkOrderRoute` / `WorkOrderPair` / `QRCodeData` / `Station`) via
`GET /romiot/station/work-orders/track`. We are switching its data source to the
**external MES tables** in the **AFLOW** SQL Server — `Mes_ProductionOrders_<company>`
(e.g. `Mes_ProductionOrders_bosan`, `_mekasan`, `_teknopar`).

Each **Hedef Firma** (target/coating company) has its **own MES table** and may need a
different (single, optional) WHERE filter. That per-company mapping
(`table_name` + optional `filter_column`/`filter_value`) is stored in a **new config
table in our Postgres**. The Hedef Firma list itself continues to come from the existing
`company_integrations` table — that mechanism is **unchanged**.

The page's UI stays the same; only the data source and one new Hedef Firma selector
change. The existing result components are reused unchanged.

## 2. Goals / Non-Goals

### Goals
- Read tracking data for "Ürünüm Nerede?" from `Mes_ProductionOrders_<company>` in AFLOW
  instead of our romiot Postgres.
- Support a different MES table (and an optional single-column filter) per Hedef Firma,
  configured by a row in a new Postgres table.
- Keep the existing page UX and result components; add only a Hedef Firma selector.
- Reuse the existing `TrackResponse` / `TrackMatch` response shape so the frontend
  components need no changes.

### Non-Goals
- No change to how Hedef Firma options are sourced (`company_integrations` stays as-is).
- No change to the existing Toy/Mekasan **push** integration (`toy_api_service.py`).
- No change to operator scanning, routes, or the romiot `WorkOrder` model.
- No admin UI for the new config table in v1 (rows seeded by SQL; yönetici CRUD deferred).
- The old Postgres `/track` endpoint is **kept** (rollback safety) but no longer used by
  the page.

## 3. Decisions (resolved with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Hedef Firma source | Unchanged — keep `company_integrations`; the new per-company MES config is a **separate new table**. |
| 2 | DB connection | **Direct pyodbc → AFLOW**, reusing the `get_aflow_connection` driver-fallback pattern. |
| 3 | WHERE config | At most **one column** equality filter per Hedef Firma; may be **absent**. |
| 4 | Route grouping | Group MES rows by **`AselsanOrderCode` + `WorkOrderItemNo`**; each row = one operation = one timeline step. |
| 5 | Endpoint structure | **Approach A** — new `GET /track-mes` endpoint + `mes_tracking_service.py`; old `/track` left intact. |
| 6 | Column mapping | Reuse the mapping already encoded in [toy_api_service.py](../../../dtbackend/app/services/toy_api_service.py#L19) (we push to these same columns). |

## 4. Column mapping (MES ⇄ Ürünüm Nerede)

Derived from `_build_payload_item` in
[toy_api_service.py:19](../../../dtbackend/app/services/toy_api_service.py#L19):

| Ürünüm Nerede field | MES column |
|---|---|
| Sipariş No (`aselsan_order_number`) | `AselsanOrderCode` |
| Kalem No (`order_item_number`) | `WorkOrderItemNo` |
| Parça No (`part_number`) | `ProductCode` (also `Mes_ProductCode`) |
| Revizyon (`revision_number`) | `RevisionNo` |
| İstasyon/operasyon adı | `OperationDesc` |
| İstasyon sıra kodu (ordering) | `Mes_MachineGroup` |
| Giriş tarihi (`entry_date`) | `ActualStartDate` |
| Çıkış tarihi (`exit_date`) | `ActualEndDate` |
| Hedef tarih (`target_date`) | `NeedDate` |
| Sektör (`sector`) | `AselsanSectorCode` |
| Gönderen Firma kodu | `SubcontractorID` (resolve to `Company.name`) |
| Hedef Firma adı | selected Hedef Firma (also `SourceCompany`) |
| Toplam adet (`total_quantity`) | `WorkOrderAmount` |

Both tables also carry `IsDeleted` / `DeletedDate` (soft delete) and `OrderStatus`.
`Mes_ProductionOrders_mekasan` additionally has `SourceCompany`. Full DDL:
[Create_Bosan_Mes_Tables.sql](../../../../ahtapot_api/Toy%20Api/SQL_Migrations/Create_Bosan_Mes_Tables.sql),
[Create_Mekasan_Mes_Tables.sql](../../../../ahtapot_api/Toy%20Api/SQL_Migrations/Create_Mekasan_Mes_Tables.sql).

## 5. Architecture

```
[urunum-nerede page]  + Hedef Firma <select> (from /company-integration/companies)
        │  GET /romiot/station/work-orders/track-mes
        │      ?hedef_firma=&order_number=&order_item_number=  (or ?part_number=)
        ▼
[backend GET /track-mes]  müşteri-only
        │  lookup config row for hedef_firma in urunum_nerede_mes_sources (Postgres)
        ▼
[mes_tracking_service]  build SQL (validated table/column + bound params)
        │  pyodbc read from AFLOW Mes_ProductionOrders_<company>   (asyncio.to_thread)
        ▼
[group rows by (AselsanOrderCode, WorkOrderItemNo)]  → assemble TrackMatch[]
        ▼
[TrackResponse] → existing page renders matches (same components)
```

### 5.1 Config table (new, romiot Postgres)

Model `UrunumNeredeMesSource` in
[app/models/romiot_models.py](../../../dtbackend/app/models/romiot_models.py),
table `urunum_nerede_mes_sources` (Alembic migration mirrors
[add_company_integrations_table.py](../../../dtbackend/alembic_romiot/versions/add_company_integrations_table.py)):

| column | type | notes |
|---|---|---|
| `id` | Integer PK | |
| `company` | String(255), unique, indexed, not null | Hedef Firma name; matches `company_integrations.company` |
| `table_name` | String(255), not null | e.g. `Mes_ProductionOrders_mekasan` |
| `filter_column` | String(128), nullable | single optional WHERE column |
| `filter_value` | String(512), nullable | value for the filter; both null → no base filter |
| `created_at` / `updated_at` | DateTime(timezone) | `server_default=now()` |

Seeded by SQL insert for the live Hedef Firma rows (bosan/mekasan/teknopar). No CRUD API
in v1.

### 5.2 Backend service — `app/services/mes_tracking_service.py`

```python
async def track_from_mes(
    romiot_db: AsyncSession,
    *,
    hedef_firma: str,
    order_number: str | None,
    order_item_number: str | None,
    part_number: str | None,
) -> TrackResponse
```

Steps:
1. Load the `UrunumNeredeMesSource` row for `hedef_firma`. **Missing → return
   `TrackResponse(matches=[])`** (page shows "Kayıt bulunamadı").
2. **Validate identifiers**: `table_name` and (if present) `filter_column` must match
   `^[A-Za-z0-9_]+$`; otherwise raise `400` (misconfiguration). These are interpolated
   into SQL (cannot be bind parameters).
3. **Build SQL** against `dbo.[table_name]`. All *values* are pyodbc `?` bind params:
   - base filter: `AND [filter_column] = ?` when both filter fields set;
   - order+item search: `AND AselsanOrderCode = ? AND WorkOrderItemNo = ?` (exact);
   - part search: `AND ProductCode LIKE ?` (`%value%`, multi-match);
   - always: `AND (IsDeleted = 0 OR IsDeleted IS NULL)`.
   Select the columns in §4 plus `OperationCode`, `OrderStatus`, `ActualQuantity`,
   `PlannedQuantity`.
4. **Read** via pyodbc inside `asyncio.to_thread` (pyodbc is sync). Reuse the
   driver-fallback logic of
   [get_aflow_connection](../../../dtbackend/app/core/database.py#L72); the table is the
   only query difference, DB/server are unchanged.
5. **Group** rows by `(AselsanOrderCode, WorkOrderItemNo)` → one `TrackMatch` each.
6. **Resolve** `company_from`: map each row's `SubcontractorID` to `Company.name` (one
   Postgres lookup, cached per request); fall back to the raw code, else `""`.

### 5.3 MES → TrackMatch assembly

Per group (ordered by `Mes_MachineGroup` numeric-then-string, tiebreak `ActualStartDate`):

**Timeline step** (per MES row):
- `position` = 1-based index; `station_id` = synthetic index (frontend uses it only as a
  React key); `station_name` = `OperationDesc`; `is_exit_station` = True for the last
  step; `entry_date` = `ActualStartDate`; `exit_date` = `ActualEndDate`.
- step `status`: `done` if `ActualEndDate` set; else `active` if `ActualStartDate` set;
  else `waiting`. `active` becomes `delayed` when `NeedDate < today`.

**Group fields**:
- `work_order_group_id` = `f"{AselsanOrderCode}-{WorkOrderItemNo}"` (unique per match key).
- `part_number` = `ProductCode`; `revision_number` = `RevisionNo`.
- `pairs` = `[OrderPair(aselsan_order_number=AselsanOrderCode, order_item_number=WorkOrderItemNo)]`.
- `coating_company` = selected `hedef_firma`; `company_from` = resolved name; `sector` =
  `AselsanSectorCode`; `main_customer` = `""`; `teklif_number` = `""`.
- `total_quantity` = `WorkOrderAmount` (fallback `PlannedQuantity`, else 0);
  `total_packages` = 1; `packages` = `[]` (MES has no package granularity →
  `PackageStrip` renders nothing for `length <= 1`).
- `target_date` = `NeedDate` (date); `last_updated` = max of all `ActualStartDate`/
  `ActualEndDate`; `has_route` = ops > 1.
- `current_station_name` / `current_entry_date` = the (last) `active` op; else the last
  `done` op's name with null entry; else `None` (renders "Girişi yapılmadı").

**Group `status`** (existing TrackStatus vocabulary):
- all ops `done` → **Tamamlandı**
- the exit/last op is `active` → **Sevke Hazır**
- any op `active` and `NeedDate < today` → **Gecikmiş**
- some op `active` → **İşlemde**
- nothing started → **Girişi yapılmadı**

### 5.4 Backend endpoint — new handler in `work_order.py`

Added to the existing router (already mounted at `/romiot/station/work-orders`), so no
`api.py` change:

```
GET /romiot/station/work-orders/track-mes
  query: hedef_firma: str (required)
         order_number, order_item_number, part_number: str | None
  auth:  check_authenticated; requires "atolye:musteri" in role  → else 403
  valid: hedef_firma required (else 400);
         (order_number AND order_item_number) OR part_number (else 400)
  body:  delegates to mes_tracking_service.track_from_mes(...)
```

### 5.5 Frontend

- [page.tsx](../../../dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx):
  - Add a **Hedef Firma `<select>`** fetched from
    `/romiot/station/company-integration/companies` (the unchanged list). Required before
    search; disable submit until chosen.
  - Switch the fetch URL to `/romiot/station/work-orders/track-mes` and include
    `hedef_firma` in the query string. Recent-queries entries also store the Hedef Firma.
- `types.ts` and all result components (`TrackResultCard`, `RouteTimeline`,
  `TrackMatchList`, `PackageStrip`, `StatusBadge`, `ProductSearchCard`) — **unchanged**
  (the selector lives at page level or as a small new sibling component).

## 6. Data flow (happy path)

1. Müşteri opens the page → picks a Hedef Firma → enters Sipariş+Kalem (or Parça) → submit.
2. Frontend `GET /track-mes?hedef_firma=…&order_number=…&order_item_number=…`.
3. Backend role-checks, loads the config row, builds + runs the AFLOW query.
4. Rows grouped → `matches[]`: 0 → not-found; 1 → result; >1 → selector list.
5. Existing components render the result/timeline.

## 7. Error handling

- `400` — missing `hedef_firma`; missing/invalid search params; invalid configured
  `table_name`/`filter_column`.
- `403` — caller lacks `atolye:musteri`.
- No config row for the Hedef Firma → `matches: []` (not an error; not-found state).
- pyodbc/connection failure → `500` surfaced as the page's generic error toast.
- Not found (`matches: []`) → existing empty state.

## 8. Security

- `table_name` / `filter_column` come from our own config table but are still validated
  against `^[A-Za-z0-9_]+$` before interpolation; everything user-supplied
  (`filter_value`, search terms) is passed as pyodbc bind parameters. No string
  concatenation of user input into SQL.
- Endpoint remains müşteri-gated.
- **Row scoping is relaxed** vs. the old endpoint: the only row filter is the optional
  single config column. There is no per-user department isolation; any müşteri who selects
  a Hedef Firma and knows a Sipariş+Kalem / Parça can look it up. (Accepted; if per-müşteri
  isolation is later required, it must be expressed via `filter_column`.)

## 9. Testing strategy

**Backend (unittest, pyodbc mocked — mirror
[test_toy_api_post_helper.py](../../../dtbackend/test_toy_api_post_helper.py)):**
- identifier validation rejects non-`^[A-Za-z0-9_]+$` `table_name`/`filter_column`.
- SQL builder: order+item produces exact predicates + bound params; part produces
  `LIKE %…%`; optional filter included only when configured; `IsDeleted` clause always present.
- grouping: rows across two `(AselsanOrderCode, WorkOrderItemNo)` pairs → two matches;
  one pair with N operations → one match with N timeline steps in order.
- status derivation: all-done → Tamamlandı; last op active → Sevke Hazır;
  active + overdue NeedDate → Gecikmiş; none started → Girişi yapılmadı; step statuses
  done/active/waiting/delayed.
- `company_from` resolution from `SubcontractorID` → `Company.name` (and fallback).
- no config row → `matches: []`.
- endpoint: non-müşteri → 403; missing `hedef_firma` → 400; missing search params → 400.

**Frontend (typecheck/build + manual):**
- Hedef Firma required before search (submit disabled / validation message).
- single vs. multi-match rendering; not-found and error states.
- `PackageStrip` hidden (packages empty); timeline renders the operation steps.

**Verification before completion:** run the backend unittest suite + frontend
`tsc`/build; manual smoke of the four page states against a seeded config row.

## 10. Affected files

**Backend (create):**
- `dtbackend/app/services/mes_tracking_service.py` — config lookup, SQL build, pyodbc
  read, grouping/assembly.
- `dtbackend/alembic_romiot/versions/<new>_add_urunum_nerede_mes_sources_table.py`.
- `dtbackend/test_mes_tracking_service.py` — unit tests.

**Backend (modify):**
- `dtbackend/app/models/romiot_models.py` — add `UrunumNeredeMesSource`.
- `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — add `GET /track-mes`.

**Frontend (modify):**
- `dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx` — Hedef Firma selector +
  endpoint switch + query param. (Optional small new
  `components/atolye/urunum-nerede/HedefFirmaSelect.tsx`.)

**Seed (manual SQL):** insert `urunum_nerede_mes_sources` rows per live Hedef Firma.

## 11. Open assumptions

- Per-Hedef-Firma single-column filter is sufficient scoping; per-müşteri isolation is out
  of scope for v1 (see §8).
- MES rows pushed by us share `AselsanOrderCode`/`WorkOrderItemNo`; the Hedef Firma's own
  MES rows for the same item also carry these, so grouping by the pair captures the full
  operation set. If a Hedef Firma populates them differently, its config/filter compensates.
- `Mes_MachineGroup` provides a usable operation ordering; ties fall back to
  `ActualStartDate`.
- AFLOW connectivity from the backend matches the existing `get_aflow_connection`
  environment (ODBC Driver 17/18 present).
