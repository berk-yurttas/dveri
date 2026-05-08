# Atolye fullAdmin Müşteri Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove müşteri creation/visibility from the yönetici flow, and give `fullAdmin:true` users a kullanıcı yönetimi view with cross-company listing, create/edit forms, and a multiselect of target workshops for müşteri users.

**Architecture:** Spec at [docs/superpowers/specs/2026-05-08-fulladmin-musteri-management-design.md](../specs/2026-05-08-fulladmin-musteri-management-design.md). Müşteri data model is the post-redesign one: PB `company` = owning workshop, `department` = customer's own name, `atolye:musteri_company:*` = target workshops. The new fullAdmin role gate is the literal string `"fullAdmin:true"` already present in PocketBase user role arrays. No schema changes; no data migration.

**Tech Stack:** FastAPI + Pydantic + SQLAlchemy async (Postgres + romiot DB) + PocketBase HTTP API on the backend. Next.js (app router) + TypeScript + Tailwind on the frontend.

---

## File Structure

**Backend** (`dtbackend/app/api/v1/endpoints/romiot/station/`):
- `auth.py` — add `is_full_admin(user)` helper alongside the existing role helpers.
- `station.py` — primary surface for all changes:
  - extract `_pb_create_user_record` helper (reused by two create endpoints)
  - add `GET /management/companies`
  - extend `GET /stations/` to accept `?company=` for fullAdmin
  - widen `GET /management/users` permission and per-row company sourcing
  - widen `PUT /management/users/{id}` permission; accept `company`/`department`/`musteri_companies`
  - add `POST /management/users` (fullAdmin-only create)
  - narrow `UserRoleType` enum to `OPERATOR` only on the legacy `POST /user`

**Backend tests** (`dtbackend/test_*.py` — standalone scripts, matches existing convention):
- `test_full_admin_helper.py` — covers `is_full_admin`.

**Frontend** (`dtfrontend/src/app/[platform]/atolye/`):
- `yonetici/page.tsx` — operator-only creation form (drop role select + musteri_department).
- `kullanici-yonetimi/page.tsx` — role-gated listing, edit modal extension, new create modal.

---

## Task 1: Backend — `is_full_admin` helper + standalone test

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/auth.py` (append helper at end of file)
- Create: `dtbackend/test_full_admin_helper.py`

- [ ] **Step 1: Write the failing test**

Create `dtbackend/test_full_admin_helper.py`:

```python
"""
Standalone assertion test for is_full_admin.

Run with: python dtbackend/test_full_admin_helper.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app.api.v1.endpoints.romiot.station.auth import is_full_admin
from app.schemas.user import User


def make_user(role):
    return User(
        id="u1",
        username="u",
        email="u@x",
        name="U",
        company="C",
        department="C",
        management_dpt="",
        title="",
        role=role,
        verified=True,
    )


def main():
    assert is_full_admin(make_user(["fullAdmin:true"])) is True, "lone fullAdmin"
    assert is_full_admin(make_user(["atolye:yonetici", "fullAdmin:true"])) is True, "with other roles"
    assert is_full_admin(make_user(["atolye:yonetici"])) is False, "no fullAdmin"
    assert is_full_admin(make_user([])) is False, "empty list"
    assert is_full_admin(make_user(None)) is False, "None role"  # type: ignore[arg-type]
    assert is_full_admin(make_user(["fullAdmin:false"])) is False, "fullAdmin false literal"
    assert is_full_admin(make_user(["fulladmin:true"])) is False, "case sensitive"
    print("is_full_admin: OK")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python dtbackend/test_full_admin_helper.py`
Expected: `ImportError: cannot import name 'is_full_admin' from 'app.api.v1.endpoints.romiot.station.auth'`

- [ ] **Step 3: Implement the helper**

Append to `dtbackend/app/api/v1/endpoints/romiot/station/auth.py` (after `get_station_company`):

```python
def is_full_admin(current_user: User) -> bool:
    """
    Returns True if the user has the literal "fullAdmin:true" string in their
    role list. The role is set in PocketBase out-of-band; no other side effect.
    """
    if not current_user.role or not isinstance(current_user.role, list):
        return False
    return "fullAdmin:true" in current_user.role
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python dtbackend/test_full_admin_helper.py`
Expected: `is_full_admin: OK`

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/auth.py dtbackend/test_full_admin_helper.py
git commit -m "fullAdmin: add is_full_admin role helper"
```

---

## Task 2: Backend — extract `_pb_create_user_record` helper

**Why:** The PocketBase admin auth + duplicate-check + create payload block is going to live in two endpoints (`POST /user` and the new `POST /management/users`). Extract it once now.

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Add the helper above `create_user_for_station`**

Insert this function between `_get_main_company_from_department` and the first `@router.get(...)` decorator (around [station.py:175](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L175)):

```python
async def _pb_create_user_record(
    *,
    username: str,
    email: str,
    password: str,
    password_confirm: str,
    name: str,
    role: list[str],
    department: str,
    company: str,
) -> str:
    """
    Authenticate as PB admin, ensure username/email are unique, create the user
    record, and return the new PB id. Raises HTTPException with PB-derived
    detail on validation/uniqueness errors.
    """
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        auth_token = await _authenticate_pocketbase_admin(client)
        headers = {"Authorization": auth_token}

        check_username = await client.get(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            params={"filter": f'username="{username}"'},
            headers=headers,
        )
        if check_username.status_code == 200 and check_username.json().get("items"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{username}' kullanıcı adı zaten kullanılıyor",
            )

        check_email = await client.get(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            params={"filter": f'email="{email}"'},
            headers=headers,
        )
        if check_email.status_code == 200 and check_email.json().get("items"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{email}' e-posta adresi zaten kullanılıyor",
            )

        payload = {
            "username": username,
            "email": email,
            "emailVisibility": True,
            "verified": True,
            "password": password,
            "passwordConfirm": password_confirm,
            "name": name,
            "role": role,
            "department": department,
            "company": company,
        }
        create_response = await client.post(
            f"{settings.POCKETBASE_URL}/api/collections/users/records",
            json=payload,
            headers=headers,
        )
        if create_response.status_code in (200, 201):
            return create_response.json().get("id", "")

        # Best-effort error parsing (mirrors today's logic)
        error_detail = create_response.text
        try:
            error_json = create_response.json()
            error_data = error_json.get("data", {}) or {}
            email_errors = error_data.get("email")
            if isinstance(email_errors, dict) and "message" in email_errors:
                msg = str(email_errors["message"]).lower()
                if "already exists" in msg or "already in use" in msg:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"'{email}' e-posta adresi zaten kullanılıyor",
                    )
                if "invalid" in msg or "format" in msg:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Geçersiz e-posta adresi formatı",
                    )
            username_errors = error_data.get("username")
            if isinstance(username_errors, dict) and "message" in username_errors:
                msg = str(username_errors["message"]).lower()
                if "already exists" in msg:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"'{username}' kullanıcı adı zaten kullanılıyor",
                    )
            error_message = error_json.get("message", error_detail)
        except HTTPException:
            raise
        except Exception:
            error_message = error_detail
        raise HTTPException(
            status_code=create_response.status_code,
            detail=f"Kullanıcı oluşturulurken hata oluştu: {error_message}",
        )
```

- [ ] **Step 2: Replace the inline block in `create_user_for_station`**

In `create_user_for_station` (around [station.py:816-977](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L816)), replace the entire `try: async with httpx.AsyncClient(...) as client: ...` block (the part from `# Create user in PocketBase` through the matching `except Exception as e: raise HTTPException(...)`) with:

```python
    # Create user in PocketBase via shared helper
    try:
        pb_user_id = await _pb_create_user_record(
            username=user_data.username,
            email=user_data.email,
            password=user_data.password,
            password_confirm=user_data.password_confirm,
            name=user_data.name,
            role=role_values,
            department=target_department,
            company=user_company,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PocketBase'de kullanıcı oluşturulurken hata oluştu: {str(e)}",
        )
```

Keep `pb_user_id = None` declared just before this block as a fallback so the return statement still works on the (impossible) helper-returns-empty path.

- [ ] **Step 3: Manually verify the imports/refs**

Run: `python -c "from app.api.v1.endpoints.romiot.station.station import _pb_create_user_record, create_user_for_station"` from `dtbackend/`
Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "fullAdmin: extract _pb_create_user_record helper"
```

---

## Task 3: Backend — narrow legacy `POST /user` to operator-only

**Why:** The yönetici page no longer offers müşteri creation; we want the backend to refuse it with a clear error if a stale client tries.

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Narrow `UserRoleType` enum**

At [station.py:24-26](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L24), change:

```python
class UserRoleType(str, Enum):
    MUSTERI = "musteri"
    OPERATOR = "operator"
```

to:

```python
class UserRoleType(str, Enum):
    """Roles the legacy /user endpoint accepts. Müşteri lives on /management/users now."""
    OPERATOR = "operator"
```

- [ ] **Step 2: Drop müşteri branches from `UserCreateRequest.validate_data`**

In [station.py:716-738](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L716), replace the validator with:

```python
    @model_validator(mode='after')
    def validate_data(self):
        _validate_password_strength(self.password)
        if self.password != self.password_confirm:
            raise ValueError('Şifreler eşleşmiyor')
        if not self.station_id:
            raise ValueError('Operatör rolü için atölye seçilmesi zorunludur')
        if self.musteri_department is not None:
            raise ValueError('Operatör rolü için müşteri şirket/departman bilgisi gönderilmemelidir')
        return self
```

`role` will be Operator-only post-narrowing, but keep the field present (default `OPERATOR`) for backward-compatible clients:

```python
    role: UserRoleType = Field(default=UserRoleType.OPERATOR, description="Role: operator")
```

- [ ] **Step 3: Drop müşteri branches from the handler body**

In `create_user_for_station` (around [station.py:796-814](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L796)), replace the role/department resolution block:

```python
    full_role = f"atolye:{user_data.role.value}"
    role_values = [full_role]
    target_department = user_company
```

Remove the if/else around `MUSTERI` (the validator already enforces operator-only, so the dead branch can go).

- [ ] **Step 4: Verify the dev server still imports cleanly**

Run: `python -c "from app.api.v1.endpoints.romiot.station.station import router"` from `dtbackend/`
Expected: no error.

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "fullAdmin: narrow legacy POST /user to operator-only"
```

---

## Task 4: Backend — `GET /management/companies` endpoint

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Update imports if needed**

At the top of `station.py`, ensure `is_full_admin` is imported:

```python
from app.api.v1.endpoints.romiot.station.auth import check_station_yonetici_role, is_full_admin
```

(replace the existing single-name import).

- [ ] **Step 2: Add the endpoint**

Insert this route after the `update_company_user` definition (around [station.py:559](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L559)):

```python
@router.get("/management/companies", response_model=list[str])
async def list_known_companies(
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Distinct list of companies that have at least one Station record.
    Feeds the fullAdmin user-management dropdowns. fullAdmin-only.
    """
    if not is_full_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="fullAdmin yetkisi gereklidir",
        )
    result = await romiot_db.execute(
        select(Station.company).distinct().order_by(Station.company)
    )
    return [row[0] for row in result.all() if row[0]]
```

- [ ] **Step 3: Manual smoke test**

Restart the dev server and call the endpoint with a fullAdmin token (use the auth flow's existing JWT). With curl:

```bash
curl -H "Cookie: access_token=<fullAdmin_token>" http://localhost:8000/romiot/station/management/companies
```

Expected: `200 OK` with a JSON array of distinct company strings, sorted.

Call again with a yönetici (non-fullAdmin) token: expect `403`.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "fullAdmin: add GET /management/companies endpoint"
```

---

## Task 5: Backend — extend `GET /stations/` for fullAdmin `?company=`

**Why:** The fullAdmin create form's "Atölye" select needs to list stations for an arbitrary company (selected by the form), not just the caller's company.

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Update the `list_stations` handler**

At [station.py:684-703](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L684), replace the function with:

```python
@router.get("/", response_model=list[StationList])
async def list_stations(
    company: str | None = None,
    current_user: User = Depends(check_authenticated),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    List stations.
    - fullAdmin: returns all stations, or stations for ?company=<name> when supplied.
    - Other atolye roles: scoped to caller's company; ?company is ignored.
    """
    if is_full_admin(current_user):
        stmt = select(Station)
        if company:
            stmt = stmt.where(Station.company == company)
        stations_result = await romiot_db.execute(stmt)
        return list(stations_result.scalars().all())

    from app.api.v1.endpoints.romiot.station.auth import get_station_company
    user_company = await get_station_company(current_user)
    stations_result = await romiot_db.execute(
        select(Station).where(Station.company == user_company)
    )
    return list(stations_result.scalars().all())
```

- [ ] **Step 2: Manual smoke test**

Call with a yönetici token without `?company`: expect their own company's stations.
Call with a fullAdmin token without `?company`: expect every station.
Call with a fullAdmin token and `?company=DIGINNO`: expect only DIGINNO stations.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "fullAdmin: GET /stations/ accepts ?company for cross-company queries"
```

---

## Task 6: Backend — widen `GET /management/users`

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Replace the handler**

At [station.py:253-347](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L253), replace `list_company_users` with:

```python
@router.get("/management/users", response_model=list[ManagedUserResponse])
async def list_company_users(
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    List atolye users.
    - fullAdmin: every user with at least one atolye:* role, across all companies.
    - Yönetici (non-fullAdmin): users whose PB company == yönetici's company,
      excluding any user carrying atolye:musteri.
    """
    full_admin = is_full_admin(current_user)
    if full_admin:
        user_company = None  # not used for filtering
    else:
        user_company = await check_station_yonetici_role(current_user)

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            auth_token = await _authenticate_pocketbase_admin(client)
            headers = {"Authorization": auth_token}

            all_pb_users: list[dict] = []
            page = 1
            total_pages = 1
            atolye_role_set = {
                "atolye:yonetici",
                "atolye:operator",
                "atolye:musteri",
                "atolye:satinalma",
            }
            while page <= total_pages:
                response = await client.get(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records",
                    params={"perPage": 200, "page": page, "sort": "name"},
                    headers=headers,
                )
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Kullanıcı listesi PocketBase'den alınamadı",
                    )

                payload = response.json()
                items = payload.get("items", [])
                for item in items:
                    item_role_values = item.get("role") if isinstance(item.get("role"), list) else []
                    has_atolye_role = any(
                        isinstance(r, str) and r in atolye_role_set for r in item_role_values
                    )
                    if not has_atolye_role:
                        continue
                    item_company = (item.get("company") or "").strip()
                    if full_admin:
                        all_pb_users.append(item)
                    else:
                        if item_company != user_company:
                            continue
                        is_musteri = any(
                            isinstance(r, str) and r == "atolye:musteri"
                            for r in item_role_values
                        )
                        if is_musteri:
                            continue
                        all_pb_users.append(item)
                total_pages = payload.get("totalPages", 1) or 1
                page += 1
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Kullanıcılar alınırken hata oluştu: {str(e)}",
        )

    usernames = [
        u.get("username") for u in all_pb_users
        if isinstance(u.get("username"), str) and u.get("username")
    ]

    pg_users_by_username: dict[str, PostgresUser] = {}
    if usernames:
        pg_users_result = await postgres_db.execute(
            select(PostgresUser).where(PostgresUser.username.in_(usernames))
        )
        for u in pg_users_result.scalars().all():
            pg_users_by_username[u.username] = u

    workshop_ids = {
        u.workshop_id for u in pg_users_by_username.values() if u.workshop_id is not None
    }
    station_name_by_id: dict[int, str] = {}
    if workshop_ids:
        stations_result = await romiot_db.execute(
            select(Station).where(Station.id.in_(workshop_ids))
        )
        station_name_by_id = {s.id: s.name for s in stations_result.scalars().all()}

    response_items: list[ManagedUserResponse] = []
    for pb_user in all_pb_users:
        username = pb_user.get("username", "")
        pg_user = pg_users_by_username.get(username)
        station_id = pg_user.workshop_id if pg_user else None
        station_name = station_name_by_id.get(station_id) if station_id else None
        extracted_role = _extract_atolye_role(pb_user.get("role"))
        item_company = (pb_user.get("company") or "").strip()

        response_items.append(
            ManagedUserResponse(
                pocketbase_id=pb_user.get("id", ""),
                username=username,
                name=pb_user.get("name"),
                email=pb_user.get("email"),
                role=extracted_role,
                station_id=station_id,
                station_name=station_name,
                company=item_company,
                is_self=username == current_user.username,
            )
        )

    return response_items
```

- [ ] **Step 2: Manual smoke test (yönetici-only)**

Set up two test users in PocketBase: a yönetici under company `WS_A`, and a müşteri whose `company=WS_A`. Call `/management/users` with the yönetici token. Expect: yönetici row present, müşteri row absent.

- [ ] **Step 3: Manual smoke test (fullAdmin)**

Call `/management/users` with a fullAdmin token. Expect: every atolye user, including müşteris and users from `WS_A`/`WS_B`/etc. Each row's `company` field reflects the PB record's `company`, not the caller's.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "fullAdmin: GET /management/users gates by role and reads per-row company"
```

---

## Task 7: Backend — extend `PUT /management/users/{id}` for fullAdmin

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Extend `ManagedUserUpdateRequest`**

At [station.py:66-82](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L66), replace the model with:

```python
class ManagedUserUpdateRequest(BaseModel):
    username: str | None = Field(None, min_length=1, description="Updated username")
    name: str | None = Field(None, min_length=1, description="Updated full name")
    password: str | None = Field(None, min_length=8, description="New password")
    password_confirm: str | None = Field(None, min_length=8, description="New password confirmation")
    role: ManagedUserRoleType | None = Field(None, description="Atolye role")
    station_id: int | None = Field(None, description="Station ID for operator role")
    company: str | None = Field(None, min_length=1, description="Owning workshop (fullAdmin only)")
    department: str | None = Field(None, min_length=1, description="Müşteri's customer name (fullAdmin only)")
    musteri_companies: list[str] | None = Field(
        None,
        description="Replacement target workshops for müşteri (fullAdmin only). When supplied, replaces every atolye:musteri_company:* entry.",
    )

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.password is not None or self.password_confirm is not None:
            if not self.password or not self.password_confirm:
                raise ValueError("Şifre güncelleme için şifre ve şifre tekrar birlikte girilmelidir")
            _validate_password_strength(self.password)
            if self.password != self.password_confirm:
                raise ValueError("Şifreler eşleşmiyor")
        if self.department is not None and ":" in self.department:
            raise ValueError("Müşteri adında ':' karakteri kullanılamaz")
        if self.musteri_companies is not None:
            for value in self.musteri_companies:
                if not isinstance(value, str) or not value.strip() or ":" in value:
                    raise ValueError("Geçersiz hedef atölye değeri")
        return self
```

- [ ] **Step 2: Rewrite the handler permission gate and role/department resolution**

Replace the handler body of `update_company_user` (entry through the PocketBase PATCH call). The block at [station.py:361-498](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L361) becomes:

```python
    full_admin = is_full_admin(current_user)
    if full_admin:
        user_company: str | None = None
    else:
        user_company = await check_station_yonetici_role(current_user)

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            auth_token = await _authenticate_pocketbase_admin(client)
            headers = {"Authorization": auth_token}

            target_response = await client.get(
                f"{settings.POCKETBASE_URL}/api/collections/users/records/{pocketbase_user_id}",
                headers=headers,
            )
            if target_response.status_code == 404:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kullanıcı bulunamadı")
            if target_response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Kullanıcı bilgisi PocketBase'den alınamadı",
                )

            target_pb_user = target_response.json()
            existing_role_values = (
                target_pb_user.get("role") if isinstance(target_pb_user.get("role"), list) else []
            )
            existing_company = (target_pb_user.get("company") or "").strip()
            existing_department = (target_pb_user.get("department") or "").strip()
            target_is_musteri = any(
                isinstance(r, str) and r == "atolye:musteri" for r in existing_role_values
            )

            if not full_admin:
                if existing_company != user_company:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bu kullanıcı sizin şirketinize ait değil",
                    )
                if target_is_musteri:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bu kullanıcı türünü düzenleme yetkiniz yok",
                    )

            old_username = target_pb_user.get("username", "")
            current_role = _extract_atolye_role(existing_role_values)
            new_role = user_data.role or current_role
            if not new_role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcının mevcut atölye rolü bulunamadı",
                )

            # Determine effective owning workshop
            effective_company: str
            if full_admin:
                effective_company = (user_data.company or existing_company).strip()
                if not effective_company:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Şirket boş olamaz",
                    )
            else:
                effective_company = user_company  # type: ignore[assignment]

            # Resolve postgres mirror & station assignment
            pg_user = None
            if old_username:
                pg_user = await UserService.get_user_by_username(postgres_db, old_username)

            requested_station_id = user_data.station_id
            station_id_for_db: int | None = None
            if new_role == ManagedUserRoleType.OPERATOR:
                if requested_station_id is not None:
                    station_id_for_db = requested_station_id
                elif pg_user and pg_user.workshop_id is not None:
                    station_id_for_db = pg_user.workshop_id
                if station_id_for_db is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Operatör rolü için atölye seçilmesi zorunludur",
                    )
            elif requested_station_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Yalnızca operatör rolü için atölye seçilebilir",
                )

            if station_id_for_db is not None:
                station_result = await romiot_db.execute(
                    select(Station).where(Station.id == station_id_for_db)
                )
                station = station_result.scalar_one_or_none()
                if not station:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"ID {station_id_for_db} ile atölye bulunamadı",
                    )
                if station.company != effective_company:
                    if full_admin and user_data.station_id is None:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Yeni şirkete ait atölye seçilmelidir",
                        )
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Bu atölye sizin şirketinize ait değil",
                    )

            new_username = user_data.username or old_username
            if not new_username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcı adı boş olamaz",
                )

            if new_username != old_username:
                check_username_response = await client.get(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records",
                    params={"filter": f'username="{new_username}"', "perPage": 1},
                    headers=headers,
                )
                if check_username_response.status_code == 200:
                    existing_items = check_username_response.json().get("items", [])
                    if existing_items and existing_items[0].get("id") != pocketbase_user_id:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"'{new_username}' kullanıcı adı zaten kullanılıyor",
                        )

                existing_pg_user_result = await postgres_db.execute(
                    select(PostgresUser).where(PostgresUser.username == new_username)
                )
                existing_pg_user = existing_pg_user_result.scalar_one_or_none()
                if existing_pg_user and (not pg_user or existing_pg_user.id != pg_user.id):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"'{new_username}' kullanıcı adı zaten kullanılıyor",
                    )

            # Build pb_roles
            pb_roles = [f"atolye:{new_role.value}"]
            if new_role == ManagedUserRoleType.MUSTERI:
                if full_admin and user_data.musteri_companies is not None:
                    for value in user_data.musteri_companies:
                        pb_roles.append(f"atolye:musteri_company:{value.strip()}")
                else:
                    for role in existing_role_values:
                        if isinstance(role, str) and role.startswith("atolye:musteri_company:"):
                            pb_roles.append(role)

            # Resolve department for payload
            if new_role == ManagedUserRoleType.MUSTERI:
                if full_admin and user_data.department is not None:
                    department_for_payload = user_data.department.strip()
                else:
                    department_for_payload = existing_department or effective_company
            else:
                department_for_payload = effective_company

            pb_payload: dict = {
                "username": new_username,
                "name": user_data.name if user_data.name is not None else target_pb_user.get("name", ""),
                "role": pb_roles,
                "department": department_for_payload,
                "company": effective_company,
            }
            if user_data.password:
                pb_payload["password"] = user_data.password
                pb_payload["passwordConfirm"] = user_data.password_confirm

            update_pb_response = await client.patch(
                f"{settings.POCKETBASE_URL}/api/collections/users/records/{pocketbase_user_id}",
                json=pb_payload,
                headers=headers,
            )
            if update_pb_response.status_code not in (200, 201):
                error_detail = update_pb_response.text
                try:
                    error_json = update_pb_response.json()
                    error_message = error_json.get("message", error_detail)
                except Exception:
                    error_message = error_detail
                raise HTTPException(
                    status_code=update_pb_response.status_code,
                    detail=f"Kullanıcı PocketBase üzerinde güncellenemedi: {error_message}",
                )

            if not pg_user:
                pg_user = PostgresUser(
                    username=new_username,
                    name=pb_payload.get("name"),
                    workshop_id=station_id_for_db,
                )
                postgres_db.add(pg_user)
            else:
                pg_user.username = new_username
                if pb_payload.get("name") is not None:
                    pg_user.name = pb_payload.get("name")
                pg_user.workshop_id = station_id_for_db

            await postgres_db.commit()
            await postgres_db.refresh(pg_user)

            station_name = None
            if pg_user.workshop_id:
                station_result = await romiot_db.execute(
                    select(Station).where(Station.id == pg_user.workshop_id)
                )
                station_obj = station_result.scalar_one_or_none()
                station_name = station_obj.name if station_obj else None

            return ManagedUserResponse(
                pocketbase_id=pocketbase_user_id,
                username=new_username,
                name=pb_payload.get("name"),
                email=target_pb_user.get("email"),
                role=new_role,
                station_id=pg_user.workshop_id,
                station_name=station_name,
                company=effective_company,
                is_self=new_username == current_user.username,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Kullanıcı güncellenirken hata oluştu: {str(e)}",
        )
```

- [ ] **Step 2: Manual smoke test (yönetici-only)**

As a yönetici, PUT a müşteri target's id: expect `403 "Bu kullanıcı türünü düzenleme yetkiniz yok"`.
As a yönetici, PUT one of your operators with a name change: expect `200`, name updated.

- [ ] **Step 3: Manual smoke test (fullAdmin)**

As fullAdmin, PUT a müşteri user with body `{"name": "X", "department": "ACME-2", "musteri_companies": ["DIGINNO", "OTHER_WS"]}`: expect `200`, PB record now has `name=X`, `department=ACME-2`, `role=["atolye:musteri","atolye:musteri_company:DIGINNO","atolye:musteri_company:OTHER_WS"]`.

PUT the same müşteri with body `{"name": "Y"}` (no `musteri_companies`): expect `200`, role list preserved verbatim from previous step.

PUT an operator with body `{"company": "WS_B"}` (and no station_id) when their existing station belongs to `WS_A`: expect `400 "Yeni şirkete ait atölye seçilmelidir"`.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "fullAdmin: PUT /management/users supports cross-company edit + musteri targets"
```

---

## Task 8: Backend — `POST /management/users` (fullAdmin create)

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Add the request schema and handler**

Insert after the `update_company_user` handler (and before `list_known_companies` from Task 4):

```python
class FullAdminUserCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    name: str = Field(..., min_length=1, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, description="Password")
    password_confirm: str = Field(..., min_length=8, description="Password confirmation")
    role: ManagedUserRoleType = Field(..., description="yonetici / musteri / operator / satinalma")
    company: str = Field(..., min_length=1, description="Owning workshop")
    department: str | None = Field(None, description="Müşteri's customer name (required for musteri)")
    station_id: int | None = Field(None, description="Required for operator")
    musteri_companies: list[str] | None = Field(
        None, description="Optional target workshops (musteri only)"
    )

    @model_validator(mode="after")
    def validate(self):
        _validate_password_strength(self.password)
        if self.password != self.password_confirm:
            raise ValueError("Şifreler eşleşmiyor")
        if self.role == ManagedUserRoleType.OPERATOR and not self.station_id:
            raise ValueError("Operatör rolü için atölye seçilmesi zorunludur")
        if self.role != ManagedUserRoleType.OPERATOR and self.station_id is not None:
            raise ValueError("Sadece operatör rolü için atölye seçilebilir")
        if self.role == ManagedUserRoleType.MUSTERI:
            if not self.department or not self.department.strip():
                raise ValueError("Müşteri rolü için müşteri adı zorunludur")
            if ":" in self.department:
                raise ValueError("Müşteri adında ':' karakteri kullanılamaz")
        if self.musteri_companies is not None:
            if self.role != ManagedUserRoleType.MUSTERI:
                raise ValueError("Hedef atölyeler sadece müşteri rolü için seçilebilir")
            for value in self.musteri_companies:
                if not isinstance(value, str) or not value.strip() or ":" in value:
                    raise ValueError("Geçersiz hedef atölye değeri")
        return self


@router.post("/management/users", response_model=dict, status_code=status.HTTP_201_CREATED)
async def full_admin_create_user(
    user_data: FullAdminUserCreateRequest,
    current_user: User = Depends(check_authenticated),
    postgres_db: AsyncSession = Depends(get_postgres_db),
    romiot_db: AsyncSession = Depends(get_romiot_db),
):
    """
    Create any atolye user. fullAdmin-only.
    """
    if not is_full_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="fullAdmin yetkisi gereklidir",
        )

    company = user_data.company.strip()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Şirket boş olamaz",
        )

    station_id_for_db: int | None = None
    if user_data.role == ManagedUserRoleType.OPERATOR:
        station_result = await romiot_db.execute(
            select(Station).where(Station.id == user_data.station_id)
        )
        station = station_result.scalar_one_or_none()
        if not station:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ID {user_data.station_id} ile atölye bulunamadı",
            )
        if station.company != company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu atölye seçilen şirkete ait değil",
            )
        station_id_for_db = user_data.station_id

    existing_pg_result = await postgres_db.execute(
        select(PostgresUser).where(PostgresUser.username == user_data.username)
    )
    if existing_pg_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{user_data.username}' kullanıcı adı zaten kullanılıyor",
        )

    role_values = [f"atolye:{user_data.role.value}"]
    if user_data.role == ManagedUserRoleType.MUSTERI and user_data.musteri_companies:
        for value in user_data.musteri_companies:
            role_values.append(f"atolye:musteri_company:{value.strip()}")

    if user_data.role == ManagedUserRoleType.MUSTERI:
        target_department = user_data.department.strip()  # type: ignore[union-attr]
    else:
        target_department = company

    try:
        pb_user_id = await _pb_create_user_record(
            username=user_data.username,
            email=user_data.email,
            password=user_data.password,
            password_confirm=user_data.password_confirm,
            name=user_data.name,
            role=role_values,
            department=target_department,
            company=company,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PocketBase'de kullanıcı oluşturulurken hata oluştu: {str(e)}",
        )

    new_user = PostgresUser(
        username=user_data.username,
        name=user_data.name,
        workshop_id=station_id_for_db,
    )
    postgres_db.add(new_user)
    await postgres_db.commit()
    await postgres_db.refresh(new_user)

    return {
        "id": new_user.id,
        "pocketbase_id": pb_user_id,
        "username": new_user.username,
        "name": new_user.name,
        "email": user_data.email,
        "role": role_values[0],
        "company": company,
        "department": target_department,
        "station_id": new_user.workshop_id,
        "musteri_companies": user_data.musteri_companies or [],
    }
```

- [ ] **Step 2: Manual smoke test (yönetici)**

POST `/management/users` as a yönetici (no fullAdmin role): expect `403 "fullAdmin yetkisi gereklidir"`.

- [ ] **Step 3: Manual smoke test (fullAdmin — müşteri)**

POST `/management/users` as fullAdmin with:

```json
{
  "username": "musteri_test",
  "name": "Test Müşteri",
  "email": "musteri_test@example.com",
  "password": "Aa1!aaaa",
  "password_confirm": "Aa1!aaaa",
  "role": "musteri",
  "company": "WS_A",
  "department": "ACME",
  "musteri_companies": ["WS_A", "WS_B"]
}
```

Expect `201`. Verify in PB: `company=WS_A`, `department=ACME`, `role=["atolye:musteri","atolye:musteri_company:WS_A","atolye:musteri_company:WS_B"]`.

- [ ] **Step 4: Manual smoke test (fullAdmin — operator)**

POST with role=operator + station_id under WS_B + company=WS_B: expect `201`, PB record with `company=WS_B`, `department=WS_B`, role `["atolye:operator"]`.

POST with operator role and station_id from WS_A but `company=WS_B`: expect `403 "Bu atölye seçilen şirkete ait değil"`.

- [ ] **Step 5: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "fullAdmin: POST /management/users for cross-role/cross-company create"
```

---

## Task 9: Frontend — yönetici page operator-only creation

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx`

- [ ] **Step 1: Narrow `userFormData` state**

At [yonetici/page.tsx:39-48](dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx#L39), replace:

```tsx
  const [userFormData, setUserFormData] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    password_confirm: "",
    musteri_department: "",
    station_id: "",
    role: "operator" as "musteri" | "operator",
  });
```

with:

```tsx
  const [userFormData, setUserFormData] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    password_confirm: "",
    station_id: "",
  });
```

- [ ] **Step 2: Simplify `handleCreateUser`**

At [yonetici/page.tsx:119-191](dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx#L119), replace the function body with:

```tsx
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setYoneticiLoading(true);
    setYoneticiError(null);
    setYoneticiSuccess(null);

    try {
      const pwError = validatePassword(userFormData.password);
      if (pwError) {
        setYoneticiError(pwError);
        setYoneticiLoading(false);
        return;
      }
      if (userFormData.password !== userFormData.password_confirm) {
        setYoneticiError("Şifreler eşleşmiyor");
        setYoneticiLoading(false);
        return;
      }
      const stationIdNum = parseInt(userFormData.station_id, 10);
      if (isNaN(stationIdNum)) {
        setYoneticiError("Geçerli bir atölye seçiniz");
        setYoneticiLoading(false);
        return;
      }

      await api.post("/romiot/station/stations/user", {
        username: userFormData.username,
        name: userFormData.name,
        email: userFormData.email,
        password: userFormData.password,
        password_confirm: userFormData.password_confirm,
        role: "operator",
        station_id: stationIdNum,
      });

      setYoneticiSuccess("Kullanıcı başarıyla oluşturuldu");
      setUserFormData({
        username: "",
        name: "",
        email: "",
        password: "",
        password_confirm: "",
        station_id: "",
      });
    } catch (err: any) {
      let errorMessage = "Kullanıcı oluşturulurken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setYoneticiError(errorMessage);
    } finally {
      setYoneticiLoading(false);
    }
  };
```

- [ ] **Step 3: Drop the role select and the conditional Atölye/Şirket fields**

In the JSX (the Create User Form section, around [yonetici/page.tsx:291-422](dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx#L291)), replace the entire form's inner inputs with this static operator-only layout:

```tsx
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Yeni Operatör Oluştur</h2>
            <form onSubmit={handleCreateUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı *</label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                  <input
                    type="text"
                    value={userFormData.name}
                    onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">E-posta *</label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre *</label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre Tekrar *</label>
                  <input
                    type="password"
                    value={userFormData.password_confirm}
                    onChange={(e) => setUserFormData({ ...userFormData, password_confirm: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Atölye *</label>
                  <select
                    value={userFormData.station_id}
                    onChange={(e) => setUserFormData({ ...userFormData, station_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading || stations.length === 0}
                  >
                    <option value="">Atölye Seçiniz</option>
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>{station.name}{station.is_exit_station ? " (Çıkış)" : ""}</option>
                    ))}
                  </select>
                  {stations.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">Henüz atölye bulunmamaktadır</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şirket</label>
                  <input
                    type="text"
                    value={userCompany || ""}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                    readOnly
                    disabled
                  />
                  <p className="mt-1 text-xs text-gray-500">Operatör otomatik olarak şirketinize atanacaktır</p>
                </div>
                <button
                  type="submit"
                  disabled={yoneticiLoading || stations.length === 0}
                  className="w-full px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {yoneticiLoading ? "Oluşturuluyor..." : "Operatör Oluştur"}
                </button>
              </div>
            </form>
          </div>
```

- [ ] **Step 4: Manual smoke test**

`pnpm --filter dtfrontend dev`. Log in as a yönetici and visit `/<platform>/atolye/yonetici`. Confirm:
- The user-creation card title is "Yeni Operatör Oluştur".
- No "Rol" field, no "Müşteri" anywhere.
- Submitting a valid operator works as before.

- [ ] **Step 5: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx
git commit -m "fullAdmin: yönetici page creates operators only"
```

---

## Task 10: Frontend — kullanici-yonetimi role detection + listing changes

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

- [ ] **Step 1: Add fullAdmin detection and a companies fetch**

Just after the existing role-detection effect at [kullanici-yonetimi/page.tsx:90-94](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L90), introduce two new pieces of state and a parallel detection.

Replace the lines from the `isYonetici` state declaration through the role-detection effect with:

```tsx
  const [isYonetici, setIsYonetici] = useState(false);
  const [isFullAdmin, setIsFullAdmin] = useState(false);
  const [companies, setCompanies] = useState<string[]>([]);
  const [filterCompany, setFilterCompany] = useState("");

  useEffect(() => {
    const roles = (user?.role && Array.isArray(user.role)) ? user.role : [];
    setIsYonetici(roles.includes("atolye:yonetici"));
    setIsFullAdmin(roles.includes("fullAdmin:true"));
  }, [user]);

  const canAccess = isYonetici || isFullAdmin;
```

Replace every later reference to `isYonetici`-as-access-gate with `canAccess`. Concretely:
- The `if (!isYonetici)` guard around the fetch (around [kullanici-yonetimi/page.tsx:97](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L97)) becomes `if (!canAccess) return;`.
- The `useEffect` dependency `[isYonetici]` (around [kullanici-yonetimi/page.tsx:125](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L125)) becomes `[canAccess]`.
- The terminal access-denied early return (around [kullanici-yonetimi/page.tsx:227](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L227)) condition `if (!isYonetici)` becomes `if (!canAccess)`.

- [ ] **Step 2: Fetch companies for fullAdmin**

Inside `fetchData` (around [kullanici-yonetimi/page.tsx:96-121](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L96)), extend `Promise.all` so fullAdmin also pulls the company list:

```tsx
  const fetchData = async () => {
    if (!canAccess) return;
    try {
      setLoading(true);
      setError(null);
      const requests: Promise<unknown>[] = [
        api.get<ManagedUser[]>("/romiot/station/stations/management/users", undefined, { useCache: false }),
        api.get<Station[]>("/romiot/station/stations/", undefined, { useCache: false }),
      ];
      if (isFullAdmin) {
        requests.push(api.get<string[]>("/romiot/station/stations/management/companies", undefined, { useCache: false }));
      }
      const [usersData, stationsData, companiesData] = await Promise.all(requests) as [
        ManagedUser[] | undefined,
        Station[] | undefined,
        string[] | undefined,
      ];
      setUsers(usersData || []);
      setStations(stationsData || []);
      setCompanies(companiesData || []);
    } catch (err: any) {
      let message = "Kullanıcı verileri alınamadı";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          message = parsed.detail || message;
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 3: Defensively filter müşteri rows for yönetici-only**

Update the `filteredUsers` memo (around [kullanici-yonetimi/page.tsx:127-137](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L127)):

```tsx
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (!isFullAdmin && u.role === "musteri") return false;
      const matchesSearch = !q || [u.username, u.name || "", u.email || "", u.station_name || "", u.company || ""].some((v) =>
        v.toLowerCase().includes(q)
      );
      const matchesRole = !filterRole || u.role === filterRole;
      const matchesAtolye = !filterAtolye || (u.station_name || "").toLowerCase().includes(filterAtolye.toLowerCase());
      const matchesCompany = !filterCompany || (u.company || "").toLowerCase().includes(filterCompany.toLowerCase());
      return matchesSearch && matchesRole && matchesAtolye && matchesCompany;
    });
  }, [users, search, filterRole, filterAtolye, filterCompany, isFullAdmin]);
```

- [ ] **Step 4: Update the table head, filter row, and rows**

Replace the entire `<table>` block (around [kullanici-yonetimi/page.tsx:279-360](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L279)) with:

```tsx
            <table className="min-w-[700px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kullanıcı Adı</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">İsim</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Atölye</th>
                  {isFullAdmin && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Şirket</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">E-posta</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">İşlem</th>
                </tr>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">
                    <select
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="">Hepsi</option>
                      <option value="yonetici">Yönetici</option>
                      {isFullAdmin && <option value="musteri">Müşteri</option>}
                      <option value="operator">Operatör</option>
                      <option value="satinalma">Satınalma</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Filtrele..."
                      value={filterAtolye}
                      onChange={(e) => setFilterAtolye(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                    />
                  </td>
                  {isFullAdmin && (
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        placeholder="Filtrele..."
                        value={filterCompany}
                        onChange={(e) => setFilterCompany(e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={isFullAdmin ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                      Kullanıcı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.pocketbase_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {u.username}
                        {u.is_self && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">Siz</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.name || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.role ? ROLE_LABELS[u.role] : "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.station_name || "-"}</td>
                      {isFullAdmin && (
                        <td className="px-4 py-3 text-sm text-gray-800">{u.company || "-"}</td>
                      )}
                      <td className="px-4 py-3 text-sm text-gray-800">{u.email || "-"}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openEditModal(u)}
                          className="px-3 py-1.5 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-md text-sm"
                        >
                          Düzenle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
```

- [ ] **Step 5: Manual smoke test**

As yönetici-only: müşteri rows are absent; "Şirket" column hidden; Müşteri option missing from role filter.
As fullAdmin: see all users across companies; Şirket column visible and filterable; Müşteri option present.

- [ ] **Step 6: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
git commit -m "fullAdmin: role-gated listing with company column and filter"
```

---

## Task 11: Frontend — kullanici-yonetimi edit modal extensions

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

- [ ] **Step 1: Extend `EditFormData` and `openEditModal`**

At [kullanici-yonetimi/page.tsx:47-54](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L47), replace `EditFormData` with:

```tsx
interface EditFormData {
  username: string;
  name: string;
  role: RoleType;
  station_id: string;
  password: string;
  password_confirm: string;
  company: string;
  department: string;
  musteri_companies: string[];
}
```

At `formData` initial state and `closeEditModal` (around [kullanici-yonetimi/page.tsx:81-88](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L81) and [kullanici-yonetimi/page.tsx:154-164](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L154)), extend the object literals with `company: "", department: "", musteri_companies: []`.

In `openEditModal` (around [kullanici-yonetimi/page.tsx:139-152](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L139)), enrich the seeded form data:

```tsx
  const openEditModal = (target: ManagedUser) => {
    const role: RoleType = target.role || "musteri";
    setSelectedUser(target);
    setFormData({
      username: target.username,
      name: target.name || "",
      role,
      station_id: target.station_id ? String(target.station_id) : "",
      password: "",
      password_confirm: "",
      company: target.company || "",
      department: "",  // populated lazily below for müşteri targets
      musteri_companies: [],
    });
    setError(null);
    setSuccess(null);
  };
```

The current `ManagedUser` shape doesn't carry `department` or the existing `musteri_companies` list. We need them when editing a müşteri. Extend `ManagedUserResponse` to include them.

- [ ] **Step 2: Backend — extend `ManagedUserResponse`**

Open `dtbackend/app/api/v1/endpoints/romiot/station/station.py` and update [station.py:36-45](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L36):

```python
class ManagedUserResponse(BaseModel):
    pocketbase_id: str
    username: str
    name: str | None = None
    email: str | None = None
    role: ManagedUserRoleType | None = None
    station_id: int | None = None
    station_name: str | None = None
    company: str
    department: str | None = None
    musteri_companies: list[str] = []
    is_self: bool = False
```

In the `list_company_users` per-row build (Task 6), add to each `ManagedUserResponse(...)`:

```python
            department=(pb_user.get("department") or "").strip() or None,
            musteri_companies=_extract_musteri_companies_from_roles(pb_user.get("role")),
```

Do the same in the `update_company_user` final return (Task 7) — populate `department=department_for_payload, musteri_companies=[r.split(":",2)[2] for r in pb_roles if r.startswith("atolye:musteri_company:")]`.

Manual smoke test the GET endpoint: confirm `department` and `musteri_companies` populated for müşteri rows; null/empty for non-müşteri.

Commit after the backend tweak before continuing the frontend:

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "fullAdmin: ManagedUserResponse exposes department + musteri_companies"
```

- [ ] **Step 3: Update the frontend `ManagedUser` type**

At [kullanici-yonetimi/page.tsx:28-38](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L28):

```tsx
interface ManagedUser {
  pocketbase_id: string;
  username: string;
  name: string | null;
  email: string | null;
  role: RoleType | null;
  station_id: number | null;
  station_name: string | null;
  company: string;
  department: string | null;
  musteri_companies: string[];
  is_self: boolean;
}
```

Update `openEditModal` to seed the new fields:

```tsx
    setFormData({
      username: target.username,
      name: target.name || "",
      role,
      station_id: target.station_id ? String(target.station_id) : "",
      password: "",
      password_confirm: "",
      company: target.company || "",
      department: target.department || "",
      musteri_companies: target.musteri_companies || [],
    });
```

- [ ] **Step 4: Update `handleUpdateUser` to send fullAdmin fields**

Replace the function body's payload-building section (around [kullanici-yonetimi/page.tsx:166-225](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L166)):

```tsx
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        username: formData.username.trim(),
        name: formData.name.trim(),
        role: formData.role,
      };
      if (!payload.username) throw new Error("Kullanıcı adı boş olamaz");
      if (!payload.name) throw new Error("İsim boş olamaz");

      if (formData.role === "operator") {
        const stationId = parseInt(formData.station_id, 10);
        if (isNaN(stationId)) throw new Error("Operatör için atölye seçiniz");
        payload.station_id = stationId;
      }

      if (formData.password || formData.password_confirm) {
        if (!formData.password || !formData.password_confirm) {
          throw new Error("Şifre güncelleme için şifre ve tekrar alanlarını doldurun");
        }
        const pwError = validatePassword(formData.password);
        if (pwError) throw new Error(pwError);
        if (formData.password !== formData.password_confirm) {
          throw new Error("Şifreler eşleşmiyor");
        }
        payload.password = formData.password;
        payload.password_confirm = formData.password_confirm;
      }

      if (isFullAdmin) {
        if (!formData.company.trim()) throw new Error("Şirket seçiniz");
        payload.company = formData.company.trim();
        if (formData.role === "musteri") {
          if (!formData.department.trim()) throw new Error("Müşteri adı boş olamaz");
          if (formData.department.includes(":")) throw new Error("Müşteri adında ':' karakteri kullanılamaz");
          payload.department = formData.department.trim();
          payload.musteri_companies = formData.musteri_companies;
        }
      }

      await api.put<ManagedUser>(
        `/romiot/station/stations/management/users/${selectedUser.pocketbase_id}`,
        payload
      );

      setSuccess("Kullanıcı başarıyla güncellendi");
      closeEditModal();
      await fetchData();
    } catch (err: any) {
      let message = "Kullanıcı güncellenemedi";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          message = parsed.detail || message;
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 5: Update the modal JSX**

Replace the role `<select>` and the fields below it (the current Atölye/password block in the modal, around [kullanici-yonetimi/page.tsx:398-455](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L398)) with:

```tsx
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value as RoleType;
                      setFormData({
                        ...formData,
                        role: newRole,
                        station_id: newRole === "operator" ? formData.station_id : "",
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  >
                    <option value="yonetici">Yönetici</option>
                    {isFullAdmin && <option value="musteri">Müşteri</option>}
                    <option value="operator">Operatör</option>
                    <option value="satinalma">Satınalma</option>
                  </select>
                </div>

                {isFullAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Şirket (Sahip Atölye) *</label>
                    <select
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value, station_id: "" })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      required
                      disabled={saving}
                    >
                      <option value="">Şirket Seçiniz</option>
                      {companies.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Atölye {formData.role === "operator" ? "*" : ""}</label>
                  <select
                    value={formData.station_id}
                    onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    disabled={saving || formData.role !== "operator"}
                    required={formData.role === "operator"}
                  >
                    <option value="">Atölye Seçiniz</option>
                    {stations
                      .filter((s) => !isFullAdmin || !formData.company || s.company === formData.company)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.is_exit_station ? " (Çıkış)" : ""}
                        </option>
                      ))}
                  </select>
                </div>

                {isFullAdmin && formData.role === "musteri" && (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Müşteri Adı *</label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        required
                        disabled={saving}
                      />
                      <p className="mt-1 text-xs text-gray-500">QR'da "Gönderen Firma" olarak basılır.</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Atölyeler</label>
                      <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                        {companies.length === 0 ? (
                          <p className="text-sm text-gray-500">Sistemde kayıtlı atölye yok.</p>
                        ) : (
                          companies.map((c) => {
                            const checked = formData.musteri_companies.includes(c);
                            return (
                              <label key={c} className="flex items-center gap-2 py-1 text-sm text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? Array.from(new Set([...formData.musteri_companies, c]))
                                      : formData.musteri_companies.filter((x) => x !== c);
                                    setFormData({ ...formData, musteri_companies: next });
                                  }}
                                  disabled={saving}
                                />
                                <span>{c}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">Müşterinin barkod oluşturabileceği hedef atölyeler. Boş bırakılabilir; müşteri eklenmeden barkod oluşturamaz.</p>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Yeni Şifre</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    minLength={8}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Yeni Şifre Tekrar</label>
                  <input
                    type="password"
                    value={formData.password_confirm}
                    onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    minLength={8}
                    disabled={saving}
                  />
                </div>
```

- [ ] **Step 6: Manual smoke test**

As fullAdmin, edit a müşteri user. Toggle target workshops, change "Müşteri Adı", change "Şirket". Save. Reopen — values stick. Verify in PB.

As yönetici-only, edit one of your operators: company/department/multiselect fields are absent; existing flow still works.

- [ ] **Step 7: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
git commit -m "fullAdmin: edit modal supports cross-company + multiselect targets"
```

---

## Task 12: Frontend — kullanici-yonetimi create modal (fullAdmin)

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

- [ ] **Step 1: Add create-modal state and helpers**

Below the existing form-state block (around [kullanici-yonetimi/page.tsx:80-88](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L80)) add:

```tsx
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    password_confirm: "",
    role: "operator" as RoleType,
    company: "",
    department: "",
    station_id: "",
    musteri_companies: [] as string[],
  });

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateForm({
      username: "",
      name: "",
      email: "",
      password: "",
      password_confirm: "",
      role: "operator",
      company: "",
      department: "",
      station_id: "",
      musteri_companies: [],
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (!createForm.username.trim()) throw new Error("Kullanıcı adı boş olamaz");
      if (!createForm.name.trim()) throw new Error("İsim boş olamaz");
      if (!createForm.email.trim()) throw new Error("E-posta boş olamaz");
      const pwError = validatePassword(createForm.password);
      if (pwError) throw new Error(pwError);
      if (createForm.password !== createForm.password_confirm) throw new Error("Şifreler eşleşmiyor");
      if (!createForm.company.trim()) throw new Error("Şirket seçiniz");

      const payload: any = {
        username: createForm.username.trim(),
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        password_confirm: createForm.password_confirm,
        role: createForm.role,
        company: createForm.company.trim(),
      };
      if (createForm.role === "operator") {
        const sid = parseInt(createForm.station_id, 10);
        if (isNaN(sid)) throw new Error("Operatör için atölye seçiniz");
        payload.station_id = sid;
      }
      if (createForm.role === "musteri") {
        if (!createForm.department.trim()) throw new Error("Müşteri adı boş olamaz");
        if (createForm.department.includes(":")) throw new Error("Müşteri adında ':' karakteri kullanılamaz");
        payload.department = createForm.department.trim();
        payload.musteri_companies = createForm.musteri_companies;
      }

      await api.post("/romiot/station/stations/management/users", payload);
      setSuccess("Kullanıcı başarıyla oluşturuldu");
      closeCreateModal();
      await fetchData();
    } catch (err: any) {
      let message = "Kullanıcı oluşturulamadı";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          message = parsed.detail || message;
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 2: Add the "Yeni Kullanıcı Oluştur" button to the page header**

Replace the page header (the flex row that today contains the title and the "Geri Dön" button, around [kullanici-yonetimi/page.tsx:241-252](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L241)):

```tsx
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Kullanıcı Yönetimi</h1>
            <p className="text-gray-600 mt-1">
              {isFullAdmin ? "Tüm şirketlerdeki kullanıcıları yönetin" : "Şirketinizdeki kullanıcıları yönetin"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isFullAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg transition-colors"
              >
                Yeni Kullanıcı Oluştur
              </button>
            )}
            <button
              onClick={() => router.push(`/${platform}/atolye`)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
            >
              Geri Dön
            </button>
          </div>
        </div>
```

- [ ] **Step 3: Render the create modal via portal**

Below the existing edit-modal portal block (after the closing `)}` at [kullanici-yonetimi/page.tsx:478](dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx#L478) but before the final `</div>`):

```tsx
      {showCreateModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30 overflow-y-auto p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="bg-gradient-to-r from-[#0f4c3a] to-[#1a6a52] px-6 py-4">
              <h3 className="text-xl font-bold text-white">Yeni Kullanıcı Oluştur</h3>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı *</label>
                  <input
                    type="text"
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">E-posta *</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre *</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre Tekrar *</label>
                  <input
                    type="password"
                    value={createForm.password_confirm}
                    onChange={(e) => setCreateForm({ ...createForm, password_confirm: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => {
                      const newRole = e.target.value as RoleType;
                      setCreateForm({
                        ...createForm,
                        role: newRole,
                        station_id: newRole === "operator" ? createForm.station_id : "",
                        department: newRole === "musteri" ? createForm.department : "",
                        musteri_companies: newRole === "musteri" ? createForm.musteri_companies : [],
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  >
                    <option value="yonetici">Yönetici</option>
                    <option value="musteri">Müşteri</option>
                    <option value="operator">Operatör</option>
                    <option value="satinalma">Satınalma</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şirket (Sahip Atölye) *</label>
                  <select
                    value={createForm.company}
                    onChange={(e) => setCreateForm({ ...createForm, company: e.target.value, station_id: "" })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  >
                    <option value="">Şirket Seçiniz</option>
                    {companies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {createForm.role === "operator" && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Atölye *</label>
                    <select
                      value={createForm.station_id}
                      onChange={(e) => setCreateForm({ ...createForm, station_id: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      required
                      disabled={saving || !createForm.company}
                    >
                      <option value="">Atölye Seçiniz</option>
                      {stations
                        .filter((s) => !createForm.company || s.company === createForm.company)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.is_exit_station ? " (Çıkış)" : ""}
                          </option>
                        ))}
                    </select>
                    {!createForm.company && (
                      <p className="mt-1 text-xs text-gray-500">Önce şirket seçiniz.</p>
                    )}
                  </div>
                )}
                {createForm.role === "musteri" && (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Müşteri Adı *</label>
                      <input
                        type="text"
                        value={createForm.department}
                        onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        required
                        disabled={saving}
                      />
                      <p className="mt-1 text-xs text-gray-500">QR'da "Gönderen Firma" olarak basılır.</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Atölyeler</label>
                      <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                        {companies.length === 0 ? (
                          <p className="text-sm text-gray-500">Sistemde kayıtlı atölye yok.</p>
                        ) : (
                          companies.map((c) => {
                            const checked = createForm.musteri_companies.includes(c);
                            return (
                              <label key={c} className="flex items-center gap-2 py-1 text-sm text-gray-800">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? Array.from(new Set([...createForm.musteri_companies, c]))
                                      : createForm.musteri_companies.filter((x) => x !== c);
                                    setCreateForm({ ...createForm, musteri_companies: next });
                                  }}
                                  disabled={saving}
                                />
                                <span>{c}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">Müşterinin barkod oluşturabileceği hedef atölyeler. Boş bırakılabilir.</p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg"
                  disabled={saving}
                >
                  {saving ? "Oluşturuluyor..." : "Oluştur"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
```

- [ ] **Step 4: Manual smoke test**

As fullAdmin, click "Yeni Kullanıcı Oluştur":
- Create a yönetici under WS_A → row appears in list with company=WS_A.
- Create a müşteri (department=ACME, targets=[WS_A,WS_B]) → row appears, role=Müşteri, company=WS_A.
- Log in as that müşteri → on `/atolye/musteri`, "Hedef Firma" dropdown lists WS_A and WS_B.
- Create an operator under WS_B with a station from WS_B → row appears, station populated.

As yönetici-only, the button is absent; no alternate way to reach the modal.

- [ ] **Step 5: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
git commit -m "fullAdmin: kullanici-yonetimi create modal with target multiselect"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Backend — run the helper test scripts**

```bash
python dtbackend/test_full_admin_helper.py
python dtbackend/test_musteri_companies_helper.py
```

Expected: both print `OK` lines and exit 0.

- [ ] **Step 2: Backend — manual matrix walkthrough**

For each of the 5 endpoints touched, run the manual smoke tests already listed in Tasks 4–8. Each pair (yönetici-only vs fullAdmin) should match the expected outcomes. Note any deviation.

- [ ] **Step 3: Frontend — full UI run**

`pnpm --filter dtfrontend dev`. Sign in as each of:
- yönetici-only — yonetici page creates operators only; kullanici-yonetimi hides müşteri rows; no create button; no Şirket column.
- fullAdmin — kullanici-yonetimi shows all rows; Şirket column populated; filters work; create modal creates yönetici/müşteri/operator/satinalma successfully; edit modal updates müşteri targets and persists.
- newly-created müşteri — atolye/musteri page lists "Hedef Firma" matching the targets selected by fullAdmin. QR creation succeeds.

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git status
# fix anything outstanding from manual testing, commit if needed
```

---

## Self-review notes

The plan covers:
- **Yönetici hides müşteri:** Tasks 6 (server-side), 10 (client-side defense in depth).
- **Yönetici cannot create müşteri:** Tasks 3 (server narrowing), 9 (client form simplification).
- **fullAdmin sees all users:** Task 6.
- **fullAdmin creates müşteri with multiselect targets:** Tasks 4 (companies endpoint), 8 (POST endpoint), 12 (UI).
- **fullAdmin edits multi-target list symmetrically:** Tasks 7 (PUT extension), 11 (UI).
- **Companies source for the multiselect:** Task 4 (distinct `Station.company`).
- **Cross-company station picking for operator create:** Task 5 (`?company` on `/stations/`).
- **Tests:** Standalone helper test for `is_full_admin` (Task 1) plus the existing `test_musteri_companies_helper.py`. Endpoint behavior is covered by the in-task manual smoke checks since the project has no pytest harness.

Type/name consistency:
- `is_full_admin` is the helper name throughout backend tasks.
- `isFullAdmin` is the frontend state name throughout.
- `musteri_companies` is the field name in the request schemas, the response schema, the `EditFormData`, and the create form — same spelling everywhere.
- `effective_company` is local-only in Task 7 — not referenced in other tasks.
- `_pb_create_user_record` is reused by both `create_user_for_station` (Task 2) and `full_admin_create_user` (Task 8) with matching keyword args.
