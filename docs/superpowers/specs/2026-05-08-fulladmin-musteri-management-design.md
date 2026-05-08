# Atolye fullAdmin Müşteri Management — Design

**Date:** 2026-05-08
**Status:** Approved (pending spec review)
**Builds on:** [2026-05-07-musteri-sender-target-redesign.md](./2026-05-07-musteri-sender-target-redesign.md). The data model from that redesign is in place: müşteri's `company` is the owning workshop, `department` is the customer's own name (sender), and `atolye:musteri_company:*` roles list the target workshops they can submit to.

## Problem

Two gaps in today's user-management UX:

1. **Yönetici sees and manages müşteri users** — a workshop yönetici should not be in the müşteri loop at all. The yönetici page currently lets them create müşteri users; the kullanıcı yönetimi page lists müşteri rows because the list filters on `company == user_company`, and a yönetici-created müşteri inherits the workshop as `company`.
2. **No in-app UI for managing müşteri target links** — the redesign explicitly punted this to "admin edits PocketBase directly" (line 24 of the redesign spec). That's not viable as the population grows. A platform-wide admin (`fullAdmin:true` role, already present in PocketBase) needs a first-class flow to create müşteri users and pick their target workshops.

## Goal

- Remove müşteri concerns from the yönetici flow entirely.
- Give fullAdmin a kullanıcı yönetimi view that spans all companies, plus create/edit forms that fully express the müşteri model: owning workshop, customer name, and a multiselect of target workshops.

## Non-goals

- No new role/field schemas. `fullAdmin:true` already exists in PocketBase user `role`. The data model from the sender/target redesign is reused as-is.
- No data migration. Existing müşteri users carry their current `company`/`department`/role set.
- No changes to operator, satinalma, or yönetici target workflows beyond what's required to gate them by role.

## Design

### Role detection

Frontend reads `user.role`:
- `isYonetici = role.includes("atolye:yonetici")`
- `isFullAdmin = role.includes("fullAdmin:true")`

Backend mirrors with a helper in `dtbackend/app/api/v1/endpoints/romiot/station/auth.py`:

```python
def is_full_admin(user: User) -> bool:
    if not user.role or not isinstance(user.role, list):
        return False
    return "fullAdmin:true" in user.role
```

A user with both roles falls through fullAdmin paths (more permissive). Yönetici-only paths apply only when `isYonetici and not isFullAdmin`.

### Yönetici page (`dtfrontend/src/app/[platform]/atolye/yonetici/page.tsx`)

Operator-only creation. Concretely:

- Drop the role `<select>` from the user-creation form. The form creates an operator unconditionally.
- Drop `musteri_department` from form state and the rendered field.
- The "Şirket" field is reduced to a static read-only line ("Kullanıcı şirketinize atanacaktır") — no user input.
- Drop the `role: "musteri" | "operator"` union from `userFormData`; pin the type to `"operator"`.

The PocketBase `company` field on a yönetici-created operator stays `user_company` as today.

### Backend `POST /romiot/station/user` (`station.py`)

`UserCreateRequest.role` is restricted to operator. Concretely:

- The request-level enum `UserRoleType` is narrowed to `OPERATOR` only (`MUSTERI` removed).
- The model validator drops the müşteri branches.
- The handler's müşteri-specific code paths (department override, role list synthesis) are deleted.

A request that arrives with `role: "musteri"` now fails at Pydantic validation (422) with a clear message. This is defense in depth — the yönetici page UI no longer offers the option.

### Kullanıcı yönetimi page (`dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`)

Three behaviors gated by role:

#### Listing
- **Yönetici-only:** server already returns workshop-owned users. Client additionally hides any row whose `role === "musteri"` (defense in depth — server also filters, see below). The "Müşteri" option in the role-filter `<select>` is omitted.
- **fullAdmin:** server returns all users across all companies. Client renders an additional "Şirket" column (the owning workshop — PB `company`) between "Atölye" and "E-posta", and a company filter `<input>`. Müşteri rows are visible; "Müşteri" stays in the role filter.

#### Edit modal
- Role `<select>` options: yönetici-only sees `yonetici / operator / satinalma`; fullAdmin sees `yonetici / musteri / operator / satinalma`.
- When `formData.role === "musteri"` and the user is fullAdmin: render two extra fields:
  1. **Şirket** (owning workshop): single `<select>` from `companies` (see below). Required.
  2. **Müşteri Adı** (sender / `department`): free-text `<input>`. Required. Reject `:`.
  3. **Hedef Atölyeler** (target list): multiselect from `companies` minus the row's own `Şirket`. Optional — empty list is allowed (the user just can't create QRs until populated).
- For non-müşteri targets, fullAdmin can also change **Şirket** (owning workshop). For yönetici-only, Şirket stays implicit (their own).

#### Create modal (fullAdmin only)
A new "Yeni Kullanıcı Oluştur" button at the top of the page (next to "Geri Dön") opens a modal mirroring the edit modal:
- Username, name, email, password, password_confirm — same validation as today.
- Role `<select>`: yonetici / musteri / operator / satinalma.
- **Şirket** (owning workshop): single `<select>` from `companies`. Required.
- If role=operator: Atölye `<select>` filtered to stations where `station.company === Şirket`.
- If role=musteri: Müşteri Adı (free-text), Hedef Atölyeler (multiselect from `companies` minus Şirket).

Companies are loaded once on page mount via `GET /management/companies` (see below) and cached in state. The Atölye `<select>` reuses the existing `/romiot/station/stations/` endpoint, which today is scoped to the caller's company; for fullAdmin we extend it (see below) to return either all stations or filtered by `?company=...`.

### Backend list endpoint — `GET /romiot/station/management/users`

Auth changes:
- Replace `check_station_yonetici_role(current_user)` with: allow either fullAdmin or yönetici. Capture the caller's company (only meaningful for yönetici-only path).
- The PocketBase scan that today filters with `item_company == user_company` becomes:
  - **fullAdmin:** include every user with at least one `atolye:*` role (operator/yönetici/musteri/satinalma).
  - **yönetici-only:** keep `item_company == user_company` filter; additionally drop items whose role list contains `"atolye:musteri"`.
- The response model gets `company: str` populated from the PB record's `company` field, not from the caller's company. This is already the variable name; today it's hard-coded to `user_company`. Change the per-row assignment to read PB `company`.

The Postgres mirror (workshop_id → station_name) needs to look up stations across all companies for fullAdmin. Today the query is `Station.company == user_company`. Replace with: collect all `workshop_id` values from the matched users, then `Station.id.in_(...)`. Both yönetici and fullAdmin paths use the same query.

### Backend update endpoint — `PUT /romiot/station/management/users/{id}`

Permission shape:
- fullAdmin: bypass the `target_company != user_company` ownership check entirely.
- Yönetici-only: keep ownership check **and** add a "target user is not a müşteri" check (`atolye:musteri not in existing roles` → 403). This prevents a yönetici from updating a müşteri even via direct API call.

Request schema additions (all optional, ignored unless caller is fullAdmin):

```python
class ManagedUserUpdateRequest(BaseModel):
    # ... existing fields ...
    company: str | None = Field(None, min_length=1, description="Owning workshop (fullAdmin only)")
    department: str | None = Field(None, min_length=1, description="Müşteri's customer name (fullAdmin only)")
    musteri_companies: list[str] | None = Field(None, description="Replacement target workshops (fullAdmin only, role=musteri)")
```

Handler logic:
- **`company`** (fullAdmin path only): when supplied, validate it's non-empty, write it to PB. When omitted, preserve existing.
- **`department`** (fullAdmin path only): when supplied, write to PB. Reject `:` chars (400). When omitted, the today logic applies (preserve existing for müşteri, set to `user_company` for non-müşteri).
- **`musteri_companies`** (fullAdmin path only): only meaningful when `new_role == MUSTERI`. When provided, **replace** every `atolye:musteri_company:*` entry — strip existing, append `atolye:musteri_company:<X>` for each value in the list. Each value must be non-empty and contain no `:`. When omitted, preserve verbatim (today's behavior).
- For non-fullAdmin callers: silently ignore `company`/`department`/`musteri_companies` if present (do not 403). Keeps the API forgiving.

The PB `PATCH` payload composition stays the same shape; only the field-source logic changes.

### Backend new endpoint — `POST /romiot/station/management/users`

fullAdmin-only. Request schema:

```python
class FullAdminUserCreateRequest(BaseModel):
    username: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    email: EmailStr
    password: str = Field(..., min_length=8)
    password_confirm: str
    role: ManagedUserRoleType  # yonetici / musteri / operator / satinalma
    company: str = Field(..., min_length=1, description="Owning workshop")
    department: str | None = Field(None, description="Müşteri's customer name (required for musteri)")
    station_id: int | None = Field(None, description="Required for operator")
    musteri_companies: list[str] | None = Field(None, description="Optional target workshops for musteri")

    @model_validator(mode="after")
    def validate(self):
        _validate_password_strength(self.password)
        if self.password != self.password_confirm:
            raise ValueError("Şifreler eşleşmiyor")
        if self.role == ManagedUserRoleType.OPERATOR and not self.station_id:
            raise ValueError("Operatör rolü için atölye seçilmesi zorunludur")
        if self.role == ManagedUserRoleType.MUSTERI:
            if not self.department or not self.department.strip():
                raise ValueError("Müşteri rolü için müşteri adı zorunludur")
            if ":" in self.department:
                raise ValueError("Müşteri adında ':' karakteri kullanılamaz")
        if self.role != ManagedUserRoleType.OPERATOR and self.station_id is not None:
            raise ValueError("Sadece operatör rolü için atölye seçilebilir")
        if self.musteri_companies is not None:
            if self.role != ManagedUserRoleType.MUSTERI:
                raise ValueError("Hedef atölyeler sadece müşteri rolü için seçilebilir")
            for value in self.musteri_companies:
                if not value or not value.strip() or ":" in value:
                    raise ValueError("Geçersiz hedef atölye değeri")
        return self
```

Handler steps:
1. Verify `is_full_admin(current_user)`; else 403.
2. If role=operator: verify station exists and `station.company == request.company` (else 403).
3. Build role list:
   - Always start with `f"atolye:{role.value}"`.
   - If role=musteri and `musteri_companies` set: append `f"atolye:musteri_company:{X}"` for each.
4. PocketBase create payload:
   - `company = request.company` (owning workshop)
   - `department = request.department.strip() if role=="musteri" else request.company`
   - `role = <list above>`
5. Mirror to Postgres `User` (`workshop_id = station_id` for operator; `None` otherwise).
6. Return same shape as today's `/user` endpoint.

The PocketBase admin auth + duplicate-username/email checks are the same code as in `create_user_for_station`; extract them into a private helper to avoid duplication.

### Backend new endpoint — `GET /romiot/station/management/companies`

fullAdmin-only. Returns `list[str]` — distinct `Station.company` values, sorted alphabetically.

```python
@router.get("/management/companies", response_model=list[str])
async def list_companies(current_user: User = Depends(check_authenticated), romiot_db: AsyncSession = Depends(get_romiot_db)):
    if not is_full_admin(current_user):
        raise HTTPException(status_code=403, detail="fullAdmin yetkisi gereklidir")
    result = await romiot_db.execute(select(Station.company).distinct().order_by(Station.company))
    return [row[0] for row in result.all()]
```

Used by the page to populate the Şirket and Hedef Atölyeler `<select>`s.

### Backend stations endpoint — `GET /romiot/station/stations/`

Currently scoped via `get_station_company` (caller's company). For fullAdmin we need cross-company station data when picking an Atölye for a new operator.

Change: when `is_full_admin(current_user)` and a `?company=<name>` query param is supplied, return stations for that company. Without `?company`, fullAdmin gets all stations. Yönetici/operator/musteri callers ignore the query param and continue to receive their own company's stations.

This keeps a single endpoint instead of adding `/management/stations`.

## Error handling and edge cases

- **Yönetici with `fullAdmin:true`:** treated as fullAdmin everywhere (more permissive).
- **fullAdmin without `atolye:yonetici`:** can still access `kullanici-yonetimi` and the new endpoints. The page's existing `isYonetici` access guard is loosened to `isYonetici || isFullAdmin`.
- **Empty `musteri_companies` on create or edit:** allowed. Müşteri logs in fine but cannot generate QRs until targets are added (matches the sender/target redesign 403 path).
- **`company` change on a yönetici/operator via edit:** allowed for fullAdmin. Operator's Atölye assignment must be re-validated against the new company; if station no longer belongs, force `station_id` change at the same time or 400.
- **Yönetici-only attempting `PUT` on müşteri target:** 403 "Bu kullanıcı türünü düzenleme yetkiniz yok".
- **`POST /user` with role=musteri (legacy clients):** 422 from Pydantic enum narrowing.
- **Fresh PB instance with zero stations:** `/management/companies` returns `[]`. The fullAdmin "Şirket" `<select>` shows a disabled empty-state option; create button stays disabled until a station exists.
- **Delete:** out of scope. fullAdmin cannot delete users via this UI; PocketBase admin remains the path.

## Testing

Backend (manual / endpoint level):
- `GET /management/users` as yönetici-only on a workshop with one yönetici, two operators, one müşteri → returns yönetici + two operators (3 rows). Müşteri row absent.
- `GET /management/users` as fullAdmin → returns every atolye user across every company; "Şirket" populated per-row from PB `company`.
- `PUT /management/users/{musteri_id}` as yönetici-only → 403.
- `PUT /management/users/{musteri_id}` as fullAdmin with `musteri_companies=["A","B"]` → PB role list now contains exactly `atolye:musteri`, `atolye:musteri_company:A`, `atolye:musteri_company:B`.
- `PUT /management/users/{musteri_id}` as fullAdmin without `musteri_companies` (e.g., name-only edit) → existing `atolye:musteri_company:*` entries preserved verbatim.
- `POST /management/users` as fullAdmin with role=musteri, company=DIGINNO, department=ACME, musteri_companies=["DIGINNO","OTHER"] → user created; PB `company=DIGINNO`, `department=ACME`, role list as expected.
- `POST /management/users` as yönetici → 403.
- `POST /user` with role=musteri → 422.
- `GET /management/companies` as fullAdmin → distinct list. As yönetici → 403.

Frontend (manual):
- Yönetici page: only operator-creation form visible; submit creates an operator.
- Kullanıcı yönetimi as yönetici-only: müşteri rows absent, role filter has no "Müşteri", edit modal role select has no "Müşteri", no "Yeni Kullanıcı Oluştur" button.
- Kullanıcı yönetimi as fullAdmin: all users visible, "Şirket" column populated, company filter works, "Yeni Kullanıcı Oluştur" opens create modal, müşteri create with multi-target succeeds, edit modal allows changing company/department/targets.
- fullAdmin-created müşteri can immediately log into atolye/musteri page; "Hedef Firma" dropdown lists exactly the targets fullAdmin selected; QR generation works.

## Reuse / refactoring

- The PocketBase admin auth + duplicate-checks block in `create_user_for_station` is duplicated in the new `POST /management/users` handler. Extract a helper `async _pb_create_user(client, headers, payload) -> str` returning the new user id, used by both endpoints.
- The role-mapping logic in `update_company_user` (today's müşteri preserve loop) becomes a small switch on supplied vs. omitted `musteri_companies`. Keep it inline; not worth a helper for two branches.
