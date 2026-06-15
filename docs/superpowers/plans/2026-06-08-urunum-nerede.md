# "Ürünüm Nerede?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a müşteri-only "Ürünüm Nerede?" page where a customer searches a product they sent (by Sipariş No + Kalem No or Parça No) and sees its current station and route-overlaid timeline, scoped strictly to their own company.

**Architecture:** A new FastAPI endpoint `GET /romiot/station/work-orders/track` resolves matching work-order groups (scoped to `company_from == department`), assembles each into a current-location + status + route/history timeline + per-package summary via **pure, unit-tested helper functions**. A new Next.js client page renders search → states (loading/not-found/list/result) → result card + timeline + package strip, with a role-gated card added to the Atölye hub.

**Tech Stack:** FastAPI + SQLAlchemy async + Pydantic (backend); Next.js App Router + React + Tailwind (frontend). Backend tests: `unittest` with mocked async DB (existing pattern). Frontend verification: `next lint` + `next build` + manual.

**Spec:** `docs/superpowers/specs/2026-06-08-urunum-nerede-design.md`

**Conventions observed from the codebase:**
- Backend helpers live in `app/api/v1/endpoints/romiot/station/work_order.py` alongside `_pairs_for_group`, `_route_expected_position`, `_work_order_to_schema`.
- Backend tests are standalone `test_*_helper.py` files at `dtbackend/` root, run via `python -m unittest <module> -v`, using `unittest.mock.AsyncMock`/`MagicMock` for the DB and `types.SimpleNamespace` for rows.
- Palette: green `#0f4c3a` (primary/done), orange `#fe9526` (müşteri accent/active), red for delayed, gray for waiting/idle. Turkish UI strings.
- Frontend API via `@/lib/api` (`api.get<T>(endpoint, undefined, { useCache: false })`), roles via `@/contexts/user-context` `useUser()` → `user.role: string[]`, `user.department`/`user.company`.

---

## Status vocabularies (single source of truth — used across all tasks)

**Group / package status** (`TrackStatus`): `"Girişi yapılmadı"`, `"Bekliyor"`, `"İşlemde"`, `"Gecikmiş"`, `"Sevke Hazır"`, `"Tamamlandı"`.

**Per-package status rules** (given that a package = all `WorkOrder` rows sharing `(group_id, package_index)`):
- No rows at all (QR-only) → `"Girişi yapılmadı"`.
- Has an active row (`exit_date is None`) at station S:
  - S `is_exit_station` → `"Sevke Hazır"`
  - else `target_date` set and `target_date < today` → `"Gecikmiş"`
  - else → `"İşlemde"`
- All rows exited:
  - latest row's station `is_exit_station` → `"Tamamlandı"`
  - else → `"Bekliyor"`

**Group rollup precedence** (first match wins): `group_delivered` or all packages `"Tamamlandı"` → `"Tamamlandı"`; any `"Gecikmiş"` → `"Gecikmiş"`; any `"İşlemde"` → `"İşlemde"`; any `"Sevke Hazır"` → `"Sevke Hazır"`; any `"Bekliyor"` → `"Bekliyor"`; else → `"Girişi yapılmadı"`.

**Timeline step status** (`StepStatus`): `"done"`, `"active"`, `"delayed"`, `"waiting"`.

---

# PART A — Backend

### Task A1: Track response schemas (pure types)

**Files:**
- Modify: `dtbackend/app/schemas/work_order.py` (append at end; reuses `OrderPair` already imported at line 6)

> Pure types — exempt from RED/GREEN per TDD policy. Verified by import in Task A2's test run.

- [ ] **Step 1: Append the schemas**

Add to the end of `dtbackend/app/schemas/work_order.py`:

```python
class TrackTimelineStep(BaseModel):
    """One station node on the tracking timeline (route spine + history overlay)."""
    position: int | None = Field(None, description="Route pozisyonu; history-only modda None")
    station_id: int
    station_name: str
    is_exit_station: bool = False
    status: str = Field(..., description='"done" | "active" | "delayed" | "waiting"')
    entry_date: datetime | None = None
    exit_date: datetime | None = None


class TrackPackage(BaseModel):
    """A single package's current position within its group."""
    package_index: int
    total_packages: int
    quantity: int
    current_station_name: str | None = None
    status: str = Field(..., description="TrackStatus")


class TrackMatch(BaseModel):
    """A matched work-order group assembled for the tracker view."""
    work_order_group_id: str
    part_number: str
    revision_number: str | None = None
    pairs: list[OrderPair]
    main_customer: str
    sector: str
    company_from: str
    coating_company: str | None = None
    teklif_number: str
    total_quantity: int
    total_packages: int
    target_date: date | None = None
    current_station_name: str | None = None
    current_entry_date: datetime | None = None
    status: str = Field(..., description="TrackStatus (group rollup)")
    last_updated: datetime | None = None
    has_route: bool = False
    timeline: list[TrackTimelineStep]
    packages: list[TrackPackage]


class TrackResponse(BaseModel):
    """0 matches = not found; 1 = open directly; >1 = selector list."""
    matches: list[TrackMatch]
```

- [ ] **Step 2: Verify it imports**

Run: `cd dtbackend && python -c "from app.schemas.work_order import TrackResponse, TrackMatch, TrackTimelineStep, TrackPackage; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/schemas/work_order.py
git commit -m "feat(atolye): add Ürünüm Nerede track response schemas"
```

---

### Task A2: Per-package status helper (pure, TDD)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` (add helper near the other module-level helpers, after `_route_expected_position`)
- Test: `dtbackend/test_track_status_helper.py` (create)

The helper takes already-normalized package data so it needs no DB.

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_track_status_helper.py`:

```python
"""Unit tests for the Ürünüm Nerede per-package + group status helpers. No DB.

Run with: python -m unittest test_track_status_helper -v
"""
import unittest
from datetime import date

from app.api.v1.endpoints.romiot.station.work_order import (
    _track_package_status,
    _track_group_status,
)

TODAY = date(2025, 5, 9)


class PackageStatusTest(unittest.TestCase):
    def test_no_rows_is_unscanned(self):
        self.assertEqual(
            _track_package_status(has_rows=False, active_is_exit=None,
                                  last_is_exit=None, target_date=None, today=TODAY),
            "Girişi yapılmadı",
        )

    def test_active_at_exit_station_is_ready_to_ship(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=True,
                                  last_is_exit=None, target_date=None, today=TODAY),
            "Sevke Hazır",
        )

    def test_active_past_target_is_delayed(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=False,
                                  last_is_exit=None, target_date=date(2025, 5, 7), today=TODAY),
            "Gecikmiş",
        )

    def test_active_within_target_is_in_progress(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=False,
                                  last_is_exit=None, target_date=date(2025, 5, 20), today=TODAY),
            "İşlemde",
        )

    def test_all_exited_at_exit_station_is_done(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=None,
                                  last_is_exit=True, target_date=None, today=TODAY),
            "Tamamlandı",
        )

    def test_all_exited_mid_route_is_waiting(self):
        self.assertEqual(
            _track_package_status(has_rows=True, active_is_exit=None,
                                  last_is_exit=False, target_date=None, today=TODAY),
            "Bekliyor",
        )


class GroupStatusTest(unittest.TestCase):
    def test_delivered_wins(self):
        self.assertEqual(_track_group_status(["İşlemde", "Bekliyor"], delivered=True), "Tamamlandı")

    def test_all_done_is_done(self):
        self.assertEqual(_track_group_status(["Tamamlandı", "Tamamlandı"], delivered=False), "Tamamlandı")

    def test_any_delayed_wins_over_in_progress(self):
        self.assertEqual(_track_group_status(["İşlemde", "Gecikmiş"], delivered=False), "Gecikmiş")

    def test_in_progress_over_ready(self):
        self.assertEqual(_track_group_status(["Sevke Hazır", "İşlemde"], delivered=False), "İşlemde")

    def test_all_unscanned(self):
        self.assertEqual(_track_group_status(["Girişi yapılmadı"], delivered=False), "Girişi yapılmadı")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_track_status_helper -v`
Expected: FAIL — `ImportError: cannot import name '_track_package_status'`

- [ ] **Step 3: Write minimal implementation**

In `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`, add after `_route_expected_position` (around line 107):

```python
def _track_package_status(
    *,
    has_rows: bool,
    active_is_exit: bool | None,
    last_is_exit: bool | None,
    target_date,
    today,
) -> str:
    """Status of a single package. `active_is_exit` is the active row's
    station exit-flag (None when no active row); `last_is_exit` is the latest
    exited row's station exit-flag (used only when no active row)."""
    if not has_rows:
        return "Girişi yapılmadı"
    if active_is_exit is not None:
        if active_is_exit:
            return "Sevke Hazır"
        if target_date is not None and target_date < today:
            return "Gecikmiş"
        return "İşlemde"
    # No active row → all rows exited
    return "Tamamlandı" if last_is_exit else "Bekliyor"


def _track_group_status(package_statuses: list[str], *, delivered: bool) -> str:
    """Roll up package statuses to one group status (precedence documented in plan)."""
    if delivered or (package_statuses and all(s == "Tamamlandı" for s in package_statuses)):
        return "Tamamlandı"
    for status in ("Gecikmiş", "İşlemde", "Sevke Hazır", "Bekliyor"):
        if status in package_statuses:
            return status
    return "Girişi yapılmadı"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_track_status_helper -v`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py dtbackend/test_track_status_helper.py
git commit -m "feat(atolye): add track package/group status helpers"
```

---

### Task A3: Timeline builder helper (pure, TDD)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`
- Test: `dtbackend/test_track_timeline_helper.py` (create)

Builds `list[TrackTimelineStep]` from the route spine + per-station history. History-only fallback when route is empty.

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_track_timeline_helper.py`:

```python
"""Unit tests for `_build_track_timeline`. No DB.

Run with: python -m unittest test_track_timeline_helper -v
"""
import unittest
from datetime import datetime

from app.api.v1.endpoints.romiot.station.work_order import _build_track_timeline


def _route(*triples):
    # (station_id, station_name, is_exit_station)
    return [{"station_id": s, "station_name": n, "is_exit_station": e} for (s, n, e) in triples]


D1 = datetime(2025, 5, 1, 9, 0)
D2 = datetime(2025, 5, 2, 16, 0)
D3 = datetime(2025, 5, 6, 9, 0)


class TimelineWithRouteTest(unittest.TestCase):
    def test_route_overlay_marks_done_active_waiting(self):
        route = _route((1, "Mal Giriş", False), (2, "Kaplama", False), (3, "Sevk", True))
        history = {
            1: {"entry": D1, "exit": D2, "active": False},
            2: {"entry": D3, "exit": None, "active": True},
        }
        steps = _build_track_timeline(route, history, group_is_delayed=False)
        self.assertEqual([s["position"] for s in steps], [0, 1, 2])
        self.assertEqual([s["status"] for s in steps], ["done", "active", "waiting"])
        self.assertEqual(steps[0]["entry_date"], D1)
        self.assertEqual(steps[0]["exit_date"], D2)
        self.assertEqual(steps[2]["station_name"], "Sevk")
        self.assertTrue(steps[2]["is_exit_station"])

    def test_active_step_is_delayed_when_group_delayed(self):
        route = _route((1, "Mal Giriş", False), (2, "Boya", False))
        history = {1: {"entry": D1, "exit": D2, "active": False},
                   2: {"entry": D3, "exit": None, "active": True}}
        steps = _build_track_timeline(route, history, group_is_delayed=True)
        self.assertEqual(steps[1]["status"], "delayed")


class TimelineHistoryOnlyTest(unittest.TestCase):
    def test_no_route_uses_history_sorted_by_entry(self):
        history = {
            2: {"entry": D3, "exit": None, "active": True, "name": "Kaplama", "is_exit": False},
            1: {"entry": D1, "exit": D2, "active": False, "name": "Mal Giriş", "is_exit": False},
        }
        steps = _build_track_timeline([], history, group_is_delayed=False)
        self.assertEqual([s["station_name"] for s in steps], ["Mal Giriş", "Kaplama"])
        self.assertEqual([s["position"] for s in steps], [None, None])
        self.assertEqual([s["status"] for s in steps], ["done", "active"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_track_timeline_helper -v`
Expected: FAIL — `ImportError: cannot import name '_build_track_timeline'`

- [ ] **Step 3: Write minimal implementation**

Add to `work_order.py` after the Task A2 helpers:

```python
def _build_track_timeline(route, history, *, group_is_delayed: bool) -> list[dict]:
    """Build timeline steps.

    `route`: ordered list of {station_id, station_name, is_exit_station} (may be empty).
    `history`: {station_id: {"entry", "exit", "active", and (history-only) "name", "is_exit"}}.
    Route present → spine with overlay (unvisited future stations = "waiting").
    Route empty → history stations ordered by entry date (no future steps).
    """
    def overlay_status(h):
        if h is None:
            return "waiting"
        if h.get("active"):
            return "delayed" if group_is_delayed else "active"
        return "done"

    steps: list[dict] = []
    if route:
        for pos, st in enumerate(route):
            h = history.get(st["station_id"])
            steps.append({
                "position": pos,
                "station_id": st["station_id"],
                "station_name": st["station_name"],
                "is_exit_station": st["is_exit_station"],
                "status": overlay_status(h),
                "entry_date": h["entry"] if h else None,
                "exit_date": h["exit"] if h else None,
            })
        return steps

    # History-only: order by entry date (None last)
    ordered = sorted(
        history.items(),
        key=lambda kv: (kv[1]["entry"] is None, kv[1]["entry"] or 0),
    )
    for station_id, h in ordered:
        steps.append({
            "position": None,
            "station_id": station_id,
            "station_name": h.get("name", ""),
            "is_exit_station": h.get("is_exit", False),
            "status": overlay_status(h),
            "entry_date": h["entry"],
            "exit_date": h["exit"],
        })
    return steps
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_track_timeline_helper -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py dtbackend/test_track_timeline_helper.py
git commit -m "feat(atolye): add track timeline builder helper"
```

---

### Task A4: Group assembler helper (pure, TDD)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`
- Test: `dtbackend/test_track_assemble_helper.py` (create)

`_assemble_track_match` consumes already-fetched rows (no DB) and produces the dict for a `TrackMatch`: per-package views, group rollup, current location, history aggregation, and timeline (delegating to Task A2/A3 helpers).

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_track_assemble_helper.py`:

```python
"""Unit tests for `_assemble_track_match`. No DB — plain row namespaces.

Run with: python -m unittest test_track_assemble_helper -v
"""
import unittest
from datetime import date, datetime
from types import SimpleNamespace

from app.api.v1.endpoints.romiot.station.work_order import _assemble_track_match
from app.schemas.order_pair import OrderPair

TODAY = date(2025, 5, 9)


def _row(package_index, station_id, entrance, exit_):
    return SimpleNamespace(
        package_index=package_index, station_id=station_id,
        entrance_date=entrance, exit_date=exit_, quantity=10,
    )


def _meta():
    # station_id -> (name, is_exit_station)
    return {
        1: ("Mal Giriş", False),
        2: ("Kaplama", False),
        3: ("Sevk", True),
    }


def _common():
    return dict(
        group_id="WO-1", part_number="P1", revision_number="R1",
        pairs=[OrderPair(aselsan_order_number="SIP-1", order_item_number="KLM-1")],
        main_customer="ASELSAN", sector="AGS", company_from="Bora",
        coating_company="Mekasan", teklif_number="MKS-1",
        total_quantity=20, total_packages=2, target_date=date(2025, 5, 20),
        delivered=False, today=TODAY,
    )


class AssembleTest(unittest.TestCase):
    def test_single_active_package_with_route(self):
        rows = [
            _row(1, 1, datetime(2025, 4, 28, 8), datetime(2025, 4, 28, 16)),
            _row(1, 2, datetime(2025, 5, 6, 9), None),
        ]
        route = [{"station_id": 1, "station_name": "Mal Giriş", "is_exit_station": False},
                 {"station_id": 2, "station_name": "Kaplama", "is_exit_station": False},
                 {"station_id": 3, "station_name": "Sevk", "is_exit_station": True}]
        match = _assemble_track_match(rows=rows, route=route, station_meta=_meta(), **_common())
        self.assertEqual(match["status"], "İşlemde")
        self.assertEqual(match["current_station_name"], "Kaplama")
        self.assertTrue(match["has_route"])
        self.assertEqual([s["status"] for s in match["timeline"]], ["done", "active", "waiting"])
        self.assertEqual(len(match["packages"]), 1)
        self.assertEqual(match["packages"][0]["status"], "İşlemde")
        self.assertEqual(match["last_updated"], datetime(2025, 5, 6, 9))

    def test_unscanned_group_has_no_rows(self):
        match = _assemble_track_match(rows=[], route=[], station_meta=_meta(), **_common())
        self.assertEqual(match["status"], "Girişi yapılmadı")
        self.assertIsNone(match["current_station_name"])
        self.assertFalse(match["has_route"])
        self.assertEqual(match["timeline"], [])

    def test_delivered_group_is_done(self):
        rows = [_row(1, 3, datetime(2025, 5, 9, 8), datetime(2025, 5, 9, 14))]
        common = _common()
        common["delivered"] = True
        match = _assemble_track_match(rows=rows, route=[], station_meta=_meta(), **common)
        self.assertEqual(match["status"], "Tamamlandı")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_track_assemble_helper -v`
Expected: FAIL — `ImportError: cannot import name '_assemble_track_match'`

- [ ] **Step 3: Write minimal implementation**

Add to `work_order.py` after the Task A3 helper:

```python
def _assemble_track_match(
    *,
    rows,
    route,
    station_meta,
    group_id,
    part_number,
    revision_number,
    pairs,
    main_customer,
    sector,
    company_from,
    coating_company,
    teklif_number,
    total_quantity,
    total_packages,
    target_date,
    delivered,
    today,
) -> dict:
    """Assemble a TrackMatch dict from a group's WorkOrder rows (all packages,
    all stations), the route, and a station_id -> (name, is_exit) map. Pure."""
    # Group rows per package
    by_pkg: dict[int, list] = {}
    for r in rows:
        by_pkg.setdefault(r.package_index, []).append(r)

    package_views: list[dict] = []
    package_statuses: list[str] = []
    for pkg_index in sorted(by_pkg):
        pkg_rows = sorted(by_pkg[pkg_index], key=lambda r: (r.entrance_date or datetime.min))
        active = next((r for r in pkg_rows if r.exit_date is None), None)
        last = pkg_rows[-1] if pkg_rows else None
        active_is_exit = station_meta.get(active.station_id, ("", False))[1] if active else None
        last_is_exit = station_meta.get(last.station_id, ("", False))[1] if last else None
        status = _track_package_status(
            has_rows=bool(pkg_rows), active_is_exit=active_is_exit,
            last_is_exit=last_is_exit, target_date=target_date, today=today,
        )
        package_statuses.append(status)
        current_name = station_meta.get(active.station_id, (None, False))[0] if active else None
        package_views.append({
            "package_index": pkg_index,
            "total_packages": total_packages,
            "quantity": pkg_rows[0].quantity if pkg_rows else 0,
            "current_station_name": current_name,
            "status": status,
        })

    group_status = _track_group_status(package_statuses, delivered=delivered)
    group_is_delayed = group_status == "Gecikmiş"

    # Aggregate per-station history across all packages
    history: dict[int, dict] = {}
    for r in rows:
        name, is_exit = station_meta.get(r.station_id, ("", False))
        h = history.get(r.station_id)
        if h is None:
            h = {"entry": r.entrance_date, "exit": r.exit_date,
                 "active": r.exit_date is None, "name": name, "is_exit": is_exit}
            history[r.station_id] = h
        else:
            if r.entrance_date and (h["entry"] is None or r.entrance_date < h["entry"]):
                h["entry"] = r.entrance_date
            if r.exit_date and (h["exit"] is None or r.exit_date > h["exit"]):
                h["exit"] = r.exit_date
            if r.exit_date is None:
                h["active"] = True

    timeline = _build_track_timeline(route, history, group_is_delayed=group_is_delayed)

    # Current location: station with the most active packages (tie → lowest route position)
    active_rows = [r for r in rows if r.exit_date is None]
    current_station_name = None
    current_entry_date = None
    if active_rows:
        route_pos = {st["station_id"]: i for i, st in enumerate(route)}
        counts: dict[int, int] = {}
        for r in active_rows:
            counts[r.station_id] = counts.get(r.station_id, 0) + 1
        best_sid = sorted(counts, key=lambda sid: (-counts[sid], route_pos.get(sid, 10**6)))[0]
        current_station_name = station_meta.get(best_sid, (None, False))[0]
        current_entry_date = min(
            (r.entrance_date for r in active_rows if r.station_id == best_sid and r.entrance_date),
            default=None,
        )

    # last_updated = latest entry/exit across all rows
    all_dates = [d for r in rows for d in (r.entrance_date, r.exit_date) if d]
    last_updated = max(all_dates) if all_dates else None

    return {
        "work_order_group_id": group_id,
        "part_number": part_number,
        "revision_number": revision_number,
        "pairs": pairs,
        "main_customer": main_customer,
        "sector": sector,
        "company_from": company_from,
        "coating_company": coating_company,
        "teklif_number": teklif_number,
        "total_quantity": total_quantity,
        "total_packages": total_packages,
        "target_date": target_date,
        "current_station_name": current_station_name,
        "current_entry_date": current_entry_date,
        "status": group_status,
        "last_updated": last_updated,
        "has_route": bool(route),
        "timeline": timeline,
        "packages": package_views,
    }
```

Also ensure `datetime` is imported (it is, line 3: `from datetime import datetime, timezone`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dtbackend && python -m unittest test_track_assemble_helper -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py dtbackend/test_track_assemble_helper.py
git commit -m "feat(atolye): add track group assembler helper"
```

---

### Task A5: `GET /track` endpoint (DB wiring + integration)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` (add route handler; extend the schema import block at lines 26-36)
- Test: `dtbackend/test_track_endpoint_resolve_helper.py` (create — mocked-DB unit test for the group-id resolver)

This task wires the DB I/O: resolve matching group ids (scanned + QR-only), fetch rows/route/stations, call `_assemble_track_match`, return `TrackResponse`. The pure resolver `_resolve_track_group_ids` (which decides which scanned group_ids match) is unit-tested with a mocked DB like `test_qr_pairs_fallback_helper.py`.

- [ ] **Step 1: Write the failing test (mocked-DB resolver)**

Create `dtbackend/test_track_endpoint_resolve_helper.py`:

```python
"""Unit test for `_resolve_track_group_ids` — selects scanned group ids matching
the query, scoped to company_from. Mocked DB. 

Run with: python -m unittest test_track_endpoint_resolve_helper -v
"""
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock

from app.api.v1.endpoints.romiot.station.work_order import _resolve_track_group_ids


def _db_returning(rows):
    result = MagicMock()
    result.all.return_value = rows
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    return db


class ResolveTrackGroupIdsTest(unittest.TestCase):
    def test_returns_group_ids_from_rows(self):
        db = _db_returning([("WO-1",), ("WO-2",)])
        ids = asyncio.run(_resolve_track_group_ids(
            db, company_from="Bora",
            order_number="SIP-1", order_item_number="KLM-1", part_number=None,
        ))
        self.assertEqual(set(ids), {"WO-1", "WO-2"})
        db.execute.assert_awaited_once()

    def test_empty_when_no_matches(self):
        db = _db_returning([])
        ids = asyncio.run(_resolve_track_group_ids(
            db, company_from="Bora",
            order_number=None, order_item_number=None, part_number="P1",
        ))
        self.assertEqual(ids, [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dtbackend && python -m unittest test_track_endpoint_resolve_helper -v`
Expected: FAIL — `ImportError: cannot import name '_resolve_track_group_ids'`

- [ ] **Step 3: Extend the schema import + add resolver and endpoint**

First, extend the import block in `work_order.py` (lines 26-36) to add the track schemas:

```python
from app.schemas.work_order import (
    WorkOrder as WorkOrderSchema,
    WorkOrderCreate,
    WorkOrderCreateResponse,
    WorkOrderDetail,
    WorkOrderExitResponse,
    WorkOrderList,
    WorkOrderStatus,
    WorkOrderUpdateExitDate,
    PaginatedWorkOrderResponse,
    TrackResponse,
    TrackMatch,
)
```

Add the resolver helper (after `_assemble_track_match`):

```python
async def _resolve_track_group_ids(
    romiot_db: AsyncSession,
    *,
    company_from: str,
    order_number: str | None,
    order_item_number: str | None,
    part_number: str | None,
) -> list[str]:
    """Distinct work_order_group_ids of SCANNED rows matching the query, scoped to
    company_from. order+item → exact pair match; part_number → ilike."""
    from sqlalchemy import or_  # local import mirrors existing style in this module
    conditions = [WorkOrder.company_from == company_from]
    if part_number:
        conditions.append(WorkOrder.part_number.ilike(f"%{part_number}%"))
    if order_number and order_item_number:
        conditions.append(
            select(WorkOrderPair.id).where(
                WorkOrderPair.work_order_group_id == WorkOrder.work_order_group_id,
                WorkOrderPair.aselsan_order_number == order_number,
                WorkOrderPair.order_item_number == order_item_number,
            ).exists()
        )
    result = await romiot_db.execute(
        select(WorkOrder.work_order_group_id).where(and_(*conditions)).distinct()
    )
    return [row[0] for row in result.all()]
```

Add the endpoint handler (place it after the `/all` endpoint, before `/companies`):

```python
@router.get("/track", response_model=TrackResponse)
async def track_product(
    order_number: str | None = Query(None, description="ASELSAN Sipariş No"),
    order_item_number: str | None = Query(None, description="Sipariş Kalem No"),
    part_number: str | None = Query(None, description="Parça Numarası"),
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """Müşteri product tracker. Resolves the caller's own work-order groups
    (company_from == department) matching the query and returns assembled
    current-location + status + route/history timeline per group."""
    role_values = current_user.role if isinstance(current_user.role, list) else []
    if "atolye:musteri" not in role_values:
        raise HTTPException(status_code=403, detail="Bu sayfa yalnızca müşteri kullanıcıları içindir.")

    department = (current_user.department or "").strip()
    if not department:
        raise HTTPException(status_code=403, detail="Kullanıcı firması belirlenemedi.")

    has_order = bool(order_number and order_item_number)
    if not has_order and not part_number:
        raise HTTPException(
            status_code=400,
            detail="Sipariş No + Kalem No veya Parça No girilmelidir.",
        )

    today = datetime.now(timezone.utc).date()

    # 1. Scanned group ids matching the query (scoped to the caller's company)
    group_ids = set(await _resolve_track_group_ids(
        romiot_db, company_from=department,
        order_number=order_number if has_order else None,
        order_item_number=order_item_number if has_order else None,
        part_number=part_number,
    ))

    # 2. QR-created-but-unscanned groups (payload company_from == department)
    qr_only: dict[str, dict] = {}
    qr_rows_result = await romiot_db.execute(select(QRCodeData))
    for qr_row in qr_rows_result.scalars().all():
        try:
            payload = json.loads(qr_row.data)
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
        gid = str(payload.get("work_order_group_id") or "").strip()
        if not gid or gid in group_ids or gid in qr_only:
            continue
        if str(payload.get("company_from") or "").strip() != department:
            continue
        # match payload against the query
        payload_pairs = payload.get("pairs") or []
        pair_match = any(
            isinstance(p, dict)
            and str(p.get("aselsan_order_number") or "") == order_number
            and str(p.get("order_item_number") or "") == order_item_number
            for p in payload_pairs
        ) if has_order else False
        part_match = (
            part_number and part_number.lower() in str(payload.get("part_number") or "").lower()
        )
        if not (pair_match or part_match):
            continue
        qr_only[gid] = payload

    # 3. Fetch station metadata once: station_id -> (name, is_exit_station)
    stations_result = await romiot_db.execute(select(Station))
    station_meta = {s.id: (s.name, s.is_exit_station) for s in stations_result.scalars().all()}

    matches: list[TrackMatch] = []

    # 3a. Scanned groups
    for gid in group_ids:
        rows_result = await romiot_db.execute(
            select(WorkOrder).where(WorkOrder.work_order_group_id == gid)
        )
        rows = rows_result.scalars().all()
        if not rows:
            continue
        route_result = await romiot_db.execute(
            select(WorkOrderRoute.station_id)
            .where(WorkOrderRoute.work_order_group_id == gid)
            .order_by(WorkOrderRoute.position)
        )
        route = [
            {"station_id": sid, "station_name": station_meta.get(sid, ("?", False))[0],
             "is_exit_station": station_meta.get(sid, ("?", False))[1]}
            for (sid,) in route_result.all()
        ]
        pairs = await _pairs_for_group(romiot_db, gid)
        coating_company = await _company_for_group_local(romiot_db, gid)
        first = rows[0]
        delivered = any(r.delivered for r in rows)
        match_dict = _assemble_track_match(
            rows=rows, route=route, station_meta=station_meta,
            group_id=gid, part_number=first.part_number, revision_number=first.revision_number,
            pairs=pairs, main_customer=first.main_customer, sector=first.sector,
            company_from=first.company_from, coating_company=coating_company,
            teklif_number=first.teklif_number, total_quantity=first.total_quantity,
            total_packages=first.total_packages, target_date=first.target_date,
            delivered=delivered, today=today,
        )
        matches.append(TrackMatch(**match_dict))

    # 3b. QR-only groups (no scans → empty timeline, status Girişi yapılmadı)
    for gid, payload in qr_only.items():
        pairs = [
            OrderPair(aselsan_order_number=str(p.get("aselsan_order_number") or ""),
                      order_item_number=str(p.get("order_item_number") or ""))
            for p in (payload.get("pairs") or [])
            if isinstance(p, dict) and p.get("aselsan_order_number") and p.get("order_item_number")
        ]
        target_date = None
        td = payload.get("target_date")
        if isinstance(td, str) and td:
            try:
                target_date = datetime.fromisoformat(td).date()
            except ValueError:
                target_date = None
        match_dict = _assemble_track_match(
            rows=[], route=[], station_meta=station_meta,
            group_id=gid, part_number=str(payload.get("part_number") or ""),
            revision_number=payload.get("revision_number"),
            pairs=pairs, main_customer=str(payload.get("main_customer") or ""),
            sector=str(payload.get("sector") or ""),
            company_from=str(payload.get("company_from") or ""),
            coating_company=None, teklif_number=str(payload.get("teklif_number") or ""),
            total_quantity=int(payload.get("total_quantity") or 0),
            total_packages=int(payload.get("total_packages") or 0),
            target_date=target_date, delivered=False, today=today,
        )
        matches.append(TrackMatch(**match_dict))

    return TrackResponse(matches=matches)
```

Add the small local helper for coating company (after `_resolve_track_group_ids`):

```python
async def _company_for_group_local(romiot_db: AsyncSession, group_id: str) -> str | None:
    """The company that owns the stations this group was scanned at."""
    result = await romiot_db.execute(
        select(Station.company)
        .join(WorkOrder, WorkOrder.station_id == Station.id)
        .where(WorkOrder.work_order_group_id == group_id)
        .limit(1)
    )
    return result.scalar_one_or_none()
```

> Note: `OrderPair` is already imported (line 22), `QRCodeData`, `Station`, `WorkOrder`, `WorkOrderPair`, `WorkOrderRoute` at lines 13-21, `json` at line 2, `Query`/`HTTPException`/`Depends` at line 5, `select`/`and_` at line 6.

- [ ] **Step 4: Run resolver test + import-check the endpoint**

Run: `cd dtbackend && python -m unittest test_track_endpoint_resolve_helper -v`
Expected: PASS (2 tests)

Run: `cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.work_order import router; print([r.path for r in router.routes if 'track' in r.path])"`
Expected: `['/track']`

- [ ] **Step 5: Run the full backend helper suite (no regressions)**

Run: `cd dtbackend && python -m unittest test_track_status_helper test_track_timeline_helper test_track_assemble_helper test_track_endpoint_resolve_helper -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py dtbackend/test_track_endpoint_resolve_helper.py
git commit -m "feat(atolye): add GET /work-orders/track müşteri tracking endpoint"
```

---

# PART B — Frontend

### Task B1: Track types + API helper (pure types)

**Files:**
- Create: `dtfrontend/src/app/[platform]/atolye/urunum-nerede/types.ts`

> Pure types — verified by `tsc`/build in later tasks.

- [ ] **Step 1: Create the types file**

```ts
// Types for the "Ürünüm Nerede?" müşteri product tracker.
// Mirrors backend app/schemas/work_order.py TrackResponse.

export type TrackStatus =
  | "Girişi yapılmadı"
  | "Bekliyor"
  | "İşlemde"
  | "Gecikmiş"
  | "Sevke Hazır"
  | "Tamamlandı";

export type StepStatus = "done" | "active" | "delayed" | "waiting";

export interface OrderPair {
  aselsan_order_number: string;
  order_item_number: string;
}

export interface TrackTimelineStep {
  position: number | null;
  station_id: number;
  station_name: string;
  is_exit_station: boolean;
  status: StepStatus;
  entry_date: string | null;
  exit_date: string | null;
}

export interface TrackPackage {
  package_index: number;
  total_packages: number;
  quantity: number;
  current_station_name: string | null;
  status: TrackStatus;
}

export interface TrackMatch {
  work_order_group_id: string;
  part_number: string;
  revision_number: string | null;
  pairs: OrderPair[];
  main_customer: string;
  sector: string;
  company_from: string;
  coating_company: string | null;
  teklif_number: string;
  total_quantity: number;
  total_packages: number;
  target_date: string | null;
  current_station_name: string | null;
  current_entry_date: string | null;
  status: TrackStatus;
  last_updated: string | null;
  has_route: boolean;
  timeline: TrackTimelineStep[];
  packages: TrackPackage[];
}

export interface TrackResponse {
  matches: TrackMatch[];
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors referencing `types.ts`

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/urunum-nerede/types.ts
git commit -m "feat(atolye): add Ürünüm Nerede frontend types"
```

---

### Task B2: Status styling util + StatusBadge

**Files:**
- Create: `dtfrontend/src/components/atolye/urunum-nerede/status.ts`
- Create: `dtfrontend/src/components/atolye/urunum-nerede/StatusBadge.tsx`

- [ ] **Step 1: Create the status style map**

`status.ts`:

```ts
import type { TrackStatus, StepStatus } from "@/app/[platform]/atolye/urunum-nerede/types";

// Tailwind classes per group/package status. Palette: green done, orange active, red delayed, gray idle.
export const STATUS_STYLES: Record<TrackStatus, { badge: string; dot: string; label: string }> = {
  "Tamamlandı":      { badge: "bg-green-100 text-green-800 border-green-300",   dot: "bg-green-600",  label: "Tamamlandı" },
  "Sevke Hazır":     { badge: "bg-green-100 text-green-800 border-green-300",   dot: "bg-green-600",  label: "Sevke Hazır" },
  "İşlemde":         { badge: "bg-orange-100 text-orange-800 border-orange-300", dot: "bg-[#fe9526]", label: "İşlemde" },
  "Gecikmiş":        { badge: "bg-red-100 text-red-800 border-red-300",         dot: "bg-red-600",    label: "Gecikmiş" },
  "Bekliyor":        { badge: "bg-gray-100 text-gray-700 border-gray-300",      dot: "bg-gray-400",   label: "Bekliyor" },
  "Girişi yapılmadı":{ badge: "bg-gray-100 text-gray-600 border-gray-300",      dot: "bg-gray-400",   label: "Girişi yapılmadı" },
};

// Timeline node colors per step status.
export const STEP_STYLES: Record<StepStatus, { node: string; line: string; text: string }> = {
  done:    { node: "bg-[#0f4c3a] border-[#0f4c3a] text-white", line: "bg-[#0f4c3a]", text: "text-[#0f4c3a]" },
  active:  { node: "bg-[#fe9526] border-[#fe9526] text-white", line: "bg-gray-300",  text: "text-[#fe9526]" },
  delayed: { node: "bg-red-600 border-red-600 text-white",     line: "bg-gray-300",  text: "text-red-600" },
  waiting: { node: "bg-white border-gray-300 text-gray-400",   line: "bg-gray-300",  text: "text-gray-400" },
};
```

- [ ] **Step 2: Create StatusBadge**

`StatusBadge.tsx`:

```tsx
import type { TrackStatus } from "@/app/[platform]/atolye/urunum-nerede/types";
import { STATUS_STYLES } from "./status";

export function StatusBadge({ status }: { status: TrackStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES["Bekliyor"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add dtfrontend/src/components/atolye/urunum-nerede/status.ts dtfrontend/src/components/atolye/urunum-nerede/StatusBadge.tsx
git commit -m "feat(atolye): add Ürünüm Nerede status styling + badge"
```

---

### Task B3: RouteTimeline component

**Files:**
- Create: `dtfrontend/src/components/atolye/urunum-nerede/RouteTimeline.tsx`

Horizontal on `sm:` and up, vertical on mobile. Renders `TrackTimelineStep[]`.

- [ ] **Step 1: Create the component**

```tsx
import type { TrackTimelineStep } from "@/app/[platform]/atolye/urunum-nerede/types";
import { STEP_STYLES } from "./status";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("tr-TR");
  } catch {
    return "";
  }
}

const STEP_TAG: Record<string, string> = {
  done: "Tamamlandı", active: "İşlemde", delayed: "Gecikmiş", waiting: "Bekliyor",
};

export function RouteTimeline({ steps }: { steps: TrackTimelineStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-gray-500 px-5 py-6">
        Bu ürün henüz hiçbir atölyede okutulmadı.
      </p>
    );
  }
  const doneN = steps.filter((s) => s.status === "done").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <svg className="w-4 h-4 text-[#0f4c3a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <span className="text-sm font-bold text-gray-900">Süreç Takip Çizelgesi</span>
        <span className="ml-auto text-xs text-gray-500 font-mono">{doneN}/{steps.length} adım tamamlandı</span>
      </div>

      {/* Horizontal (sm+) */}
      <div className="hidden sm:block overflow-x-auto px-5 py-6">
        <div className="flex items-start min-w-max">
          {steps.map((step, i) => {
            const st = STEP_STYLES[step.status];
            return (
              <div key={`${step.station_id}-${i}`} className="flex flex-col items-center relative min-w-[120px] max-w-[150px] flex-1">
                {i < steps.length - 1 && (
                  <div className={`absolute top-5 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-0.5 ${step.status === "done" ? "bg-[#0f4c3a]" : step.status === "delayed" ? "bg-red-500" : "bg-gray-300"}`} />
                )}
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold z-10 ${st.node}`}>
                  {step.status === "done" ? "✓" : step.status === "delayed" ? "!" : i + 1}
                </div>
                <div className={`mt-2 text-xs font-bold text-center px-1 ${st.text}`}>{step.station_name}</div>
                <div className="mt-1 text-[10px] text-gray-500 font-mono text-center leading-tight">
                  {step.entry_date ? <div>Giriş: {fmtDate(step.entry_date)}</div> : <div className="text-gray-400">Başlamadı</div>}
                  {step.exit_date && <div>Çıkış: {fmtDate(step.exit_date)}</div>}
                </div>
                <span className={`mt-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${st.text} bg-gray-50`}>
                  {STEP_TAG[step.status]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vertical (mobile) */}
      <div className="sm:hidden px-4 py-4">
        {steps.map((step, i) => {
          const st = STEP_STYLES[step.status];
          return (
            <div key={`${step.station_id}-${i}`} className="flex gap-3 relative">
              {i < steps.length - 1 && (
                <div className={`absolute left-[14px] top-8 bottom-0 w-0.5 ${step.status === "done" ? "bg-[#0f4c3a]" : "bg-gray-300"}`} />
              )}
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 flex-shrink-0 mt-0.5 ${st.node}`}>
                {step.status === "done" ? "✓" : step.status === "delayed" ? "!" : i + 1}
              </div>
              <div className="flex-1 pb-5 min-w-0">
                <div className={`text-sm font-bold ${st.text}`}>{step.station_name}</div>
                <div className="text-xs text-gray-500 font-mono leading-relaxed">
                  {step.entry_date ? `Giriş: ${fmtDate(step.entry_date)}` : <span className="text-gray-400">Henüz başlamadı</span>}
                  {step.exit_date && <><br />Çıkış: {fmtDate(step.exit_date)}</>}
                </div>
                <span className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${st.text} bg-gray-50`}>
                  {STEP_TAG[step.status]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/components/atolye/urunum-nerede/RouteTimeline.tsx
git commit -m "feat(atolye): add Ürünüm Nerede route timeline (h/v)"
```

---

### Task B4: PackageStrip component

**Files:**
- Create: `dtfrontend/src/components/atolye/urunum-nerede/PackageStrip.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { TrackPackage } from "@/app/[platform]/atolye/urunum-nerede/types";
import { STATUS_STYLES } from "./status";

export function PackageStrip({ packages }: { packages: TrackPackage[] }) {
  if (packages.length <= 1) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-900">Paketler ({packages.length})</span>
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        {packages.map((p) => {
          const s = STATUS_STYLES[p.status] ?? STATUS_STYLES["Bekliyor"];
          return (
            <div key={p.package_index} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${s.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <span className="font-semibold">Paket {p.package_index}</span>
              <span className="opacity-70">·</span>
              <span>{p.current_station_name ?? "Girişi yapılmadı"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/components/atolye/urunum-nerede/PackageStrip.tsx
git commit -m "feat(atolye): add Ürünüm Nerede package strip"
```

---

### Task B5: TrackResultCard component

**Files:**
- Create: `dtfrontend/src/components/atolye/urunum-nerede/TrackResultCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { TrackMatch } from "@/app/[platform]/atolye/urunum-nerede/types";
import { StatusBadge } from "./StatusBadge";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("tr-TR"); } catch { return "—"; }
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("tr-TR"); } catch { return "—"; }
}

export function TrackResultCard({ match }: { match: TrackMatch }) {
  const orderLabel = match.pairs[0]
    ? `${match.pairs[0].aselsan_order_number} / ${match.pairs[0].order_item_number}`
    : "—";
  const details: { label: string; value: string }[] = [
    { label: "Parça No", value: match.part_number + (match.revision_number ? `/${match.revision_number}` : "") },
    { label: "Adet", value: `${match.total_quantity} adet` },
    { label: "Toplam Paket", value: `${match.total_packages}` },
    { label: "ASELSAN Sipariş / Kalem", value: orderLabel },
    { label: "Kaplamacı Firma", value: match.coating_company ?? "—" },
    { label: "Gönderen Firma", value: match.company_from },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-br from-[#0f4c3a] to-[#16654d] flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1">Mevcut Konum</div>
          <div className="flex items-center gap-2 text-white text-lg sm:text-xl font-bold">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{match.current_station_name ?? "Girişi yapılmadı"}</span>
          </div>
          {match.current_entry_date && (
            <div className="text-white/60 text-xs font-mono mt-1">Giriş: {fmtDateTime(match.current_entry_date)}</div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <StatusBadge status={match.status} />
          {match.target_date && (
            <div className="text-white/60 text-[11px] font-mono mt-1.5">
              Hedef: <strong className="text-white/90">{fmtDate(match.target_date)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3">
        {details.map((d) => (
          <div key={d.label} className="px-4 py-3 border-b border-r border-gray-100 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">{d.label}</div>
            <div className="text-xs font-semibold text-gray-900 break-words">{d.value}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-1.5 text-[11px] text-gray-500">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Son güncelleme: <strong className="text-gray-700">{fmtDateTime(match.last_updated)}</strong>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/components/atolye/urunum-nerede/TrackResultCard.tsx
git commit -m "feat(atolye): add Ürünüm Nerede result card"
```

---

### Task B6: TrackMatchList component

**Files:**
- Create: `dtfrontend/src/components/atolye/urunum-nerede/TrackMatchList.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { TrackMatch } from "@/app/[platform]/atolye/urunum-nerede/types";
import { StatusBadge } from "./StatusBadge";

export function TrackMatchList({
  matches,
  onSelect,
}: {
  matches: TrackMatch[];
  onSelect: (m: TrackMatch) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-900">{matches.length} kayıt bulundu</span>
        <span className="text-xs text-gray-500 ml-2">Detay için bir ürün seçin</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {matches.map((m) => (
          <li key={m.work_order_group_id}>
            <button
              type="button"
              onClick={() => onSelect(m)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {m.part_number}{m.revision_number ? `/${m.revision_number}` : ""}
                </div>
                <div className="text-xs text-gray-500 font-mono truncate">
                  {m.pairs[0] ? `${m.pairs[0].aselsan_order_number} / ${m.pairs[0].order_item_number}` : "—"}
                  {" · "}{m.current_station_name ?? "Girişi yapılmadı"}
                </div>
              </div>
              <StatusBadge status={m.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/components/atolye/urunum-nerede/TrackMatchList.tsx
git commit -m "feat(atolye): add Ürünüm Nerede multi-match list"
```

---

### Task B7: ProductSearchCard component

**Files:**
- Create: `dtfrontend/src/components/atolye/urunum-nerede/ProductSearchCard.tsx`

Two method tabs, validation, submit/clear. Emits a typed query to the parent.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";

export type TrackQuery =
  | { method: "order"; order_number: string; order_item_number: string }
  | { method: "part"; part_number: string };

export function ProductSearchCard({
  loading,
  onSearch,
}: {
  loading: boolean;
  onSearch: (q: TrackQuery) => void;
}) {
  const [method, setMethod] = useState<"order" | "part">("order");
  const [orderNo, setOrderNo] = useState("");
  const [itemNo, setItemNo] = useState("");
  const [partNo, setPartNo] = useState("");
  const [valError, setValError] = useState<string | null>(null);

  const submit = () => {
    setValError(null);
    if (method === "order") {
      if (!orderNo.trim() || !itemNo.trim()) {
        setValError("Lütfen hem sipariş numarasını hem de kalem numarasını girin.");
        return;
      }
      onSearch({ method: "order", order_number: orderNo.trim(), order_item_number: itemNo.trim() });
    } else {
      if (!partNo.trim()) {
        setValError("Lütfen parça numarasını girin.");
        return;
      }
      onSearch({ method: "part", part_number: partNo.trim() });
    }
  };

  const clear = () => {
    setOrderNo(""); setItemNo(""); setPartNo(""); setValError(null);
  };

  const tabBase = "flex-1 flex flex-col items-center gap-1 py-3 px-3 rounded-lg border-2 text-xs font-semibold transition-colors cursor-pointer";
  const tabActive = "border-[#0f4c3a] bg-[#0f4c3a] text-white";
  const tabIdle = "border-gray-200 bg-gray-50 text-gray-500 hover:border-[#fe9526] hover:text-[#fe9526]";
  const inputCls = "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white text-sm font-mono";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-md p-5">
      <div className="flex gap-2 mb-4">
        <button type="button" className={`${tabBase} ${method === "order" ? tabActive : tabIdle}`} onClick={() => { setMethod("order"); setValError(null); }}>
          <span>Sipariş + Kalem ile Sorgula</span>
        </button>
        <button type="button" className={`${tabBase} ${method === "part" ? tabActive : tabIdle}`} onClick={() => { setMethod("part"); setValError(null); }}>
          <span>Parça No ile Sorgula</span>
        </button>
      </div>

      {method === "order" ? (
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">ASELSAN Sipariş No</label>
            <input className={inputCls} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="SIP-2025-01-4812"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Sipariş Kalem No</label>
            <input className={inputCls} value={itemNo} onChange={(e) => setItemNo(e.target.value)} placeholder="KLM-004"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Parça Numarası</label>
          <input className={inputCls} value={partNo} onChange={(e) => setPartNo(e.target.value)} placeholder="ASL-09-2244"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={loading}
          className="flex-1 px-4 py-2.5 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {loading ? "Sorgulanıyor..." : "Sorgula"}
        </button>
        <button type="button" onClick={clear} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors">
          Temizle
        </button>
      </div>

      {valError && (
        <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs font-medium text-amber-700">
          {valError}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/components/atolye/urunum-nerede/ProductSearchCard.tsx
git commit -m "feat(atolye): add Ürünüm Nerede search card"
```

---

### Task B8: Page (states, fetch, recent queries)

**Files:**
- Create: `dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx`

Wires everything: role guard, search → fetch `/track` → idle/loading/not-found/list/result states, recent queries in localStorage.

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { useUser } from "@/contexts/user-context";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { TrackMatch, TrackResponse } from "./types";
import { ProductSearchCard, type TrackQuery } from "@/components/atolye/urunum-nerede/ProductSearchCard";
import { TrackMatchList } from "@/components/atolye/urunum-nerede/TrackMatchList";
import { TrackResultCard } from "@/components/atolye/urunum-nerede/TrackResultCard";
import { RouteTimeline } from "@/components/atolye/urunum-nerede/RouteTimeline";
import { PackageStrip } from "@/components/atolye/urunum-nerede/PackageStrip";

type View = "idle" | "loading" | "notfound" | "list" | "result";

const RECENT_KEY = "urunum_nerede_recent";

interface RecentItem { label: string; sub: string; query: TrackQuery; }

export default function UrunumNeredePage() {
  const { user } = useUser();
  const [isMusteri, setIsMusteri] = useState(false);
  const [view, setView] = useState<View>("idle");
  const [matches, setMatches] = useState<TrackMatch[]>([]);
  const [selected, setSelected] = useState<TrackMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      setIsMusteri(user.role.some((r) => typeof r === "string" && r === "atolye:musteri"));
    }
  }, [user]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const pushRecent = (item: RecentItem) => {
    setRecent((prev) => {
      const next = [item, ...prev.filter((p) => p.label !== item.label)].slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const runSearch = async (q: TrackQuery) => {
    setError(null);
    setView("loading");
    setSelected(null);
    try {
      const params = new URLSearchParams();
      if (q.method === "order") {
        params.set("order_number", q.order_number);
        params.set("order_item_number", q.order_item_number);
      } else {
        params.set("part_number", q.part_number);
      }
      const res = await api.get<TrackResponse>(
        `/romiot/station/work-orders/track?${params.toString()}`,
        undefined,
        { useCache: false }
      );
      const found = res.matches ?? [];
      setMatches(found);
      if (found.length === 0) {
        setView("notfound");
      } else if (found.length === 1) {
        setSelected(found[0]);
        setView("result");
      } else {
        setView("list");
      }
      if (found.length > 0) {
        const label = q.method === "order" ? `${q.order_number} / ${q.order_item_number}` : q.part_number;
        pushRecent({ label, sub: found[0].part_number, query: q });
      }
    } catch {
      setError("Sorgu sırasında bir hata oluştu. Lütfen tekrar deneyin.");
      setView("idle");
    }
  };

  if (!isMusteri) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Erişim Yetkisi Yok</h1>
          <p className="text-gray-600">Bu sayfayı görüntüleme yetkisine sahip değilsiniz.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Ürünüm Nerede?</h1>
          <p className="text-sm text-gray-500">Gönderdiğiniz ürünlerin atölye sürecindeki anlık konumunu sorgulayın.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="mb-5">
          <ProductSearchCard loading={view === "loading"} onSearch={runSearch} />
        </div>

        {recent.length > 0 && view === "idle" && (
          <div className="mb-5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Son Sorgular</div>
            <div className="flex flex-wrap gap-2">
              {recent.map((r, i) => (
                <button key={i} type="button" onClick={() => runSearch(r.query)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs hover:border-[#fe9526] hover:text-[#0f4c3a] transition-colors cursor-pointer">
                  <span className="font-mono font-semibold">{r.label}</span>
                  <span className="text-gray-400">{r.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {view === "loading" && (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="animate-spin rounded-full h-9 w-9 border-2 border-gray-200 border-t-[#0f4c3a]" />
            <p className="text-sm text-gray-500">Sorgu yapılıyor...</p>
          </div>
        )}

        {view === "notfound" && (
          <div className="flex flex-col items-center py-10 gap-2 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-700">Kayıt Bulunamadı</h3>
            <p className="text-sm text-gray-500 max-w-xs">Girdiğiniz bilgilere ait kayıt bulunamadı. Lütfen bilgileri kontrol edip tekrar deneyin.</p>
          </div>
        )}

        {view === "list" && (
          <TrackMatchList matches={matches} onSelect={(m) => { setSelected(m); setView("result"); }} />
        )}

        {view === "result" && selected && (
          <div className="space-y-4">
            {matches.length > 1 && (
              <button type="button" onClick={() => setView("list")}
                className="text-sm text-[#0f4c3a] font-medium hover:underline cursor-pointer">
                ← Tüm sonuçlara dön
              </button>
            )}
            <TrackResultCard match={selected} />
            <PackageStrip packages={selected.packages} />
            <RouteTimeline steps={selected.timeline} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors

Run: `cd dtfrontend && npm run lint`
Expected: no errors for the new files

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/urunum-nerede/page.tsx
git commit -m "feat(atolye): add Ürünüm Nerede page (states + recent)"
```

---

### Task B9: Add the hub card (müşteri-only)

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/page.tsx` (insert into the `cards` array, lines 60-122)

Current `cards` entries are objects with `{ title, description, href, allowed, color, icon }` (see `Müşteri` entry at lines 74-85). Add a new entry. `isMusteri` is already in scope (line 15, set at lines 32-35).

- [ ] **Step 1: Insert the card**

In `dtfrontend/src/app/[platform]/atolye/page.tsx`, add this object to the `cards` array (e.g. right after the `Müşteri` card object that ends at line 85, before the `Operatör` card):

```tsx
    {
      title: "Ürünüm Nerede?",
      description: "Ürünlerinizin atölye sürecindeki anlık konumu",
      href: `/${platform}/atolye/urunum-nerede`,
      allowed: isMusteri,
      color: "#fe9526",
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
```

- [ ] **Step 2: Typecheck + build**

Run: `cd dtfrontend && npx tsc --noEmit`
Expected: no errors

Run: `cd dtfrontend && npm run build`
Expected: build succeeds; the route `/[platform]/atolye/urunum-nerede` appears in the output.

- [ ] **Step 3: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/page.tsx
git commit -m "feat(atolye): add Ürünüm Nerede card to atölye hub (müşteri only)"
```

---

# PART C — Verification

### Task C1: Full verification pass

- [ ] **Step 1: Backend — all track helper tests pass**

Run: `cd dtbackend && python -m unittest test_track_status_helper test_track_timeline_helper test_track_assemble_helper test_track_endpoint_resolve_helper -v`
Expected: all PASS, 0 failures.

- [ ] **Step 2: Backend — no regressions in existing helper tests**

Run: `cd dtbackend && python -m unittest test_work_order_serialization_helper test_qr_pairs_fallback_helper -v`
Expected: all PASS.

- [ ] **Step 3: Frontend — typecheck, lint, build**

Run: `cd dtfrontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: all succeed; new route present.

- [ ] **Step 4: Manual smoke (document results)**

With backend + frontend running, logged in as a müşteri user:
1. Atölye hub shows the **Ürünüm Nerede?** card; non-müşteri roles do NOT see it.
2. Search by Sipariş No + Kalem No for a known own-company order → result card + timeline + (if multi-package) package strip.
3. Search by a Parça No that spans multiple groups → list → select → detail.
4. Search a value with no match → "Kayıt Bulunamadı".
5. Search an order belonging to **another** company → "Kayıt Bulunamadı" (isolation; never another firm's data).
6. Query a group that has a QR but no scans yet → status "Girişi yapılmadı", empty-timeline message.

Record pass/fail for each in the task review.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test(atolye): verify Ürünüm Nerede end-to-end"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §3 decisions 1-6 → Tasks A5 (search methods, multi-match, scoping, dedicated endpoint), A3/A4 (route+history timeline), B8 (multi-match list), B9 (müşteri-only card). ✓
- §4.1 endpoint + schemas → A1, A5. ✓
- §4.2 components → B2-B8. ✓
- §4.3 hub card → B9. ✓
- §5 status derivation → A2 (package + group), A3 (step status). ✓
- §6 data flow / §7 error handling → B8 (states, error toast/banner), A5 (400/403). ✓
- §8 testing → A2-A5 unit tests + C1 (incl. isolation smoke test). ✓
- Isolation (user's explicit requirement) → A5 `company_from == department` scope + A5 resolver test + C1 step 5. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `TrackStatus`/`StepStatus` vocabularies are defined once (top of plan) and reused identically in A2/A3/B1/B2; helper names (`_track_package_status`, `_track_group_status`, `_build_track_timeline`, `_assemble_track_match`, `_resolve_track_group_ids`, `_company_for_group_local`) are consistent across definition (A2-A5) and tests. Frontend component names match imports in B8. Endpoint path `/romiot/station/work-orders/track` consistent between A5 and B8. ✓
