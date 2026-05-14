# Station Management List + Çıkış Atölyesi Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a station-management list (with edit/delete actions) to the atolye yönetici page, and surface a "Çıkış Atölyesi" indicator wherever a station is named to operators and work-order viewers.

**Architecture:** Single shared `ExitStationBadge` React component is consumed in four locations. Backend changes are minimal: `/my-station` returns the `is_exit_station` flag, and `DELETE /stations/{id}` gains a second guard (matches the existing work-orders guard) so a station with operators assigned cannot be removed without first moving or deleting those operators. All other endpoints are reused as-is.

**Tech Stack:**
- Backend: FastAPI (sync handler signature with async SQLAlchemy sessions), SQLAlchemy 2.x async, Pydantic v2. Existing test culture is standalone Python scripts in `dtbackend/test_*.py` exercising pure helpers — there is **no** HTTP/TestClient infrastructure, so endpoint verification in this plan uses live-curl RED/GREEN against a running dev backend.
- Frontend: Next.js 15.5.6 (App Router, "use client" pages), React 19.1, Tailwind v4. **No frontend test framework is installed.** Frontend verification uses dev server + browser interaction with explicit BEFORE/AFTER expectations.

**Working tree assumption:** Run from repo root `c:\Users\ABDULLAHGOKTUG\Desktop\dveri`. PowerShell is the default shell on this machine.

**Spec:** `docs/superpowers/specs/2026-05-14-station-management-and-exit-indicator-design.md`.

---

## File Structure

**Created:**
- `dtfrontend/src/components/atolye/ExitStationBadge.tsx` — shared presentational badge (1 file, ~30 lines)

**Modified:**
- `dtbackend/app/api/v1/endpoints/romiot/station/station.py` — two handlers touched: `get_my_station` (lines 1090–1148) and `delete_station` (lines 1372–1422)
- `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx` — `Station` interface extended; new list card, edit modal, delete modal, and supporting state
- `dtfrontend/src/app/[platform]/atolye/operator/page.tsx` — new `stationIsExit` state, augmented `/my-station` consumption, header badge
- `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx` — `getCurrentStation` replaced by `getCurrentStationInfo`; badge added to "Durum" column and station-history rows

**No test files created.** The repo has no endpoint-level test infrastructure and no frontend test runner. Each task uses live verification (curl for backend, dev server + browser for frontend) with explicit BEFORE/AFTER evidence captured before declaring a step done. Reason: introducing pytest+TestClient or Vitest+RTL for this feature would be a much larger scope-creep change than the feature itself; existing repo style is to write standalone scripts for pure helpers and validate endpoint/UI behavior manually.

---

## Dependency Graph

```
T1 (backend /my-station)  ─────┐
T2 (backend delete guard) ─┐   │
                           │   │
T3 (ExitStationBadge) ─────┼─┬─┼─→ T4 (operator page)
                           │ │ │
                           │ ├─┼─→ T5 (iş emirleri page)
                           │ │ │
                           │ └─┴─→ T6 (yönetici list card)
                           │             │
                           │             ▼
                           │       T7 (yönetici edit modal)
                           │             │
                           ▼             ▼
                           └─→  T8 (yönetici delete modal)
                                        │
                                        ▼
                                T9 (full end-to-end verification)
```

Sequential order if not parallelizing: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.

---

## Task 1: Backend — augment `/my-station` response with `is_exit_station`

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py:1090-1148` (`get_my_station` handler)
- Test: none (manual verification with curl per "no endpoint test infrastructure" note above)

**Current symbol to bridge from** (verbatim from the file):

```python
@router.get("/my-station", response_model=dict)
async def get_my_station(
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    ...
    return {
        "station_id": station.id,
        "name": station.name,
        "company": station.company
    }
```

**TDD exemption justification:** This task is a response-shape addition (one key added to a dict literal). The repo has no TestClient pattern. RED is provided by a curl call against the running backend that shows the absent field; GREEN is the same call showing the present field.

- [ ] **Step 1: Start the backend dev server (if not already running)**

```powershell
cd dtbackend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

(Run in a separate terminal; leave it running for the rest of this task.)

- [ ] **Step 2: RED — capture a baseline `/my-station` response that does NOT contain `is_exit_station`**

In a second terminal, get a valid auth token by logging in to the running app's frontend as an operator user, then copying the PocketBase token from the browser devtools (Application → Cookies → `pb_auth` or whatever the local key is). Substitute it for `<TOKEN>` below.

```powershell
curl -H "Authorization: Bearer <TOKEN>" `
  http://127.0.0.1:8000/api/v1/romiot/station/stations/my-station
```

**Expected RED output (current state):**

```json
{"station_id":3,"name":"Tornalama","company":"ASELSAN"}
```

The field `is_exit_station` is absent. Paste this output as evidence before moving on.

- [ ] **Step 3: GREEN — add `is_exit_station` to the response**

Edit `dtbackend/app/api/v1/endpoints/romiot/station/station.py`, find the existing return at lines 1144–1148:

```python
    return {
        "station_id": station.id,
        "name": station.name,
        "company": station.company
    }
```

Replace with:

```python
    return {
        "station_id": station.id,
        "name": station.name,
        "company": station.company,
        "is_exit_station": station.is_exit_station,
    }
```

The `station` object already comes from `select(Station).where(Station.id == pg_user.workshop_id)` a few lines above (line 1134), and `Station.is_exit_station` is a real column on the model (see `dtbackend/app/models/romiot_models.py`). No new query, no new imports.

- [ ] **Step 4: GREEN — re-run the curl and confirm the field is now present**

```powershell
curl -H "Authorization: Bearer <TOKEN>" `
  http://127.0.0.1:8000/api/v1/romiot/station/stations/my-station
```

**Expected GREEN output:**

```json
{"station_id":3,"name":"Tornalama","company":"ASELSAN","is_exit_station":false}
```

(Or `"is_exit_station":true` if the test operator's station happens to be marked.) Paste the output as evidence.

- [ ] **Step 5: Commit**

```powershell
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "feat(atolye): include is_exit_station in /my-station response"
```

---

## Task 2: Backend — add operator-assignment guard to `delete_station`

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py:1372-1422` (`delete_station` handler)
- Test: none (manual verification with curl)

**Current symbol to bridge from** (verbatim, abbreviated):

```python
@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_station(
    station_id: int,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
    user_company = await check_station_yonetici_role(current_user)
    station_result = await romiot_db.execute(...)
    station = station_result.scalar_one_or_none()
    ...
    # Existing work-orders guard
    from app.models.romiot_models import WorkOrder
    work_orders_result = await romiot_db.execute(
        select(WorkOrder).where(WorkOrder.station_id == station_id).limit(1)
    )
    has_work_orders = work_orders_result.scalar_one_or_none() is not None
    if has_work_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="İş emirleri olan atölye silinemez"
        )
    await romiot_db.delete(station)
    await romiot_db.commit()
    return None
```

**Imports already present** (from the top of the file): `PostgresUser` aliases `User` from `postgres_models` (line 14), `get_postgres_db` is imported (line 13). No new imports needed.

- [ ] **Step 1: Backend dev server is running from Task 1**

If not, restart per Task 1, Step 1.

- [ ] **Step 2: RED — confirm the current handler ALLOWS deletion when an operator is still assigned**

Pick a station from your dev DB that has at least one operator assigned (`workshop_id` set on a `users` row in PostgreSQL). If none exists, create one via the existing yönetici UI: create a new station, then create an operator assigned to it.

Try to delete it. Use a yönetici account's token.

```powershell
# Replace <STATION_ID> with the test station's id and <YONETICI_TOKEN> with a yönetici token
curl -X DELETE -H "Authorization: Bearer <YONETICI_TOKEN>" `
  http://127.0.0.1:8000/api/v1/romiot/station/stations/<STATION_ID>
```

**Expected RED output (current bug):** `204 No Content` — deletion succeeded, leaving the operator dangling with `workshop_id` pointing to a now-deleted station.

Confirm the dangling state by querying the operator (or simply observing the operator dropdown in the yönetici page is now missing the deleted station while the operator still references it).

Paste the curl result as evidence. **Then re-create the test station + operator pairing so the GREEN step can run.**

- [ ] **Step 3: GREEN — add the operator-assignment guard**

Edit the handler signature at line 1372–1377 to accept the postgres session. The current signature:

```python
async def delete_station(
    station_id: int,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db)
):
```

Becomes:

```python
async def delete_station(
    station_id: int,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db),
):
```

Then add the new guard immediately BEFORE the existing work-orders guard (around line 1406):

```python
    # Block deletion when operators are assigned to this station
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

The full updated handler (with the new guard in place, original work-orders guard retained) ends up like:

```python
@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_station(
    station_id: int,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
    postgres_db: AsyncSession = Depends(get_postgres_db),
):
    user_company = await check_station_yonetici_role(current_user)

    station_result = await romiot_db.execute(
        select(Station).where(Station.id == station_id)
    )
    station = station_result.scalar_one_or_none()

    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ID {station_id} ile atölye bulunamadı"
        )

    if station.company != user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu atölye sizin şirketinize ait değil"
        )

    # Block deletion when operators are assigned to this station
    assigned_operators_result = await postgres_db.execute(
        select(PostgresUser).where(PostgresUser.workshop_id == station_id).limit(1)
    )
    has_operators = assigned_operators_result.scalar_one_or_none() is not None

    if has_operators:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bu atölyeye atanmış operatör(ler) bulunmaktadır. Önce operatörleri başka atölyeye taşıyın veya silin."
        )

    from app.models.romiot_models import WorkOrder
    work_orders_result = await romiot_db.execute(
        select(WorkOrder).where(WorkOrder.station_id == station_id).limit(1)
    )
    has_work_orders = work_orders_result.scalar_one_or_none() is not None

    if has_work_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="İş emirleri olan atölye silinemez"
        )

    await romiot_db.delete(station)
    await romiot_db.commit()

    return None
```

`PostgresUser` is already imported at line 14 (`from app.models.postgres_models import User as PostgresUser`); `select` is at line 7; `get_postgres_db` is at line 13.

- [ ] **Step 4: GREEN — confirm delete is now blocked**

The dev server should auto-reload (uvicorn `--reload`). Re-run:

```powershell
curl -X DELETE -H "Authorization: Bearer <YONETICI_TOKEN>" `
  http://127.0.0.1:8000/api/v1/romiot/station/stations/<STATION_ID>
```

**Expected GREEN output:**

```
HTTP/1.1 400 Bad Request
{"detail":"Bu atölyeye atanmış operatör(ler) bulunmaktadır. Önce operatörleri başka atölyeye taşıyın veya silin."}
```

Use `-i` on curl to see the status line:

```powershell
curl -i -X DELETE -H "Authorization: Bearer <YONETICI_TOKEN>" `
  http://127.0.0.1:8000/api/v1/romiot/station/stations/<STATION_ID>
```

Paste the output as evidence.

- [ ] **Step 5: GREEN — confirm delete still SUCCEEDS for a station with no operators and no work orders**

Create a fresh empty station via the yönetici create form (no operators assigned, no work orders), then:

```powershell
curl -i -X DELETE -H "Authorization: Bearer <YONETICI_TOKEN>" `
  http://127.0.0.1:8000/api/v1/romiot/station/stations/<EMPTY_STATION_ID>
```

**Expected:**

```
HTTP/1.1 204 No Content
```

Paste the output as evidence.

- [ ] **Step 6: Commit**

```powershell
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "feat(atolye): block station deletion when operators are still assigned"
```

---

## Task 3: Create `ExitStationBadge` shared component

**Files:**
- Create: `dtfrontend/src/components/atolye/ExitStationBadge.tsx`
- Test: none (presentational component, manually verified via consumers in Tasks 4–8)

**TDD exemption justification:** Pure presentational component — props in, JSX out, single conditional branch (`null` when `isExit` falsy). No state, no effects, no business logic. Falls under the "pure types / configuration" exemption from the global TDD rule. Verified end-to-end in the consumer tasks.

- [ ] **Step 1: Confirm the target directory exists and check sibling component style**

```powershell
ls dtfrontend/src/components/atolye
```

Expected: shows `SelectOrdersFolder.tsx` and `OrderFilesViewer.tsx`.

- [ ] **Step 2: Create the component file**

Create `dtfrontend/src/components/atolye/ExitStationBadge.tsx` with this exact content:

```tsx
interface ExitStationBadgeProps {
  isExit: boolean | undefined;
  size?: "sm" | "md";
}

export function ExitStationBadge({ isExit, size = "sm" }: ExitStationBadgeProps) {
  if (!isExit) return null;

  const sizeClasses =
    size === "md"
      ? "text-sm px-2.5 py-1 gap-1.5"
      : "text-xs px-2 py-0.5 gap-1";

  const iconClasses = size === "md" ? "h-4 w-4" : "h-3 w-3";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border bg-amber-100 text-amber-800 border-amber-300 ${sizeClasses}`}
      title="Çıkış Atölyesi — bu atölyeden çıkan iş emirleri teslim edilmiş sayılır"
    >
      <svg
        className={iconClasses}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        />
      </svg>
      Çıkış Atölyesi
    </span>
  );
}
```

Notes for the implementer:
- The SVG path is identical to the one on the operator-page "İş Emri Çıkış" button at lines 800–808 of `operator/page.tsx` (kept consistent so the visual vocabulary across the app stays intact).
- The component returns `null` when `isExit` is falsy so callers can write `<ExitStationBadge isExit={station.is_exit_station} />` unconditionally.
- Named export (`export function ExitStationBadge`) matches the style of `OrderFilesViewer` in the same directory.

- [ ] **Step 3: Confirm TypeScript compiles**

```powershell
cd dtfrontend
pnpm exec tsc --noEmit
```

Expected: no errors. (If `pnpm` is not installed: `npx tsc --noEmit`.)

- [ ] **Step 4: Commit**

```powershell
git add dtfrontend/src/components/atolye/ExitStationBadge.tsx
git commit -m "feat(atolye): add ExitStationBadge shared component"
```

---

## Task 4: Operator page — render Çıkış badge in header

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/operator/page.tsx`
- Test: none (manual browser verification)

**Depends on:** T1 (backend response field), T3 (badge component).

**Current symbols to bridge from** (verbatim from the file):

L216-218:
```tsx
const [stationId, setStationId] = useState<number | null>(null);
const [stationName, setStationName] = useState<string>("");
const [allStationNames, setAllStationNames] = useState<string[]>([]);
```

L264-269:
```tsx
const stationData = await api.get<{ station_id: number; name: string; company: string }>(
  "/romiot/station/stations/my-station"
);
setStationId(stationData.station_id);
setStationName(stationData.name);
```

L757-764:
```tsx
<div>
  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Atölye İşlemleri</h1>
  {stationName && (
    <p className="text-gray-600 mt-1">Atölye: <span className="font-semibold">{stationName}</span></p>
  )}
</div>
```

- [ ] **Step 1: Start the frontend dev server**

```powershell
cd dtfrontend
pnpm dev
```

(Run in a separate terminal; keep it running for visual verification.)

- [ ] **Step 2: RED — open the operator page in a browser as an operator whose station has `is_exit_station = true`**

Navigate to `http://localhost:3000/<platform>/atolye/operator` and observe the header. It shows:

```
Atölye İşlemleri
Atölye: Tornalama
```

No exit-station badge. Capture a screenshot or copy the visible text as evidence.

If your operator's station is NOT an exit station, temporarily flip the flag via SQL or via the yönetici page (existing create form supports it) so you have a positive case to verify against.

- [ ] **Step 3: GREEN — add state + import + badge render**

Edit `dtfrontend/src/app/[platform]/atolye/operator/page.tsx`.

**Edit 1** — add the import at the top of the imports block (around line 6, after the `OrderFilesViewer` import):

```tsx
import { ExitStationBadge } from "@/components/atolye/ExitStationBadge";
```

**Edit 2** — add new state immediately after `setAllStationNames` declaration. Find:

```tsx
const [stationId, setStationId] = useState<number | null>(null);
const [stationName, setStationName] = useState<string>("");
const [allStationNames, setAllStationNames] = useState<string[]>([]);
```

Replace with:

```tsx
const [stationId, setStationId] = useState<number | null>(null);
const [stationName, setStationName] = useState<string>("");
const [stationIsExit, setStationIsExit] = useState<boolean>(false);
const [allStationNames, setAllStationNames] = useState<string[]>([]);
```

**Edit 3** — update the `/my-station` response handler. Find:

```tsx
const stationData = await api.get<{ station_id: number; name: string; company: string }>(
  "/romiot/station/stations/my-station"
);
setStationId(stationData.station_id);
setStationName(stationData.name);
```

Replace with:

```tsx
const stationData = await api.get<{ station_id: number; name: string; company: string; is_exit_station: boolean }>(
  "/romiot/station/stations/my-station"
);
setStationId(stationData.station_id);
setStationName(stationData.name);
setStationIsExit(stationData.is_exit_station);
```

**Edit 4** — render the badge in the header. Find:

```tsx
{stationName && (
  <p className="text-gray-600 mt-1">Atölye: <span className="font-semibold">{stationName}</span></p>
)}
```

Replace with:

```tsx
{stationName && (
  <p className="text-gray-600 mt-1 inline-flex items-center gap-2 flex-wrap">
    <span>Atölye: <span className="font-semibold">{stationName}</span></span>
    <ExitStationBadge isExit={stationIsExit} size="md" />
  </p>
)}
```

The `inline-flex` + `gap-2` keeps the badge inline with the text on a single line, wrapping to a second line on very narrow viewports.

- [ ] **Step 4: GREEN — reload the operator page and confirm the badge appears**

Hard reload the browser (Ctrl+F5). Header should now read:

```
Atölye İşlemleri
Atölye: Tornalama  [→ Çıkış Atölyesi]
```

Where `[→ Çıkış Atölyesi]` is the amber pill badge. Capture a screenshot.

- [ ] **Step 5: GREEN — confirm the badge does NOT appear for a non-exit station**

Log in as (or temporarily switch the test operator's station to) a non-exit station. Confirm the header shows just `Atölye: <name>` with no badge.

- [ ] **Step 6: Commit**

```powershell
git add dtfrontend/src/app/[platform]/atolye/operator/page.tsx
git commit -m "feat(atolye): show Çıkış Atölyesi badge in operator header"
```

---

## Task 5: İş emirleri page — badge in Durum column + station-history rows

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx`
- Test: none (manual browser verification)

**Depends on:** T3 (badge component).

**Current symbols to bridge from** (verbatim):

L358-370 — `getCurrentStation` helper:

```tsx
const getCurrentStation = (entries: WorkOrderDetail[]): string => {
  const activeEntries = entries.filter(e => !e.exit_date);
  if (activeEntries.length > 0) {
    return activeEntries[0].station_name;
  }
  // If all exited, show last station
  const sorted = [...entries].sort((a, b) => {
    const dateA = a.exit_date || a.entrance_date || "";
    const dateB = b.exit_date || b.entrance_date || "";
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
  return sorted.length > 0 ? sorted[0].station_name : "-";
};
```

L915: `const currentStation = getCurrentStation(wo.entries);`

L934-943 — Durum column:

```tsx
<td className="px-4 py-3">
  <div className="flex items-center gap-2">
    <span className="text-sm text-gray-900">{currentStation}</span>
    {hasActiveEntry && (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Aktif
      </span>
    )}
  </div>
</td>
```

L957-960 — `OrderFilesViewer` prop:

```tsx
<td className="px-4 py-3">
  <OrderFilesViewer orderId={wo.part_number} stationName={currentStation !== "-" ? currentStation : undefined} allStationNames={stations.map((s) => s.name)} />
</td>
```

L1036-1042 — station-history row header:

```tsx
<div>
  <h5 className="font-semibold text-gray-900 text-sm">{entry.station_name}</h5>
  <p className="text-xs text-gray-600">
    Operatör: {entry.user_name || "Bilinmiyor"} - Paket {entry.package_index}/{entry.total_packages} ({entry.quantity}/{entry.total_quantity} parça)
  </p>
</div>
```

The `WorkOrderDetail` interface on this page already includes `is_exit_station: boolean` at line 13 — no fetch-layer changes needed.

- [ ] **Step 1: RED — open iş emirleri page, expand a work order, confirm no badge anywhere**

With the frontend dev server still running, navigate to `http://localhost:3000/<platform>/atolye/is-emirleri`. Find a work order whose current station OR any historic station is marked `is_exit_station`. Confirm:

- "Durum" column shows just `Tornalama Aktif` with no exit indicator.
- Expand the row → "Atölye Geçiş Geçmişi" lists station names with no exit indicator.

Capture screenshots of both BEFORE states as evidence.

- [ ] **Step 2: GREEN — add the import**

At the top of `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx`, after the `OrderFilesViewer` import (around line 7):

```tsx
import { ExitStationBadge } from "@/components/atolye/ExitStationBadge";
```

- [ ] **Step 3: GREEN — replace `getCurrentStation` with `getCurrentStationInfo`**

Replace the helper at lines 358–370 with:

```tsx
// Get the current station info (name + exit flag) for a work order group
const getCurrentStationInfo = (entries: WorkOrderDetail[]): { name: string; isExit: boolean } => {
  const activeEntries = entries.filter(e => !e.exit_date);
  if (activeEntries.length > 0) {
    const e = activeEntries[0];
    return { name: e.station_name, isExit: e.is_exit_station };
  }
  // If all exited, show last station (by most recent exit/entrance date)
  const sorted = [...entries].sort((a, b) => {
    const dateA = a.exit_date || a.entrance_date || "";
    const dateB = b.exit_date || b.entrance_date || "";
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
  if (sorted.length === 0) return { name: "-", isExit: false };
  return { name: sorted[0].station_name, isExit: sorted[0].is_exit_station };
};
```

- [ ] **Step 4: GREEN — update the call site at line 915**

Find:

```tsx
const currentStation = getCurrentStation(wo.entries);
```

Replace with:

```tsx
const currentStation = getCurrentStationInfo(wo.entries);
```

- [ ] **Step 5: GREEN — update the Durum cell at lines 934–943**

Find:

```tsx
<td className="px-4 py-3">
  <div className="flex items-center gap-2">
    <span className="text-sm text-gray-900">{currentStation}</span>
    {hasActiveEntry && (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Aktif
      </span>
    )}
  </div>
</td>
```

Replace with:

```tsx
<td className="px-4 py-3">
  <div className="flex items-center gap-2 flex-wrap">
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

`flex-wrap` lets the badges fall to a second line on very narrow viewports. Order: name → Çıkış badge → Aktif badge (Çıkış is a sticky property of the station; Aktif is the current status of the work order).

- [ ] **Step 6: GREEN — update the `OrderFilesViewer` prop at line 958**

Find:

```tsx
<OrderFilesViewer orderId={wo.part_number} stationName={currentStation !== "-" ? currentStation : undefined} allStationNames={stations.map((s) => s.name)} />
```

Replace with:

```tsx
<OrderFilesViewer orderId={wo.part_number} stationName={currentStation.name !== "-" ? currentStation.name : undefined} allStationNames={stations.map((s) => s.name)} />
```

- [ ] **Step 7: GREEN — update the station-history row header at line 1037**

Find:

```tsx
<div>
  <h5 className="font-semibold text-gray-900 text-sm">{entry.station_name}</h5>
  <p className="text-xs text-gray-600">
    Operatör: {entry.user_name || "Bilinmiyor"} - Paket {entry.package_index}/{entry.total_packages} ({entry.quantity}/{entry.total_quantity} parça)
  </p>
</div>
```

Replace with:

```tsx
<div>
  <h5 className="font-semibold text-gray-900 text-sm inline-flex items-center gap-2 flex-wrap">
    {entry.station_name}
    <ExitStationBadge isExit={entry.is_exit_station} size="sm" />
  </h5>
  <p className="text-xs text-gray-600">
    Operatör: {entry.user_name || "Bilinmiyor"} - Paket {entry.package_index}/{entry.total_packages} ({entry.quantity}/{entry.total_quantity} parça)
  </p>
</div>
```

- [ ] **Step 8: GREEN — confirm TypeScript compiles**

```powershell
cd dtfrontend
pnpm exec tsc --noEmit
```

Expected: no errors. If errors mention "Property 'name' does not exist on type 'string'" or similar, search for any remaining usages of the old `currentStation` (as a string) and update them to `currentStation.name`.

- [ ] **Step 9: GREEN — reload iş emirleri page and confirm badges**

Hard reload the page. Confirm:

- Durum column on the work order whose current station is an exit station now shows: `Tornalama [→ Çıkış Atölyesi] [Aktif]`.
- Durum column for a work order at a non-exit station shows: `Montaj [Aktif]` (no Çıkış badge).
- Expanded "Atölye Geçiş Geçmişi" shows badges only on the rows whose `station_name` is an exit station.

Capture screenshots as GREEN evidence.

- [ ] **Step 10: Commit**

```powershell
git add dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx
git commit -m "feat(atolye): show Çıkış Atölyesi badge in iş emirleri page"
```

---

## Task 6: Yönetici page — station list card

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx`
- Test: none (manual browser verification)

**Depends on:** T3 (badge component).

This task ONLY adds the list UI and extends the local `Station` interface. Edit modal and delete modal come in Tasks 7 and 8.

**Current symbols to bridge from** (verbatim):

L24-29 — local `Station` interface:

```tsx
interface Station {
  id: number;
  name: string;
  company: string;
  is_exit_station: boolean;
}
```

L218-272 — the left column of the form layout, currently containing only the "Yeni Atölye Oluştur" card.

- [ ] **Step 1: RED — open yönetici page, confirm no station list exists**

Navigate to `http://localhost:3000/<platform>/atolye/yonetici` as a yönetici. Observe: only two cards exist — "Yeni Atölye Oluştur" (left) and "Yeni Operatör Oluştur" (right). No way to see or manage existing stations from the UI. Capture screenshot.

- [ ] **Step 2: GREEN — extend the local `Station` interface and add the import**

Edit `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx`.

At the top of the imports block (after the existing `api` import on line 5):

```tsx
import { ExitStationBadge } from "@/components/atolye/ExitStationBadge";
```

Replace the local `Station` interface at lines 24–29:

```tsx
interface Station {
  id: number;
  name: string;
  company: string;
  is_exit_station: boolean;
}
```

With:

```tsx
interface Station {
  id: number;
  name: string;
  company: string;
  is_exit_station: boolean;
  station_order_code: number | null;
}
```

The backend's `StationList` schema already returns `station_order_code` (see `dtbackend/app/schemas/station.py:23-32`); only the TypeScript view of the value is being widened.

- [ ] **Step 3: GREEN — add the "Mevcut Atölyeler" list card to the left column**

Find the closing `</div>` of the create-station card and the closing tag of the left column container. The current structure (around lines 218–272) is:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <div className="space-y-8">
    {/* Create Workshop Form */}
    <div className="bg-white rounded-lg shadow-lg p-6">
      ...form...
    </div>

  </div>
  {/* Create User Form */}
  <div className="bg-white rounded-lg shadow-lg p-6">
    ...
  </div>
</div>
```

Add a NEW card inside `<div className="space-y-8">` (the left-column wrapper), immediately AFTER the closing `</div>` of the "Create Workshop Form" card and BEFORE the wrapper's closing `</div>`:

```tsx
{/* Existing Workshops List */}
<div className="bg-white rounded-lg shadow-lg p-6">
  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Mevcut Atölyeler</h2>
  {stations.length === 0 ? (
    <p className="text-sm text-gray-500">Henüz atölye bulunmamaktadır</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">İsim</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tip</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {[...stations].sort((a, b) => a.id - b.id).map((station) => (
            <tr key={station.id}>
              <td className="px-3 py-2 text-sm text-gray-900 font-medium">{station.name}</td>
              <td className="px-3 py-2">
                {station.is_exit_station ? (
                  <ExitStationBadge isExit={true} size="sm" />
                ) : (
                  <span className="text-gray-400 text-sm">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="inline-flex gap-2">
                  <button
                    type="button"
                    onClick={() => { /* edit handler — wired in Task 7 */ }}
                    className="px-2 py-1 text-xs font-medium text-[#0f4c3a] hover:bg-[#0f4c3a]/10 rounded transition-colors"
                    title="Düzenle"
                    disabled
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => { /* delete handler — wired in Task 8 */ }}
                    className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Sil"
                    disabled
                  >
                    Sil
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
```

The action buttons are `disabled` for this task — they're wired up in Tasks 7 and 8. This lets the list render and ship visually now without half-implemented modal behavior.

- [ ] **Step 4: GREEN — confirm TypeScript compiles**

```powershell
cd dtfrontend
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: GREEN — reload yönetici page and confirm the list renders**

Hard reload `http://localhost:3000/<platform>/atolye/yonetici`. The left column should now show, in order: "Yeni Atölye Oluştur" card, then a new "Mevcut Atölyeler" card with a table of stations. Each row shows name, exit badge (or em-dash), and disabled "Düzenle" / "Sil" buttons. Capture screenshot.

- [ ] **Step 6: Commit**

```powershell
git add dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx
git commit -m "feat(atolye): add Mevcut Atölyeler list to yönetici page"
```

---

## Task 7: Yönetici page — edit modal

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx`
- Test: none (manual browser verification)

**Depends on:** T6 (list card with disabled buttons must exist).

- [ ] **Step 1: RED — confirm the Düzenle buttons are still disabled (T6 state)**

Open yönetici page. Hover the Düzenle button; cursor shows disabled. Clicking does nothing. Capture screenshot.

- [ ] **Step 2: GREEN — add edit modal state**

Add new state declarations after the existing `setYoneticiSuccess` declaration (around line 49). Find:

```tsx
const [yoneticiLoading, setYoneticiLoading] = useState(false);
const [yoneticiError, setYoneticiError] = useState<string | null>(null);
const [yoneticiSuccess, setYoneticiSuccess] = useState<string | null>(null);
```

Add directly after:

```tsx
const [editingStation, setEditingStation] = useState<Station | null>(null);
const [editFormData, setEditFormData] = useState<{ name: string; is_exit_station: boolean }>({ name: "", is_exit_station: false });
const [editModalLoading, setEditModalLoading] = useState(false);
const [modalError, setModalError] = useState<string | null>(null);
```

- [ ] **Step 3: GREEN — add the edit handler**

Add this function immediately after `handleCreateUser` (around line 175, before the `if (!isYonetici)` early return):

```tsx
const openEditModal = (station: Station) => {
  setEditingStation(station);
  setEditFormData({ name: station.name, is_exit_station: station.is_exit_station });
  setModalError(null);
};

const closeEditModal = () => {
  setEditingStation(null);
  setEditFormData({ name: "", is_exit_station: false });
  setModalError(null);
};

const handleUpdateStation = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingStation) return;
  setEditModalLoading(true);
  setModalError(null);

  try {
    await api.put(`/romiot/station/stations/${editingStation.id}`, {
      name: editFormData.name,
      company: editingStation.company,
      is_exit_station: editFormData.is_exit_station,
      station_order_code: editingStation.station_order_code,
    });
    setYoneticiSuccess("Atölye güncellendi");
    closeEditModal();
    await fetchStations();
  } catch (err: any) {
    let errorMessage = "Atölye güncellenirken hata oluştu";
    if (err.message) {
      try {
        const errorObj = JSON.parse(err.message);
        errorMessage = errorObj.detail || errorMessage;
      } catch {
        errorMessage = err.message;
      }
    }
    setModalError(errorMessage);
  } finally {
    setEditModalLoading(false);
  }
};
```

`api.put` is exported from `dtfrontend/src/lib/api.ts:224` with signature `put: <T>(endpoint: string, data?: any, options?: RequestInit, cacheOptions?: CacheOptions)` — body is the second positional arg, as used above.

- [ ] **Step 4: GREEN — wire the Düzenle button**

In the list table from Task 6, find the Düzenle button:

```tsx
<button
  type="button"
  onClick={() => { /* edit handler — wired in Task 7 */ }}
  className="px-2 py-1 text-xs font-medium text-[#0f4c3a] hover:bg-[#0f4c3a]/10 rounded transition-colors"
  title="Düzenle"
  disabled
>
  Düzenle
</button>
```

Replace with:

```tsx
<button
  type="button"
  onClick={() => openEditModal(station)}
  className="px-2 py-1 text-xs font-medium text-[#0f4c3a] hover:bg-[#0f4c3a]/10 rounded transition-colors"
  title="Düzenle"
>
  Düzenle
</button>
```

(Removed `disabled`, replaced placeholder `onClick`.)

- [ ] **Step 5: GREEN — render the edit modal**

Add the modal JSX immediately before the page's closing `</div>` wrapper (the outermost `<div className="min-h-screen p-4 sm:p-8 bg-gray-50">` closing tag — around line 377). It sits adjacent to the rest of the content, not inside any of the form cards.

```tsx
{/* Edit Station Modal */}
{editingStation && (
  <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Atölye Düzenle</h3>
        <button
          type="button"
          onClick={closeEditModal}
          className="text-gray-500 hover:text-gray-700 text-xl leading-none"
          aria-label="Kapat"
        >
          ×
        </button>
      </div>
      <form onSubmit={handleUpdateStation}>
        <div className="p-6 space-y-4">
          {modalError && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded text-sm text-red-700 whitespace-pre-line">
              {modalError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
            <input
              type="text"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
              required
              disabled={editModalLoading}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Şirket</label>
            <input
              type="text"
              value={editingStation.company}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
              readOnly
              disabled
            />
            <p className="mt-1 text-xs text-gray-500">Şirket bilgisi düzenlenemez</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="edit_is_exit_station"
              checked={editFormData.is_exit_station}
              onChange={(e) => setEditFormData({ ...editFormData, is_exit_station: e.target.checked })}
              className="h-4 w-4 text-[#0f4c3a] border-gray-300 rounded focus:ring-[#0f4c3a]"
              disabled={editModalLoading}
            />
            <label htmlFor="edit_is_exit_station" className="text-sm font-medium text-gray-700">
              Çıkış Atölyesi
            </label>
            <span className="text-xs text-gray-500">(Bu atölyeden çıkan iş emirleri teslim edilmiş sayılır)</span>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeEditModal}
            disabled={editModalLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={editModalLoading}
            className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editModalLoading ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
```

- [ ] **Step 6: GREEN — confirm TypeScript compiles**

```powershell
cd dtfrontend
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: GREEN — edit a station's name and confirm round-trip**

Reload yönetici page. Click Düzenle on any station. Modal opens, prefilled. Change the name; uncheck/check the Çıkış Atölyesi box; click Kaydet. Verify:

- Modal closes
- Page-level success banner shows "Atölye güncellendi"
- List row reflects the new name and exit state
- Hard-reload the page → values persist

Capture screenshots BEFORE submit (modal open with edits) and AFTER (list row updated).

- [ ] **Step 8: GREEN — submit a duplicate name and confirm modal-scoped error**

Reload, click Düzenle on station A, change its name to exactly match station B's name, click Kaydet. Verify:

- Modal stays open
- Red banner inside the modal shows the backend's `detail` text (e.g., "'ASELSAN' şirketinde 'Montaj' adında bir atölye zaten mevcut")
- No page-level error/success banner

Capture screenshot of the modal with the inline error.

- [ ] **Step 9: GREEN — confirm `station_order_code` is preserved across edits**

If any station in your dev DB has a non-null `station_order_code`, edit just its name (don't touch the order code in the UI — it isn't editable). After saving, query the DB or re-fetch the list and verify `station_order_code` is unchanged. This validates that the round-trip body preserves the field rather than nulling it.

```powershell
# Optional DB check via the API:
curl -H "Authorization: Bearer <TOKEN>" `
  http://127.0.0.1:8000/api/v1/romiot/station/stations/ | ConvertFrom-Json | Where-Object { $_.id -eq <ID> }
```

Confirm `station_order_code` matches its pre-edit value.

- [ ] **Step 10: Commit**

```powershell
git add dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx
git commit -m "feat(atolye): add edit-station modal to yönetici page"
```

---

## Task 8: Yönetici page — delete modal

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx`
- Test: none (manual browser verification)

**Depends on:** T2 (backend operator-guard must exist for the inline error path to display the right message), T7 (modal state pattern is established).

- [ ] **Step 1: RED — confirm the Sil buttons still do nothing**

Reload yönetici page. Sil button on each row is currently disabled (T6 state). Capture screenshot.

- [ ] **Step 2: GREEN — add delete modal state**

Below the edit-state declarations from T7, add:

```tsx
const [deletingStation, setDeletingStation] = useState<Station | null>(null);
const [deleteModalLoading, setDeleteModalLoading] = useState(false);
```

(`modalError` is already declared in T7 and is reused here — only one modal is open at a time.)

- [ ] **Step 3: GREEN — add the delete handler**

Add immediately after `handleUpdateStation` (which T7 added):

```tsx
const openDeleteModal = (station: Station) => {
  setDeletingStation(station);
  setModalError(null);
};

const closeDeleteModal = () => {
  setDeletingStation(null);
  setModalError(null);
};

const handleDeleteStation = async () => {
  if (!deletingStation) return;
  setDeleteModalLoading(true);
  setModalError(null);

  try {
    await api.delete(`/romiot/station/stations/${deletingStation.id}`);
    setYoneticiSuccess("Atölye silindi");
    closeDeleteModal();
    await fetchStations();
  } catch (err: any) {
    let errorMessage = "Atölye silinirken hata oluştu";
    if (err.message) {
      try {
        const errorObj = JSON.parse(err.message);
        errorMessage = errorObj.detail || errorMessage;
      } catch {
        errorMessage = err.message;
      }
    }
    setModalError(errorMessage);
  } finally {
    setDeleteModalLoading(false);
  }
};
```

`api.delete` is exported from `dtfrontend/src/lib/api.ts:238` with signature `delete: <T>(endpoint: string, options?: RequestInit, cacheOptions?: CacheOptions)` — no body argument, as used above.

- [ ] **Step 4: GREEN — wire the Sil button**

In the list table, find the Sil button:

```tsx
<button
  type="button"
  onClick={() => { /* delete handler — wired in Task 8 */ }}
  className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded transition-colors"
  title="Sil"
  disabled
>
  Sil
</button>
```

Replace with:

```tsx
<button
  type="button"
  onClick={() => openDeleteModal(station)}
  className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded transition-colors"
  title="Sil"
>
  Sil
</button>
```

- [ ] **Step 5: GREEN — render the delete confirmation modal**

Add immediately after the edit modal JSX (from T7), still inside the page's outermost wrapper:

```tsx
{/* Delete Station Modal */}
{deletingStation && (
  <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Atölyeyi Sil</h3>
        <button
          type="button"
          onClick={closeDeleteModal}
          className="text-gray-500 hover:text-gray-700 text-xl leading-none"
          aria-label="Kapat"
        >
          ×
        </button>
      </div>
      <div className="p-6 space-y-4">
        {modalError && (
          <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded text-sm text-red-700 whitespace-pre-line">
            {modalError}
          </div>
        )}
        <p className="text-sm text-gray-700">
          <span className="font-semibold">'{deletingStation.name}'</span> atölyesini silmek istediğinize emin misiniz?
        </p>
        <p className="text-xs text-gray-500">Bu işlem geri alınamaz.</p>
      </div>
      <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
        <button
          type="button"
          onClick={closeDeleteModal}
          disabled={deleteModalLoading}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          İptal
        </button>
        <button
          type="button"
          onClick={handleDeleteStation}
          disabled={deleteModalLoading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deleteModalLoading ? "Siliniyor..." : "Evet, Sil"}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: GREEN — TypeScript compiles**

```powershell
cd dtfrontend
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: GREEN — happy-path delete**

Create a fresh test station via the existing Yeni Atölye form. Don't assign any operator to it and don't run any work orders through it. Open yönetici page; click Sil on the new test station; confirm. Verify:

- Modal closes
- Page-level success banner: "Atölye silindi"
- List row removed
- Hard-reload page → station stays gone

Capture screenshots.

- [ ] **Step 8: GREEN — delete blocked when operator assigned**

Create another test station; via the existing Yeni Operatör form, assign an operator to it. Open yönetici page; click Sil on that station; confirm. Verify:

- Modal stays open
- Red banner inside the modal shows: "Bu atölyeye atanmış operatör(ler) bulunmaktadır. Önce operatörleri başka atölyeye taşıyın veya silin." (this exact text from T2)
- List row remains

Capture screenshot of the modal with the inline error.

- [ ] **Step 9: GREEN — delete blocked when work orders exist**

Find or create a station that has work orders. Click Sil; confirm. Verify the modal stays open and shows the existing backend message: "İş emirleri olan atölye silinemez". Same inline-error path.

Capture screenshot.

- [ ] **Step 10: Commit**

```powershell
git add dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx
git commit -m "feat(atolye): add delete-station modal with guards in yönetici page"
```

---

## Task 9: Full end-to-end verification

**Files:** none modified — this task captures evidence that everything ties together.

- [ ] **Step 1: Run TypeScript build for the frontend**

```powershell
cd dtfrontend
pnpm exec tsc --noEmit
```

Expected: no errors anywhere in the project. Paste the (silent) success or paste any errors with their file/line.

- [ ] **Step 2: Run Next.js lint**

```powershell
cd dtfrontend
pnpm lint
```

Paste output. Any new errors introduced by this work must be addressed before declaring done; pre-existing lint findings in unrelated files are not in scope.

- [ ] **Step 3: Backend smoke — confirm endpoints respond as expected**

With the backend dev server running:

```powershell
# Yönetici token
$Y = "<YONETICI_TOKEN>"
# Operator token
$O = "<OPERATOR_TOKEN>"

# 1. List endpoint returns station_order_code on every row
curl -H "Authorization: Bearer $Y" http://127.0.0.1:8000/api/v1/romiot/station/stations/

# 2. /my-station returns is_exit_station
curl -H "Authorization: Bearer $O" http://127.0.0.1:8000/api/v1/romiot/station/stations/my-station

# 3. DELETE empty station → 204
curl -i -X DELETE -H "Authorization: Bearer $Y" http://127.0.0.1:8000/api/v1/romiot/station/stations/<EMPTY_ID>

# 4. DELETE station with operator → 400 "operatör"
curl -i -X DELETE -H "Authorization: Bearer $Y" http://127.0.0.1:8000/api/v1/romiot/station/stations/<HAS_OPERATOR_ID>

# 5. DELETE station with work orders → 400 "İş emirleri olan"
curl -i -X DELETE -H "Authorization: Bearer $Y" http://127.0.0.1:8000/api/v1/romiot/station/stations/<HAS_WO_ID>
```

Paste each response. Each must match the expected status and detail message.

- [ ] **Step 4: Frontend end-to-end walkthrough**

In the browser, as a yönetici:

1. Yönetici page → Mevcut Atölyeler list visible; exit stations show the amber Çıkış Atölyesi badge in the Tip column.
2. Edit a station → modal opens, prefilled; change name + flip exit flag → Kaydet → list reflects changes immediately.
3. Try a duplicate name → modal stays open with backend error inline.
4. Delete an empty station → confirm dialog → success banner; list updates.
5. Try to delete a station with operators or work orders → modal stays open with the correct inline backend message.

Then as an operator at an exit station:

6. Operator page header shows `Atölye: <name> [→ Çıkış Atölyesi]` (medium-size badge).
7. İş emirleri page → "Durum" column on work orders at exit stations shows the small badge next to the station name. Expand a row → "Atölye Geçiş Geçmişi" → each row whose station is an exit station shows the small badge.

Then as an operator at a non-exit station:

8. Operator header shows no badge.

Capture a screenshot for each of steps 1, 5, 6, 7. Confirm absence-of-badge for step 8.

- [ ] **Step 5: Final git state check**

```powershell
git status
git log --oneline -10
```

Expected: clean working tree, eight new commits (one per task 1–8). Paste output.
