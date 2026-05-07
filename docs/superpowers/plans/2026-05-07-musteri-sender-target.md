# Müşteri Sender/Target Re-Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the müşteri data model so `department` holds the müşteri's own (sender) company, `atolye:musteri_company:*` roles list the targets they can submit work to, the QR's "Gönderen Firma" is set server-side from `department`, and `QRCodeData.company` stores the target picked at creation.

**Architecture:** Schema field `company_from` is renamed to `target_company` in the batch-create payload. Backend reads the target, validates it against the caller's roles, sets the QR JSON's `company_from` from `current_user.department`, and persists `QRCodeData.company = target_company`. Müşteri scoping queries flip: scanned-WO base filter reverts to `WorkOrder.company_from == department` (single value, since their sender is always themselves), unscanned-QR preview becomes `QRCodeData.company IN (allowed_targets)`. The yönetici create-müşteri flow stops auto-injecting `atolye:musteri_company:*` and stops overriding `department` with the yönetici's own. The yönetici-edit flow preserves all `musteri_company:*` roles verbatim and carries the target user's `department` forward unchanged. Frontend gets a new "Hedef Firma" dropdown alongside a now-truly-read-only "Gönderen Firma" field; print/preview templates read sender from a fresh `userOwnCompany` state.

**Tech Stack:** FastAPI + Pydantic (extra-forbid), SQLAlchemy async, PocketBase, Next.js 14 App Router, React + TypeScript, Tailwind.

**Reference spec:** [docs/superpowers/specs/2026-05-07-musteri-sender-target-redesign.md](../specs/2026-05-07-musteri-sender-target-redesign.md)

**Branch:** `feat/musteri-multi-company` (continuing). HEAD at plan time: `1eded65` (spec commit).

---

## File Map

**Modify (backend):**
- `dtbackend/app/schemas/qr_code.py` — rename `company_from` → `target_company` on `QRCodeBatchCreate`, add `extra='forbid'`.
- `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` — `generate_qr_code_batch` (validation + server-side sender + target storage), `get_qr_codes_by_work_order_group` (IN-on-company / `==`-on-payload-from).
- `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py` — `get_all_work_orders` (revert WO `company_from` to `==`, switch unscanned QR preview to `IN`).
- `dtbackend/app/api/v1/endpoints/romiot/station/station.py` — create-müşteri (department = customer name; role list `["atolye:musteri"]` only) and edit-müşteri (preserve roles + carry department forward).

**Modify (frontend):**
- `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx` — `BarcodeFormData.company_from` → `target_company`; new `userOwnCompany` state; "Gönderen Firma" reverts to read-only, bound to `userOwnCompany`; new "Hedef Firma" dropdown bound to `target_company`; print/preview render sender from `userOwnCompany`; submit-button disabled when no targets.

---

## Task 1: Backend — Schema rename + `generate-batch` rewrite

**Files:**
- Modify: `dtbackend/app/schemas/qr_code.py:26-38` (`QRCodeBatchCreate` definition)
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py:147-180` (validation block) and `:209-225` (QR JSON build) and `:248-253` (`QRCodeData` insert)

After this task, the `generate-batch` endpoint accepts `target_company` instead of `company_from`, validates it against the caller's `atolye:musteri_company:*` roles (or `== department` for yönetici), populates the persisted JSON's `company_from` from `current_user.department` server-side, and stores `QRCodeData.company = target_company`. Old clients sending `company_from` get a 422 (Pydantic extra-fields rejection).

- [ ] **Step 1: Rename the schema field and add `extra='forbid'`**

In `dtbackend/app/schemas/qr_code.py`, replace lines 26-38:

```python
class QRCodeBatchCreate(BaseModel):
    """Schema for batch QR code generation from the work order form"""
    main_customer: str = Field(..., description="Ana Müşteri")
    sector: str = Field(..., description="Sektör")
    company_from: str = Field(..., description="Gönderen Firma")
    teklif_number: str = Field(..., description="Teklif Numarası")
    aselsan_order_number: str = Field(..., description="ASELSAN Sipariş Numarası")
    order_item_number: str = Field(..., description="Sipariş Kalem Numarası")
    part_number: str = Field(..., description="Parça Numarası")
    revision_number: str | None = Field(None, description="Revizyon Numarası")
    quantity: int = Field(..., gt=0, description="Toplam Sipariş Miktarı")
    package_quantity: int = Field(1, gt=0, description="Parti Sayısı")
    target_date: date = Field(..., description="Hedef Bitirme Tarihi")
```

with:

```python
class QRCodeBatchCreate(BaseModel):
    """Schema for batch QR code generation from the work order form.

    `target_company` is the customer the QR is created FOR (storage tenant).
    The QR's printed "Gönderen Firma" (sender) is filled in server-side from
    the caller's department; clients must NOT send a `company_from` field.
    """
    model_config = {"extra": "forbid"}

    main_customer: str = Field(..., description="Ana Müşteri")
    sector: str = Field(..., description="Sektör")
    target_company: str = Field(..., description="Hedef Firma — QR'ın oluşturulduğu hedef şirket")
    teklif_number: str = Field(..., description="Teklif Numarası")
    aselsan_order_number: str = Field(..., description="ASELSAN Sipariş Numarası")
    order_item_number: str = Field(..., description="Sipariş Kalem Numarası")
    part_number: str = Field(..., description="Parça Numarası")
    revision_number: str | None = Field(None, description="Revizyon Numarası")
    quantity: int = Field(..., gt=0, description="Toplam Sipariş Miktarı")
    package_quantity: int = Field(1, gt=0, description="Parti Sayısı")
    target_date: date = Field(..., description="Hedef Bitirme Tarihi")
```

- [ ] **Step 2: Replace the validation block in `generate_qr_code_batch`**

In `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`, replace lines 147-180:

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
```

with:

```python
    # Sender ("Gönderen Firma") is always the caller's own company.
    sender_company = (current_user.department or "").strip()
    role_values = current_user.role if isinstance(current_user.role, list) else []
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    has_create_role = is_musteri or is_yonetici

    if not has_create_role or not sender_company:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="QR kod oluşturma yetkisi yok. Müşteri veya yönetici rolü gereklidir."
        )

    # Validate target_company against the caller's allowed targets.
    # Müşteri rule takes precedence when user has both roles.
    submitted_target = batch_data.target_company.strip()
    if not submitted_target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hedef firma boş olamaz.",
        )
    if is_musteri:
        allowed_targets = _extract_musteri_companies_from_roles(role_values)
        if not allowed_targets:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hedef firma rolü atanmamış. Yöneticinizle iletişime geçin.",
            )
        if submitted_target not in allowed_targets:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu hedef firma için QR kod oluşturma yetkiniz yok.",
            )
    elif is_yonetici:
        if submitted_target != sender_company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu hedef firma için QR kod oluşturma yetkiniz yok.",
            )
```

- [ ] **Step 3: Update the QR JSON construction**

In the same file, replace lines 209-225 (the `qr_data = { ... }` block):

```python
        # Build the QR data for this package
        qr_data = {
            "work_order_group_id": work_order_group_id,
            "main_customer": batch_data.main_customer,
            "sector": batch_data.sector,
            "company_from": batch_data.company_from,
            "teklif_number": batch_data.teklif_number,
            "aselsan_order_number": batch_data.aselsan_order_number,
            "order_item_number": batch_data.order_item_number,
            "part_number": batch_data.part_number,
            "revision_number": batch_data.revision_number,
            "quantity": pkg_qty,
            "total_quantity": total_quantity,
            "package_index": i,
            "total_packages": total_packages,
            "target_date": batch_data.target_date.isoformat(),
        }
```

with:

```python
        # Build the QR data for this package.
        # `company_from` is the SENDER (printed "Gönderen Firma") and is always
        # the caller's own department, never the client's input.
        qr_data = {
            "work_order_group_id": work_order_group_id,
            "main_customer": batch_data.main_customer,
            "sector": batch_data.sector,
            "company_from": sender_company,
            "teklif_number": batch_data.teklif_number,
            "aselsan_order_number": batch_data.aselsan_order_number,
            "order_item_number": batch_data.order_item_number,
            "part_number": batch_data.part_number,
            "revision_number": batch_data.revision_number,
            "quantity": pkg_qty,
            "total_quantity": total_quantity,
            "package_index": i,
            "total_packages": total_packages,
            "target_date": batch_data.target_date.isoformat(),
        }
```

- [ ] **Step 4: Store the target as the QR record's `company`**

In the same file, replace lines 248-253:

```python
        # Create QR code data record
        qr_code_record = QRCodeData(
            code=code,
            data=data_json,
            company=user_company,
            expires_at=expires_at
        )
```

with:

```python
        # Create QR code data record. `company` is the TARGET (storage tenant).
        qr_code_record = QRCodeData(
            code=code,
            data=data_json,
            company=submitted_target,
            expires_at=expires_at
        )
```

- [ ] **Step 5: Lint the modified files**

Run from repo root:
```
python -m ruff check dtbackend/app/schemas/qr_code.py dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
```

Expected: no NEW errors. (Pre-existing `F401`/`F841` in `qr_code.py` are acceptable.) Compare counts via stash if uncertain.

- [ ] **Step 6: Verify the code parses (import-only smoke check)**

From repo root:
```
python -c "import sys; sys.path.insert(0, 'dtbackend'); import app.api.v1.endpoints.romiot.station.qr_code; import app.schemas.qr_code; print('imports ok')"
```

Expected: `imports ok`. If the import fails because of unrelated `Settings()` env validation, run from `dtbackend/` instead and adjust the path.

- [ ] **Step 7: Commit**

```
git add dtbackend/app/schemas/qr_code.py dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
git commit -m "müşteri sender/target: rename to target_company, server-side sender, target as storage tenant"
```

---

## Task 2: Backend — Group + work-order list scoping shift

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py:343-388` (group endpoint müşteri scoping + per-row check)
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py:422-447` (musteri var setup), `:489-490` and `:539-540` (revert IN to ==), `:592` (unscanned QR preview switches to IN for müşteri), `:619` (per-row payload check switches to ==)

The müşteri's QRs are now stored under whatever target they picked, so list endpoints scope `QRCodeData.company` (storage tenant) by `IN (their roles)`. Their `WorkOrder.company_from` is always their own `department` (single value), so that scanned-WO filter reverts from `IN` to `==`.

- [ ] **Step 1: Update the QR-group müşteri block to drop the legacy fallback and use targets**

In `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`, replace lines 343-359:

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

with:

```python
    is_musteri = "atolye:musteri" in role_values
    musteri_targets: list[str] = []
    if is_musteri:
        musteri_targets = _extract_musteri_companies_from_roles(role_values)
        if not musteri_targets:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hedef firma rolü atanmamış. Yöneticinizle iletişime geçin.",
            )
```

- [ ] **Step 2: Rewrite the SQL query to scope by IN-list for müşteri, == for yönetici/operator**

In the same file, replace lines 361-374 (the `query = text(...)` block and the execute call):

```python
    query = text(
        """
        SELECT code, data
        FROM qr_code_data
        WHERE company = :company
          AND data::jsonb ->> 'work_order_group_id' = :group_id
        ORDER BY (data::jsonb ->> 'package_index')::int
        """
    )
    result = await romiot_db.execute(
        query,
        {"company": main_company, "group_id": work_order_group_id},
    )
    rows = result.fetchall()
```

with:

```python
    if is_musteri:
        # Müşteri sees QR groups stored under any of their target companies.
        query = text(
            """
            SELECT code, data
            FROM qr_code_data
            WHERE company = ANY(:companies)
              AND data::jsonb ->> 'work_order_group_id' = :group_id
            ORDER BY (data::jsonb ->> 'package_index')::int
            """
        )
        result = await romiot_db.execute(
            query,
            {"companies": musteri_targets, "group_id": work_order_group_id},
        )
    else:
        # Yönetici / operator / satinalma: scoped to their own department.
        query = text(
            """
            SELECT code, data
            FROM qr_code_data
            WHERE company = :company
              AND data::jsonb ->> 'work_order_group_id' = :group_id
            ORDER BY (data::jsonb ->> 'package_index')::int
            """
        )
        result = await romiot_db.execute(
            query,
            {"company": department_value, "group_id": work_order_group_id},
        )
    rows = result.fetchall()
```

No new imports are needed — both branches use the existing `text()` import.

- [ ] **Step 3: Update the per-row sender filter for müşteri**

In the same file, replace lines 386-388:

```python
        if is_musteri and musteri_companies:
            if (payload.get("company_from") or "").strip() not in musteri_companies:
                continue
```

with:

```python
        if is_musteri:
            # Defense-in-depth: müşteri's own QRs always carry their department
            # as the JSON's company_from (server-set at creation).
            if (payload.get("company_from") or "").strip() != department_value:
                continue
```

- [ ] **Step 4: Lint the QR-code module**

From repo root:
```
python -m ruff check dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py
```

Expected: no NEW errors.

- [ ] **Step 5: Update the work-order list müşteri block in `work_order.py`**

In `dtbackend/app/api/v1/endpoints/romiot/station/work_order.py`, replace lines 422-436:

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

with:

```python
    musteri_targets: list[str] = []
    is_musteri = "atolye:musteri" in role_values
    is_yonetici = "atolye:yonetici" in role_values
    if is_musteri:
        musteri_targets = _extract_musteri_companies_from_roles(role_values)
        if not musteri_targets:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hedef firma rolü atanmamış. Yöneticinizle iletişime geçin.",
            )
```

- [ ] **Step 6: Revert the scanned-WO base condition to `==` for müşteri (first occurrence)**

In the same file, replace lines 478-479:

```python
    if is_musteri and musteri_companies:
        base_conditions.append(WorkOrder.company_from.in_(musteri_companies))
```

with:

```python
    if is_musteri:
        # Müşteri's sender identity is their own department; their work orders
        # all carry that as company_from.
        base_conditions.append(WorkOrder.company_from == department_value)
```

- [ ] **Step 7: Revert the scanned-WO base condition to `==` for müşteri (second occurrence, search_station branch)**

In the same file, replace lines 528-529:

```python
        if is_musteri and musteri_companies:
            base_conditions.append(WorkOrder.company_from.in_(musteri_companies))
```

with:

```python
        if is_musteri:
            base_conditions.append(WorkOrder.company_from == department_value)
```

- [ ] **Step 8: Switch the unscanned-QR preview source to IN-on-targets for müşteri**

The local variable named `target_company` in this function (lines ~451-452) refers to the workshop being filtered for — yönetici default. Don't rename it. Find the unscanned-QR query at lines 591-594:

```python
        if not search_station:
            qr_rows_result = await romiot_db.execute(
                select(QRCodeData).where(QRCodeData.company == target_company)
            )
            qr_rows = qr_rows_result.scalars().all()
```

Replace with:

```python
        if not search_station:
            if is_musteri:
                # Müşteri: their unscanned QRs are stored under each picked target.
                unscanned_qr_filter = QRCodeData.company.in_(musteri_targets)
            else:
                # Yönetici / operator / satinalma: own workshop.
                unscanned_qr_filter = QRCodeData.company == target_company
            qr_rows_result = await romiot_db.execute(
                select(QRCodeData).where(unscanned_qr_filter)
            )
            qr_rows = qr_rows_result.scalars().all()
```

- [ ] **Step 9: Update the per-row payload sender check inside the unscanned-QR loop**

In the same file, replace line 608:

```python
                if is_musteri and musteri_companies and company_from not in musteri_companies:
                    continue
```

with:

```python
                if is_musteri and company_from != department_value:
                    continue
```

- [ ] **Step 10: Lint the work-order module**

From repo root:
```
python -m ruff check dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
```

Expected: no NEW errors.

- [ ] **Step 11: Run the helper test (no helper change here, but confirm nothing regresses)**

```
python dtbackend/test_musteri_companies_helper.py
```

Expected: all three labels print `OK`.

- [ ] **Step 12: Import-only smoke check**

```
python -c "import sys; sys.path.insert(0, 'dtbackend'); import app.api.v1.endpoints.romiot.station.qr_code, app.api.v1.endpoints.romiot.station.work_order; print('imports ok')"
```

Expected: `imports ok`.

- [ ] **Step 13: Commit**

```
git add dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py dtbackend/app/api/v1/endpoints/romiot/station/work_order.py
git commit -m "müşteri sender/target: scope storage tenant by targets, sender by ==department"
```

---

## Task 3: Backend — Yönetici create-müşteri + edit logic

**Files:**
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py:472-486` (edit-müşteri role/department reassembly)
- Modify: `dtbackend/app/api/v1/endpoints/romiot/station/station.py:793-810` (create-müşteri target_department + roles)

After this task: a yönetici creating a müşteri sets the new user's `department` to the value of the form's `musteri_department` field (the customer's company), not the yönetici's own. No `atolye:musteri_company:*` role is auto-added at creation; admin adds them out-of-band. Editing a müşteri preserves all existing `musteri_company:*` roles verbatim and carries the existing `department` forward — name/password edits no longer overwrite the customer-of-record.

- [ ] **Step 1: Rewrite the edit-müşteri reassembly to preserve roles and department**

In `dtbackend/app/api/v1/endpoints/romiot/station/station.py`, replace lines 472-493:

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

            pb_payload: dict = {
                "username": new_username,
                "name": user_data.name if user_data.name is not None else target_pb_user.get("name", ""),
                "role": pb_roles,
                "department": department_for_payload,
                "company": user_company,
            }
```

with:

```python
            existing_role_values = target_pb_user.get("role") if isinstance(target_pb_user.get("role"), list) else []
            existing_department = (target_pb_user.get("department") or "").strip()
            pb_roles = [f"atolye:{new_role.value}"]
            if new_role == ManagedUserRoleType.MUSTERI:
                # Preserve every atolye:musteri_company:* role verbatim; admin owns
                # the linked-targets list. No synthesis, no fallback.
                for role in existing_role_values:
                    if isinstance(role, str) and role.startswith("atolye:musteri_company:"):
                        pb_roles.append(role)
                # Müşteri's department is the customer's own company; do not
                # overwrite it with the yönetici's company on a name/password edit.
                department_for_payload = existing_department or user_company
            else:
                # Operator / yönetici (non-müşteri target): department is the
                # yönetici's company (workshop), as today.
                department_for_payload = user_company

            pb_payload: dict = {
                "username": new_username,
                "name": user_data.name if user_data.name is not None else target_pb_user.get("name", ""),
                "role": pb_roles,
                "department": department_for_payload,
                "company": user_company,
            }
```

- [ ] **Step 2: Rewrite the create-müşteri department+roles**

In the same file, replace lines 793-810:

```python
    # Department mapping:
    # - all roles keep main company in department
    # - musteri-specific company is stored in an extra role
    target_department = user_company
    role_values = [full_role]
    if user_data.role == UserRoleType.MUSTERI:
        musteri_department = (user_data.musteri_department or "").strip()
        if ":" in musteri_department:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Müşteri şirket/departman bilgisinde ':' karakteri kullanılamaz"
            )
        role_values.append(f"atolye:musteri_company:{musteri_department}")
```

with:

```python
    # Department mapping:
    # - operator / yönetici: department = yönetici's own company (workshop)
    # - müşteri: department = the customer's own company (the sender identity).
    #   Linked targets (atolye:musteri_company:<X>) are added by an admin
    #   out-of-band after creation, not here.
    role_values = [full_role]
    if user_data.role == UserRoleType.MUSTERI:
        musteri_department = (user_data.musteri_department or "").strip()
        if ":" in musteri_department:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Müşteri şirket/departman bilgisinde ':' karakteri kullanılamaz"
            )
        target_department = musteri_department
    else:
        target_department = user_company
```

- [ ] **Step 3: Lint**

```
python -m ruff check dtbackend/app/api/v1/endpoints/romiot/station/station.py
```

Expected: no NEW errors.

- [ ] **Step 4: Import-only smoke check**

```
python -c "import sys; sys.path.insert(0, 'dtbackend'); import app.api.v1.endpoints.romiot.station.station; print('imports ok')"
```

Expected: `imports ok`.

- [ ] **Step 5: Commit**

```
git add dtbackend/app/api/v1/endpoints/romiot/station/station.py
git commit -m "müşteri sender/target: department=customer at create, preserve roles/department on edit"
```

---

## Task 4: Frontend — `target_company` form field + sender from `userOwnCompany` + dual fields

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx` — `BarcodeFormData` (line 23-35), state (lines 38-44), role-extraction effect (lines 46-89), reconcile effect (lines 109-119), `handleGenerateBarcode` payload (lines 158-170), print-card HTML (line 233), JSX form fields (lines 415-438), preview table (line 612)

After this task: the form sends `target_company` instead of `company_from`, the printed/preview "Gönderen Firma" reads from a new `userOwnCompany` state (the müşteri's `user.department`), the existing dropdown is repurposed as the new "Hedef Firma" selector with options from `userCompanies` (role-derived targets), and a separate read-only "Gönderen Firma" `<input>` shows the sender. The submit button is disabled when the user has no targets.

- [ ] **Step 1: Update `BarcodeFormData`**

In `dtfrontend/src/app/[platform]/atolye/musteri/page.tsx`, replace lines 23-35:

```tsx
interface BarcodeFormData {
  main_customer: string;
  sector: string;
  company_from: string;
  teklif_number: string;
  aselsan_order_number: string;
  order_item_number: string;
  part_number: string;
  revision_number: string;
  quantity: number;
  package_quantity: number;
  target_date: string;
}
```

with:

```tsx
interface BarcodeFormData {
  main_customer: string;
  sector: string;
  target_company: string;
  teklif_number: string;
  aselsan_order_number: string;
  order_item_number: string;
  part_number: string;
  revision_number: string;
  quantity: number;
  package_quantity: number;
  target_date: string;
}
```

- [ ] **Step 2: Add `userOwnCompany` state**

Find the existing state block (around lines 38-44):

```tsx
  const { user } = useUser();
  const [isMusteri, setIsMusteri] = useState(false);
  const [isYonetici, setIsYonetici] = useState(false);
  const [userCompanies, setUserCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

Replace with:

```tsx
  const { user } = useUser();
  const [isMusteri, setIsMusteri] = useState(false);
  const [isYonetici, setIsYonetici] = useState(false);
  const [userCompanies, setUserCompanies] = useState<string[]>([]);
  const [userOwnCompany, setUserOwnCompany] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 3: Set `userOwnCompany` inside the role-extraction effect**

Replace the existing role-extraction effect (find the `useEffect` block whose final `setUserCompanies(...)` lines exist; it spans roughly lines 46-89):

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

with:

```tsx
  // Check user roles and extract sender + allowed targets.
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

        // Sender ("Gönderen Firma") is always the user's own company.
        const ownCompany = (user.department || user.company || "").trim();
        setUserOwnCompany(ownCompany);

        // Targets ("Hedef Firma" dropdown options) — for müşteri, the
        // atolye:musteri_company:<X> role values; for yönetici-only, their own
        // company (a single allowed self-target preserves the existing flow).
        const prefix = "atolye:musteri_company:";
        const seen = new Set<string>();
        const targets: string[] = [];
        if (musteriRole) {
          for (const role of user.role) {
            if (typeof role === "string" && role.startsWith(prefix)) {
              const value = role.slice(prefix.length).trim();
              if (value && !seen.has(value)) {
                seen.add(value);
                targets.push(value);
              }
            }
          }
          setUserCompanies(targets);
        } else {
          // Yönetici-only: target == own company.
          setUserCompanies(ownCompany ? [ownCompany] : []);
        }
      }
    }
  }, [user]);
```

- [ ] **Step 4: Rename the reconcile effect's field reference**

Replace the existing reconcile effect (around lines 109-119):

```tsx
  // Default company_from to the first allowed company; preserve user's choice if it is still valid.
  useEffect(() => {
    if (userCompanies.length > 0 && (isMusteri || isYonetici)) {
      setBarcodeFormData((prev) => ({
        ...prev,
        company_from: userCompanies.includes(prev.company_from)
          ? prev.company_from
          : userCompanies[0],
      }));
    }
  }, [userCompanies, isMusteri, isYonetici]);
```

with:

```tsx
  // Default target_company to the first allowed target; preserve user's choice if it is still valid.
  useEffect(() => {
    if (userCompanies.length > 0 && (isMusteri || isYonetici)) {
      setBarcodeFormData((prev) => ({
        ...prev,
        target_company: userCompanies.includes(prev.target_company)
          ? prev.target_company
          : userCompanies[0],
      }));
    }
  }, [userCompanies, isMusteri, isYonetici]);
```

- [ ] **Step 5: Update the initial `useState` for `barcodeFormData`**

Find the line (around line 95) that initializes `barcodeFormData` with `company_from: ""`. The relevant block is the `useState<BarcodeFormData>({...})` call. Replace:

```tsx
    company_from: "",
```

with:

```tsx
    target_company: "",
```

(There is exactly one occurrence of `company_from: ""` in this file.)

- [ ] **Step 6: Update the submit payload to send `target_company`**

Replace the `payload` block in `handleGenerateBarcode` (around lines 158-170):

```tsx
      const payload: any = {
        main_customer: barcodeFormData.main_customer,
        sector: barcodeFormData.sector,
        company_from: barcodeFormData.company_from,
        teklif_number: barcodeFormData.teklif_number.trim(),
        aselsan_order_number: barcodeFormData.aselsan_order_number,
        order_item_number: barcodeFormData.order_item_number,
        part_number: barcodeFormData.part_number,
        revision_number: barcodeFormData.revision_number,
        quantity: barcodeFormData.quantity,
        package_quantity: effectivePackageQuantity,
        target_date: barcodeFormData.target_date,
      };
```

with:

```tsx
      const payload: any = {
        main_customer: barcodeFormData.main_customer,
        sector: barcodeFormData.sector,
        target_company: barcodeFormData.target_company,
        teklif_number: barcodeFormData.teklif_number.trim(),
        aselsan_order_number: barcodeFormData.aselsan_order_number,
        order_item_number: barcodeFormData.order_item_number,
        part_number: barcodeFormData.part_number,
        revision_number: barcodeFormData.revision_number,
        quantity: barcodeFormData.quantity,
        package_quantity: effectivePackageQuantity,
        target_date: barcodeFormData.target_date,
      };
```

- [ ] **Step 7: Update the print-card HTML "Gönderen Firma" row to read from `userOwnCompany`**

Find the print-card row (around line 233):

```tsx
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Gönderen Firma</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.company_from}</td></tr>
```

Replace with:

```tsx
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Gönderen Firma</td><td style="border: 1px solid #d1d5db; padding: 6px;">${userOwnCompany}</td></tr>
```

- [ ] **Step 8: Update the on-screen preview table "Gönderen Firma" cell**

Find the preview table cell (around line 612):

```tsx
                            <td className="py-2 px-3 text-gray-900">{barcodeFormData.company_from}</td>
```

Replace with:

```tsx
                            <td className="py-2 px-3 text-gray-900">{userOwnCompany}</td>
```

- [ ] **Step 9: Replace the existing "Gönderen Firma" `<select>` with a read-only `<input>` and a separate "Hedef Firma" `<select>`**

Find the existing form field for "Gönderen Firma" (around lines 415-438). It currently looks like:

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

Replace with two adjacent fields:

```tsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gönderen Firma *</label>
                <input
                  type="text"
                  value={userOwnCompany}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                  readOnly
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Firma *</label>
                <select
                  value={barcodeFormData.target_company}
                  onChange={(e) =>
                    setBarcodeFormData({ ...barcodeFormData, target_company: e.target.value })
                  }
                  className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                    userCompanies.length <= 1 ? "bg-gray-100 cursor-not-allowed" : "bg-white"
                  }`}
                  disabled={userCompanies.length === 0 || userCompanies.length === 1}
                  required
                >
                  {userCompanies.length === 0 && (
                    <option value="" disabled>
                      Yetkili hedef firma yok
                    </option>
                  )}
                  {userCompanies.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
                {isMusteri && userCompanies.length === 0 && (
                  <p className="mt-1 text-xs text-red-600">
                    Hedef firma rolü atanmamış. Yöneticinizle iletişime geçin.
                  </p>
                )}
              </div>
```

- [ ] **Step 10: Disable the submit button when there are no targets**

Find the submit button (search the file for `Barkod Oluştur`). It currently looks roughly like:

```tsx
            <button
              type="submit"
              disabled={loading}
              className="..."
            >
              {loading ? "Oluşturuluyor..." : "Barkod Oluştur"}
            </button>
```

Replace the `disabled={loading}` attribute with `disabled={loading || userCompanies.length === 0}`. Leave the rest of the button unchanged.

- [ ] **Step 11: Verify no leftover `company_from` references**

Use Grep on this single file with pattern `company_from`. Expected: zero matches. (All references — interface field, state init, reconcile effect, payload, print HTML, preview cell — should now use either `target_company` or `userOwnCompany`.)

- [ ] **Step 12: Type-check**

From `dtfrontend/`:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 13: Build**

From `dtfrontend/`:
```
npm run build
```

Expected: build succeeds.

- [ ] **Step 14: Commit**

```
git add dtfrontend/src/app/[platform]/atolye/musteri/page.tsx
git commit -m "müşteri sender/target: target_company dropdown + sender from userOwnCompany"
```

---

## Self-Review Notes

**Spec coverage (each spec section maps to at least one task):**

- "Schema rename" → Task 1 Step 1.
- "`generate_qr_code_batch` validation, server-side sender, target as storage tenant" → Task 1 Steps 2-4.
- "Group retrieval IN-on-targets, sender == department" → Task 2 Steps 1-3.
- "Work-order list scanned-WO `==` and unscanned-QR preview `IN`" → Task 2 Steps 5-9.
- "Helper unchanged; legacy fallback dropped at call sites" → Task 1 Step 2 + Task 2 Steps 1, 5.
- "Yönetici create-müşteri uses customer name for department, no auto-role" → Task 3 Step 2.
- "Yönetici-edit preserves roles + department" → Task 3 Step 1.
- "Frontend new dual fields, server-side sender display, payload field rename, submit-button gate" → Task 4 Steps 1-10.
- "Migration is manual" → no task; pre-condition for the user.

**Type/name consistency:**
- Backend variable: `musteri_targets` (was `musteri_companies`) at all three call sites in qr_code.py and work_order.py — Task 2 Steps 1, 5.
- Frontend: `BarcodeFormData.target_company`, state `userOwnCompany` and `userCompanies` (the latter now strictly the targets list).
- Schema field: `target_company` end-to-end. The backend's `WorkOrder.company_from` column is unchanged (it stores the sender, which is correct under the new model).

**Placeholders:** none. Each step contains the exact code to write or the exact command to run.

**Note on the local var name `target_company` in `work_order.py`:** It exists in the function (refers to the workshop being filtered for) and is unrelated to the new schema field of the same name. Task 2 Step 8 explicitly leaves it alone to avoid scope creep.
