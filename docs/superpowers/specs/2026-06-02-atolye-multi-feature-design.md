# Atolye Multi-Feature — Design

**Date:** 2026-06-02
**Scope:** atolye müşteri, yönetici, operator, is-emirleri, kullanici-yonetimi; backend `romiot/station/*`; `alembic_romiot` migrations; `toy_api_service`

## Goal

Six related additions to the atolye area:

1. **F1.** Remove the per-user "Hedef Firma" allowlist for müşteri. All companies in `company_integrations` are available to every müşteri user.
2. **F2.** Replace the static Hedef Firma `<select>` with a typeahead dropdown (250 ms debounce, full virtualized list on empty input, client-side filter).
3. **F3.** Allow multiple (Sipariş No, Kalem No) pairs on a single work order. Affects QR JSON, DB schema, print template, is-emirleri rendering, and the Mekasan push.
4. **F4.** Yönetici can mark a station as **Giriş Atölyesi** (parallel to the existing Çıkış Atölyesi flag). Editable in Create form and Mevcut Atölyeler edit modal.
5. **F5.** The first scan of a work order group must happen at a Giriş Atölyesi (graceful fallback when company has none configured).
6. **F6.** After the first entrance scan, operator picks the ordered list of stations the QR will visit. Subsequent scans at off-route or out-of-order stations trigger a warn-and-override modal. Yönetici can edit the route from is-emirleri.

## Non-goals

- No multi-company work order routes — routes live within one company.
- No bulk station operations beyond the existing single-station Create / Edit / Delete.
- No new admin UI for managing `company_integrations` rows — that surface already exists and isn't in scope.
- No reflow of the existing `atolye:musteri_company:*` role values into a new structure. They are deleted end-to-end.
- No re-print of historical QRs after F3 migration — the QR retrieve handler normalizes legacy single-pair payloads on the fly.
- No route enforcement for **grandfathered** work order groups (groups created before this migration). They finish under the old rules.

## Architecture overview

```
+------------------------+        +------------------------------------+
| New shared components  |<-------| musteri/page.tsx     (F1,F2,F3)    |
|                        |<-------| yonetici/page.tsx    (F4, F5/F6 banners)
|  CompanyTypeahead      |<-------| operator/page.tsx    (F5,F6)        |
|  EntryStationBadge     |<-------| is-emirleri/page.tsx (F3,F6)        |
|  RoutePickerModal      |        | kullanici-yonetimi/page.tsx (F1)    |
|  RouteWarningModal     |        +------------------------------------+
+------------------------+                       |
                                                 v
                            +------------------------------------+
                            | Backend (FastAPI)                  |
                            |                                    |
                            | GET    /company-integrations/      |
                            |        companies          (NEW F1) |
                            | POST   /work-orders/      (CHG F3,F5,F6)|
                            | POST   /work-orders/                |
                            |        update-exit-date   (CHG F6)  |
                            | GET    /stations/my-station         |
                            |                           (CHG F4)  |
                            | PUT    /stations/{id}     (CHG F4)  |
                            | POST   /work-order-routes/ (NEW F6) |
                            | PUT    /work-order-routes/          |
                            |        {group_id}         (NEW F6)  |
                            | GET    /qr-code/retrieve/{code}     |
                            |                           (CHG F3)  |
                            +------------------------------------+
                                                 |
                                                 v
                            +------------------------------------+
                            | Postgres (romiot DB)               |
                            | M1: work_order_pairs    (NEW F3)   |
                            |     + backfill from work_orders    |
                            |     + relax scalar columns nullable|
                            | M2: stations.is_entry_station (F4) |
                            | M3: work_orders.route_violation,   |
                            |     work_order_routes      (F6)    |
                            +------------------------------------+
```

## DB migrations

### M1 — `work_order_pairs` (F3)

File: `alembic_romiot/versions/add_work_order_pairs.py`

```python
def upgrade() -> None:
    op.create_table(
        "work_order_pairs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("work_order_group_id", sa.String(50), nullable=False, index=True),
        sa.Column("idx", sa.Integer, nullable=False),
        sa.Column("aselsan_order_number", sa.String(255), nullable=False),
        sa.Column("order_item_number", sa.String(255), nullable=False),
        sa.UniqueConstraint("work_order_group_id", "idx", name="uq_work_order_pair"),
    )

    op.execute("""
        INSERT INTO work_order_pairs (work_order_group_id, idx,
                                      aselsan_order_number, order_item_number)
        SELECT wo.work_order_group_id, 0,
               wo.aselsan_order_number, wo.order_item_number
        FROM work_orders wo
        INNER JOIN (
            SELECT work_order_group_id, MIN(id) AS first_id
            FROM work_orders
            GROUP BY work_order_group_id
        ) firsts ON firsts.first_id = wo.id
        WHERE wo.aselsan_order_number IS NOT NULL
          AND wo.order_item_number IS NOT NULL;
    """)

    op.alter_column("work_orders", "aselsan_order_number", nullable=True)
    op.alter_column("work_orders", "order_item_number", nullable=True)
```

The legacy scalar columns are retained nullable as a fallback during the rollout window; a follow-up cleanup PR will drop them once every read site is confirmed off the legacy path.

### M2 — `stations.is_entry_station` (F4)

```python
op.add_column("stations",
    sa.Column("is_entry_station", sa.Boolean, nullable=False, server_default="false"))
```

No backfill. Yönetici toggles per station after deploy. The Yönetici page (Section 5) warns when zero entry stations exist for the company.

### M3 — `work_order_routes` + `work_orders.route_violation` (F6)

```python
op.add_column("work_orders",
    sa.Column("route_violation", sa.Boolean, nullable=False, server_default="false"))

op.create_table(
    "work_order_routes",
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("work_order_group_id", sa.String(50), nullable=False, index=True),
    sa.Column("position", sa.Integer, nullable=False),
    sa.Column("station_id", sa.Integer,
              sa.ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False),
    sa.Column("created_by_user_id", sa.Integer, nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True),
              server_default=sa.func.now()),
    sa.UniqueConstraint("work_order_group_id", "position", name="uq_route_position"),
)
```

`ondelete=RESTRICT` blocks station deletion when referenced by a route (sibling guard to the existing operator-assignment and work-orders guards in `DELETE /stations/{id}`).

---

## F1 — Hedef Firma source moves to `company_integrations`

### Backend

**New endpoint** `GET /romiot/station/company-integrations/companies` in `app/api/v1/endpoints/romiot/station/company_integration.py`:

- Returns `list[str]` — every distinct `company` value, alphabetically sorted (Turkish locale collation).
- Auth: any authenticated user holding any `atolye:*` role.
- Implementation: `SELECT company FROM company_integrations ORDER BY company COLLATE "tr-TR-x-icu"`.

**`qr_code.py:generate_qr_code_batch` validation rewrite** (current lines 160–186):

- Delete the `_extract_musteri_companies_from_roles()` call and the `is_musteri` allowlist branch.
- Keep the `is_yonetici → target_company == sender_company` branch (Yönetici-only stays locked to own company per F1.4).
- Add: `submitted_target` must exist in `company_integrations`. `SELECT 1 FROM company_integrations WHERE company = :t`. 400 "Hedef firma bulunamadı" otherwise.

**`get_qr_codes_by_work_order_group`** (lines 322–427):

- Drop the `is_musteri → musteri_targets` branch.
- Müşteri sees QR groups whose JSON `company_from = department` (their own sender). The query simplifies to one branch: `WHERE data::jsonb ->> 'company_from' = :dept`.

**`_extract_musteri_companies_from_roles`** removed from both `qr_code.py` and `station.py`.

**`station.py` cleanup** — remove these fields and their handlers:

- `ManagedUserResponse.musteri_companies`
- `ManagedUserUpdateRequest.musteri_companies`
- `FullAdminUserCreateRequest.musteri_companies` (and any sibling create-user requests)
- Every PocketBase role write path that emits `atolye:musteri_company:<X>` — `list_company_users`, `update_company_user`, `full_admin_create_user`, and any role-aggregation helpers
- The post-update logic in `update_company_user` and `full_admin_create_user` that sets these roles

After deploy, müşteri users on PocketBase will have `["atolye:musteri"]` (the role name) and nothing else from the `musteri_company:` prefix. Existing role entries are left in PocketBase until the next user update rewrites the role array (silently dropped — they're unread).

### Frontend

**`musteri/page.tsx`**:

- Delete `userCompanies` state and the role-parsing useEffect (lines 41, 47–86).
- Replace the Hedef Firma `<select>` block (lines 440–467) with `<CompanyTypeahead value={barcodeFormData.target_company} onChange={...} required />`.
- `target_company` initializes empty; submit button stays disabled until value is a valid company (typeahead exposes `isValid` indirectly via the inline "Bu firma listede yok" helper, but parent also checks `companies.includes(value)` on submit).
- Remove the "Hedef firma rolü atanmamış" inline error (lines 463–467) — supplanted by the empty-companies state inside the typeahead.

**`kullanici-yonetimi/page.tsx`**:

- Remove the müşteri-companies multi-select column / cells / bulk-edit dialog.
- Audit every `musteri_companies` reference and delete.
- The "Hedef Firmalar" column header and the firma-dropdown filter introduced by the 2026-05-14 spec become dead code — removed.

**Any other full-admin page that surfaces `musteri_companies`** — discovered by grep. Same treatment.

---

## F2 — `CompanyTypeahead` component

File: `dtfrontend/src/components/atolye/CompanyTypeahead.tsx` (new).

**Props:**

```ts
interface CompanyTypeaheadProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;        // default "Hedef firma seçin veya arayın"
  id?: string;
}
```

**Behavior:**

- On mount: `GET /romiot/station/company-integrations/companies` once via `api.get(..., { useCache: true })`. While in-flight, input is disabled with shimmer placeholder.
- State: `companies: string[]`, `query: string`, `debouncedQuery: string`, `open: boolean`, `highlightedIndex: number`.
- **Debounce**: `query` updates immediately on keystroke; `debouncedQuery` updates 250 ms after the last keystroke (via `useEffect` setTimeout + clearTimeout). The dropdown's filter consumes `debouncedQuery`.
- **Filter**: Turkish-locale-aware case-insensitive substring match — `company.toLocaleLowerCase('tr-TR').includes(debouncedQuery.toLocaleLowerCase('tr-TR'))`. Empty query → full list.
- **Virtualization**: `react-window` `FixedSizeList`, item height 36 px, max viewport 8 rows (288 px). If `companies.length ≤ 20`, skip the virtualizer and render a plain `<ul>` to keep DOM simple.
- **Keyboard**: `ArrowDown` / `ArrowUp` move highlight (wrap); `Enter` selects highlighted; `Escape` closes and restores `query` to `value`; `Tab` commits highlighted (if any).
- **Click-outside**: closes dropdown via `mousedown` listener on `document`.
- **Validation message**: when `value` non-empty AND `!companies.includes(value.trim())` AND `!open`, render red helper text "Bu firma listede yok" beneath the input. Parent form disables submit on invalid.
- **Empty-list state**: companies returned `[]` → input disabled, placeholder "Sistemde tanımlı firma yok", red helper "Yönetici bir firma entegrasyonu tanımlamalıdır".
- **Styling**: matches existing `musteri/page.tsx` form inputs — `px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500`. Dropdown absolute, `z-50`, `bg-white shadow-lg rounded-lg max-h-72 overflow-auto`. Highlighted row `bg-blue-50 text-blue-900`. Selected row: `border-l-2 border-blue-500`.
- **Accessibility**: `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-activedescendant`. Each option `role="option"`.

**Dependency**: adds `react-window` (≈6 KB gzipped).

**Re-use**: same component used in full-admin user create form for müşteri `department`, kullanici-yonetimi filters, and anywhere else a company picker appears.

---

## F3 — Multiple Sipariş / Kalem pairs

### Schema

**Backend** (`dtbackend/app/schemas/`):

- `qr_code.py:QRCodeBatchCreate` — drop scalar fields, add `pairs: list[OrderPair]` (`min_length=1`).
- New shared schema `OrderPair { aselsan_order_number: str, order_item_number: str }` reused everywhere.
- `work_order.py:WorkOrderBase` / `WorkOrderCreate` / `WorkOrderList` / `WorkOrderDetail` — drop the scalar fields, add `pairs: list[OrderPair]`.
- `WorkOrderDetail` additionally gains `pair_count: int` (server-side computed, denormalized) so collapsed is-emirleri rows can render the "+N" badge without enumerating.

**QR JSON payload** (`qr_code.py:generate_qr_code_batch` lines 217–232): the JSON written into `qr_code_data.data` swaps the two scalar keys for one `pairs: [{aselsan_order_number, order_item_number}, ...]` key.

**QR retrieve normalization** (`qr_code.py:retrieve_qr_data` lines 280–319): if the stored JSON has `pairs`, return as-is. If it has the legacy scalar keys (pre-migration QRs), wrap them into `pairs: [{...}]` on the fly. Old printed QRs keep working without re-printing.

### Backend handler changes

**`work_order.py:create_work_order`** (lines 53–210):

- `WorkOrderCreate` body drops scalars, carries `pairs`.
- After the WorkOrder INSERT, the handler upserts `work_order_pairs` rows for `(work_order_group_id, idx)`. First scan of a group creates the pair rows; subsequent package scans hit the UNIQUE constraint and skip insert. Pair data is identical across packages of the same group.

**`toy_api_service.py:send_production_order`**:

- Accept `pairs: list[OrderPair]` arg (caller fetches from `work_order_pairs` and passes through).
- **`len(pairs) == 1`**: send the existing single payload exactly. `AselsanOrderCode = pairs[0].aselsan_order_number`, `WorkOrderItemNo = pairs[0].order_item_number`, `Mes_OrderId = f"{work_order_group_id}-{station.id}"` (unchanged).
- **`len(pairs) > 1`**: `asyncio.gather` of N POST tasks. For each pair: `AselsanOrderCode = pair.aselsan_order_number`, `WorkOrderItemNo = pair.order_item_number`, `Mes_OrderId = f"{work_order_group_id}-{station.id}-{pair.aselsan_order_number}"`.
- Call site `create_work_order` (lines 189–202) reads pairs from `work_order_pairs` post-insert and passes them through.

**`work_order.py:get_all_work_orders`** filter logic: the existing per-column filter on `aselsan_order_number` / `order_item_number` changes from a column ILIKE to:

```sql
EXISTS (
  SELECT 1 FROM work_order_pairs p
  WHERE p.work_order_group_id = work_orders.work_order_group_id
    AND p.aselsan_order_number ILIKE :q
)
```

(And the same for kalem.) ANY pair match wins per F3.8.

**Read-path safety net.** Backend serializers for `WorkOrderDetail.pairs` first read `work_order_pairs`; if empty (defensive — shouldn't happen post-backfill), fall back to `[{aselsan_order_number, order_item_number}]` from the legacy scalar columns.

### Frontend — müşteri input UI

**`musteri/page.tsx`** lines 480–511 replaced with a "Malzemeler" section.

State: `pairs: { aselsan_order_number: string; order_item_number: string }[]` (initial `[{ aselsan_order_number: '', order_item_number: '' }]`).

Layout:

```
Malzemeler *
┌────────────────────────────────────────────────────────┐
│ Sipariş No           Kalem No                           │
│ [23Y0021A53]    [10]                            [×]    │
│ [23Y0021A53]    [20]                            [×]    │
│ [+ Malzeme Ekle]                                        │
└────────────────────────────────────────────────────────┘
```

**Character filter** (explicit user requirement):

- `onKeyDown` swallows any key whose `e.key` is not allowed:
  - Sipariş No allowed: `A-Z`, `a-z`, `0-9`, plus control keys (Backspace, Delete, Arrows, Home, End, Enter, Tab navigation, Cmd/Ctrl+A/C/V/X/Z).
  - Kalem No allowed: `0-9` plus the same control keys.
- `onPaste` sanitizes the pasted clipboard text: `replace(/[^A-Za-z0-9]/g, '')` for sipariş, `replace(/[^0-9]/g, '')` for kalem.
- This blocks `,`, `-`, `;`, `/`, `\`, `|`, space, `.`, Turkish characters, and any other separator. The user must use "Malzeme Ekle" to add additional pairs.

**Per-row validation** (per F3.4):

- Sipariş No: existing rule `/^2\d[YD]/` when `main_customer === 'ASELSAN'`.
- Kalem No: existing rule — integer, positive, multiple of 10.
- Duplicate (sipariş, kalem) across rows → "Bu çift birden fazla eklenmiş".
- Empty values on any row → row fails required validation explicitly (not silently dropped).
- At least one valid pair required (the initial row counts).

Errors render to the right of the row.

`×` remove button hidden on the last remaining row (must always have ≥1).

### Frontend — print template

`musteri/page.tsx` `buildPackageCardHtml` (lines 231–256) and on-screen preview table (lines 666–680):

- `pairs.length === 1`: render the existing two rows — `Sipariş Numarası` and `Kalem Numarası` — verbatim. **No visual change** for the single-pair flow.
- `pairs.length > 1`: replace those two rows with one "Malzemeler" row whose value cell is a nested `<table>` with header `Sipariş No | Kalem No` and one row per pair. Same border style as the parent table.

### Frontend — is-emirleri rendering

[is-emirleri/page.tsx](dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx):

- Type updates: `WorkOrderDetail.aselsan_order_number/order_item_number` → `pairs: OrderPair[]` + `pair_count: number`.
- **Collapsed row** (lines 931, 986–990): show `pairs[0].aselsan_order_number / pairs[0].order_item_number`. If `pair_count > 1`, append `<span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">+{pair_count - 1}</span>`.
- **Expanded panel** (lines 1236–1241): replace the two cells with one "Malzemeler" row whose right cell holds a small two-column table of all pairs.
- **Print template inside expand** (lines 633–634): same conditional treatment as the müşteri print.

---

## F4 — `is_entry_station` flag

### Backend

- `app/models/romiot_models.py:Station` — add `is_entry_station = Column(Boolean, nullable=False, server_default="false")`.
- `app/schemas/station.py:StationBase` and `StationList` — add `is_entry_station: bool = Field(False, ...)`.
- `station.py:get_my_station` (lines 1090–1148) — include `is_entry_station` in the response dict (same one-shot Station fetch).
- `station.py:list_stations` (lines 1152+) — `StationList` already serialized; new field flows automatically.
- `station.py:create_station` / `update_station` — accept the full `StationCreate` body; new field plumbs through.

### Frontend

**New component** `components/atolye/EntryStationBadge.tsx`:

- Sibling of `ExitStationBadge.tsx` with identical shape.
- Props: `isEntry: boolean | undefined; size?: 'sm' | 'md'`.
- Renders `null` when `isEntry` is falsy.
- Colors: `bg-emerald-100 text-emerald-800 border border-emerald-300`.
- Icon: `LogIn` from `lucide-react`.
- Text: "Giriş Atölyesi".

**`yonetici/page.tsx`** changes:

- **Local `Station` interface** (lines 25–31): add `is_entry_station: boolean`.
- **Create form** (around lines 335–348): second checkbox under the existing `is_exit_station` block. Label "Giriş Atölyesi" with micro-copy "(Bu atölyeden iş emrinin ilk girişi yapılabilir)". `stationFormData` extended.
- **Mevcut Atölyeler "Tip" column** (lines 379–385): stack badges:

  ```tsx
  <div className="flex flex-col gap-1 items-start">
    <EntryStationBadge isEntry={station.is_entry_station} size="sm" />
    <ExitStationBadge   isExit={station.is_exit_station}  size="sm" />
    {!station.is_entry_station && !station.is_exit_station &&
      <span className="text-gray-400 text-sm">—</span>}
  </div>
  ```

- **Edit modal** (lines 542–578): second checkbox below the existing exit one. `editFormData` extended; round-tripped through PUT body (line 197–227).

**`operator/page.tsx` header** (lines 760–762):

- New state `stationIsEntry: boolean`, populated from `/my-station` response.
- Render badge next to the existing exit badge in the header block.

---

## F5 — First scan must be at a Giriş Atölyesi

### Backend

**`work_order.py:create_work_order`** — new guard inserted after the duplicate-package check (line 86) and before the active-at-other-station check (line 94):

```python
# F5: first scan of a group must be at an is_entry_station
any_existing_for_group = await romiot_db.execute(
    select(WorkOrder.id).where(
        WorkOrder.work_order_group_id == work_order_data.work_order_group_id
    ).limit(1)
)
is_first_scan_for_group = any_existing_for_group.scalar_one_or_none() is None

if is_first_scan_for_group:
    station_lookup = await romiot_db.execute(
        select(Station).where(Station.id == work_order_data.station_id)
    )
    this_station = station_lookup.scalar_one_or_none()
    if this_station:
        # F5.3 graceful fallback: only enforce when at least one entry station
        # exists for the operator's company. Otherwise allow + log warning.
        company_has_entry = (await romiot_db.execute(
            select(Station.id).where(
                Station.company == this_station.company,
                Station.is_entry_station == True,
            ).limit(1)
        )).scalar_one_or_none() is not None

        if company_has_entry and not this_station.is_entry_station:
            raise HTTPException(
                status_code=400,
                detail='İlk tarama bir Giriş Atölyesinde yapılmalıdır.'
            )
        elif not company_has_entry:
            logger.warning(
                "First scan at non-entry station accepted because company %s has no entry stations configured",
                this_station.company,
            )
```

The new guard also signals `is_first_scan_for_group: bool` in `WorkOrderCreateResponse` — consumed by F6 to trigger the route picker.

### Frontend

**`yonetici/page.tsx` warning banners** (above the existing success / error banners, lines 284–304):

- Compute `hasEntryStation = stations.some(s => s.is_entry_station)`.
- When `stations.length > 0 && !hasEntryStation`: render a yellow banner "⚠ Henüz Giriş Atölyesi tanımlanmamış. İlk taramalar herhangi bir atölyede yapılabilir."
- Same pattern for `!hasExitStation`: "⚠ Henüz Çıkış Atölyesi tanımlanmamış. İş emirleri teslim edilmiş olarak işaretlenemez ve rotalar son durağı doğrulanamaz."
- Non-dismissible — reappear on every render until fixed.

**`operator/page.tsx`** — no client-side pre-check. The green `EntryStationBadge` from F4 communicates to the operator whether their station can accept first scans. Backend 400 on the first-scan check surfaces in the existing red error banner.

---

## F6 — Ordered station route + warn-on-deviation

### F6.1 Grandfather rule (F6.15)

A work order group has a route **iff** at least one row exists in `work_order_routes` for its `work_order_group_id`. Pre-migration groups have zero rows. The scan-time validation in §F6.3 treats those groups as "no route, skip validation" — they finish under the old rules. The route picker (§F6.2) never opens for grandfathered groups because their first scan already happened in the past.

### F6.2 Route creation modal — on first scan of a new group

**Trigger in `operator/page.tsx`** (current entrance-mode handler around lines 418–446):

- After `POST /work-orders/` returns 201, the operator page reads the new `is_first_scan_for_group: bool` from the response.
- When true: suspend further scans (`routePickerOpen = true`, scanner input swallowed) and open `<RoutePickerModal />`.
- The block clears only after Save or Cancel.

**New component** `components/atolye/RoutePickerModal.tsx`:

```ts
interface RoutePickerModalProps {
  workOrderGroupId: string;
  entryStationId: number;        // operator's current station — pinned at position 0
  entryStationName: string;
  companyStations: Station[];    // pre-fetched company stations (no extra API call)
  onSaved: () => void;
  onCancelled: () => void;       // does NOT delete the just-committed WorkOrder row
}
```

**UI** (per F6.5 — single ordered list, drag-and-drop):

```
┌── Bu iş emrinin gideceği atölyeleri sırayla seçin ──┐
│                                                      │
│ Seçilen Sıra                                         │
│ ┌──────────────────────────────────────────────┐    │
│ │ 1. Tornalama (Giriş Atölyesi) 🔒              │    │
│ │ 2. ≡ Boyama                          [×]      │    │
│ │ 3. ≡ Montaj                          [×]      │    │
│ │ 4. ≡ Sevkiyat (Çıkış Atölyesi) ✓     [×]     │    │
│ └──────────────────────────────────────────────┘    │
│                                                      │
│ [+ Atölye Ekle ▼]                                   │
│                                                      │
│  ⚠ Rota bir Çıkış Atölyesinde bitmelidir            │
│  (only when the last picked station isn't is_exit AND│
│   the company has at least one exit station)         │
│                                                      │
│         [İptal]            [Kaydet]                 │
└──────────────────────────────────────────────────────┘
```

- Position 0 = operator's current station — read-only (lock icon, no `×`, not draggable).
- "+ Atölye Ekle" dropdown lists `companyStations` minus stations already in the route. Selection appends to the end.
- Drag handle `≡` on positions ≥1 — reorder within the list.
- "Kaydet" disabled when:
  - Route has only position 0, OR
  - Company has ≥1 exit station AND the last picked station is not `is_exit_station` (per F6.4).
- "İptal" closes the modal but leaves the just-created WorkOrder row in place. Next scan of any package of the same group re-triggers the modal (server still sees no route record). Gives the operator an undo path without rolling back the entrance scan.

**Dependency**: `@dnd-kit/core` + `@dnd-kit/sortable` (chosen over `react-beautiful-dnd` for accessibility — supports keyboard reordering with Space-pick / Arrow-move / Space-drop, important for tablet operators).

**Save action** — new endpoint:

```
POST /romiot/station/work-order-routes/
Body: { work_order_group_id: str, station_ids: list[int] }

Returns 201 on success, 409 if a route already exists for the group.
```

Backend validations:
- `station_ids` non-empty.
- All `station_ids` belong to the operator's company (joined against `stations.company`).
- `station_ids[0]` matches the operator's station (pinned entry).
- `station_ids` unique within the request (no station listed twice).
- Last station is `is_exit_station == True` OR the company has zero exit stations (F6.8 graceful fallback).
- No existing route rows for the group (race-condition guard, 409 otherwise).

Inserts rows in order. Position 0..N-1.

### F6.3 Scan-time route validation

Added to `work_order.py:create_work_order` (entrance) and `update_exit_date` (exit) handlers. After the F5 first-scan check; before the active-at-other-station check.

**"Expected position" per-package logic** (per F6.9):

```python
async def _route_expected_position(romiot_db, group_id, package_index) -> int | None:
    """Highest reached route position for this package (latest exited station's
    position) + 1. Returns 0 if package never exited any route station. None
    if the group has no route."""
    result = await romiot_db.execute(
        select(WorkOrderRoute.position)
        .join(WorkOrder, and_(
            WorkOrder.station_id == WorkOrderRoute.station_id,
            WorkOrder.work_order_group_id == WorkOrderRoute.work_order_group_id,
            WorkOrder.package_index == package_index,
        ))
        .where(
            WorkOrderRoute.work_order_group_id == group_id,
            WorkOrder.exit_date.is_not(None),
        )
        .order_by(WorkOrderRoute.position.desc())
        .limit(1)
    )
    highest_exited = result.scalar_one_or_none()
    if highest_exited is None:
        return 0
    return highest_exited + 1
```

**Entrance validation**:

```python
route_rows = (await romiot_db.execute(
    select(WorkOrderRoute.position, WorkOrderRoute.station_id)
    .where(WorkOrderRoute.work_order_group_id == work_order_data.work_order_group_id)
    .order_by(WorkOrderRoute.position)
)).fetchall()

if route_rows and not work_order_data.acknowledged_route_violation:
    expected_pos = await _route_expected_position(romiot_db,
        work_order_data.work_order_group_id, work_order_data.package_index)
    this_pos = next((r.position for r in route_rows
                     if r.station_id == work_order_data.station_id), None)

    if this_pos is None:
        raise HTTPException(400, detail={
            "type": "route_off",
            "message": "Bu atölye iş emrinin rotasında yok. Yine de devam etmek istiyor musunuz?",
        })
    if this_pos != expected_pos:
        expected_station_name = (await romiot_db.execute(
            select(Station.name).join(WorkOrderRoute, ...).where(
                WorkOrderRoute.work_order_group_id == work_order_data.work_order_group_id,
                WorkOrderRoute.position == expected_pos,
            )
        )).scalar_one_or_none()
        raise HTTPException(400, detail={
            "type": "route_out_of_order",
            "message": f"Sıradaki atölye: {expected_station_name} (pozisyon {expected_pos + 1}). Yine de devam etmek istiyor musunuz?",
            "expected_position": expected_pos,
            "actual_position": this_pos,
        })
```

`acknowledged_route_violation: bool = False` is a new field on `WorkOrderCreate`. When true, the validation block is skipped and the WorkOrder row is inserted with `route_violation = True`.

**Exit validation** — analogous logic on `update_exit_date`. Same two error types. Same override field name on `WorkOrderUpdateExitDate`.

### F6.4 Override modal (`RouteWarningModal`)

`components/atolye/RouteWarningModal.tsx`. When the scan POST returns 400 with `detail.type ∈ {route_off, route_out_of_order}`, the operator page intercepts before showing the generic error banner:

```
┌── Rota Uyarısı ──────────────────────────┐
│  ⚠ {detail.message}                      │
│                                          │
│  [İptal]    [Yine de Devam Et]           │
└──────────────────────────────────────────┘
```

- "Yine de Devam Et" re-fires the same POST with `acknowledged_route_violation: true`. The row is inserted with `route_violation = true`, the operator flow continues.
- "İptal" closes the modal and discards the scan (no WorkOrder row is created; operator can scan again).

### F6.5 Yönetici "Rota Düzenle" on is-emirleri

For users with `atolye:yonetici`, each work-order row in is-emirleri gets a "Rota Düzenle" button. Click opens the same `RoutePickerModal` pre-loaded with the existing route. Save calls:

```
PUT /romiot/station/work-order-routes/{work_order_group_id}
Body: { station_ids: list[int] }
```

Backend: same validations as POST. Deletes existing route rows for the group and inserts new ones in a single transaction. Position 0 (entry station) cannot change — yönetici trying to alter it gets a 400 ("Giriş istasyonu değiştirilemez").

Grandfathered groups render "Rota Tanımla" (creates rather than replaces). Saving works the same; position 0 takes the operator's first historical entrance scan's station.

The button is yönetici-only — not exposed to operators or müşteri.

### F6.6 Audit display

**`WorkOrderDetail` schema** gains `route_violation: bool` (per-row).

is-emirleri renders:

- **Collapsed row Durum cell** (existing badges): if any of the group's rows has `route_violation=true`, append `<span className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">⚠ Rota dışı</span>`.
- **Expanded station-history row** (per-station card): same badge on the specific WorkOrder row whose `route_violation=true`. Hover-tooltip: "Operatör rotaya uymadan tarama yaptı".
- **Expanded panel — new "Rota" section**: ordered list of route positions. Each position shows its station name and the appropriate `EntryStationBadge` / `ExitStationBadge`. Visited positions get a ✓; current position gets →; violations get ⚠. Derived from `work_order_routes` join'd with the group's WorkOrder rows.

### F6.7 New router module

A new file `dtbackend/app/api/v1/endpoints/romiot/station/work_order_route.py` holds the POST / PUT endpoints. The router is mounted under `/romiot/station/work-order-routes/` in the existing station router include block. Schemas live in a new `app/schemas/work_order_route.py`. This keeps `work_order.py` from growing further.

---

## Data flow

- **Müşteri creates QR**: form fetches `/company-integrations/companies` once, types into typeahead, fills pairs via "Malzeme Ekle", submits. Backend validates target against `company_integrations`, validates each pair, generates N QR codes whose JSON now carries `pairs: [...]`. Printed labels render the pair table when N>1, the existing single rows when N=1.
- **Operator first scan**: scanner reads short code → frontend GETs `/qr-code/retrieve/{code}` → POSTs `/work-orders/` with `pairs`. Backend enforces F5 (entry station), creates WorkOrder + `work_order_pairs` rows, fires Mekasan POST(s), returns `is_first_scan_for_group=true`. Frontend opens `RoutePickerModal`, operator picks and saves the route, scanner resumes.
- **Operator subsequent scan**: backend enforces F6.3 against the per-package expected position; on mismatch returns 400 with `type=route_off|route_out_of_order`. Frontend shows `RouteWarningModal`; operator either cancels or re-fires with `acknowledged_route_violation=true`, which is committed with `route_violation=true` on the row.
- **Yönetici on is-emirleri**: views work orders, sees pairs + route + violation badges, can click "Rota Düzenle" to replace the route. Route Section in the expanded panel reflects the new route immediately after save.
- **Yönetici on /yonetici**: stations list shows green Giriş + amber Çıkış badges stacked. Warning banners fire when company has zero entry or zero exit stations. New/edit station forms expose both flags as independent checkboxes.

## Error handling

- All scan-time errors flow through the existing red error banner in `operator/page.tsx`, **except** route warnings which intercept first and surface in `RouteWarningModal`.
- All form-level errors on `musteri/page.tsx` stay in the existing top error banner. Per-row pair errors render inline on the offending row.
- Modal errors (route picker, override) stay scoped to their modal.
- Backend 400 detail formats:
  - F1 unknown target: `detail = "Hedef firma bulunamadı"`.
  - F5 first-scan mismatch: `detail = "İlk tarama bir Giriş Atölyesinde yapılmalıdır."`
  - F6 violations: `detail = {type, message, ...}` structured dict consumed by the frontend interceptor.

## Testing notes

**Backend** (`dtbackend/`):
- Migration M1: integration test on a seeded DB confirming every existing `work_order_group_id` gets exactly one pair row, scalar columns become nullable, idempotent re-runs.
- New endpoint `GET /company-integrations/companies`: returns sorted distinct list, 401 for unauthenticated, 403 for users with no atolye role.
- `generate_qr_code_batch`: drops the `musteri_companies` allowlist; validates against `company_integrations`; rejects unknown target with 400.
- `create_work_order` first-scan guard: rejects scan at non-entry station when company has ≥1 entry station; allows + logs warning when company has zero entry stations.
- `create_work_order` route validation: off-route and out-of-order both raise 400 with structured `type`; `acknowledged_route_violation=true` skips validation and sets `route_violation=true`.
- `POST /work-order-routes/`: rejects routes whose final station isn't is_exit (when an exit exists); rejects mismatched entry; 409 on duplicate.
- `toy_api_service.send_production_order`: single-pair payload is byte-identical to current; multi-pair fans out N parallel POSTs with disambiguated `Mes_OrderId`.

**Frontend** (`dtfrontend/`):
- `CompanyTypeahead`: 250 ms debounce holds, empty input shows full list, no-match shows red helper, keyboard nav works, virtualizer kicks in past 20 items.
- Müşteri input: typing `,` `-` etc. is suppressed in sipariş / kalem fields. Paste sanitization works. Duplicate-pair detection fires.
- Print template: single pair unchanged; multi-pair renders the Malzemeler mini-table.
- Yönetici page: Mevcut Atölyeler shows stacked badges; warning banners appear on misconfig.
- Operator page: green Giriş badge appears for entry stations; first-scan flow triggers `RoutePickerModal`; cancel leaves the WorkOrder row; subsequent scan re-triggers.
- Route violation modal: appears on backend 400 with type, override re-fires with the ack flag, cancel discards.
- is-emirleri: pair count badge appears for N>1; route section in expanded panel reflects current progress; "Rota Düzenle" is yönetici-only.

## Open questions

None — every design choice resolved during brainstorming:

- F1: `company_integrations` is the catalog; musteri_company roles deleted end-to-end; yönetici-only stays locked to own company; QR history filtered by `company_from = department`.
- F2: client-side filter, 250 ms debounce, virtualized full list, strict no-match validation.
- F3: shared pair list per group; new `work_order_pairs` table with backfill; `OrderPair` shared schema; print + Mekasan unchanged for single-pair; conditional multi-pair behavior; sipariş/kalem inputs reject all separator characters; "Malzeme Ekle" button; ANY-pair search match.
- F4: `is_entry_station` independent of `is_exit_station`; both, either, or neither allowed; two stacked checkboxes; stacked badges in Mevcut Atölyeler.
- F5: first-scan check by group-wide WorkOrder presence; graceful fallback when company has no entry station; non-dismissible yönetici warning banners.
- F6: route picker after first entrance scan, blocking further scans; per-group route; drag-and-drop ordered list; entry pinned, exit-end validated when possible; per-package expected position; yellow override modal with audit `route_violation`; yönetici-only edit; grandfathered groups skip enforcement; new dedicated router module.
