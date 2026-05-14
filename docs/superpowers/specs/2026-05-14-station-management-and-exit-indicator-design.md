# Station Management List + Çıkış Atölyesi Indicator — Design

**Date:** 2026-05-14
**Scope:** atolye yönetici, operator, and iş emirleri pages

## Goal

Two related additions to the atolye area:

1. Give yönetici users a list of their company's stations in the yönetici page, with edit and delete actions, so they can fix typos, flip the exit-station flag, and remove stale stations without going through the database.
2. Make "Çıkış Atölyesi" stations visually distinguishable everywhere a station name appears to operators and to work-order viewers. Today the flag exists in the data model but is never rendered to the user; that hides a load-bearing piece of information about where a work order's lifecycle ends.

## Non-goals

- No new edit capability for `station_order_code` (the Mes_MachineGroup integration code is not exposed in the existing create form either; out of scope here).
- No bulk station operations.
- No station-rename/migration flow for orphaned operators — deletion is simply blocked when operators are still assigned.
- No Çıkış indicator inside the operator's "Atölyemdeki İş Emirleri" table — that table only shows the operator's own station, which is already named once in the page header.

## Architecture overview

```
+------------------------+      +------------------------------------+
| ExitStationBadge.tsx   |<-----| yonetici/page.tsx (new list card)  |
| (shared component,     |<-----| operator/page.tsx (header)         |
|  src/components/atolye)|<-----| is-emirleri/page.tsx (Durum col +  |
+------------------------+      |  station history rows)             |
                                +------------------------------------+
                                                |
                                                v
                                +------------------------------------+
                                | Backend (FastAPI)                  |
                                | GET    /stations/             (no  |
                                |   change — already returns         |
                                |   is_exit_station)                 |
                                | GET    /stations/my-station   (+   |
                                |   is_exit_station in response)     |
                                | PUT    /stations/{id}         (no  |
                                |   change — already supports        |
                                |   is_exit_station updates)         |
                                | DELETE /stations/{id}         (+   |
                                |   operator-assignment guard)       |
                                +------------------------------------+
```

The frontend treats the badge as a property of the station name: wherever a station name is rendered to a user, the badge sits adjacent to it. The shared component is the single source of truth for visual treatment.

## Backend changes

### 1. `GET /romiot/station/stations/my-station`

File: `dtbackend/app/api/v1/endpoints/romiot/station/station.py` (current implementation at lines 1090–1148).

Today the handler returns:

```python
return {
    "station_id": station.id,
    "name": station.name,
    "company": station.company
}
```

Add `is_exit_station` to the response payload. The `Station` row is already fetched in the same handler — no new query.

```python
return {
    "station_id": station.id,
    "name": station.name,
    "company": station.company,
    "is_exit_station": station.is_exit_station,
}
```

### 2. `DELETE /romiot/station/stations/{station_id}`

File: same module, current implementation at lines 1372–1422.

The existing guard blocks deletion when any `WorkOrder.station_id == station_id` exists. Add a second guard immediately before it that blocks deletion when any operator is assigned to the station:

```python
from app.models.postgres_models import User as PostgresUser

assigned_operators_result = await postgres_db.execute(
    select(PostgresUser).where(PostgresUser.workshop_id == station_id).limit(1)
)
has_operators = assigned_operators_result.scalar_one_or_none() is not None

if has_operators:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Bu atölyeye atanmış operatör(ler) bulunmaktadır. Önce operatörleri başka atölyeye taşıyın veya silin."
    )
```

This requires injecting `postgres_db: AsyncSession = Depends(get_postgres_db)` into the handler signature (the rest of the module uses both sessions side-by-side already, so the pattern is established).

The check is intentionally a 400 (validation), same shape as the existing work-orders guard, so the frontend treats both errors the same way.

### 3. No new endpoints needed

`GET /romiot/station/stations/` already returns `StationList` with `id, name, company, is_exit_station, station_order_code` (see `dtbackend/app/schemas/station.py:23-32`). `PUT /romiot/station/stations/{id}` already accepts updates to all editable fields including `is_exit_station`. The frontend will consume these as-is.

## Frontend changes

### 4. Shared component: `ExitStationBadge`

File: `dtfrontend/src/components/atolye/ExitStationBadge.tsx` (new).

Single small component used in four locations (yönetici list, operator header, iş emirleri Durum column, iş emirleri station-history rows). Self-guards on the boolean so callers don't write their own `&&` check.

Props:

```ts
interface ExitStationBadgeProps {
  isExit: boolean | undefined;
  size?: "sm" | "md";  // sm = table rows, md = operator header
}
```

Behavior:

- Renders `null` when `isExit` is falsy.
- Renders a pill-shaped solid badge: `bg-amber-100 text-amber-800 border border-amber-300`.
- Contains the exit/door arrow icon (same path as the existing "İş Emri Çıkış" button on the operator page) followed by the text "Çıkış Atölyesi".
- `sm`: `text-xs px-2 py-0.5`, icon `h-3 w-3`.
- `md`: `text-sm px-2.5 py-1`, icon `h-4 w-4`.

Amber (rather than red/orange) keeps the badge clearly distinct from:
- the green "Aktif" / "Atölyede" status pills (operator + iş emirleri pages),
- the blue "Çıkış yapıldı" status pill,
- the red error blocks.

Visually it reads as a sticky property of the station, not as a status of the current work order.

### 5. Yönetici page — station list, edit modal, delete modal

File: `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx`.

#### 5a. New "Mevcut Atölyeler" card

Add immediately below the existing "Yeni Atölye Oluştur" card inside the left column (the column starting at line 219). The right column ("Yeni Operatör Oluştur") is untouched.

Card layout:

```
+----------------------------------------------------+
| Mevcut Atölyeler                                   |
+----------------------------------------------------+
| İsim         | Tip                  | İşlemler    |
|--------------+----------------------+-------------|
| Tornalama    | [→ Çıkış Atölyesi]   | [✎] [🗑]    |
| Montaj       | —                    | [✎] [🗑]    |
| Boyama       | —                    | [✎] [🗑]    |
+----------------------------------------------------+
```

Data source: the existing `stations` state (already fetched by `fetchStations` at lines 65–80, already refreshed after create-station). Sort by `id` ascending so the order matches the operator-create dropdown.

Empty state: "Henüz atölye bulunmamaktadır" (same wording as the operator dropdown empty state at line 351).

Action buttons:
- ✎ button → opens the edit modal pre-filled with the row's values.
- 🗑 button → opens the delete-confirmation modal.

Both buttons stop event propagation (the row itself is not clickable, but defensive against future row-click handlers).

#### 5b. Edit modal

Pre-filled with the row's `{name, is_exit_station}`. Şirket field is locked and shows `userCompany` (matches the create-station form's behavior at lines 236–246).

The local `Station` interface (lines 24–29 of `yonetici/page.tsx`) must be extended to include `station_order_code: number | null` so the value can round-trip through the PUT body without being silently nulled. The backend's `StationList` schema already returns this field; only the TypeScript type needs to catch up.

On Save:

```
PUT /romiot/station/stations/{id}
body: {
  name,
  company: userCompany,
  is_exit_station,
  station_order_code: editingStation.station_order_code  // preserve, do not null out
}
```

- On success (200): close modal, set `yoneticiSuccess` to "Atölye güncellendi", refresh `fetchStations()`.
- On error: show the parsed `detail` text inside a red banner *inside the modal* (`modalError` state). Modal stays open so the user can correct the name and retry.

#### 5c. Delete confirmation modal

Plain confirm dialog showing the station name. On confirm:

```
DELETE /romiot/station/stations/{id}
```

- On 204: close modal, set `yoneticiSuccess` to "Atölye silindi", refresh `fetchStations()`.
- On 400 (the work-orders guard OR the new operator-assignment guard): show the backend's `detail` text inside the modal — the modal stays open so the user sees exactly why deletion was blocked.
- On any other error: same pattern, generic fallback message.

#### 5d. New state added to the page

```ts
const [editingStation, setEditingStation] = useState<Station | null>(null);
const [editFormData, setEditFormData] = useState({ name: "", is_exit_station: false });
const [editModalLoading, setEditModalLoading] = useState(false);
const [deletingStation, setDeletingStation] = useState<Station | null>(null);
const [deleteModalLoading, setDeleteModalLoading] = useState(false);
const [modalError, setModalError] = useState<string | null>(null);
```

`modalError` is shared by both modals — only one is open at a time, so a single field is enough. It's cleared whenever either modal opens.

### 6. Operator page — Çıkış badge in header

File: `dtfrontend/src/app/[platform]/atolye/operator/page.tsx`.

Add a third piece of station state:

```ts
const [stationIsExit, setStationIsExit] = useState<boolean>(false);
```

Update the `/my-station` response handling (currently at lines 264–269) to also persist `is_exit_station`:

```ts
const stationData = await api.get<{ station_id: number; name: string; company: string; is_exit_station: boolean }>(
  "/romiot/station/stations/my-station"
);
setStationId(stationData.station_id);
setStationName(stationData.name);
setStationIsExit(stationData.is_exit_station);
```

Render the badge inline in the header block at lines 760–762:

```tsx
{stationName && (
  <p className="text-gray-600 mt-1">
    Atölye: <span className="font-semibold">{stationName}</span>{" "}
    <ExitStationBadge isExit={stationIsExit} size="md" />
  </p>
)}
```

No other operator-page touch point: the work-orders table on this page only ever lists the operator's own station, which is already named once in the header above the table.

### 7. İş emirleri page — Çıkış badge in Durum + station history

File: `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx`.

The page's `WorkOrderDetail` interface already carries `is_exit_station: boolean` on every row (line 13) — `GET /romiot/station/work-orders/all` already serves it. No fetch-layer changes.

#### 7a. "Durum" column on collapsed rows

The current helper `getCurrentStation` (lines 358–370) returns just the station-name string. Replace it (or add a sibling) so the caller can access both name and exit flag:

```ts
const getCurrentStationInfo = (entries: WorkOrderDetail[]): { name: string; isExit: boolean } => {
  const activeEntries = entries.filter(e => !e.exit_date);
  if (activeEntries.length > 0) {
    const e = activeEntries[0];
    return { name: e.station_name, isExit: e.is_exit_station };
  }
  const sorted = [...entries].sort((a, b) => {
    const dateA = a.exit_date || a.entrance_date || "";
    const dateB = b.exit_date || b.entrance_date || "";
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
  if (sorted.length === 0) return { name: "-", isExit: false };
  return { name: sorted[0].station_name, isExit: sorted[0].is_exit_station };
};
```

The Durum cell render (lines 934–942) becomes:

```tsx
<td className="px-4 py-3">
  <div className="flex items-center gap-2">
    <span className="text-sm text-gray-900">{currentStation.name}</span>
    <ExitStationBadge isExit={currentStation.isExit} size="sm" />
    {hasActiveEntry && (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Aktif
      </span>
    )}
  </div>
</td>
```

Order: name → Çıkış badge → Aktif badge. Çıkış is a sticky property of the station; Aktif is the current status of the work order at that station. Putting Çıkış first reads naturally as "station name (and what kind of station it is) — current state".

The `currentStation !== "-"` guard at line 958 (passed to `OrderFilesViewer`) becomes `currentStation.name !== "-"`.

#### 7b. Station-history rows in the expanded view

Update the `<h5>` at line 1037:

```tsx
<h5 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
  {entry.station_name}
  <ExitStationBadge isExit={entry.is_exit_station} size="sm" />
</h5>
```

Same badge size as the Durum column for visual consistency across the page.

## Data flow

- **Yönetici list:** existing `fetchStations()` already returns `is_exit_station`. The list re-renders on every create/edit/delete via the same `fetchStations()` call.
- **Operator header:** `/my-station` is called once on mount; its augmented response feeds `stationIsExit`. A yönetici flipping the flag on a station won't propagate to a currently-logged-in operator until they reload — acceptable, since this flag changes rarely.
- **İş emirleri:** `is_exit_station` rides on every `WorkOrderDetail` row in the existing paginated response. The 10-second polling on the operator page (and any refresh on iş emirleri) already picks up updated flags.

## Error handling

Modal-scoped errors stay inside the modal so the user retains context. Page-level success/error banners stay unchanged for the create-station and create-operator flows.

Backend `400` responses for both delete guards (work-orders, operators) share the same response shape and reach the same modal-error display path. The user reads the specific `detail` text and decides next steps.

## Testing notes

Backend:
- Update existing station endpoint tests to assert `is_exit_station` in the `/my-station` response.
- Add a delete-station test: station with an assigned operator → 400 with the new detail message.
- Existing tests for delete-with-work-orders and delete-success continue to pass unchanged.

Frontend:
- `ExitStationBadge`: renders null when `isExit` is false/undefined; renders pill with icon + text when true; respects `size` prop.
- Yönetici page: list renders; edit modal opens prefilled, PUT body includes preserved `station_order_code`; delete modal shows backend error inline and stays open on 400.
- Operator page: badge appears in header when `is_exit_station: true`, absent otherwise.
- İş emirleri page: badge appears in Durum column when the current station is an exit station; appears in each station-history row whose station is an exit station.

## Open questions

None — design choices were resolved during brainstorming:

- Edit scope: name + is_exit_station (station_order_code preserved silently, not edited).
- Indicator visual: solid pill badge with door icon + "Çıkış Atölyesi" text.
- List placement: left column under the create-station form.
- Edit interaction: modal dialog.
- Delete safety: confirm modal + backend block on operators-assigned.
- İş emirleri badge placement: both Durum column AND each station-history row.
