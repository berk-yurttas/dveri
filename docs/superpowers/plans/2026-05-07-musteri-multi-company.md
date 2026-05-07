# Müşteri Multi-Company Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a müşteri user to be linked to multiple companies via repeated `atolye:musteri_company:<X>` roles, and let them choose which company a new QR is created for from a dropdown on the müşteri page.

**Architecture:** Pure role-array extension — no schema change. Three duplicated helper copies in the backend (`station.py`, `qr_code.py`, `work_order.py`) are widened to return `list[str]`. Single-value comparisons (`==`) become set membership (`IN` / `not in`). The frontend swaps a readonly text input for a `<select>` populated from the user's roles. A new server-side validation in `generate-batch` enforces that the submitted `company_from` is in the caller's allowed set.

**Tech Stack:** FastAPI + SQLAlchemy (async), Pydantic, PocketBase (auth/role store), Next.js 14 App Router, React, TypeScript, Tailwind.

**Reference spec:** [docs/superpowers/specs/2026-05-07-musteri-multi-company-design.md](../specs/2026-05-07-musteri-multi-company-design.md)

---

## File Map

**Modify (backend):**
- `dtbackend/app/api/v1/endpoints/romiot/station/station.py` — helper rename + return-type change at line 145; multi-company-preserving edit logic at lines 467-478.
- `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` — helper rename + return-type change at line 27; new validation block in `generate_qr_code_batch` (~line 144); group-retrieval scoping at lines 313-356.
- `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — helper rename + return-type change at line 32; list scoping at lines 422-436, 478-479, 528-529, 608.

**Modify (frontend):**
- `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx` — state, role-extraction effect, prefill effect, "Gönderen Firma" form field at lines 397-406.

**Create:**
- `dtbackend/test_musteri_companies_helper.py` — standalone assertion script for the pure helper (matches the existing `dtbackend/test_*.py` convention).

---

## Task 1: Backend — Plural helper, list-based scoping, multi-role preservation

**Files:**
- Create: `dtbackend/test_musteri_companies_helper.py`
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py:145-158`, `:467-478`
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py:27-36`, `:313-327`, `:354-356`
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py:32-41`, `:422-436`, `:478-479`, `:528-529`, `:608`

This task is a single coordinated rewrite: rename the helper everywhere, update every call site to use lists, and fix the yönetici-edit code path that would otherwise silently drop extra companies. After this task, the codebase has no remaining references to `_extract_musteri_company_from_roles` (singular).

- [ ] **Step 1: Write standalone helper test**

Create file `dtbackend/test_musteri_companies_helper.py`:

```python
"""
Standalone assertion test for _extract_musteri_companies_from_roles.

Run with: python dtbackend/test_musteri_companies_helper.py
"""
import sys
from pathlib import Path

# Make `app` importable when running from repo root
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app.api.v1.endpoints.romiot.station.station import (
    _extract_musteri_companies_from_roles as helper_station,
)
from app.api.v1.endpoints.romiot.station.qr_code import (
    _extract_musteri_companies_from_roles as helper_qr,
)
from app.api.v1.endpoints.romiot.station.work_order import (
    _extract_musteri_companies_from_roles as helper_wo,
)


def run(helper, label):
    assert helper(None) == [], f"{label}: None should return []"
    assert helper([]) == [], f"{label}: empty list should return []"
    assert helper(["atolye:musteri"]) == [], f"{label}: no company role -> []"
    assert helper(["atolye:musteri_company:ACME"]) == ["ACME"], f"{label}: single"
    assert helper(
        ["atolye:musteri", "atolye:musteri_company:ACME", "atolye:musteri_company:FOO"]
    ) == ["ACME", "FOO"], f"{label}: order preserved"
    assert helper(
        ["atolye:musteri_company:ACME", "atolye:musteri_company:ACME"]
    ) == ["ACME"], f"{label}: dedupe"
    assert helper(
        ["atolye:musteri_company:  ACME  "]
    ) == ["ACME"], f"{label}: trim whitespace"
    assert helper(
        ["atolye:musteri_company:"]
    ) == [], f"{label}: empty value ignored"
    print(f"{label}: OK")


if __name__ == "__main__":
    run(helper_station, "station.py")
    run(helper_qr, "qr_code.py")
    run(helper_wo, "work_order.py")
    print("All helper tests passed.")
```

- [ ] **Step 2: Run the test and verify it fails**

Run from repo root:
```
python dtbackend/test_musteri_companies_helper.py
```

Expected: `ImportError: cannot import name '_extract_musteri_companies_from_roles'` (the plural helpers don't exist yet).

- [ ] **Step 3: Replace the helper in `station.py`**

In `dtbackend/app/api/v1/endpoints/romiot/station/station.py`, replace lines 145-158:

```python
def _extract_musteri_company_from_roles(role_values: list[str] | None) -> str | None:
    """
    Extracts musteri company from supplemental role:
    - atolye:musteri_company:<company>
    """
    if not role_values:
        return None
    prefix = "atolye:musteri_company:"
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value:
                return value
    return None
```

with:

```python
def _extract_musteri_companies_from_roles(role_values: list[str] | None) -> list[str]:
    """
    Extracts the list of müşteri companies from supplemental roles:
    - atolye:musteri_company:<company>

    Order-preserving and deduplicated.
    """
    if not role_values:
        return []
    prefix = "atolye:musteri_company:"
    companies: list[str] = []
    seen: set[str] = set()
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value and value not in seen:
                seen.add(value)
                companies.append(value)
    return companies
```

- [ ] **Step 4: Replace the helper in `qr_code.py`**

In `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`, replace lines 27-36:

```python
def _extract_musteri_company_from_roles(role_values: list[str] | None) -> str | None:
    if not role_values:
        return None
    prefix = "atolye:musteri_company:"
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value:
                return value
    return None
```

with:

```python
def _extract_musteri_companies_from_roles(role_values: list[str] | None) -> list[str]:
    """
    Extracts the list of müşteri companies from supplemental roles:
    - atolye:musteri_company:<company>

    Order-preserving and deduplicated.
    """
    if not role_values:
        return []
    prefix = "atolye:musteri_company:"
    companies: list[str] = []
    seen: set[str] = set()
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value and value not in seen:
                seen.add(value)
                companies.append(value)
    return companies
```

- [ ] **Step 5: Replace the helper in `work_order.py`**

In `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`, replace lines 32-41:

```python
def _extract_musteri_company_from_roles(role_values: list[str] | None) -> str | None:
    if not role_values:
        return None
    prefix = "atolye:musteri_company:"
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value:
                return value
    return None
```

with:

```python
def _extract_musteri_companies_from_roles(role_values: list[str] | None) -> list[str]:
    """
    Extracts the list of müşteri companies from supplemental roles:
    - atolye:musteri_company:<company>

    Order-preserving and deduplicated.
    """
    if not role_values:
        return []
    prefix = "atolye:musteri_company:"
    companies: list[str] = []
    seen: set[str] = set()
    for role in role_values:
        if isinstance(role, str) and role.startswith(prefix):
            value = role[len(prefix):].strip()
            if value and value not in seen:
                seen.add(value)
                companies.append(value)
    return companies
```

- [ ] **Step 6: Run the helper test and verify it passes**

Run:
```
python dtbackend/test_musteri_companies_helper.py
```

Expected output:
```
station.py: OK
qr_code.py: OK
work_order.py: OK
All helper tests passed.
```

- [ ] **Step 7: Update yönetici-edit logic in `station.py` to preserve all `musteri_company` roles**

In `dtbackend/app/api/v1/endpoints/romiot/station/station.py`, replace lines 467-478:

```python
            department_for_payload = user_company
            existing_role_values = target_pb_user.get("role") if isinstance(target_pb_user.get("role"), list) else []
            pb_roles = [f"atolye:{new_role.value}"]
            if new_role == ManagedUserRoleType.MUSTERI:
                musteri_company = _extract_musteri_company_from_roles(existing_role_values)
                if not musteri_company and target_department.startswith(f"{user_company}:"):
                    # Backward compatibility for previously saved department format XXX:YYY
                    musteri_company = target_department.split(":", 1)[1].strip()
                if not musteri_company:
                    # Fallback when converting role without explicit musteri company input
                    musteri_company = user_company
                pb_roles.append(f"atolye:musteri_company:{musteri_company}")
```

with:

```python
            department_for_payload = user_company
            existing_role_values = target_pb_user.get("role") if isinstance(target_pb_user.get("role"), list) else []
            pb_roles = [f"atolye:{new_role.value}"]
            if new_role == ManagedUserRoleType.MUSTERI:
                musteri_companies = _extract_musteri_companies_from_roles(existing_role_values)
                if not musteri_companies and target_department.startswith(f"{user_company}:"):
                    # Backward compatibility for previously saved department format XXX:YYY
                    fallback = target_department.split(":", 1)[1].strip()
                    if fallback:
                        musteri_companies = [fallback]
                if not musteri_companies:
                    # Fallback when converting role without explicit musteri company input
                    musteri_companies = [user_company]
                for company in musteri_companies:
                    pb_roles.append(f"atolye:musteri_company:{company}")
```

- [ ] **Step 8: Update the QR group-retrieval call site in `qr_code.py` to use the list**

In `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`, replace lines 313-327:

```python
    is_musteri = "atolye:musteri" in role_values
    main_company = department_value
    musteri_department = None
    if is_musteri:
        musteri_department = _extract_musteri_company_from_roles(role_values)
        if not musteri_department and ":" in department_value:
            # Backward compatibility for old department format XXX:YYY
            main_company, musteri_department = department_value.split(":", 1)
            main_company = main_company.strip()
            musteri_department = musteri_department.strip()
        if not musteri_department:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Müşteri şirket bilgisi rol üzerinde bulunamadı."
            )
```

with:

```python
    is_musteri = "atolye:musteri" in role_values
    main_company = department_value
    musteri_companies: list[str] = []
    if is_musteri:
        musteri_companies = _extract_musteri_companies_from_roles(role_values)
        if not musteri_companies and ":" in department_value:
            # Backward compatibility for old department format XXX:YYY
            main_company, fallback = department_value.split(":", 1)
            main_company = main_company.strip()
            fallback = fallback.strip()
            if fallback:
                musteri_companies = [fallback]
        if not musteri_companies:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Müşteri şirket bilgisi rol üzerinde bulunamadı."
            )
```

- [ ] **Step 9: Update the per-row company filter in `qr_code.py` to use `not in`**

In the same file, replace lines 354-356:

```python
        if is_musteri and musteri_department:
            if (payload.get("company_from") or "").strip() != musteri_department:
                continue
```

with:

```python
        if is_musteri and musteri_companies:
            if (payload.get("company_from") or "").strip() not in musteri_companies:
                continue
```

- [ ] **Step 10: Update the work-order list call site in `work_order.py` to use the list**

In `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`, replace lines 422-436:

```python
    musteri_department = None
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    if is_musteri:
        musteri_department = _extract_musteri_company_from_roles(role_values)
        if not musteri_department and ":" in department_value:
            # Backward compatibility for old department format XXX:YYY
            company, musteri_department = department_value.split(":", 1)
            company = company.strip()
            musteri_department = musteri_department.strip()
        if not musteri_department:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Müşteri şirket bilgisi rol üzerinde bulunamadı"
            )
```

with:

```python
    musteri_companies: list[str] = []
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    if is_musteri:
        musteri_companies = _extract_musteri_companies_from_roles(role_values)
        if not musteri_companies and ":" in department_value:
            # Backward compatibility for old department format XXX:YYY
            company, fallback = department_value.split(":", 1)
            company = company.strip()
            fallback = fallback.strip()
            if fallback:
                musteri_companies = [fallback]
        if not musteri_companies:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Müşteri şirket bilgisi rol üzerinde bulunamadı"
            )
```

- [ ] **Step 11: Update the SQL `base_conditions` in `work_order.py` (first occurrence)**

In the same file, replace lines 478-479:

```python
    if is_musteri and musteri_department:
        base_conditions.append(WorkOrder.company_from == musteri_department)
```

with:

```python
    if is_musteri and musteri_companies:
        base_conditions.append(WorkOrder.company_from.in_(musteri_companies))
```

- [ ] **Step 12: Update the SQL `base_conditions` in `work_order.py` (second occurrence, inside the `search_station` branch)**

In the same file, replace lines 528-529:

```python
        if is_musteri and musteri_department:
            base_conditions.append(WorkOrder.company_from == musteri_department)
```

with:

```python
        if is_musteri and musteri_companies:
            base_conditions.append(WorkOrder.company_from.in_(musteri_companies))
```

- [ ] **Step 13: Update the QR-payload company-filter in `work_order.py`**

In the same file, replace line 608 (the unscanned-QR loop check):

```python
                if is_musteri and musteri_department and company_from != musteri_department:
                    continue
```

with:

```python
                if is_musteri and musteri_companies and company_from not in musteri_companies:
                    continue
```

- [ ] **Step 14: Verify no stale references remain**

Run two Grep checks over the three backend files (`station.py`, `qr_code.py`, `work_order.py`):

1. Pattern `_extract_musteri_company_from_roles` (singular function name). Expected: zero matches across all three files. Any match is a missed rename — go fix it.

2. Pattern `\bmusteri_department\b` (the old local-variable name). Expected: zero matches in `qr_code.py` and `work_order.py`. In `station.py`, matches must remain *only* inside the `UserCreateRequest` Pydantic class (around lines 703-727) and the create endpoint body that consumes `user_data.musteri_department` (around lines 796-802) — those are the create-user request field, which the spec explicitly leaves unchanged. Any other `musteri_department` occurrence in `station.py` is a missed call site — go fix it.

- [ ] **Step 15: Run the helper test again to confirm nothing regressed**

Run:
```
python dtbackend/test_musteri_companies_helper.py
```

Expected: all three labels print `OK` and the final line `All helper tests passed.` appears.

- [ ] **Step 16: Lint the modified backend files**

Run from repo root:
```
ruff check dtbackend/app/api/v1/endpoints/romiot/station/station.py dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
```

Expected: no new errors. Pre-existing warnings unrelated to our changes are acceptable.

- [ ] **Step 17: Smoke-test the dev server starts**

Start the backend (from `dtbackend/`):
```
uvicorn app.main:app --reload --port 8000
```

Expected: server boots and `/docs` is reachable. Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 18: Commit**

```
git add dtbackend/test_musteri_companies_helper.py dtbackend/app/api/v1/endpoints/romiot/station/station.py dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "müşteri multi-company: plural helper, IN-based scoping, preserve roles on edit"
```

---

## Task 2: Backend — Server-side `company_from` validation in `generate-batch`

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py:126-150` (the `generate_qr_code_batch` endpoint, just after the existing role/company check)

The frontend dropdown is no longer readonly, so the server must enforce that the submitted `company_from` belongs to the caller. Müşteri rule takes precedence when a user holds both roles.

- [ ] **Step 1: Insert the validation block in `generate_qr_code_batch`**

Open `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`. Find this region (around lines 138-151):

```python
    # Company is now read from department; role is company-independent
    user_company = (current_user.department or "").strip()
    has_create_role = (
        current_user.role
        and isinstance(current_user.role, list)
        and ("atolye:musteri" in current_user.role or "atolye:yonetici" in current_user.role)
    )
    
    if not has_create_role or not user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri veya yönetici rolü gereklidir."
        )
    
    # Calculate packages
```

Replace it with:

```python
    # Company is now read from department; role is company-independent
    user_company = (current_user.department or "").strip()
    role_values = current_user.role if isinstance(current_user.role, list) else []
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    has_create_role = is_musteri or is_yonetici

    if not has_create_role or not user_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri veya yönetici rolü gereklidir."
        )

    # Validate company_from against caller's allowed set.
    # Müşteri rule takes precedence when user has both roles.
    submitted_company = (batch_data.company_from or "").strip()
    if is_musteri:
        allowed_companies = _extract_musteri_companies_from_roles(role_values)
        if not allowed_companies and ":" in user_company:
            # Backward compatibility for old department format XXX:YYY
            fallback = user_company.split(":", 1)[1].strip()
            if fallback:
                allowed_companies = [fallback]
        if submitted_company not in allowed_companies:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu şirket adına QR kod oluşturma yetkiniz yok.",
            )
    elif is_yonetici:
        if submitted_company != user_company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu şirket adına QR kod oluşturma yetkiniz yok.",
            )

    # Calculate packages
```

- [ ] **Step 2: Lint the modified file**

Run from repo root:
```
ruff check dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
```

Expected: no new errors.

- [ ] **Step 3: Manual verification — happy path (müşteri linked to ACME submits ACME)**

Start the backend:
```
uvicorn app.main:app --reload --port 8000
```

Authenticate as a müşteri whose `role` array includes `atolye:musteri_company:ACME`. Use the existing FE login or grab a token via `/auth` per the project's flow. With that bearer token, POST a minimal payload (replace `<TOKEN>` and `<ASELSAN_DEPT>` per your dataset):

```
curl -X POST http://localhost:8000/api/v1/romiot/station/qr-code/generate-batch \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "main_customer": "ASELSAN",
    "sector": "AGS",
    "company_from": "ACME",
    "teklif_number": "TEST-001",
    "aselsan_order_number": "TEST-ORD-001",
    "order_item_number": "001",
    "part_number": "PN-1",
    "revision_number": "A",
    "quantity": 5,
    "package_quantity": 1,
    "target_date": "2026-09-01"
  }'
```

Expected: HTTP 201 with a `work_order_group_id` and a single package.

- [ ] **Step 4: Manual verification — rejection (müşteri submits a non-allowed company)**

Same setup, but change `company_from` to a value NOT present in any of the user's `atolye:musteri_company:*` roles (e.g., `"NOT-ALLOWED-CO"`):

```
curl -X POST http://localhost:8000/api/v1/romiot/station/qr-code/generate-batch \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ ... "company_from": "NOT-ALLOWED-CO" ... }'
```

Expected: HTTP 403 with body `{"detail": "Bu şirket adına QR kod oluşturma yetkiniz yok."}`.

- [ ] **Step 5: Manual verification — yönetici locked to own department**

Authenticate as a yönetici whose `department` is `DIGINNO`. Submit `company_from: "DIGINNO"` → expect HTTP 201. Submit `company_from: "ACME"` → expect HTTP 403 with the same detail message.

- [ ] **Step 6: Stop the dev server and commit**

Stop the backend (Ctrl+C). Then:

```
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
git commit -m "müşteri multi-company: validate company_from against caller's allowed set"
```

---

## Task 3: Frontend — Multi-company dropdown on müşteri page

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx` — state at lines 38-43; role-extraction `useEffect` at 46-75; prefill `useEffect` at 96-100; "Gönderen Firma" field at 397-406.

The "Gönderen Firma" input becomes a `<select>` populated from the user's roles. Behavior is identical for single-company users (the dropdown shows one disabled option). Multi-company users get an enabled dropdown.

- [ ] **Step 1: Replace the `userCompany` state with `userCompanies`**

In `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx`, replace lines 41-41:

```tsx
  const [userCompany, setUserCompany] = useState<string | null>(null);
```

with:

```tsx
  const [userCompanies, setUserCompanies] = useState<string[]>([]);
```

- [ ] **Step 2: Update the role-extraction `useEffect` to build the company list**

In the same file, replace lines 46-75:

```tsx
  // Check user roles and extract company
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const musteriRole = user.role.find((role) =>
        typeof role === "string" && role === "atolye:musteri"
      );
      const yoneticiRole = user.role.find((role) =>
        typeof role === "string" && role === "atolye:yonetici"
      );
      if (musteriRole || yoneticiRole) {
        setIsMusteri(!!musteriRole);
        setIsYonetici(!!yoneticiRole);
        const musteriCompanyRole = user.role.find(
          (role) => typeof role === "string" && role.startsWith("atolye:musteri_company:")
        );
        if (musteriRole && typeof musteriCompanyRole === "string") {
          const musteriCompany = musteriCompanyRole.replace("atolye:musteri_company:", "").trim();
          setUserCompany(musteriCompany || null);
        } else {
          const departmentValue = (user.department || "").trim();
          if (musteriRole && departmentValue.includes(":")) {
            // Backward compatibility for old department format XXX:YYY
            const [, musteriDepartment] = departmentValue.split(":", 2);
            setUserCompany(musteriDepartment?.trim() || null);
          } else {
            setUserCompany(departmentValue || user.company || null);
          }
        }
      }
    }
  }, [user]);
```

with:

```tsx
  // Check user roles and extract the list of companies the user can act for
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const musteriRole = user.role.find(
        (role) => typeof role === "string" && role === "atolye:musteri"
      );
      const yoneticiRole = user.role.find(
        (role) => typeof role === "string" && role === "atolye:yonetici"
      );
      if (musteriRole || yoneticiRole) {
        setIsMusteri(!!musteriRole);
        setIsYonetici(!!yoneticiRole);

        // Collect every atolye:musteri_company:<X> role, deduped, in array order.
        const prefix = "atolye:musteri_company:";
        const seen = new Set<string>();
        const collected: string[] = [];
        for (const role of user.role) {
          if (typeof role === "string" && role.startsWith(prefix)) {
            const value = role.slice(prefix.length).trim();
            if (value && !seen.has(value)) {
              seen.add(value);
              collected.push(value);
            }
          }
        }

        if (musteriRole && collected.length > 0) {
          setUserCompanies(collected);
        } else {
          // Fallback for legacy users / yönetici-only.
          const departmentValue = (user.department || "").trim();
          if (musteriRole && departmentValue.includes(":")) {
            // Backward compatibility for old department format XXX:YYY
            const [, musteriDepartment] = departmentValue.split(":", 2);
            const fallback = musteriDepartment?.trim() || "";
            setUserCompanies(fallback ? [fallback] : []);
          } else {
            const fallback = departmentValue || user.company || "";
            setUserCompanies(fallback ? [fallback] : []);
          }
        }
      }
    }
  }, [user]);
```

- [ ] **Step 3: Update the prefill `useEffect`**

In the same file, replace lines 96-100:

```tsx
  // Prefill company_from with user's company
  useEffect(() => {
    if (userCompany && (isMusteri || isYonetici)) {
      setBarcodeFormData((prev) => ({ ...prev, company_from: userCompany }));
    }
  }, [userCompany, isMusteri, isYonetici]);
```

with:

```tsx
  // Default company_from to the first allowed company; preserve user's choice if already set.
  useEffect(() => {
    if (userCompanies.length > 0 && (isMusteri || isYonetici)) {
      setBarcodeFormData((prev) => ({
        ...prev,
        company_from: prev.company_from || userCompanies[0],
      }));
    }
  }, [userCompanies, isMusteri, isYonetici]);
```

- [ ] **Step 4: Replace the readonly input with a `<select>`**

In the same file, replace lines 397-406:

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gönderen Firma *</label>
                <input
                  type="text"
                  value={barcodeFormData.company_from}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                  readOnly
                  disabled
                />
              </div>
```

with:

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gönderen Firma *</label>
                <select
                  value={barcodeFormData.company_from}
                  onChange={(e) =>
                    setBarcodeFormData({ ...barcodeFormData, company_from: e.target.value })
                  }
                  className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                    userCompanies.length <= 1 ? "bg-gray-100 cursor-not-allowed" : "bg-white"
                  }`}
                  disabled={userCompanies.length <= 1}
                  required
                >
                  {userCompanies.length === 0 && (
                    <option value="">Şirket bulunamadı</option>
                  )}
                  {userCompanies.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
              </div>
```

- [ ] **Step 5: Type-check the frontend**

From `dtfrontend/`:
```
npx tsc --noEmit
```

Expected: no errors. If any, they should reference our changes — fix them; pre-existing errors elsewhere are out of scope (note them but do not address).

- [ ] **Step 6: Build the frontend**

From `dtfrontend/`:
```
npm run build
```

Expected: build succeeds. Pre-existing warnings unrelated to our changes are acceptable.

- [ ] **Step 7: Manual verification — single-company müşteri (visual parity)**

With both `dtbackend` (`uvicorn app.main:app --reload --port 8000`) and `dtfrontend` (`npm run dev`) running, log in as a müşteri whose roles contain exactly one `atolye:musteri_company:<X>`. Open the müşteri page (`/<platform>/atolye/musteri`). Confirm:
- "Gönderen Firma" field is a select, prefilled with their company, and disabled (gray bg, not-allowed cursor).
- The form submits successfully and a QR is generated.

- [ ] **Step 8: Manual verification — multi-company müşteri**

Log in as a müşteri whose roles contain TWO or more `atolye:musteri_company:<X>` entries (set this up in PocketBase admin: edit the user's `role` field and add e.g. `atolye:musteri_company:FOO` alongside the existing one). Open the müşteri page. Confirm:
- The select is enabled (white bg) and contains all linked companies as options.
- Default selection is the first one (matching role-array order).
- Switching options updates the value sent on submit; submitting with each option succeeds (HTTP 201).
- Submitting with the dropdown locked at an allowed value works (the field is required, so empty submission was already prevented by the form).

- [ ] **Step 9: Manual verification — yönetici-only**

Log in as a yönetici (no `atolye:musteri` role). Confirm the select shows their `department` as the only option and is disabled. Form still submits successfully.

- [ ] **Step 10: Manual verification — list views still scope correctly**

For the multi-company müşteri from Step 8, navigate to the iş emirleri page (`/<platform>/atolye/is-emirleri`). Confirm work orders appear for **both** linked companies (i.e., the IN-based scoping from Task 1 is in effect).

- [ ] **Step 11: Stop dev servers and commit**

Stop both servers. Then:

```
git add dtfrontend/src/app/[platform]/atolye/musteri/page.tsx
git commit -m "müşteri multi-company: dropdown selector for company_from"
```

---

## Self-Review Notes

**Spec coverage check:**
- "Helper rename and return type" → Task 1 Steps 3-6.
- "QR generation validation" (müşteri/yönetici/both rules) → Task 2 Steps 1, 3-5.
- "List/group scoping == → IN" (qr_code group, work_order ×3) → Task 1 Steps 8-9, 11-13.
- "Preserve existing roles on yönetici edit" → Task 1 Step 7.
- "No change to user-creation flow" → no task touches `station.py:732+`.
- Frontend state, prefill, dropdown for müşteri / yönetici-only / both → Task 3 Steps 1-4.
- Backward-compat fallback (old `XXX:YYY` department) → preserved in Task 1 Steps 7, 8, 10 and Task 2 Step 1 and Task 3 Step 2.
- Test coverage from spec: helper variations → Task 1 Step 1; QR validation 3 cases → Task 2 Steps 3-5; list scoping shows multi-company data → Task 3 Step 10; yönetici PATCH preserves all → covered by Task 1 Step 7's loop append (no automated test for the PATCH path; manual verification path: edit a 3-linked müşteri's name through `kullanici-yonetimi` and confirm via PocketBase admin that all three `atolye:musteri_company:*` entries remain).

**Type/name consistency:** `_extract_musteri_companies_from_roles` (plural, returns `list[str]`) is used identically across all three backend files; call-site variable is `musteri_companies` everywhere. Frontend state is `userCompanies: string[]`.

**No placeholders:** every code step shows the exact replacement; every command step shows the exact command and expected output.
