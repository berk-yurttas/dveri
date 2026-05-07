# Müşteri Multi-Company Linking — Design

**Date:** 2026-05-07
**Status:** Approved (pending spec review)

## Problem

Today a müşteri user is tightly coupled to exactly one company:

- At creation (`POST /romiot/station/user`), the yönetici supplies `musteri_department` and the user receives a single role `atolye:musteri_company:<X>`.
- The müşteri page renders `company_from` as a readonly input prefilled with that single value.
- The QR-group retrieval and work-order list endpoints scope by `company_from == musteri_department`.

Some müşteri users need to create QRs for, and view data scoped to, more than one company. The yönetici creating the user only owns their own company, so they cannot grant additional links — that is an admin task.

## Goal

Allow a müşteri user to be linked to multiple companies, and let them choose which company a new QR is created for. Other companies' workflows are unchanged.

## Non-goals

- No UI for managing multi-company links inside the app. The admin will add additional `atolye:musteri_company:<X>` roles directly in PocketBase.
- No change to the yönetici user-creation flow — single-company creation remains.
- No new "active company" mode or global selector. The choice happens at QR creation time on the form.

## Design

### Data model

A müşteri's PocketBase `role` array may contain multiple `atolye:musteri_company:<X>` entries. Existing single-company users keep working as-is (their array contains exactly one such entry).

There is no schema change. No migration is required.

### Backend

1. **Helper rename and return type.** `_extract_musteri_company_from_roles(role_values) -> str | None` becomes `_extract_musteri_companies_from_roles(role_values) -> list[str]`, returning a deduplicated, order-preserving list. Update all three copies:
   - [dtbackend/app/api/v1/endpoints/romiot/station/station.py:145](../../../dtbackend/app/api/v1/endpoints/romiot/station/station.py#L145)
   - [dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py:27](../../../dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py#L27)
   - [dtbackend/app/api/v1/endpoints/romiot/station/work_order.py:32](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L32)

2. **QR generation validation** ([qr_code.py:126](../../../dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py#L126), `generate_qr_code_batch`).
   - If caller has `atolye:musteri`: `batch_data.company_from` must be in their `musteri_companies` list. Otherwise 403.
   - Else if caller has `atolye:yonetici`: `batch_data.company_from` must equal `current_user.department`. Otherwise 403.
   - Both-roles case: müşteri rule applies.

   This is the security gate — the frontend field is no longer readonly, so the server must enforce it.

3. **List/group scoping changed from `==` to `IN`.** When the caller is a müşteri, fetch their full list of companies and use it as the filter set:
   - QR-group retrieval at [qr_code.py:354-356](../../../dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py#L354-L356)
   - Work-order list base condition at [work_order.py:478-479](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L478-L479) and [work_order.py:528-529](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L528-L529)
   - Feragat / payload-level check at [work_order.py:608](../../../dtbackend/app/api/v1/endpoints/romiot/station/work_order.py#L608)

4. **Preserve existing roles on yönetici edit** ([station.py:467-478](../../../dtbackend/app/api/v1/endpoints/romiot/station/station.py#L467-L478)). The current code rebuilds `pb_roles` carrying forward only the *first* `atolye:musteri_company:*` entry. After this change, that path silently wipes any extras the admin added. Fix: collect every `atolye:musteri_company:*` from `existing_role_values` and re-append them all. The existing fallback (old `XXX:YYY` department format → synthesize one entry) still applies only when zero entries exist.

5. **No change** to the user-creation flow at [station.py:732+](../../../dtbackend/app/api/v1/endpoints/romiot/station/station.py#L732). Yönetici still creates müşteris with exactly one company; admin adds more out-of-band.

### Frontend

Only [dtfrontend/src/app/\[platform\]/atolye/musteri/page.tsx](../../../dtfrontend/src/app/[platform]/atolye/musteri/page.tsx) changes.

1. Replace `userCompany: string | null` state with `userCompanies: string[]`. Build it from `user.role` by collecting every entry starting with `atolye:musteri_company:`, deduplicated, order-preserving. Backward-compat fallback (department-with-colon, then plain department, then `user.company`) only kicks in when the list is empty.

2. Initialize `barcodeFormData.company_from` to `userCompanies[0]` (or empty string if list is empty — same as today).

3. Replace the readonly `<input>` for "Gönderen Firma" at [musteri/page.tsx:399-405](../../../dtfrontend/src/app/[platform]/atolye/musteri/page.tsx#L399-L405) with a `<select>`:
   - **Müşteri user:** options are `userCompanies`. Enabled when length > 1; disabled when length ≤ 1 (visually equivalent to today's single-company UX).
   - **Yönetici-only user:** single option = the user's own company, resolved the same way as today (`department` then `user.company` fallback). Disabled.
   - **Both roles:** apply the müşteri rule (their linked companies).

4. No other UI changes. The work-order list and QR-group views already render whatever the backend returns; once the backend filter is widened, those pages naturally show data from all linked companies with no client work.

## Error handling and edge cases

- **Tampered request:** server 403s if `company_from` is not allowed for the caller.
- **Empty company list for a müşteri:** existing fallback path (department / `user.company`) preserves current behavior; if still empty, the form blocks submission as it does today.
- **Yönetici edits a multi-linked müşteri:** all `atolye:musteri_company:*` roles are preserved across the PATCH (covered by step 4 above).
- **Backward compatibility:** old-format `department = "XXX:YYY"` users continue to resolve to one company via the existing fallback; nothing about their experience changes.

## Testing

Backend:
- `_extract_musteri_companies_from_roles` returns `[]`, `["A"]`, `["A","B"]`, dedupes duplicates, preserves order.
- `generate-batch`:
  - müşteri with `["A","B"]` can submit `company_from=A` and `=B`; cannot submit `=C` (403).
  - yönetici can submit own department; cannot submit any other (403).
  - user with both roles follows müşteri rule.
- QR-group and work-order list endpoints return rows for every linked company; do not leak rows from non-linked companies.
- Yönetici PATCH on a müşteri with three `musteri_company` roles preserves all three.

Frontend:
- Single-company müşteri: dropdown shows one option, disabled — visual parity with today.
- Multi-company müşteri: dropdown enabled with all options; switching changes the value sent to the API.
- Yönetici-only: dropdown shows their company, disabled.
- Empty list: fallback to `department` / `user.company` so submission isn't blocked for legacy users.
