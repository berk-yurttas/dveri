# Müşteri Sender/Target Re-Architecture — Design

**Date:** 2026-05-07
**Status:** Approved (pending spec review)
**Supersedes:** [2026-05-07-musteri-multi-company-design.md](./2026-05-07-musteri-multi-company-design.md). Four implementation commits already exist on `feat/musteri-multi-company` (helper plural rewrite, IN-scoping, server-side validation, dropdown). They are partially reused; semantics shift as below.

## Problem

Today the müşteri user is modeled as a **workshop tenant**: their `department` holds the workshop's company, and a single `atolye:musteri_company:<X>` role names the customer they represent. The first iteration of multi-company simply allowed multiple of those roles. The user's actual mental model is different and cleaner:

- The müşteri **is** a customer (e.g., ACME).
- The müşteri's "own" company belongs in `department`.
- The müşteri creates QRs **for** other companies (typically workshops like DIGINNO) — those companies are the **target** of each QR, picked at creation time.
- The QR's "Gönderen Firma" (sender) is always the müşteri's own company.

The first iteration's dropdown also conflated the two roles: the user picked from a list of "linked customers" but stamped that as `company_from` (sender). With the corrected model, the dropdown picks the **target** workshop, and `company_from` is always the müşteri's department.

## Goal

Re-anchor the data model so a müşteri user is a customer (sender), `atolye:musteri_company:<X>` roles list the targets they can submit work to, and each QR carries its target as the storage tenant.

## Non-goals

- No UI for managing target links inside the app. Admin manages role entries via PocketBase directly (an admin-side workflow already exists separately).
- No new operator/yönetici flows. They keep working as today; they just see correct data again because of how QRs are now stored.
- No data migration script. Existing müşteri users will be migrated manually (small population).

## Design

### Data model

| Field | Holds | Example |
|---|---|---|
| `user.department` (müşteri) | the müşteri's own company — the **sender** | `"ACME"` |
| `atolye:musteri_company:<X>` roles (müşteri) | the **target** companies the müşteri can submit work to (typically workshops) | `DIGINNO`, `OTHER_WORKSHOP` |
| `QRCodeData.company` (storage tenant) | the **target** picked at creation | `"DIGINNO"` |
| QR JSON `company_from` (printed "Gönderen Firma") | always the müşteri's `department`, set server-side | `"ACME"` |
| `WorkOrder.company_from` | same as the QR JSON value (already true today) | `"ACME"` |

A müşteri with zero `atolye:musteri_company:*` roles cannot create QRs (no valid targets) — server returns 403 with a clear message.

Operator/yönetici/satinalma user fields are unchanged. Their `department` continues to hold their own workshop.

### API change

The `QRCodeBatchCreate` payload's `company_from` field is **renamed to `target_company`** to match its new semantics. The frontend sends `target_company`. The server:

- Sets `QRCodeData.company = batch_data.target_company`.
- Sets the QR JSON's `company_from` from `current_user.department` (server-side, ignoring any client value).

The backend rejects any payload with the legacy `company_from` field set (extra-field error from Pydantic) so old clients fail loudly rather than silently.

### Backend changes

1. **Schema rename** in `dtbackend/app/schemas/qr_code.py`: `QRCodeBatchCreate.company_from` → `target_company`. Mark the field required.

2. **`generate_qr_code_batch`** at [qr_code.py:126](dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py#L126):
   - Read `target_company = batch_data.target_company.strip()`.
   - Compute `allowed_targets = _extract_musteri_companies_from_roles(role_values)` for müşteri callers (yönetici case described below).
   - Reject if `target_company not in allowed_targets` → 403 `"Bu hedef firma için QR kod oluşturma yetkiniz yok."`.
   - Reject if müşteri's `allowed_targets` is empty → 403 `"Hedef firma rolü atanmamış. Yöneticinizle iletişime geçin."`.
   - Build the QR JSON with `"company_from": current_user.department` (server-source-of-truth).
   - Persist `QRCodeData(company=target_company, data=...)`.
   - Yönetici callers: out-of-scope for the new flow. Keep current behavior unchanged for backward compatibility — a yönetici can still hit this endpoint and submit a `target_company` equal to their own `department`. This preserves any existing yönetici-side QR-generation use case without expanding it.

3. **Group retrieval** at [qr_code.py:285](dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py#L285) (`get_qr_codes_by_work_order_group`):
   - For müşteri: query becomes `WHERE company IN :targets AND data->>'work_order_group_id' = :group_id` where `targets = _extract_musteri_companies_from_roles(role_values)` (their current allowed targets). The per-row `payload.company_from` filter changes to `== current_user.department` (their sender identity, single value).
   - For yönetici: unchanged from today — `WHERE company == department`.

4. **Work-order list** at [work_order.py:386](dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L386) (`get_all_work_orders`):
   - For müşteri scanned-WO base condition (currently `WorkOrder.company_from.in_(musteri_companies)` after Task 1): becomes `WorkOrder.company_from == current_user.department` (their sender identity is stable). Reverts the IN scoping in this specific spot.
   - For müşteri unscanned-QR preview merge at [work_order.py:592](dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L592): query becomes `WHERE QRCodeData.company.in_(allowed_targets)` (the targets from their roles). Per-payload filter `company_from != department` continues (pure defense-in-depth).
   - For yönetici: unchanged from today — `WHERE QRCodeData.company == target_company` where `target_company` is their own department.

5. **Helper** `_extract_musteri_companies_from_roles` (introduced in commit `7c60ba8`): kept as-is. Continues to return the list of targets from `atolye:musteri_company:*` roles. The legacy `XXX:YYY` department fallback that the helper-call sites currently use is **dropped** in this redesign (legacy users will be migrated manually); the empty-list path now leads to a clean 403, not a quiet fallback.

6. **Yönetici create-müşteri flow** at [station.py:732+](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L732):
   - Müşteri branch: `target_department = user_data.musteri_department.strip()` (the customer's company name from the form), instead of the current `user_company` (yönetici's own).
   - Roles: just `["atolye:musteri"]`. The `atolye:musteri_company:<X>` role is **no longer auto-added** at creation. Admin adds targets out-of-band after creation (the admin-side workflow handles this).

7. **Yönetici-edit logic** at [station.py:467-491](dtbackend/app/api/v1/endpoints/romiot/station/station.py#L467) (introduced in commit `7c60ba8`):
   - Drop the synthesis loop that re-builds `pb_roles` with auto-appended `atolye:musteri_company:<X>` from `musteri_companies` plus fallbacks.
   - Replacement: when re-saving roles for a müşteri target user, preserve every `atolye:musteri_company:*` entry from `existing_role_values` verbatim. No synthesis, no fallback. The base role `atolye:musteri` is added explicitly (as today).
   - Also: when a yönetici edits a müşteri user, the müşteri's `department` (= the customer's company) should NOT be overwritten with the yönetici's own. Department writes happen only at create time, or via admin-side flows. Today's edit endpoint may overwrite `department`; this is fixed by reading the existing target user's department and reusing it on the PATCH (carry it forward unchanged).

### Frontend changes

Only [musteri/page.tsx](dtfrontend/src/app/[platform]/atolye/musteri/page.tsx). State and effects already exist from Task 3; semantics shift.

1. **State:** `userCompanies: string[]` — keep, but now represents **targets** (role-derived only). Source: `atolye:musteri_company:*` roles, deduplicated. **Department is no longer added to this list.** No legacy-fallback path (the spec drops it on backend; FE matches).

2. **New state:** `userOwnCompany: string` — the müşteri's `user.department`, used to populate the read-only "Gönderen Firma" field.

3. **Form data:**
   - `BarcodeFormData` is updated: rename `company_from` → `target_company`. Initialize from `userCompanies[0]` (or empty if no targets). The reconcile effect (commit `585d9bb`) keeps working with the new field name.
   - Submit handler: send `target_company` in the payload. Do NOT send `company_from` — the server populates the JSON's `company_from` itself.

4. **JSX**:
   - "Gönderen Firma" field: read-only `<input>` showing `userOwnCompany`. (Reverts to the pre-Task-3 input shape, but bound to `userOwnCompany`, not the role-derived value.)
   - **New** required `<select>` field labeled **"Hedef Firma"**, placed adjacent to "Gönderen Firma" in the form layout. Options = `userCompanies` (targets). Disabled when `userCompanies.length <= 1`. Empty-list state: `<option value="" disabled>Yetkili hedef firma yok</option>` and the form's submit button is disabled (no valid target → can't submit).

5. **Print/preview rendering:** the "Gönderen Firma" row on the printed QR continues to show `barcodeFormData.company_from` today. Update those references (preview tables and print HTML at [musteri/page.tsx:212](dtfrontend/src/app/[platform]/atolye/musteri/page.tsx#L212), [:580](dtfrontend/src/app/[platform]/atolye/musteri/page.tsx#L580)) to read `userOwnCompany`. The "Hedef Firma" doesn't appear on the printed QR — the workshop is implicit (the operator scans at their own station).

### Validation cleanup

Server-side validation block from commit `95417ce` (the müşteri/yönetici allowed-set check) is rewritten to match the new semantics:

- The check now applies to `target_company` (not `company_from`).
- Müşteri rule: must be in `_extract_musteri_companies_from_roles(role_values)`.
- Yönetici rule: must equal their `department` (legacy/transitional support).

## Error handling and edge cases

- **Müşteri with no targets:** 403 at QR creation with `"Hedef firma rolü atanmamış. Yöneticinizle iletişime geçin."`. Frontend disables the submit button when `userCompanies.length === 0`, so the request never fires in the normal flow — the 403 is the defense-in-depth.
- **Tampered request:** server rejects any `target_company` not in the caller's allowed set (same shape as today's check, just keyed off the new field name).
- **Client sends `company_from` in payload:** Pydantic strict mode (`extra="forbid"` on the schema) rejects it. Old FE versions fail loudly.
- **Yönetici edits müşteri's name:** `department` is preserved (carried forward from the existing PB record); all `atolye:musteri_company:*` roles are preserved verbatim.
- **Operator scans QR:** unchanged. They see the JSON payload with `company_from = <müşteri's department>`. No change to print layout.
- **Yönetici unscanned-QR preview:** newly works again — QRs targeting their workshop are stored with `QRCodeData.company = <their department>`.

## Migration (manual)

For each existing müşteri user (small population):

1. Read the existing `atolye:musteri_company:<X>` value (single string `X`).
2. Set `user.department = X`.
3. Remove the `atolye:musteri_company:<X>` role.
4. (Optional, per use case) Add new `atolye:musteri_company:<workshop>` role(s) for the workshops this customer will submit work to.

A user with `department=ACME` and no `musteri_company:*` roles is a valid logged-in account but cannot create QRs until admin adds at least one target role.

## Testing

Backend (helper-level standalone test in `dtbackend/test_musteri_companies_helper.py` already covers the role parsing — no change needed there).

Endpoint-level (manual verification):
- Müşteri ACME with roles `[DIGINNO, OTHER_WORKSHOP]` POSTs `generate-batch` with `target_company=DIGINNO` → 201, QR stored under `company=DIGINNO`, JSON has `company_from=ACME`.
- Same müşteri POSTs `target_company=NOT_LINKED` → 403.
- Müşteri ACME with empty role set POSTs anything → 403 with the role-missing message.
- Old client POSTs `company_from=...` → 422 (Pydantic extra-fields rejection).
- DIGINNO yönetici opens iş emirleri page → unscanned-QR preview now lists ACME's pending QR targeting DIGINNO.
- Müşteri opens iş emirleri page → sees scanned work orders where `company_from=ACME` and unscanned QRs whose target is in their current role set.

Frontend (manual verification):
- Single-target müşteri: "Gönderen Firma" shows their own company (read-only), "Hedef Firma" dropdown shows one target option, disabled. Submission works.
- Multi-target müşteri: dropdown is enabled with all options. Switching targets changes the body's `target_company`. Submission still puts their own company in the JSON's `company_from` (printed QR matches expectations).
- Müşteri with zero target roles: "Hedef Firma" shows the empty-state option, submit button is disabled, helpful inline message points to admin.

## Reuse of existing commits

| Commit | Status |
|---|---|
| `7c60ba8` (helper plural + IN scoping + edit-loop) | Helper rename **kept**. IN-scoping at QR-group endpoint **kept** (now keyed off targets). Work-order `WorkOrder.company_from.in_(...)` filter **reverted to `==`** (single sender identity). Edit-loop **rewritten** (preserve verbatim, no synthesis). |
| `95417ce` (validation in `generate-batch`) | **Rewritten** to validate `target_company` against the caller's role set; client `company_from` is no longer accepted. |
| `2c752e3` (frontend dropdown for `company_from`) | **Rewritten** to drive a separate "Hedef Firma" dropdown bound to `target_company`; "Gönderen Firma" reverts to a read-only input bound to `user.department`. |
| `585d9bb` (reconcile orphan value) | **Kept**, applied to the new `target_company` field. |

The implementation plan will lay out exactly which lines change in each file, with diffs against current HEAD.
