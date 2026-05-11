# Firma Field + Bulk Hedef Firma Edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Şirket (Sahip Atölye)" dropdown with a single editable "Firma" text input that maps to PB `department`; restrict operator creation/editing in fullAdmin's kullanıcı yönetimi page; add bulk Hedef Firma edit for multiple müşteri users at once.

**Architecture:** Spec at [docs/superpowers/specs/2026-05-11-firma-bulk-edit-design.md](../specs/2026-05-11-firma-bulk-edit-design.md). Frontend collapses two form fields ("Şirket" dropdown + "Müşteri Adı" / inferred workshop) into one "Firma" text input. Backend stops requiring `company` on incoming payloads and writes `company = department` on every create/update, leaving the existing yönetici-scoping filter (`company == user_company`) untouched. A new `PATCH /management/users/bulk-musteri-companies` endpoint handles bulk replacement/addition of `atolye:musteri_company:*` roles per müşteri.

**Tech Stack:** FastAPI + Pydantic v2 + SQLAlchemy async on the backend. PocketBase HTTP API for user record mutations. Next.js (app router) + TypeScript + Tailwind on the frontend.

---

## File Structure

**Backend** (`dtbackend/app/api/v1/endpoints/romiot/station/`):
- `station.py` — sole backend surface. Changes:
  - `FullAdminUserCreateRequest`: `company` → optional, ignored by handler
  - `full_admin_create_user`: reject `role=operator`; derive `company = department` (or station's company for legacy non-müşteri callers without department)
  - `ManagedUserUpdateRequest`: keep `company` field for backward compat but mark deprecated/ignored
  - `update_company_user`: lock Firma + role for operators; derive `company = department` for non-operators
  - new `BulkMusteriCompaniesMode` enum + `BulkMusteriCompaniesRequest` schema + `bulk_musteri_companies` endpoint

**Frontend** (`dtfrontend/src/app/[platform]/atolye/`):
- `kullanici-yonetimi/page.tsx` — sole frontend surface. Changes:
  - New bulk-selection state (`selectedMusteriIds: Set<string>`)
  - Listing: leftmost checkbox column (müşteri rows only), toolbar above the table when ≥1 selected, header column rename "Şirket" → "Firma"
  - New bulk modal (`showBulkModal`, `bulkSelectedCompanies`, `bulkMode`) + JSX + submit handler hitting the new endpoint
  - Edit modal: drop "Şirket (Sahip Atölye)" `<select>`, drop "Müşteri Adı" duplicate input, add single "Firma" text input shown for every role; operator → Firma readOnly + role select disabled; rename "Hedef Atölyeler" → "Hedef Firmalar"
  - Create modal: drop "Operatör" option, drop "Şirket (Sahip Atölye)" `<select>`, single "Firma" text input shown for every remaining role, rename "Hedef Atölyeler" → "Hedef Firmalar"
  - Drop `company` from create/update payloads

No new files. No schema migrations. No new dependencies.

---

## Task 1: Backend — Update `FullAdminUserCreateRequest` schema

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Make `company` optional and reword its description**

Find `FullAdminUserCreateRequest` (currently around line 757). Replace the class with:

```python
class FullAdminUserCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    name: str = Field(..., min_length=1, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, description="Password")
    password_confirm: str = Field(..., min_length=8, description="Password confirmation")
    role: ManagedUserRoleType = Field(..., description="yonetici / musteri / satinalma (operator rejected by handler)")
    company: str | None = Field(
        None,
        description="Deprecated: ignored on input. Backend writes company = department.",
    )
    department: str = Field(..., min_length=1, description="Firma (saves to PB department; mirrored to PB company)")
    station_id: int | None = Field(None, description="Required for operator role — but operator is rejected by handler")
    musteri_companies: list[str] | None = Field(
        None, description="Optional target firmalar (musteri only)"
    )

    @model_validator(mode="after")
    def validate(self):
        _validate_password_strength(self.password)
        if self.password != self.password_confirm:
            raise ValueError("Şifreler eşleşmiyor")
        if not self.department.strip():
            raise ValueError("Firma boş olamaz")
        if ":" in self.department:
            raise ValueError("Firma adında ':' karakteri kullanılamaz")
        if self.role == ManagedUserRoleType.OPERATOR:
            raise ValueError("Operatör kullanıcıları bu uçtan oluşturulamaz; yönetici sayfasını kullanın.")
        if self.station_id is not None:
            raise ValueError("station_id gönderilmemelidir")
        if self.musteri_companies is not None:
            if self.role != ManagedUserRoleType.MUSTERI:
                raise ValueError("Hedef firmalar sadece müşteri rolü için seçilebilir")
            for value in self.musteri_companies:
                if not isinstance(value, str) or not value.strip() or ":" in value:
                    raise ValueError("Geçersiz hedef firma değeri")
        return self
```

Key changes vs the existing schema:
- `company` becomes optional, marked deprecated
- `department` becomes REQUIRED (was optional only for müşteri)
- Operator rejected at schema level
- `station_id` rejected at schema level (operator goes through yönetici page exclusively)
- "Müşteri adı" terminology becomes "Firma" in error messages
- `musteri_companies` validation unchanged

- [ ] **Step 2: Smoke test the schema**

Run from `c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtbackend`:

```
python -c "from app.api.v1.endpoints.romiot.station.station import FullAdminUserCreateRequest; m = FullAdminUserCreateRequest(username='u', name='N', email='u@x.com', password='Aa1!aaaa', password_confirm='Aa1!aaaa', role='musteri', department='ACME', musteri_companies=['WS1']); print(m.role, m.department, m.company)"
```
Expected: `ManagedUserRoleType.MUSTERI ACME None`.

Run:
```
python -c "from app.api.v1.endpoints.romiot.station.station import FullAdminUserCreateRequest; FullAdminUserCreateRequest(username='u', name='N', email='u@x.com', password='Aa1!aaaa', password_confirm='Aa1!aaaa', role='operator', department='X')"
```
Expected: ValidationError mentioning `"Operatör kullanıcıları bu uçtan oluşturulamaz"`.

Run:
```
python -c "from app.api.v1.endpoints.romiot.station.station import FullAdminUserCreateRequest; FullAdminUserCreateRequest(username='u', name='N', email='u@x.com', password='Aa1!aaaa', password_confirm='Aa1!aaaa', role='yonetici', department='')"
```
Expected: ValidationError mentioning `"Firma boş olamaz"` (or pydantic's `min_length` complaint — either accepted).

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "firma: FullAdminUserCreateRequest drops required company, rejects operator"
```

---

## Task 2: Backend — Update `full_admin_create_user` handler

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Simplify the handler body**

Find `full_admin_create_user` (currently around line 794). Replace EVERYTHING from the line `if not is_full_admin(current_user):` through the closing `}` of the final `return {...}` with this body (the decorator and function signature stay unchanged):

```python
    if not is_full_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="fullAdmin yetkisi gereklidir",
        )

    # Firma = department (mirrored to company on the PB record)
    firma = user_data.department.strip()
    if not firma:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Firma boş olamaz",
        )

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
        seen: set[str] = set()
        for value in user_data.musteri_companies:
            norm = value.strip()
            if norm and norm not in seen:
                seen.add(norm)
                role_values.append(f"atolye:musteri_company:{norm}")

    try:
        pb_user_id = await _pb_create_user_record(
            username=user_data.username,
            email=user_data.email,
            password=user_data.password,
            password_confirm=user_data.password_confirm,
            name=user_data.name,
            role=role_values,
            department=firma,
            company=firma,
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
        workshop_id=None,
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
        "company": firma,
        "department": firma,
        "station_id": None,
        "musteri_companies": user_data.musteri_companies or [],
    }
```

Key changes vs the existing handler:
- All station-resolution logic is removed (operator now rejected by schema)
- `station_id_for_db` is always `None` (operator unreachable here)
- `company = firma` mirror — both PB fields get the same value
- Returns the same response shape; `station_id` is always `None`

- [ ] **Step 2: Smoke test the import**

Run from `c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtbackend`:
```
python -c "from app.api.v1.endpoints.romiot.station.station import full_admin_create_user, router; print('OK')"
```
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "firma: full_admin_create_user uses department as Firma, mirrors to company"
```

---

## Task 3: Backend — Update `update_company_user` handler

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Add operator-edit restrictions and the firma mirror**

Find `update_company_user` (currently around line 493). The function body is long; we're patching three specific regions.

**Region A — `effective_company` resolution** (currently around lines 564-574). Find this block:

```python
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
```

Replace it with:

```python
            # Firma (department) = effective company; mirrored to PB company on write.
            # Operators: locked to existing department. Non-operators: editable via user_data.department.
            target_is_operator = any(
                isinstance(r, str) and r == "atolye:operator" for r in existing_role_values
            )
            if full_admin and target_is_operator:
                if user_data.department is not None and user_data.department.strip() != existing_department:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Operatör için Firma bilgisi düzenlenemez",
                    )
                if user_data.role is not None and user_data.role != ManagedUserRoleType.OPERATOR:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Operatör rolü değiştirilemez.",
                    )
                effective_company = existing_department or existing_company
            elif full_admin:
                effective_company = (
                    (user_data.department or existing_department or existing_company).strip()
                )
                if not effective_company:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Firma boş olamaz",
                    )
                if ":" in effective_company:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Firma adında ':' karakteri kullanılamaz",
                    )
            else:
                effective_company = user_company  # type: ignore[assignment]
```

**Region B — `department_for_payload` resolution** (currently around lines 670-677). Find:

```python
            # Resolve department for payload
            if new_role == ManagedUserRoleType.MUSTERI:
                if full_admin and user_data.department is not None:
                    department_for_payload = user_data.department.strip()
                else:
                    department_for_payload = existing_department or effective_company
            else:
                department_for_payload = effective_company
```

Replace with:

```python
            # Department mirrors Firma. For operators, locked to existing value.
            # For non-operators under fullAdmin, takes user_data.department if supplied; otherwise effective_company.
            if target_is_operator:
                department_for_payload = existing_department or effective_company
            elif full_admin and user_data.department is not None:
                department_for_payload = user_data.department.strip()
            else:
                department_for_payload = effective_company
```

**Region C — final `pb_payload`** (currently around lines 679-685). The block:

```python
            pb_payload: dict = {
                "username": new_username,
                "name": user_data.name if user_data.name is not None else target_pb_user.get("name", ""),
                "role": pb_roles,
                "department": department_for_payload,
                "company": effective_company,
            }
```

Change `"company": effective_company,` to `"company": department_for_payload,` so the two PB fields are always equal:

```python
            pb_payload: dict = {
                "username": new_username,
                "name": user_data.name if user_data.name is not None else target_pb_user.get("name", ""),
                "role": pb_roles,
                "department": department_for_payload,
                "company": department_for_payload,
            }
```

Also update the final `return ManagedUserResponse(...)` (currently around lines 731-747) — change `company=effective_company,` to `company=department_for_payload,`:

```python
            return ManagedUserResponse(
                pocketbase_id=pocketbase_user_id,
                username=new_username,
                name=pb_payload.get("name"),
                email=target_pb_user.get("email"),
                role=new_role,
                station_id=pg_user.workshop_id,
                station_name=station_name,
                company=department_for_payload,
                department=department_for_payload,
                musteri_companies=[
                    role.split(":", 2)[2]
                    for role in pb_roles
                    if role.startswith("atolye:musteri_company:")
                ],
                is_self=new_username == current_user.username,
            )
```

- [ ] **Step 2: Update `ManagedUserUpdateRequest` description for `company`**

Find `ManagedUserUpdateRequest` (currently around line 68). Find the `company` field:

```python
    company: str | None = Field(None, min_length=1, description="Owning workshop (fullAdmin only)")
```

Replace with:

```python
    company: str | None = Field(
        None,
        description="Deprecated: ignored on input. Backend writes company = department.",
    )
```

(Drop `min_length=1` so stale clients sending an empty string don't get a confusing 422.)

- [ ] **Step 3: Smoke test the import**

Run from `c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtbackend`:
```
python -c "from app.api.v1.endpoints.romiot.station.station import update_company_user, ManagedUserUpdateRequest; m = ManagedUserUpdateRequest(department='ACME'); print(m.department)"
```
Expected: prints `ACME`.

Run:
```
python -c "from app.api.v1.endpoints.romiot.station.station import ManagedUserUpdateRequest; ManagedUserUpdateRequest(department='bad:value')"
```
Expected: ValidationError mentioning `:` (this check is already in the existing `validate_request` validator; do not move it).

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "firma: PUT /management/users mirrors department→company, locks operator firma+role"
```

---

## Task 4: Backend — New `PATCH /management/users/bulk-musteri-companies` endpoint

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py`

- [ ] **Step 1: Add the request schema + enum**

Insert this block AFTER `FullAdminUserCreateRequest` and BEFORE `@router.post("/management/users", ...)` (around line 793):

```python
class BulkMusteriCompaniesMode(str, Enum):
    ADD = "add"
    REPLACE = "replace"


class BulkMusteriCompaniesRequest(BaseModel):
    user_ids: list[str] = Field(..., min_length=1, description="PocketBase user ids to update")
    companies: list[str] = Field(..., description="Target firmalar to apply")
    mode: BulkMusteriCompaniesMode = Field(..., description="add (merge) or replace (overwrite)")

    @model_validator(mode="after")
    def validate_companies(self):
        for c in self.companies:
            if not isinstance(c, str) or ":" in c:
                raise ValueError("Geçersiz hedef firma değeri")
        return self
```

(Note `Enum` is already imported at the top of `station.py` since `ManagedUserRoleType` uses it.)

- [ ] **Step 2: Add the endpoint handler**

Insert this handler AFTER `full_admin_create_user` (currently around line 897) and BEFORE `@router.get("/management/companies", ...)` (currently around line 900):

```python
@router.patch("/management/users/bulk-musteri-companies", response_model=dict)
async def bulk_musteri_companies(
    payload: BulkMusteriCompaniesRequest,
    current_user: User = Depends(check_authenticated),
):
    """
    Bulk update target firmalar (atolye:musteri_company:*) for multiple müşteri users.
    fullAdmin-only. Returns per-user succeeded/failed lists.
    """
    if not is_full_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="fullAdmin yetkisi gereklidir",
        )

    # Dedupe + normalize the requested companies
    seen: set[str] = set()
    normalized: list[str] = []
    for c in payload.companies:
        n = c.strip()
        if n and n not in seen:
            seen.add(n)
            normalized.append(n)

    succeeded: list[str] = []
    failed: list[dict] = []

    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        auth_token = await _authenticate_pocketbase_admin(client)
        headers = {"Authorization": auth_token}

        for user_id in payload.user_ids:
            try:
                get_resp = await client.get(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records/{user_id}",
                    headers=headers,
                )
                if get_resp.status_code != 200:
                    failed.append({"id": user_id, "detail": "Kullanıcı bulunamadı"})
                    continue

                pb_user = get_resp.json()
                role_values = pb_user.get("role") if isinstance(pb_user.get("role"), list) else []
                if "atolye:musteri" not in role_values:
                    failed.append({"id": user_id, "detail": "Müşteri olmayan kullanıcı atlandı"})
                    continue

                non_company_roles = [
                    r for r in role_values
                    if not (isinstance(r, str) and r.startswith("atolye:musteri_company:"))
                ]

                if payload.mode == BulkMusteriCompaniesMode.REPLACE:
                    targets = list(normalized)
                else:  # ADD
                    existing_targets = [
                        r.split(":", 2)[2]
                        for r in role_values
                        if isinstance(r, str) and r.startswith("atolye:musteri_company:")
                    ]
                    seen_local: set[str] = set()
                    targets = []
                    for t in (*existing_targets, *normalized):
                        if t and t not in seen_local:
                            seen_local.add(t)
                            targets.append(t)

                new_role_list = [*non_company_roles] + [
                    f"atolye:musteri_company:{t}" for t in targets
                ]

                patch_resp = await client.patch(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records/{user_id}",
                    json={"role": new_role_list},
                    headers=headers,
                )
                if patch_resp.status_code in (200, 201):
                    succeeded.append(user_id)
                else:
                    failed.append({"id": user_id, "detail": f"PocketBase güncelleme hatası ({patch_resp.status_code})"})
            except Exception as e:
                failed.append({"id": user_id, "detail": str(e)})

    return {"succeeded": succeeded, "failed": failed}
```

- [ ] **Step 3: Smoke test the imports**

Run from `c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtbackend`:
```
python -c "from app.api.v1.endpoints.romiot.station.station import bulk_musteri_companies, BulkMusteriCompaniesRequest, BulkMusteriCompaniesMode, router; print('OK')"
```
Expected: prints `OK`.

Run a schema test:
```
python -c "from app.api.v1.endpoints.romiot.station.station import BulkMusteriCompaniesRequest; m = BulkMusteriCompaniesRequest(user_ids=['u1','u2'], companies=['A','B'], mode='add'); print(m.mode, m.companies)"
```
Expected: `BulkMusteriCompaniesMode.ADD ['A', 'B']`.

Run a validation failure test:
```
python -c "from app.api.v1.endpoints.romiot.station.station import BulkMusteriCompaniesRequest; BulkMusteriCompaniesRequest(user_ids=['u1'], companies=['bad:value'], mode='replace')"
```
Expected: ValidationError mentioning `Geçersiz hedef firma değeri`.

- [ ] **Step 4: Commit**

```bash
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "firma: add bulk-musteri-companies PATCH endpoint for fullAdmin"
```

---

## Task 5: Frontend — Listing checkbox column + bulk toolbar + column rename

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

- [ ] **Step 1: Add bulk-selection state**

Find the `[filterCompany, setFilterCompany]` declaration (around line 86). Immediately after it (still inside the component, just after the role-detection effect and before any other logic), add:

```tsx
  const [selectedMusteriIds, setSelectedMusteriIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSelectedCompanies, setBulkSelectedCompanies] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<"add" | "replace">("add");
```

Place these together so they're easy to find later.

- [ ] **Step 2: Compute selected count + visible-müşteri set**

After `filteredUsers` (around line 161), add:

```tsx
  const visibleMusteriIds = useMemo(
    () => filteredUsers.filter((u) => u.role === "musteri").map((u) => u.pocketbase_id),
    [filteredUsers]
  );

  const allVisibleMusterisSelected =
    visibleMusteriIds.length > 0 && visibleMusteriIds.every((id) => selectedMusteriIds.has(id));
  const someVisibleMusterisSelected =
    visibleMusteriIds.some((id) => selectedMusteriIds.has(id)) && !allVisibleMusterisSelected;
```

- [ ] **Step 3: Add bulk-selection toggle helpers**

After the helpers from step 2, add:

```tsx
  const toggleMusteriSelected = (id: string) => {
    setSelectedMusteriIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisibleMusteris = (checked: boolean) => {
    setSelectedMusteriIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleMusteriIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const clearBulkSelection = () => setSelectedMusteriIds(new Set());
```

- [ ] **Step 4: Add the bulk toolbar JSX**

Find the success banner block (around line 396):

```tsx
        {success && (
          <div className="mb-4 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg text-green-700">
            {success}
          </div>
        )}
```

Insert this block AFTER it (before the search bar wrapper at line 402):

```tsx
        {isFullAdmin && selectedMusteriIds.size > 0 && (
          <div className="mb-4 p-3 bg-[#0f4c3a] text-white rounded-lg flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{selectedMusteriIds.size} müşteri seçili</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBulkSelectedCompanies([]);
                  setBulkMode("add");
                  setShowBulkModal(true);
                }}
                className="px-3 py-1.5 bg-white text-[#0f4c3a] hover:bg-gray-100 rounded-md text-sm font-medium"
              >
                Hedef Firmaları Düzenle
              </button>
              <button
                type="button"
                onClick={clearBulkSelection}
                className="px-3 py-1.5 bg-transparent border border-white/40 text-white hover:bg-white/10 rounded-md text-sm"
              >
                Seçimi Temizle
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 5: Add the leftmost checkbox column to the table**

Find the `<table>` block (around line 416). Replace the entire `<thead>` (the existing `<thead>...</thead>`) with:

```tsx
              <thead className="bg-gray-50">
                <tr>
                  {isFullAdmin && (
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        aria-label="Görünür müşterileri seç"
                        checked={allVisibleMusterisSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleMusterisSelected;
                        }}
                        onChange={(e) => toggleAllVisibleMusteris(e.target.checked)}
                        disabled={visibleMusteriIds.length === 0}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kullanıcı Adı</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">İsim</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Atölye</th>
                  {isFullAdmin && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Firma</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">E-posta</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">İşlem</th>
                </tr>
                <tr className="bg-gray-100 border-b border-gray-200">
                  {isFullAdmin && <td className="px-4 py-2" />}
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
```

Key changes from the existing thead:
- `<th>` for the new checkbox column at the leftmost position (only when fullAdmin)
- Header text "Şirket" → "Firma" (the col still maps to `u.company` field)
- A matching empty `<td>` in the filter row to keep column alignment

- [ ] **Step 6: Update the table body — add checkbox cell + colspan**

Replace the entire `<tbody>` block immediately following the `<thead>`:

```tsx
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={isFullAdmin ? 8 : 6} className="px-4 py-8 text-center text-gray-500">
                      Kullanıcı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.pocketbase_id} className="hover:bg-gray-50">
                      {isFullAdmin && (
                        <td className="px-4 py-3">
                          {u.role === "musteri" ? (
                            <input
                              type="checkbox"
                              aria-label={`${u.username} seç`}
                              checked={selectedMusteriIds.has(u.pocketbase_id)}
                              onChange={() => toggleMusteriSelected(u.pocketbase_id)}
                            />
                          ) : null}
                        </td>
                      )}
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
```

Key changes:
- New leftmost `<td>` rendering the per-row checkbox (only for fullAdmin & only for müşteri rows; non-müşteri rows render an empty cell)
- `colSpan={isFullAdmin ? 8 : 6}` accounts for the new column (was 7:6)

- [ ] **Step 7: Run TypeScript check**

```
cd c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtfrontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
git commit -m "firma: list-level müşteri bulk selection + toolbar + Firma column rename"
```

---

## Task 6: Frontend — Bulk modal + submit handler

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

- [ ] **Step 1: Add the bulk submit handler**

Find `closeCreateModal` (around line 210). Immediately after that function (before `handleCreateUser`), add:

```tsx
  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkSelectedCompanies([]);
    setBulkMode("add");
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMusteriIds.size === 0) return;
    if (bulkMode === "replace" && bulkSelectedCompanies.length === 0) {
      const confirmed = typeof window !== "undefined"
        ? window.confirm(`${selectedMusteriIds.size} müşterinin tüm hedef firmaları silinecek. Devam edilsin mi?`)
        : true;
      if (!confirmed) return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await api.patch<{ succeeded: string[]; failed: { id: string; detail: string }[] }>(
        "/romiot/station/stations/management/users/bulk-musteri-companies",
        {
          user_ids: Array.from(selectedMusteriIds),
          companies: bulkSelectedCompanies,
          mode: bulkMode,
        }
      );

      const okCount = resp?.succeeded?.length ?? 0;
      const failCount = resp?.failed?.length ?? 0;
      if (failCount > 0) {
        const sample = resp.failed.slice(0, 3).map((f) => `${f.id}: ${f.detail}`).join(" / ");
        setSuccess(`${okCount} müşteri güncellendi, ${failCount} başarısız (${sample})`);
      } else {
        setSuccess(`${okCount} müşteri için hedef firmalar güncellendi`);
      }
      clearBulkSelection();
      closeBulkModal();
      await fetchData();
    } catch (err: any) {
      let message = "Toplu güncelleme başarısız";
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

(Note: `api.patch` follows the same shape as `api.get/post/put` already used in this file. If `api.patch` isn't present on the api client, this step needs to use `api.post` with a method override OR add a `patch` method to the client. Verify before continuing — search `c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtfrontend/src/lib/api.ts` for the available verbs.)

- [ ] **Step 2: Verify api.patch exists**

Run:
```
grep -n "patch" c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtfrontend/src/lib/api.ts
```

If `patch` is not in the list of methods, add it before continuing. The minimal addition mirrors the existing `put` method — typically a one-line wrapper that forwards `method: "PATCH"` through the same fetch helper. Inspect the file's structure and add the missing verb consistently.

If `patch` is already there, skip ahead.

- [ ] **Step 3: Render the bulk modal portal**

Find the end of the create-modal portal block (around line 893):

```tsx
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
```

Insert the bulk-modal portal IMMEDIATELY before the final `</div>` of the page wrapper:

```tsx
      {showBulkModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30 overflow-y-auto p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="bg-gradient-to-r from-[#0f4c3a] to-[#1a6a52] px-6 py-4">
              <h3 className="text-xl font-bold text-white">Hedef Firmalar — Toplu Düzenleme</h3>
              <p className="text-sm text-white/80 mt-1">{selectedMusteriIds.size} müşteri seçili</p>
            </div>
            <form onSubmit={handleBulkSubmit} className="p-6 space-y-4">
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">Mod</span>
                <div className="flex flex-col gap-2 text-sm text-gray-800">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="bulkMode"
                      checked={bulkMode === "add"}
                      onChange={() => setBulkMode("add")}
                      disabled={saving}
                      className="mt-1"
                    />
                    <span>
                      <strong>Mevcuta ekle</strong>
                      <span className="block text-xs text-gray-500">
                        Seçili müşterilere bu firmaları ekler; mevcut hedef firmalar korunur.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="bulkMode"
                      checked={bulkMode === "replace"}
                      onChange={() => setBulkMode("replace")}
                      disabled={saving}
                      className="mt-1"
                    />
                    <span>
                      <strong>Mevcudu değiştir</strong>
                      <span className="block text-xs text-gray-500">
                        Seçili müşterilerin hedef firmaları tamamen bu listeyle değiştirilir.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">Firmalar</span>
                <div className="border border-gray-300 rounded-lg p-3 max-h-64 overflow-y-auto bg-white">
                  {companies.length === 0 ? (
                    <p className="text-sm text-gray-500">Sistemde kayıtlı firma yok.</p>
                  ) : (
                    companies.map((c) => {
                      const checked = bulkSelectedCompanies.includes(c);
                      return (
                        <label key={c} className="flex items-center gap-2 py-1 text-sm text-gray-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? Array.from(new Set([...bulkSelectedCompanies, c]))
                                : bulkSelectedCompanies.filter((x) => x !== c);
                              setBulkSelectedCompanies(next);
                            }}
                            disabled={saving}
                          />
                          <span>{c}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeBulkModal}
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
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
```

- [ ] **Step 4: Run TypeScript check**

```
cd c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtfrontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
# Also add lib/api.ts if step 2 modified it:
git add dtfrontend/src/lib/api.ts 2>/dev/null
git commit -m "firma: bulk Hedef Firmalar modal + submit handler"
```

---

## Task 7: Frontend — Edit modal refactor (Firma + operator restrictions + label renames)

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

- [ ] **Step 1: Simplify `handleUpdateUser` payload**

Find `handleUpdateUser` (around line 281). Replace the body — specifically the `try { ... }` block content — with:

```tsx
    try {
      const payload: any = {
        username: formData.username.trim(),
        name: formData.name.trim(),
        role: formData.role,
      };
      if (!payload.username) throw new Error("Kullanıcı adı boş olamaz");
      if (!payload.name) throw new Error("İsim boş olamaz");

      const targetIsOperator = selectedUser?.role === "operator";

      if (formData.role === "operator" || targetIsOperator) {
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
        if (!targetIsOperator) {
          if (!formData.department.trim()) throw new Error("Firma boş olamaz");
          if (formData.department.includes(":")) throw new Error("Firma adında ':' karakteri kullanılamaz");
          payload.department = formData.department.trim();
        }
        if (formData.role === "musteri") {
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
```

Key changes vs the existing handler:
- `payload.company` is no longer sent (backend derives `company = department`)
- `payload.department` is sent for any non-operator role under fullAdmin (was only for müşteri)
- Operator targets keep their existing department; we don't send `department` at all
- "Müşteri Adı / Müşteri adı" error strings become "Firma"

- [ ] **Step 2: Replace the role select + Şirket dropdown + Atölye select + Müşteri-only fields**

Find the edit modal JSX. Look for the Rol `<select>` block (around line 543). Replace EVERYTHING from that block through the end of the existing operator-only Atölye block AND the existing müşteri-only fields (down through the closing `)}` before "Yeni Şifre", around line 648) with:

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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white disabled:bg-gray-100"
                    required
                    disabled={saving || selectedUser?.role === "operator"}
                  >
                    <option value="yonetici">Yönetici</option>
                    {isFullAdmin && <option value="musteri">Müşteri</option>}
                    <option value="operator">Operatör</option>
                    <option value="satinalma">Satınalma</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Firma {selectedUser?.role === "operator" ? "" : "*"}
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 ${
                      selectedUser?.role === "operator" ? "bg-gray-100 cursor-not-allowed" : "bg-white"
                    }`}
                    required={selectedUser?.role !== "operator"}
                    disabled={saving}
                    readOnly={selectedUser?.role === "operator"}
                  />
                  {formData.role === "musteri" && (
                    <p className="mt-1 text-xs text-gray-500">QR'da "Gönderen Firma" olarak basılır.</p>
                  )}
                  {selectedUser?.role === "operator" && (
                    <p className="mt-1 text-xs text-gray-500">Operatör için Firma düzenlenemez.</p>
                  )}
                </div>

                {selectedUser?.role === "operator" && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Atölye *</label>
                    <select
                      value={formData.station_id}
                      onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      required
                      disabled={saving}
                    >
                      <option value="">Atölye Seçiniz</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.is_exit_station ? " (Çıkış)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isFullAdmin && formData.role === "musteri" && selectedUser?.role !== "operator" && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Firmalar</label>
                    <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                      {companies.length === 0 ? (
                        <p className="text-sm text-gray-500">Sistemde kayıtlı firma yok.</p>
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
                    <p className="mt-1 text-xs text-gray-500">Müşterinin barkod oluşturabileceği hedef firmalar. Boş bırakılabilir; müşteri eklenmeden barkod oluşturamaz.</p>
                  </div>
                )}
```

Key changes vs the existing block:
- Removed the entire "Şirket (Sahip Atölye)" `<select>` block
- Removed the old separate "Müşteri Adı" `<input>` (now folded into the universal Firma input)
- Role `<select>` becomes disabled when the existing user is an operator
- New Firma `<input>` shown for every role; readOnly+grey for operators
- The operator-only Atölye `<select>` no longer filters by company (operator's firma is locked anyway)
- "Hedef Atölyeler" → "Hedef Firmalar" (label, helper text)
- Hedef Firmalar block doesn't render for operator targets (defense in depth — a non-operator user would never have this branch fire incorrectly, but a stale operator with corrupt roles is handled cleanly)

- [ ] **Step 3: Run TypeScript check**

```
cd c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtfrontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
git commit -m "firma: edit modal — single Firma input, operator lockdown, label renames"
```

---

## Task 8: Frontend — Create modal refactor (drop Operatör, drop Şirket dropdown, Firma input, renames)

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

- [ ] **Step 1: Update create form initial state**

Find `createForm` initial state (around line 197) and the matching reset in `closeCreateModal` (around line 211). Replace both objects with the same simplified shape (drop `company`, drop `station_id`, drop the type assertion for `role` since "operator" is gone):

Initial state:
```tsx
  const [createForm, setCreateForm] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    password_confirm: "",
    role: "musteri" as Exclude<RoleType, "operator">,
    department: "",
    musteri_companies: [] as string[],
  });
```

Reset:
```tsx
  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateForm({
      username: "",
      name: "",
      email: "",
      password: "",
      password_confirm: "",
      role: "musteri",
      department: "",
      musteri_companies: [],
    });
  };
```

(Default role changes from `"operator"` to `"musteri"` because operator is no longer a valid choice here. `Exclude<RoleType, "operator">` narrows the form's role to the three remaining options.)

- [ ] **Step 2: Simplify `handleCreateUser` payload**

Find `handleCreateUser` (around line 226). Replace the entire body with:

```tsx
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
      if (!createForm.department.trim()) throw new Error("Firma boş olamaz");
      if (createForm.department.includes(":")) throw new Error("Firma adında ':' karakteri kullanılamaz");

      const payload: any = {
        username: createForm.username.trim(),
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        password_confirm: createForm.password_confirm,
        role: createForm.role,
        department: createForm.department.trim(),
      };
      if (createForm.role === "musteri") {
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

Key changes vs the existing handler:
- `payload.company` removed (backend derives)
- `payload.station_id` removed (operator no longer reachable)
- `payload.department` always sent (required validator at top)
- Operator-specific block removed

- [ ] **Step 3: Replace the create-modal JSX fields**

Find the create-modal `<form>` JSX (around line 704). Replace the Rol `<select>`, Şirket `<select>`, operator-Atölye, and müşteri-only fields with the simplified set.

Locate the existing block starting at `<label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>` (around line 764) and ending at the closing `</>` of the müşteri-only fragment (around line 870). Replace that entire span with:

```tsx
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => {
                      const newRole = e.target.value as Exclude<RoleType, "operator">;
                      setCreateForm({
                        ...createForm,
                        role: newRole,
                        musteri_companies: newRole === "musteri" ? createForm.musteri_companies : [],
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  >
                    <option value="yonetici">Yönetici</option>
                    <option value="musteri">Müşteri</option>
                    <option value="satinalma">Satınalma</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Firma *</label>
                  <input
                    type="text"
                    value={createForm.department}
                    onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                  {createForm.role === "musteri" && (
                    <p className="mt-1 text-xs text-gray-500">QR'da "Gönderen Firma" olarak basılır.</p>
                  )}
                </div>

                {createForm.role === "musteri" && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Firmalar</label>
                    <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                      {companies.length === 0 ? (
                        <p className="text-sm text-gray-500">Sistemde kayıtlı firma yok.</p>
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
                    <p className="mt-1 text-xs text-gray-500">Müşterinin barkod oluşturabileceği hedef firmalar. Boş bırakılabilir.</p>
                  </div>
                )}
```

Key changes:
- Role `<select>` has 3 options (yonetici/musteri/satinalma) — Operatör is gone
- No "Şirket (Sahip Atölye)" `<select>` at all
- No operator-only Atölye `<select>` at all
- One "Firma" text input shown for every remaining role
- "Hedef Atölyeler" → "Hedef Firmalar"

- [ ] **Step 4: Run TypeScript check**

```
cd c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtfrontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
git commit -m "firma: create modal — drop Operatör option, drop Şirket dropdown, single Firma input"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Run helper test scripts**

```
cd c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtbackend && python test_full_admin_helper.py
```
Expected: `is_full_admin: OK`.

```
cd c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtbackend && python test_musteri_companies_helper.py
```
Expected: three `OK` lines + `All helper tests passed.`.

- [ ] **Step 2: Full backend import smoke**

```
cd c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtbackend && python -c "from app.api.v1.endpoints.romiot.station.station import router, list_company_users, update_company_user, full_admin_create_user, bulk_musteri_companies, list_known_companies, list_stations, FullAdminUserCreateRequest, ManagedUserUpdateRequest, BulkMusteriCompaniesRequest, BulkMusteriCompaniesMode, ManagedUserRoleType; print('all symbols import OK')"
```
Expected: prints `all symbols import OK`.

- [ ] **Step 3: Frontend TypeScript check**

```
cd c:/Users/ABDULLAHGOKTUG/Desktop/dveri/dtfrontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Manual UI walkthrough**

Start the dev server (`pnpm --filter dtfrontend dev` plus the backend). As fullAdmin:
- Open kullanıcı yönetimi.
- Listing shows: a leftmost checkbox column on müşteri rows only; "Firma" column (renamed from "Şirket"); other columns unchanged.
- Tick the header checkbox → all visible müşteri rows tick (non-müşteri rows don't).
- Toolbar above table appears with `N müşteri seçili`, `Hedef Firmaları Düzenle`, `Seçimi Temizle`.
- Click "Hedef Firmaları Düzenle" → modal opens with mode radio (default: Mevcuta ekle) and firmalar checkboxes.
- Pick 2 firmalar, mode = add, save → success banner shows count; each selected müşteri's PB record now has the union of old + new `atolye:musteri_company:*` roles.
- Repeat with mode = replace and 0 firmalar checked → confirm dialog fires; on accept, all selected müşteris lose their target firma roles.
- Edit a müşteri user → modal shows "Firma" text input (editable), "Hedef Firmalar" checkbox list. No "Şirket (Sahip Atölye)" dropdown anywhere.
- Edit an operator user → "Firma" input is grey/read-only; role select is disabled showing "Operatör"; Atölye picker still works.
- Edit a yönetici user → "Firma" input editable; no Hedef Firmalar block.
- Create modal → role select has Yönetici / Müşteri / Satınalma (no Operatör). Firma text input shown for all three. Hedef Firmalar shown only for müşteri.
- Create a müşteri with department=TESTCO and one target → success; backend mirrors PB `company = department = TESTCO`.

As a yönetici-only user (non-fullAdmin):
- The list shows no checkbox column, no "Firma" column header (uses no isFullAdmin path).
- Edit modal still works for non-müşteri users; no "Firma" text input shown for non-fullAdmin (the original UX is preserved — the new Firma input is gated behind fullAdmin only in the edit modal because non-fullAdmin shouldn't be reassigning department).

- [ ] **Step 5: Final commit if any fixups were needed**

```bash
git status
# fix anything outstanding from manual testing, commit if needed
```

---

## Self-review notes

**Spec coverage:**
- Firma single text input → Tasks 7 (edit), 8 (create)
- Mirror `company = department` → Tasks 2 (create), 3 (update)
- Operator restrictions: no creation → Tasks 1 (schema reject), 8 (UI drop Operatör option). Operator edit: locked Firma + locked role → Tasks 3 (backend), 7 (frontend)
- Bulk Hedef Firmalar: state + UI + endpoint → Tasks 5 (selection state + toolbar + header rename), 6 (modal + handler + new endpoint call), 4 (backend endpoint)
- Renames: "Şirket" → "Firma" (column) → Task 5. "Müşteri Adı" → "Firma" (form) → Task 7 (edit) + Task 8 (create). "Hedef Atölyeler" → "Hedef Firmalar" → Tasks 7, 8, 6 (bulk modal).

**Placeholder scan:**
- No "TBD", "TODO", "implement later" in the plan.
- Every step that changes code includes a code block.
- Every command has expected output.
- Task 6 Step 2 ("verify api.patch exists") is the only conditional step. It's bounded: if `patch` isn't present, add it consistently with the existing verbs. The follow-up commit in step 5 covers `lib/api.ts` if it was touched.

**Type consistency:**
- `BulkMusteriCompaniesMode` is the enum name in Task 4 schema, Task 4 handler, Task 6 frontend submit handler payload (as `"add"` / `"replace"` string literals matching the enum values).
- `selectedMusteriIds: Set<string>` is the type across Tasks 5 and 6.
- `bulkMode: "add" | "replace"` is the type across Tasks 5 and 6.
- `Exclude<RoleType, "operator">` narrows the create form's role to the three valid options across Task 8 steps 1, 2, 3.
- Frontend `payload.department` field is consistent across Tasks 7 and 8.
- Frontend `payload.musteri_companies` field is consistent.
- Backend endpoint path `/romiot/station/stations/management/users/bulk-musteri-companies` (frontend) maps to `@router.patch("/management/users/bulk-musteri-companies", ...)` (backend, mounted under `/romiot/station/stations`).
