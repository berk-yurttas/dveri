# Company Registry + toy_api Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a first-class `companies` registry + 1:1 `user_companies` pairing the authoritative source of a user's company for the atolye subsystem (replacing PocketBase `department`), select company via typeahead in user forms, and send `SubcontractorID` + `SourceCompany` to the Mekasan/toy_api endpoint.

**Architecture:** Two new romiot-DB tables (`companies`, `user_companies`) + a `work_orders.company_from_id` FK. A single async `resolve_user_company(user, romiot_db)` helper replaces every atolye read of `current_user.department`; the three station auth helpers become async + `romiot_db`-aware and all 29 call sites thread the session through. New `/companies` and `/my-company` endpoints feed the frontend. The Mekasan push gains two fields. A standalone script backfills pairings (it must read PocketBase, so it is NOT an Alembic step).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic (`alembic_romiot`), httpx, Pydantic v2. Frontend: Next.js 15.5.6, React 19, TypeScript 5, Tailwind 4. romiot PostgreSQL (separate from primary DB).

**Spec:** `docs/superpowers/specs/2026-06-03-company-registry-and-toy-api-fields-design.md`.

**Worktree:** done in the existing `gok2` worktree at `.worktrees/gok2` (branch `gok2`). The romiot DB is not reachable from the dev environment, so migration upgrades and live endpoint smoke tests are deferred to a DB-connected environment; verification here is import/`py_compile`/`tsc`/`lint`/`build`-based + `alembic heads` chain integrity. Current alembic head (down_revision for the new migration): **`f6a7b8c9d0e1`**.

---

## File Structure

**New backend files:**
```
dtbackend/alembic_romiot/versions/add_companies_and_user_companies.py   T01 — tables + work_orders.company_from_id
dtbackend/app/schemas/company.py                                        T04 — Company/CompanyList/UserCompany schemas
dtbackend/app/api/v1/endpoints/romiot/station/company_resolver.py       T05 — resolve_user_company / require_user_company
dtbackend/app/api/v1/endpoints/romiot/station/company.py                T08 — GET /companies, GET /my-company
dtbackend/scripts/backfill_user_companies.py                            T16 — one-time PB→pairing backfill
```

**Modified backend files:**
```
dtbackend/app/models/romiot_models.py                                   T02 — Company, UserCompany, WorkOrder.company_from_id
dtbackend/app/api/v1/endpoints/romiot/station/auth.py                   T06 — 3 helpers async + romiot_db
dtbackend/app/api/v1/endpoints/romiot/station/company_integration.py    T07 — thread romiot_db into helper calls
dtbackend/app/api/v1/endpoints/romiot/station/priority.py               T07
dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py                T09 — sender company via resolver + company_from_id in QR JSON
dtbackend/app/api/v1/endpoints/romiot/station/work_order.py             T10 — scoping via resolver + persist company_from_id + subcontractor lookup
dtbackend/app/api/v1/endpoints/romiot/station/station.py                T11/T12 — helper calls + user-mgmt pairing + list company
dtbackend/app/api/v1/api.py                                             T08 — mount the company router
dtbackend/app/services/toy_api_service.py                               T13 — SubcontractorID + SourceCompany
```

**New frontend file:**
```
dtfrontend/src/hooks/useMyCompany.ts                                    T14 — fetch GET /my-company
```

**Modified frontend files:**
```
dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx        T15 — CompanyTypeahead in forms + list company
dtfrontend/src/app/[platform]/atolye/musteri/page.tsx                   T14 — own company from /my-company
dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx                  T14
dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx               T14
```

## Dependency waves
```
Wave 0  T01 migration | T02 models | T04 company schema  (T02 needs T01 conceptually; T04 independent)
Wave 1  T05 resolver (needs T02)
Wave 2  T06 auth helpers (needs T05) → T07 simple call sites (company_integration, priority)
Wave 3  T08 endpoints+router (needs T04,T05) ‖ T09 qr_code ‖ T10 work_order ‖ T11 station helper calls  (all need T06)
Wave 4  T12 station user-mgmt pairing (needs T05, T08-schema)
Wave 5  T13 toy_api (needs T10 passing subcontractor_id)
Wave 6  T14 frontend my-company (needs T08) ‖ T15 kullanici-yonetimi forms (needs T08)
Wave 7  T16 backfill script (needs T02) ; T17 verification
```

---

## Task 01: Migration — companies, user_companies, work_orders.company_from_id

**Files:**
- Create: `dtbackend/alembic_romiot/versions/add_companies_and_user_companies.py`

- [ ] **Step 1: Write the migration**

Create `dtbackend/alembic_romiot/versions/add_companies_and_user_companies.py`:

```python
"""add companies + user_companies tables and work_orders.company_from_id

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-03 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'companies',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('name', name='uq_companies_name'),
        sa.UniqueConstraint('code', name='uq_companies_code'),
    )

    op.create_table(
        'user_companies',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('pb_user_id', sa.String(length=255), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('pb_user_id', name='uq_user_companies_pb_user_id'),
    )

    op.add_column(
        'work_orders',
        sa.Column('company_from_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='RESTRICT'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('work_orders', 'company_from_id')
    op.drop_table('user_companies')
    op.drop_table('companies')
```

- [ ] **Step 2: Verify the migration chain (DB not required)**

Run:
```bash
cd dtbackend && python -m alembic -c alembic_romiot.ini heads
```
Expected: `a7b8c9d0e1f2 (head)` (single head; chains off `f6a7b8c9d0e1`). If the romiot DB is reachable, also run `python -m alembic -c alembic_romiot.ini upgrade head` and confirm exit 0; otherwise note the DB-unavailability.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/alembic_romiot/versions/add_companies_and_user_companies.py
git commit -m "feat(romiot): companies + user_companies tables + work_orders.company_from_id"
```

---

## Task 02: Models — Company, UserCompany, WorkOrder.company_from_id

**Files:**
- Modify: `dtbackend/app/models/romiot_models.py`

Current `WorkOrder` (lines 21–76) has `company_from = Column(String(255), nullable=False)` at line 40 and ends its column list at `route_violation` (line 69). The file's imports (line 1) are `from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint`.

- [ ] **Step 1: Add `company_from_id` to `WorkOrder`**

In `dtbackend/app/models/romiot_models.py`, inside the `WorkOrder` class, immediately after the `company_from` column (line 40):

```python
    company_from = Column(String(255), nullable=False)
    # FK form of company_from (Q13). Nullable for legacy rows / unmatched names;
    # the string column above is kept as a back-compat mirror, dropped in a later pass.
    company_from_id = Column(Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=True)
```

- [ ] **Step 2: Append `Company` and `UserCompany` classes**

At the end of `dtbackend/app/models/romiot_models.py`:

```python
class Company(PostgreSQLBase):
    """Authoritative company registry for the atolye subsystem (replaces the
    PocketBase department as the source of a user's company). `name` is the
    canonical company string used by stations/qr/work_orders; `code` is sent to
    Mekasan as SubcontractorID."""
    __tablename__ = "companies"
    __table_args__ = (
        UniqueConstraint("name", name="uq_companies_name"),
        UniqueConstraint("code", name="uq_companies_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class UserCompany(PostgreSQLBase):
    """1:1 pairing of a PocketBase user to a company. `pb_user_id` stores the
    PocketBase user id (string); no cross-DB FK is possible (same pattern as
    WorkOrder.user_id). UNIQUE(pb_user_id) enforces one company per user."""
    __tablename__ = "user_companies"
    __table_args__ = (
        UniqueConstraint("pb_user_id", name="uq_user_companies_pb_user_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    pb_user_id = Column(String(255), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
```

`func` is already imported at the top of the file (`from sqlalchemy.sql import func`).

- [ ] **Step 3: Smoke import**

```bash
cd dtbackend && python -c "from app.models.romiot_models import Company, UserCompany, WorkOrder; print(Company.__tablename__, UserCompany.__tablename__, WorkOrder.company_from_id)"
```
Expected: `companies user_companies <column>` — no exception.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/models/romiot_models.py
git commit -m "feat(models): Company, UserCompany, WorkOrder.company_from_id"
```

---

## Task 04: Company schemas

**Files:**
- Create: `dtbackend/app/schemas/company.py`

Pure-type DTOs — no test required (project TDD overlay exempts pure types).

- [ ] **Step 1: Create the schema file**

Create `dtbackend/app/schemas/company.py`:

```python
from pydantic import BaseModel, Field


class CompanyOut(BaseModel):
    """A company as returned to the frontend (registry list + my-company)."""
    id: int
    name: str
    code: str

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Smoke import**

```bash
cd dtbackend && python -c "from app.schemas.company import CompanyOut; print(list(CompanyOut.model_fields.keys()))"
```
Expected: `['id', 'name', 'code']`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/schemas/company.py
git commit -m "feat(schemas): CompanyOut DTO"
```

---

## Task 05: Company resolver helper

**Files:**
- Create: `dtbackend/app/api/v1/endpoints/romiot/station/company_resolver.py`

- [ ] **Step 1: Create the resolver module**

Create `dtbackend/app/api/v1/endpoints/romiot/station/company_resolver.py`:

```python
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.romiot_models import Company, UserCompany
from app.schemas.user import User


async def resolve_user_company(current_user: User, romiot_db: AsyncSession) -> Company | None:
    """Return the user's Company from the user_companies pairing table (NOT
    PocketBase). None when the user has no pairing row. `current_user.id` is the
    PocketBase user id."""
    result = await romiot_db.execute(
        select(Company)
        .join(UserCompany, UserCompany.company_id == Company.id)
        .where(UserCompany.pb_user_id == current_user.id)
    )
    return result.scalar_one_or_none()


async def require_user_company(current_user: User, romiot_db: AsyncSession) -> Company:
    """Same as resolve_user_company but raises 403 when the user is unpaired."""
    company = await resolve_user_company(current_user, romiot_db)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kullanıcı bir firmaya atanmamış",
        )
    return company
```

- [ ] **Step 2: Smoke import**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.company_resolver import resolve_user_company, require_user_company; import inspect; print(list(inspect.signature(resolve_user_company).parameters))"
```
Expected: `['current_user', 'romiot_db']`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/company_resolver.py
git commit -m "feat(station): resolve_user_company / require_user_company helper"
```

---

## Task 06: Rewire the three station auth helpers (async + romiot_db)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/auth.py`

Current symbols (read the file first):
- `check_station_operator_role(station_id, current_user, db)` (lines 9–49) — compares `station.company != user_company` where `user_company = (current_user.department or "").strip()` (line 42).
- `check_station_yonetici_role(current_user)` (lines 52–77) — returns `(current_user.department or "").strip()` (line 70), raising 401 when empty.
- `get_station_company(current_user)` (lines 80–115) — returns `(current_user.department or "").strip()` (line 108).
- `is_full_admin(current_user)` (lines 118–125) — unchanged.

- [ ] **Step 1: Replace the three helpers to resolve company from the pairing table**

In `dtbackend/app/api/v1/endpoints/romiot/station/auth.py`, add the resolver import at the top (after the existing imports):

```python
from app.api.v1.endpoints.romiot.station.company_resolver import require_user_company
```

Replace `check_station_operator_role` so the company comparison uses the resolved company name (it already receives `db`, the romiot session):

```python
async def check_station_operator_role(
    station_id: int,
    current_user: User,
    db: AsyncSession
):
    """Check the user holds 'atolye:operator' AND their resolved company matches
    the station's company. Company now comes from user_companies, not PocketBase."""
    station_result = await db.execute(
        select(Station).where(Station.id == station_id)
    )
    station = station_result.scalar_one_or_none()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{station_id} ID'li atölye bulunamadı"
        )

    if "atolye:operator" not in current_user.role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bu atölye için gerekli operatör yetkisine sahip değilsiniz"
        )

    company = await require_user_company(current_user, db)
    if station.company != company.name:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bu atölye için şirket yetkisine sahip değilsiniz"
        )

    return station
```

Replace `check_station_yonetici_role` to take `romiot_db` and resolve the company:

```python
async def check_station_yonetici_role(current_user: User, romiot_db: AsyncSession) -> str:
    """Check 'atolye:yonetici' and return the user's resolved company NAME
    (from user_companies). Raises 401 without the role, 403 when unpaired."""
    if not current_user.role or not isinstance(current_user.role, list):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yönetici yetkisine sahip değilsiniz"
        )
    if "atolye:yonetici" not in current_user.role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yönetici yetkisine sahip değilsiniz"
        )
    company = await require_user_company(current_user, romiot_db)
    return company.name
```

Replace `get_station_company` to take `romiot_db` and resolve:

```python
async def get_station_company(current_user: User, romiot_db: AsyncSession) -> str:
    """Return the user's resolved company NAME for any atolye role
    (from user_companies). 401 without an atolye role, 403 when unpaired."""
    if not current_user.role or not isinstance(current_user.role, list):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Atölye yetkisine sahip değilsiniz"
        )
    allowed_roles = {"atolye:yonetici", "atolye:operator", "atolye:musteri", "atolye:satinalma"}
    if not any(isinstance(r, str) and r in allowed_roles for r in current_user.role):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçerli bir atölye yetkisine sahip değilsiniz"
        )
    company = await require_user_company(current_user, romiot_db)
    return company.name
```

Add `AsyncSession` to the imports if not present (the file already imports `from sqlalchemy.ext.asyncio import AsyncSession`).

- [ ] **Step 2: Smoke import**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.auth import check_station_yonetici_role, get_station_company, check_station_operator_role; import inspect; print(list(inspect.signature(check_station_yonetici_role).parameters), list(inspect.signature(get_station_company).parameters))"
```
Expected: both now include `romiot_db`. No exception.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/auth.py
git commit -m "feat(station/auth): resolve company from user_companies in the 3 helpers"
```

> NOTE for downstream tasks: every caller of `check_station_yonetici_role(current_user)` must become `check_station_yonetici_role(current_user, romiot_db)`, and every `get_station_company(current_user)` → `get_station_company(current_user, romiot_db)`. `check_station_operator_role` keeps its 3-arg signature (it already received `db`).

---

## Task 07: Thread romiot_db into simple helper call sites (company_integration, priority)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/company_integration.py`
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/priority.py`

- [ ] **Step 1: Grep the call sites**

```bash
cd dtbackend && grep -n "check_station_yonetici_role\|get_station_company\|current_user.department" app/api/v1/endpoints/romiot/station/company_integration.py app/api/v1/endpoints/romiot/station/priority.py
```

- [ ] **Step 2: Update each call site**

In each handler that calls `check_station_yonetici_role(current_user)` or `get_station_company(current_user)`, pass the romiot session that the handler already depends on (it injects `romiot_db: AsyncSession = Depends(get_romiot_db)`), and `await` it:
- `company = await check_station_yonetici_role(current_user)` → `company = await check_station_yonetici_role(current_user, romiot_db)`
- `company = await get_station_company(current_user)` → `company = await get_station_company(current_user, romiot_db)`

If a handler reads `current_user.department` directly, replace with:
```python
from app.api.v1.endpoints.romiot.station.company_resolver import require_user_company
company = (await require_user_company(current_user, romiot_db)).name
```
(Both these modules already inject `romiot_db`; verify with the grep — if any handler does not, add `romiot_db: AsyncSession = Depends(get_romiot_db)` to its signature and the imports `from app.core.database import get_romiot_db` + `from sqlalchemy.ext.asyncio import AsyncSession`.)

- [ ] **Step 3: Smoke import**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.company_integration import router as r1; from app.api.v1.endpoints.romiot.station.priority import router as r2; print('ok', len(r1.routes), len(r2.routes))"
```

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/company_integration.py dtbackend/app/api/v1/endpoints/romiot/station/priority.py
git commit -m "feat(station): resolve company via pairing in company_integration + priority"
```

---

## Task 08: New endpoints — GET /companies + GET /my-company — and router mount

**Files:**
- Create: `dtbackend/app/api/v1/endpoints/romiot/station/company.py`
- Modify: `dtbackend/app/api/v1/api.py`

The router mount file is `dtbackend/app/api/v1/api.py`; the existing station routers are mounted there directly on `api_router` with full `/romiot/station/...` prefixes (e.g. `api_router.include_router(work_order_route.router, prefix="/romiot/station/work-order-routes", ...)`).

- [ ] **Step 1: Create the company endpoint module**

Create `dtbackend/app/api/v1/endpoints/romiot/station/company.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.romiot.station.company_resolver import resolve_user_company
from app.core.auth import check_authenticated
from app.core.database import get_romiot_db
from app.models.romiot_models import Company
from app.schemas.company import CompanyOut
from app.schemas.user import User

router = APIRouter()


def _has_atolye_role(current_user: User) -> bool:
    roles = current_user.role if isinstance(current_user.role, list) else []
    return any(isinstance(r, str) and r.startswith("atolye:") for r in roles)


@router.get("/", response_model=list[CompanyOut])
async def list_companies(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """List the company registry (name + code), ordered by name. For the
    user-form typeahead. Any atolye:* role may read."""
    if not _has_atolye_role(current_user):
        raise HTTPException(status_code=403, detail="Atölye yetkisi gereklidir.")
    result = await romiot_db.execute(select(Company).order_by(Company.name))
    return list(result.scalars().all())


@router.get("/my-company", response_model=CompanyOut)
async def get_my_company(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """The caller's own company from the pairing table. 404 when unpaired."""
    if not _has_atolye_role(current_user):
        raise HTTPException(status_code=403, detail="Atölye yetkisi gereklidir.")
    company = await resolve_user_company(current_user, romiot_db)
    if company is None:
        raise HTTPException(status_code=404, detail="Kullanıcı bir firmaya atanmamış")
    return company
```

- [ ] **Step 2: Mount the router in `api.py`**

In `dtbackend/app/api/v1/api.py`, add `company` to the station import line and mount it. Find the existing line that imports the station submodules (e.g. `from app.api.v1.endpoints.romiot.station import company_integration, station, work_order, qr_code, priority, work_order_route`) and append `, company as station_company`. Then add, alongside the other station includes:

```python
api_router.include_router(station_company.router, prefix="/romiot/station/companies", tags=["station:companies"])
```

(`GET /` → `/romiot/station/companies/`; `GET /my-company` → `/romiot/station/companies/my-company`.)

- [ ] **Step 3: Smoke**

```bash
cd dtbackend && python -c "import main; print([p for p in [r.path for r in main.app.routes] if 'romiot/station/companies' in p])"
```
Expected: list includes `/api/v1/romiot/station/companies/` and `/api/v1/romiot/station/companies/my-company`.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/company.py dtbackend/app/api/v1/api.py
git commit -m "feat(station): GET /companies + GET /my-company endpoints"
```

---

## Task 09: qr_code.py — sender company via resolver + company_from_id in QR JSON

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`

Read the file first. Current symbols: `generate_qr_code` reads `user_company = (current_user.department or "").strip()`; `generate_qr_code_batch` reads `sender_company = (current_user.department or "").strip()` and builds the QR JSON dict with `"company_from": sender_company` (no id); `get_qr_codes_by_work_order_group` filters müşteri rows by `company_from = department_value`.

- [ ] **Step 1: Resolve sender company in generate_qr_code + generate_qr_code_batch**

Add the import:
```python
from app.api.v1.endpoints.romiot.station.company_resolver import require_user_company
```

In `generate_qr_code`, replace `user_company = (current_user.department or "").strip()` with:
```python
sender = await require_user_company(current_user, romiot_db)
user_company = sender.name
```

In `generate_qr_code_batch`, replace `sender_company = (current_user.department or "").strip()` with:
```python
sender = await require_user_company(current_user, romiot_db)
sender_company = sender.name
```
Then, in the QR JSON payload dict, add the id alongside `company_from`:
```python
"company_from": sender_company,
"company_from_id": sender.id,
```

- [ ] **Step 2: Update get_qr_codes_by_work_order_group's department read**

Replace `department_value = (current_user.department or "").strip()` (and its empty-check 403) with:
```python
department_value = (await require_user_company(current_user, romiot_db)).name
```
(Keep the rest of the müşteri/non-müşteri branching unchanged — it already filters by `department_value`.)

- [ ] **Step 3: Smoke import + grep**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.qr_code import router; print(len(router.routes))"
cd dtbackend && grep -n "current_user.department" app/api/v1/endpoints/romiot/station/qr_code.py   # expect no output
```

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
git commit -m "feat(qr-code): sender company via pairing + company_from_id in QR JSON"
```

---

## Task 10: work_order.py — scoping via resolver, persist company_from_id, subcontractor lookup

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`

Read the file. Current symbols: `create_work_order` builds a `WorkOrder(...)` from the request (no `company_from_id`), then fires `send_production_order(new_work_order, this_station, integration.api_url, integration.api_key, this_station.company, pairs)`. `get_all_work_orders` derives `department_value = (current_user.department or "").strip()` and `company = department_value`. `WorkOrderCreate`/`WorkOrderDetail` schemas carry `company_from` (string).

- [ ] **Step 1: Add `company_from_id` to the WorkOrder create + persist it**

In `create_work_order`, when constructing `new_work_order = WorkOrder(...)`, also set `company_from_id`. Resolve it from the request payload's `company_from_id` if present, else by matching the `company_from` name to a `companies` row:

```python
from app.models.romiot_models import Company  # add to imports if missing

# resolve company_from_id: prefer the QR-provided id, else match by name
company_from_id = getattr(work_order_data, "company_from_id", None)
if company_from_id is None and work_order_data.company_from:
    cf = await romiot_db.execute(
        select(Company.id).where(Company.name == work_order_data.company_from)
    )
    company_from_id = cf.scalar_one_or_none()
```
Then add `company_from_id=company_from_id,` to the `WorkOrder(...)` constructor.

Add `company_from_id: int | None = None` to `WorkOrderBase` (or `WorkOrderCreate`) in `dtbackend/app/schemas/work_order.py` so the scan POST body can carry the id read from the QR JSON. Also add `company_from_id: int | None = None` to `WorkOrderDetail` and `WorkOrderList` (read-only display/debug).

- [ ] **Step 2: Look up the subcontractor code + pass it to the Mekasan push**

Just before the `send_production_order(...)` call in `create_work_order`, resolve the code from `company_from_id`:
```python
subcontractor_id = None
if new_work_order.company_from_id is not None:
    code_row = await romiot_db.execute(
        select(Company.code).where(Company.id == new_work_order.company_from_id)
    )
    subcontractor_id = code_row.scalar_one_or_none()
```
Change the call to:
```python
asyncio.create_task(send_production_order(
    new_work_order, this_station, integration.api_url, integration.api_key,
    this_station.company, pairs, subcontractor_id,
))
```
Apply the SAME subcontractor lookup + extra arg to the `send_production_order(...)` call in `update_exit_date` (it pushes on exit too).

- [ ] **Step 3: Replace get_all_work_orders department read**

Replace `department_value = (current_user.department or "").strip()` with:
```python
from app.api.v1.endpoints.romiot.station.company_resolver import require_user_company
department_value = (await require_user_company(current_user, romiot_db)).name
```
Leave the rest of the scoping logic (which already keys on `department_value` / `company`) unchanged.

- [ ] **Step 4: Smoke import**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.work_order import router; print([r.path for r in router.routes])"
cd dtbackend && grep -n "current_user.department" app/api/v1/endpoints/romiot/station/work_order.py   # expect no output
```

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/work_order.py dtbackend/app/schemas/work_order.py
git commit -m "feat(work-orders): persist company_from_id, resolve subcontractor code, scope via pairing"
```

---

## Task 11: station.py — thread romiot_db into helper calls (non-user-mgmt)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

This task covers ONLY the station/link-directory endpoints that call the auth helpers — `create_station`, `update_station`, `delete_station`, `get_my_station`, `list_stations`, the work-order-link-directory get/put. (User-management handlers are Task 12.)

- [ ] **Step 1: Grep helper + department usages**

```bash
cd dtbackend && grep -n "check_station_yonetici_role\|get_station_company\|current_user.department\|_get_main_company_from_department" app/api/v1/endpoints/romiot/station/station.py
```

- [ ] **Step 2: Thread romiot_db + await each helper call (station + link-directory handlers)**

For each station/link-directory handler that calls `await check_station_yonetici_role(current_user)` or `get_station_company(current_user)`, change to pass the handler's `romiot_db` (these handlers already inject `romiot_db: AsyncSession = Depends(get_romiot_db)`):
- `user_company = await check_station_yonetici_role(current_user)` → `await check_station_yonetici_role(current_user, romiot_db)`
- `get_station_company(current_user)` → `get_station_company(current_user, romiot_db)`

For the work-order-link-directory GET, which reads `company = _get_main_company_from_department(current_user.department)`: replace with the resolved company name:
```python
from app.api.v1.endpoints.romiot.station.company_resolver import require_user_company
company = (await require_user_company(current_user, romiot_db)).name
```
(`_get_main_company_from_department` splits on `:`; since company now comes from the registry with no `:`, the raw name is correct.)

- [ ] **Step 3: Smoke import**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.station import router; print('ok', len(router.routes))"
```

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "feat(stations): resolve company via pairing in station + link-directory handlers"
```

---

## Task 12: station.py — user-management pairing (create/edit/list)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

This is the most intricate change. Read these current symbols first:
- `ManagedUserResponse` (lines 36–46): has `company: str`, `department: str | None`.
- `ManagedUserUpdateRequest` (lines 67–90): has `company` (deprecated), `department` (free-text), and a `validate_request` that rejects `:` in `department`.
- `UserCreateRequest` (the legacy operator-create schema) and `FullAdminUserCreateRequest` (full-admin create) — find them via grep; they carry `musteri_department`/`department` for the company.
- `_pb_create_user_record(..., department, company)` — writes department/company to PocketBase.
- `list_company_users` — builds `ManagedUserResponse(company=item_company, department=...)` from PB fields, and (for yönetici) filters by PB `item_company != user_company`.
- `update_company_user`, `full_admin_create_user`, `create_user_for_station` — set department/company on PB and assign roles.

The transformation rules (apply consistently):

- [ ] **Step 1: Add `company_id` to the create/update request schemas**

Add `company_id: int | None = Field(None, description="Selected company id from the registry")` to `ManagedUserUpdateRequest`, `FullAdminUserCreateRequest`, and the operator `UserCreateRequest`. Remove the `:`-in-`department` validation from `ManagedUserUpdateRequest.validate_request` (company now comes from a fixed registry). Keep the `department` field on the schemas for now (it becomes the server-derived mirror, not the input source).

- [ ] **Step 2: Add a pairing-upsert + company-resolution helper inside station.py**

Add near the other helpers:
```python
from app.models.romiot_models import Company, UserCompany

async def _company_by_id(romiot_db, company_id: int) -> Company:
    row = await romiot_db.execute(select(Company).where(Company.id == company_id))
    company = row.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=400, detail="Geçersiz firma seçimi")
    return company

async def _company_by_name(romiot_db, name: str) -> Company | None:
    row = await romiot_db.execute(select(Company).where(Company.name == name))
    return row.scalar_one_or_none()

async def _upsert_user_company(romiot_db, pb_user_id: str, company_id: int) -> None:
    existing = await romiot_db.execute(
        select(UserCompany).where(UserCompany.pb_user_id == pb_user_id)
    )
    row = existing.scalar_one_or_none()
    if row is None:
        romiot_db.add(UserCompany(pb_user_id=pb_user_id, company_id=company_id))
    else:
        row.company_id = company_id
    await romiot_db.commit()

async def _resolve_pairing_company_name(romiot_db, pb_user_id: str) -> str | None:
    row = await romiot_db.execute(
        select(Company.name).join(UserCompany, UserCompany.company_id == Company.id)
        .where(UserCompany.pb_user_id == pb_user_id)
    )
    return row.scalar_one_or_none()
```

- [ ] **Step 3: Determine the effective company in create/edit (operator vs non-operator)**

In each create/edit handler, compute the company to pair BEFORE creating/updating the PB user:
- **Operator** (role == operator, has `station_id`): load the station; the company is the station's company. `company = await _company_by_name(romiot_db, station.company)`; if `None` → `raise HTTPException(400, "Bu istasyonun firması firma kayıtlarında bulunamadı")`. If the client also sent `company_id`, require it to equal `company.id` (else 400 "Operatör firması istasyonun firmasıyla eşleşmelidir").
- **Non-operator** (müşteri/yönetici/satinalma): `company_id` is required → `company = await _company_by_id(romiot_db, user_data.company_id)`. (For a non-fullAdmin yönetici creating users, also enforce `company.name == <creator's resolved company>` so they can't assign other companies.)

Set the mirror: `department_for_pb = company.name` (passed to `_pb_create_user_record` / the PB update payload as both `department` and `company`).

- [ ] **Step 4: Write the pairing after the PB user exists**

After the PB user is created/updated and you have its `pb_user_id`, call:
```python
await _upsert_user_company(romiot_db, pb_user_id, company.id)
```
(Create: use the new PB id. Edit: use the path `pocketbase_user_id`. Only upsert when the company changed or on create.)

- [ ] **Step 5: Resolve the per-user company from the pairing in list_company_users**

In `list_company_users`, for each PB user build the company from the pairing table instead of PB fields:
```python
paired = await _resolve_pairing_company_name(romiot_db, pb_user["id"])
item_company = paired or ""   # fall back to "" (unpaired) — shown as "-" on the FE
```
Use `item_company` for the `ManagedUserResponse.company` and for the yönetici scoping filter (`if item_company != user_company: skip`). `user_company` for the yönetici comes from `await check_station_yonetici_role(current_user, romiot_db)` (Task 06). `ManagedUserResponse.department` may be set to `item_company` (or left as the PB department mirror).

These handlers must inject `romiot_db` if they don't already (`romiot_db: AsyncSession = Depends(get_romiot_db)`).

- [ ] **Step 6: Smoke import + grep**

```bash
cd dtbackend && python -c "from app.api.v1.endpoints.romiot.station.station import router; print('ok', len(router.routes))"
cd dtbackend && grep -n "current_user.department" app/api/v1/endpoints/romiot/station/station.py   # expect no output
```

- [ ] **Step 7: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "feat(stations): user-company pairing on create/edit + pairing-resolved company in list"
```

> If the user-management handler structure can't be reconciled confidently with these rules, STOP and report BLOCKED with the specific handler region pasted — do not guess.

---

## Task 13: toy_api_service — SubcontractorID + SourceCompany

**Files:**
- Modify: `dtbackend/app/services/toy_api_service.py`

Current symbols quoted: `_build_payload_item(work_order, station, pair, mes_order_id)` returns the dict at lines 17–35; `send_production_order(work_order, station, api_url, api_key, company, pairs)` (lines 55–95).

- [ ] **Step 1: Add the two fields + the new parameter**

Change `_build_payload_item` to accept `subcontractor_id` and `source_company` and include them:
```python
def _build_payload_item(
    work_order,
    station,
    pair: OrderPair,
    mes_order_id: str,
    subcontractor_id: str | None,
    source_company: str,
) -> dict:
    return {
        "AselsanOrderCode": pair.aselsan_order_number,
        "WorkOrderItemNo": pair.order_item_number,
        "ProductCode": work_order.part_number,
        "Mes_ProductCode": work_order.part_number,
        "RevisionNo": work_order.revision_number,
        "Mes_MachineGroup": str(station.station_order_code) if station.station_order_code is not None else None,
        "OperationDesc": station.name,
        "Mes_OrderId": mes_order_id,
        "SubcontractorWorkOrderNo": work_order.work_order_group_id,
        "SubcontractorID": subcontractor_id,
        "SourceCompany": source_company,
        "ActualStartDate": work_order.entrance_date.isoformat() if work_order.entrance_date else None,
        "ActualEndDate": work_order.exit_date.isoformat() if work_order.exit_date else None,
        "PlannedQuantity": work_order.quantity,
        "WorkOrderAmount": work_order.total_quantity,
        "ActualQuantity": work_order.quantity if work_order.exit_date else 0,
        "MES_CreatedDate": work_order.qr_created_at.isoformat() if work_order.qr_created_at else None,
        "NeedDate": work_order.target_date.isoformat() if work_order.target_date else None,
        "AselsanSectorCode": work_order.sector,
    }
```

- [ ] **Step 2: Thread `subcontractor_id` through `send_production_order`**

```python
async def send_production_order(
    work_order,
    station,
    api_url: str,
    api_key: str,
    company: str,
    pairs: list[OrderPair],
    subcontractor_id: str | None = None,
) -> None:
    # ... unchanged docstring + empty-pairs guard ...
    if not pairs:
        logger.warning("send_production_order skipped: empty pairs for work_order_id=%s", work_order.id)
        return

    base_id = f"{work_order.work_order_group_id}-{station.id}"

    if len(pairs) == 1:
        item = _build_payload_item(work_order, station, pairs[0], base_id, subcontractor_id, company)
        await _post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id)
        return

    tasks = []
    for pair in pairs:
        mes_order_id = f"{base_id}-{pair.aselsan_order_number}-{pair.order_item_number}"
        item = _build_payload_item(work_order, station, pair, mes_order_id, subcontractor_id, company)
        tasks.append(_post_one(api_url, api_key, {"company": company, "data": [item]}, work_order.id))
    await asyncio.gather(*tasks)
```
`source_company` is the existing `company` argument (the target/scanning-station company, Q14).

- [ ] **Step 3: Smoke import**

```bash
cd dtbackend && python -c "from app.services.toy_api_service import send_production_order; import inspect; print(list(inspect.signature(send_production_order).parameters))"
```
Expected: `['work_order', 'station', 'api_url', 'api_key', 'company', 'pairs', 'subcontractor_id']`.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/services/toy_api_service.py
git commit -m "feat(toy-api): SubcontractorID (company_from code) + SourceCompany (target name)"
```

---

## Task 14: Frontend — own company from /my-company (hook + 3 pages)

**Files:**
- Create: `dtfrontend/src/hooks/useMyCompany.ts`
- Modify: `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx`
- Modify: `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx`
- Modify: `dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx`

- [ ] **Step 1: Create the hook**

Create `dtfrontend/src/hooks/useMyCompany.ts`:
```ts
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface MyCompany {
  id: number;
  name: string;
  code: string;
}

/** Fetches the caller's own company from the pairing-backed endpoint.
 *  Returns null until loaded or when the user is unpaired (404). */
export function useMyCompany(enabled: boolean): MyCompany | null {
  const [company, setCompany] = useState<MyCompany | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.get<MyCompany>("/romiot/station/companies/my-company")
      .then((data) => { if (!cancelled) setCompany(data); })
      .catch(() => { if (!cancelled) setCompany(null); });
    return () => { cancelled = true; };
  }, [enabled]);
  return company;
}
```

- [ ] **Step 2: musteri/page.tsx — Gönderen Firma from /my-company**

Current line 82 sets `setUserOwnCompany((user.department || user.company || "").trim())` inside the role effect. Replace the source: import the hook, call `const myCompany = useMyCompany(isMusteri || isYonetici);`, and set `userOwnCompany` from `myCompany?.name ?? ""` (drop the `user.department` read). Keep `userOwnCompany` as the state the print/preview already consume.

- [ ] **Step 3: yonetici/page.tsx — company from /my-company**

Current line 69 sets `setUserCompany(user.department || user.company || null)`. Replace with the hook: `const myCompany = useMyCompany(isYonetici); ` and drive `userCompany` from `myCompany?.name ?? null` (the create/edit station forms + fetchStations already consume `userCompany`).

- [ ] **Step 4: is-emirleri/page.tsx — userCompany + ASELSAN check from /my-company**

Current lines 239 + 244 read `user.department || user.company`. Replace `setUserCompany(...)` with the hook value (`myCompany?.name ?? ""`), and base the ASELSAN-satinalma check on `(myCompany?.name ?? "").toUpperCase() === "ASELSAN"`.

- [ ] **Step 5: Type-check**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add dtfrontend/src/hooks/useMyCompany.ts dtfrontend/src/app/[platform]/atolye/musteri/page.tsx dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx dtfrontend/src/app/[platform]/atolye/is-emirleri/page.tsx
git commit -m "feat(atolye/fe): read own company from /my-company instead of PB department"
```

---

## Task 15: Frontend — kullanici-yonetimi company typeahead + pairing

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

Read the file. Current: the create form (`createForm.department`) and edit form (`formData.department`) use free-text "Firma" inputs (around lines 553–574 and 734–744); the list shows `u.company`; the company filter is `u.department === filterCompany`; create/edit submit send `department` (validated for `:`).

- [ ] **Step 1: Add company state + fetch the registry**

Add state for the selected company id in both forms and a fetched companies list. Reuse the existing `CompanyTypeahead` component (`@/components/atolye/CompanyTypeahead`) pointed at `/romiot/station/companies/`. Since `CompanyTypeahead` currently fetches its own list internally from the integrations endpoint, EITHER (a) extend it to accept an optional `endpoint`/`items` prop, OR (b) add a small local typeahead bound to the companies list. Prefer (a): add an optional `endpoint?: string` prop to `CompanyTypeahead` defaulting to the existing integrations path, and a `valueId`/`onSelectId` pathway, OR keep it name-based and resolve the chosen name → id from the fetched companies list on submit. Document whichever you choose.

- [ ] **Step 2: Replace the free-text Firma inputs with the typeahead**

In both create and edit forms, replace the `<input>`/`<select>` "Firma" controls with `<CompanyTypeahead>` over the companies registry. For the operator role, lock/auto-set the company to the selected station's company (mirror the existing operator station handling). Store the selected `company_id`.

- [ ] **Step 3: Send company_id on submit; drop the `:` validation**

Create + edit submit payloads send `company_id` (resolved from the selected company). Remove the `createForm.department.includes(":")`/`formData.department.includes(":")` checks. Keep sending nothing for `department` (the backend derives + mirrors it).

- [ ] **Step 4: List company + filter from the response**

The managed-users list already shows `u.company`; the backend now returns the pairing-resolved company there (Task 12), so no change beyond ensuring the company FILTER uses `u.company` consistently (the backend resolves it). If the filter currently keys on `u.department`, switch it to `u.company`.

- [ ] **Step 5: Type-check**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx dtfrontend/src/components/atolye/CompanyTypeahead.tsx
git commit -m "feat(kullanici-yonetimi): company typeahead from registry + send company_id"
```

---

## Task 16: Backfill script — pair existing PB users to companies

**Files:**
- Create: `dtbackend/scripts/backfill_user_companies.py`

Pattern: mirror existing standalone scripts (`dtbackend/scripts/backfill_analytics_department.py`). The script reads PocketBase (admin auth) and writes `user_companies` rows in the romiot DB.

- [ ] **Step 1: Write the script**

Create `dtbackend/scripts/backfill_user_companies.py`:
```python
"""One-time backfill: pair existing atolye PocketBase users to companies.

Run AFTER the migration is applied AND the `companies` table is seeded via SQL.
Idempotent: skips users that already have a user_companies row. Reports any
user whose PB department has no matching company, and any company name used by
stations/work_orders that is missing from `companies`.

Usage:  python -m scripts.backfill_user_companies
"""
import asyncio

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.core.database import RomiotAsyncSessionLocal
from app.models.romiot_models import Company, Station, UserCompany, WorkOrder


async def _pb_admin_token(client: httpx.AsyncClient) -> str:
    resp = await client.post(
        f"{settings.POCKETBASE_URL}/api/admins/auth-with-password",
        json={"identity": settings.POCKETBASE_ADMIN_EMAIL, "password": settings.POCKETBASE_ADMIN_PASSWORD},
    )
    resp.raise_for_status()
    return resp.json()["token"]


async def _list_atolye_users(client: httpx.AsyncClient, token: str) -> list[dict]:
    users: list[dict] = []
    page = 1
    while True:
        resp = await client.get(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            params={"page": page, "perPage": 200},
            headers={"Authorization": token},
        )
        resp.raise_for_status()
        body = resp.json()
        for item in body.get("items", []):
            roles = item.get("role") or []
            if any(isinstance(r, str) and r.startswith("atolye:") for r in roles):
                users.append(item)
        if page >= body.get("totalPages", 1):
            break
        page += 1
    return users


async def main() -> None:
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        token = await _pb_admin_token(client)
        pb_users = await _list_atolye_users(client, token)

    paired = 0
    skipped = 0
    unmatched_users: list[str] = []
    async with RomiotAsyncSessionLocal() as db:
        companies = {c.name: c.id for c in (await db.execute(select(Company))).scalars().all()}

        # report company names in use but missing from the registry
        used_names = set()
        for s in (await db.execute(select(Station.company))).scalars().all():
            used_names.add((s or "").strip())
        for cf in (await db.execute(select(WorkOrder.company_from))).scalars().all():
            used_names.add((cf or "").strip())
        missing = sorted(n for n in used_names if n and n not in companies)
        if missing:
            print("WARNING: company names in use but missing from companies:", missing)

        for u in pb_users:
            pb_id = u["id"]
            existing = (await db.execute(
                select(UserCompany).where(UserCompany.pb_user_id == pb_id)
            )).scalar_one_or_none()
            if existing is not None:
                skipped += 1
                continue
            dept = (u.get("department") or "").strip()
            company_id = companies.get(dept)
            if company_id is None:
                unmatched_users.append(f"{u.get('username')} (department={dept!r})")
                continue
            db.add(UserCompany(pb_user_id=pb_id, company_id=company_id))
            paired += 1
        await db.commit()

    print(f"paired={paired} skipped_existing={skipped} unmatched={len(unmatched_users)}")
    for line in unmatched_users:
        print("  UNMATCHED:", line)


if __name__ == "__main__":
    asyncio.run(main())
```

Verify `RomiotAsyncSessionLocal` is the correct session-maker name (grep `app/core/database.py`); if it differs (e.g. `RomiotSessionLocal`), use the real name.

- [ ] **Step 2: Syntax check (no DB/PB needed)**

```bash
cd dtbackend && python -m py_compile scripts/backfill_user_companies.py && echo "py_compile OK"
```

- [ ] **Step 3: Commit**

```bash
git add dtbackend/scripts/backfill_user_companies.py
git commit -m "feat(scripts): one-time backfill of user_companies from PocketBase"
```

---

## Task 17: Verification

- [ ] **Step 1: Backend — import + alembic chain + grep + py_compile**

```bash
cd dtbackend && python -c "import main; print('main OK')"
cd dtbackend && python -m alembic -c alembic_romiot.ini heads          # single head a7b8c9d0e1f2
cd dtbackend && grep -rn "current_user.department" app/api/v1/endpoints/romiot/   # expect 0
cd dtbackend && python -m py_compile app/api/v1/endpoints/romiot/station/*.py app/services/toy_api_service.py scripts/backfill_user_companies.py
```
Expected: app imports; single alembic head; zero `current_user.department` in the atolye routers; py_compile OK. Confirm the new routes are registered:
```bash
cd dtbackend && python -c "import main; print([p for p in [r.path for r in main.app.routes] if 'companies' in p])"
```
Expected: includes `/api/v1/romiot/station/companies/` and `/api/v1/romiot/station/companies/my-company`.

- [ ] **Step 2: Frontend — tsc + lint + build**

```bash
cd dtfrontend && npx tsc --noEmit -p tsconfig.json && npm run lint && npm run build
```
Expected: all exit 0; the 6 atolye routes build.

- [ ] **Step 3: Endpoint-path cross-check (FE ↔ BE)**

```bash
cd /c/Users/ABDULLAHGOKTUG/Desktop/dveri/.worktrees/gok2 && grep -rn "company-integration/companies\|companies/my-company\|/romiot/station/companies" dtfrontend/src
```
Confirm every frontend call matches a registered backend path (note: the registry list is `/romiot/station/companies/`, distinct from the existing integrations list `/romiot/station/company-integration/companies`).

- [ ] **Step 4: Commit verification log**

```bash
git add docs/superpowers/reviews/2026-06-03-company-registry/task-17-review.md
git commit -m "test: backend+frontend static verification for company registry"
```

**Deferred to a DB-connected environment** (documented, cannot run here): `alembic upgrade head`; seed `companies` via SQL; run `python -m scripts.backfill_user_companies`; backfill `work_orders.company_from_id`; live endpoint smoke (unpaired→403/404, operator company-must-match-station, QR carries company_from_id, Mekasan push carries SubcontractorID + SourceCompany).

---

## Notes for the executing engineer

- **Worktree + per-task reviews:** per the project overlay, each task gets spec-compliance + code-quality review and a per-task artifact under `docs/superpowers/reviews/2026-06-03-company-registry/task-<N>-review.md`.
- **Threading `romiot_db`:** the single most repeated mechanical change. Every `check_station_yonetici_role`/`get_station_company` call gains a `romiot_db` arg; every direct `current_user.department` read in the atolye routers becomes `(await require_user_company(current_user, romiot_db)).name`. Grep `current_user.department` must be 0 in `app/api/v1/endpoints/romiot/` at the end.
- **DB-less environment:** migrations + backfill + live smoke run later; here, verify by import/`py_compile`/`alembic heads`/`tsc`/`lint`/`build`.
- **Dependency reminders:** T05 needs T02; T06 needs T05; T07/T09/T10/T11 need T06; T08 needs T04+T05; T12 needs T05+T08-schema; T13 needs T10 passing `subcontractor_id`; T14/T15 need T08.

---

## Self-Review

**1. Spec coverage:**
- Data model (Sec 1) → T01, T02. Company schema → T04.
- Resolver + rip-out (Sec 2) → T05, T06, T07, T09, T10, T11, T12.
- Endpoints + user mgmt (Sec 3) → T08 (/companies, /my-company), T12 (pairing on create/edit + list), T14/T15 (frontend).
- toy_api (Sec 4) → T13 (fields) + T10 (company_from_id persistence + subcontractor lookup).
- Migrations/backfill/rollout (Sec 5) → T01, T16, T17.

**2. Placeholder scan:** Tasks 12 and 15 use "adapt-from-current" instructions (read the handler/form, apply the stated transformation rules) rather than full literal rewrites, because those two targets are large and intricate and the global rules require bridging from the actual current symbols (which the engineer reads in-task). Every rule is concrete (operator vs non-operator company source; remove `:` validation; upsert pairing; resolve list company from pairing). The other 15 tasks have literal code. No TBD/TODO.

**3. Type consistency:** `resolve_user_company`/`require_user_company(current_user, romiot_db)` signatures are used identically everywhere; `send_production_order(..., subcontractor_id)` matches the T10 caller; `CompanyOut{id,name,code}` matches the `/companies` + `/my-company` responses and the frontend `MyCompany` interface; `company_from_id` is the same name in the migration (T01), model (T02), QR JSON (T09), and WorkOrder persistence (T10).
