# Kullanıcı Yönetimi — Firma Field + Bulk Hedef Firma Edit — Design

**Date:** 2026-05-11
**Status:** Approved (pending spec review)
**Builds on:** [2026-05-08-fulladmin-musteri-management-design.md](./2026-05-08-fulladmin-musteri-management-design.md). That feature shipped on `main` (commit range `e6ca3e0..fde9805`). The two key concepts from it stay: `fullAdmin:true` role for cross-company admins, and the listing/edit/create modals on `kullanici-yonetimi/page.tsx`.

## Problem

Three UX issues surfaced in production use of the fullAdmin user management page:

1. **Field redundancy.** Create/edit forms ask fullAdmin to fill in both "Şirket (Sahip Atölye)" (a dropdown that writes PB `company`) and either "Müşteri Adı" (for müşteri) or implicit workshop info (for non-müşteri). The two fields encode similar workshop-affiliation information; fullAdmin can pick a Şirket value that contradicts the rest of the form, and the dropdown source (existing Station companies) doesn't include newly-named workshops that don't yet have stations.

2. **No bulk editing of müşteri target firmalar.** Granting a single new target workshop to twenty müşteri users today requires opening twenty edit modals. The original spec explicitly punted this to admin work; the actual operational reality calls for a bulk path.

3. **Operators can be created/moved through fullAdmin's view.** Operators are tied to a specific station, which already lives in a workshop. Letting fullAdmin pick a Firma for an operator independent of their station can produce inconsistent rows. Operator creation also already has a proper home on the yönetici page.

4. **Terminology.** "Şirket (Sahip Atölye)" and "Hedef Atölyeler" are the language of the old workshop-tenant model. The product team uses "Firma" / "Hedef Firmalar" in conversation.

## Goal

Collapse the Firma field to a single editable text input, lock it for operators, remove "Operatör" from fullAdmin's create flow, and add a bulk-edit path for müşteri Hedef Firmalar. Rename the surviving Turkish labels accordingly.

## Non-goals

- No data migration. Existing PB rows keep their current `company` values; new writes will set `company = department`. Any drift between historical `company` and `department` resolves the first time a row is edited.
- No new role/field schema. PB schema stays exactly as it is.
- No changes to the müşteri-side QR creation flow, work order list, or sender/target model.

## Design

### Data model

| PB field | After this change | How it gets populated |
|---|---|---|
| `department` | Stays the canonical "user's company name" / Firma | Frontend text input "Firma". Validation: required, non-empty, no `:` character. |
| `company` | Mirror of `department` (always written equal) | Backend writes both fields to the same value on every create/update. Yönetici-scope listing (`item.company == user_company`) keeps working without changes. |
| `atolye:musteri_company:*` roles | Unchanged. The list of target workshops a müşteri can submit QRs to. | Per-user via the existing edit modal, OR bulk via the new endpoint. |

The simplification: there is no separate "owning workshop" concept anymore. `company` and `department` carry the same value going forward.

### Frontend changes

Only `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`.

#### 1. Form simplification

Both modals (edit + create) drop the existing `<select>` for "Şirket (Sahip Atölye)". They drop the separate "Müşteri Adı" text input (when role=musteri). They gain a single **"Firma"** text input shown for every role.

- `formData` / `createForm` lose `company`. The existing `department` field carries the Firma value.
- Validation: trim, non-empty, no `:` character. Same rules as today's `department` validator.
- **Operator role exception:** when the form's role is `operator`, the Firma input renders read-only (greyed-out background, no editing) and is populated from the operator's existing `department`. Create modal cannot select operator (§2), so this branch only matters for edit. Changing the Atölye does NOT re-write Firma — Firma reflects the original record. This is consistent with "fullAdmin cannot move an operator across workshops".

#### 2. Operator restriction in create modal

The role `<select>` in the create modal drops the `<option value="operator">Operatör</option>`. Only `yonetici / musteri / satinalma` remain. Submit-side: if a stale form somehow sends `role: "operator"`, the backend already rejects via the schema enum (see §Backend below).

#### 3. Operator restriction in edit modal

When the edit target's existing role is `operator`:
- The role `<select>` is disabled (operator can't be morphed via this UI). The `<select>` shows only `<option value="operator">Operatör</option>` so the value matches.
- The Firma `<input>` is `readOnly` with grey background.
- The Atölye `<select>` continues to work as today (yönetici uses the same path on the operator page; this UI mirrors it).
- Password, Name, Username edit normally.

#### 4. Bulk Hedef Firmalar edit

- **Listing table:** a leftmost checkbox column. The header `<th>` holds a "select all visible müşteris" `<input type="checkbox">` (indeterminate when some-but-not-all visible müşteris are selected). Non-müşteri body cells render an empty `<td>` (no checkbox).
- **Toolbar:** when `selectedMusteriIds.size > 0`, a sticky bar appears immediately above the table:
  - Label: `{N} müşteri seçili`
  - Button: `Hedef Firmaları Düzenle` (primary, dark green like other actions)
  - Button: `Seçimi Temizle` (secondary, light grey)
- **Modal:** opens with the firmalar list from `companies` state as checkboxes. State is initialized empty (no pre-fill).
  - Mode `<radio>`:
    - **Mevcuta ekle** (default) — chosen firmalar get added to each selected müşteri's existing target list. Existing targets stay.
    - **Mevcudu değiştir** — each selected müşteri's target list is replaced with exactly the checked firmalar (empty list allowed).
  - Footer: `İptal` / `Kaydet` buttons. Save calls the new bulk endpoint and on success refreshes the user list, closes the modal, clears the selection set, and shows `{N} müşteri için hedef firmalar güncellendi` in the existing success banner.

#### 5. Label changes

| Before | After |
|---|---|
| "Şirket (Sahip Atölye) *" (form label) | (field removed) |
| "Müşteri Adı *" (form label) | "Firma *" |
| "Hedef Atölyeler" (form label) | "Hedef Firmalar" |
| "Şirket" (list column) | "Firma" |
| "Şirket Seçiniz" (placeholder, old dropdown) | n/a |
| Helper text "QR'da 'Gönderen Firma' olarak basılır." | Stays under the Firma input only when role=musteri |
| Helper text "Müşterinin barkod oluşturabileceği hedef atölyeler. …" | Replaces "atölyeler" with "firmalar" |
| Bulk modal title | "Hedef Firmalar — Toplu Düzenleme" |

### Backend changes

`dtbackend/app/api/v1/endpoints/romiot/station/station.py`.

#### 1. Schemas

`ManagedUserUpdateRequest`:
- `company` field stays in the schema for backwards compatibility but is now ignored — backend always derives `company = department` (or for operator, from the existing station). Add a `description` note: `"Deprecated: ignored on input; backend writes company = department."`.
- The `validate_request` validator stops checking `company`. The `department`-cleanliness check (no `:`) stays.

`FullAdminUserCreateRequest`:
- `company` field becomes optional with default `None`. Backend derives.
- `role: ManagedUserRoleType` — keep enum unchanged, but the handler explicitly rejects `role == OPERATOR` (see §2 below). The schema enum stays inclusive for symmetry with the listing endpoint.

New schema `BulkMusteriCompaniesRequest`:

```python
class BulkMusteriCompaniesMode(str, Enum):
    ADD = "add"
    REPLACE = "replace"


class BulkMusteriCompaniesRequest(BaseModel):
    user_ids: list[str] = Field(..., min_length=1, description="PocketBase user ids to update")
    companies: list[str] = Field(..., description="Target firmalar to apply")
    mode: BulkMusteriCompaniesMode = Field(..., description="add (merge) or replace (overwrite)")

    @model_validator(mode="after")
    def validate(self):
        for c in self.companies:
            if not isinstance(c, str) or not c.strip() or ":" in c:
                raise ValueError("Geçersiz hedef firma değeri")
        return self
```

#### 2. `POST /management/users` (`full_admin_create_user`)

- Reject `role == ManagedUserRoleType.OPERATOR` with 400 `"Operatör kullanıcıları kullanıcı yönetimi sayfasında oluşturulamaz; yönetici sayfasını kullanın."`. Backend defense for the now-removed UI option.
- For non-operator roles: `company = department` (mirror). The handler's existing path that derives `target_department` is unchanged.
- `user_data.company` is no longer required — handler uses `user_data.department` as the source of truth.

#### 3. `PUT /management/users/{id}` (`update_company_user`)

- When the target is an operator (existing role contains `atolye:operator`):
  - Reject `user_data.department` if supplied AND `user_data.department.strip() != existing_department` (cleanly 400 `"Operatör için Firma bilgisi düzenlenemez"`).
  - Reject `user_data.role` if supplied AND it differs from `OPERATOR`. (Operators can only stay operators via this endpoint.)
- The "effective company" line that today reads `user_data.company or existing_company` becomes simply:
  - For operator: `effective_company = station.company` (if station resolves) or existing `company`.
  - For non-operator: `effective_company = (user_data.department or existing_department).strip()`. PB writes `company = department`.
- The existing musteri_companies replacement path stays the same.

#### 4. New endpoint: `PATCH /management/users/bulk-musteri-companies`

```python
@router.patch("/management/users/bulk-musteri-companies", response_model=dict)
async def bulk_musteri_companies(
    payload: BulkMusteriCompaniesRequest,
    current_user: User = Depends(check_authenticated),
    ...
):
    if not is_full_admin(current_user):
        raise HTTPException(403, "fullAdmin yetkisi gereklidir")

    # Dedupe normalized payload companies
    seen: set[str] = set()
    normalized: list[str] = []
    for c in payload.companies:
        n = c.strip()
        if n and n not in seen:
            seen.add(n)
            normalized.append(n)

    async with httpx.AsyncClient(...) as client:
        token = await _authenticate_pocketbase_admin(client)
        headers = {"Authorization": token}
        succeeded: list[str] = []
        failed: list[dict] = []

        for user_id in payload.user_ids:
            try:
                # Fetch user
                resp = await client.get(f"{settings.POCKETBASE_URL}/api/collections/users/records/{user_id}", headers=headers)
                if resp.status_code != 200:
                    failed.append({"id": user_id, "detail": "Kullanıcı bulunamadı"})
                    continue
                pb_user = resp.json()
                role_values = pb_user.get("role") if isinstance(pb_user.get("role"), list) else []
                if "atolye:musteri" not in role_values:
                    failed.append({"id": user_id, "detail": "Müşteri olmayan kullanıcı atlandı"})
                    continue

                # Build new role list
                non_company_roles = [r for r in role_values if not (isinstance(r, str) and r.startswith("atolye:musteri_company:"))]
                if payload.mode == BulkMusteriCompaniesMode.REPLACE:
                    targets = list(normalized)
                else:  # ADD
                    existing_targets = [r.split(":", 2)[2] for r in role_values if isinstance(r, str) and r.startswith("atolye:musteri_company:")]
                    seen_local: set[str] = set()
                    targets = []
                    for t in [*existing_targets, *normalized]:
                        if t and t not in seen_local:
                            seen_local.add(t)
                            targets.append(t)
                new_role_list = [*non_company_roles] + [f"atolye:musteri_company:{t}" for t in targets]

                # PATCH back
                patch_resp = await client.patch(
                    f"{settings.POCKETBASE_URL}/api/collections/users/records/{user_id}",
                    json={"role": new_role_list},
                    headers=headers,
                )
                if patch_resp.status_code in (200, 201):
                    succeeded.append(user_id)
                else:
                    failed.append({"id": user_id, "detail": "PocketBase güncelleme hatası"})
            except Exception as e:
                failed.append({"id": user_id, "detail": str(e)})

    return {"succeeded": succeeded, "failed": failed}
```

Returns a per-user breakdown so the frontend can show partial-failure messages.

### Frontend payload changes

- `POST /management/users` body: drop `company`. Send only `username/name/email/password/password_confirm/role/department/station_id?/musteri_companies?`.
- `PUT /management/users/{id}` body: drop `company`. Send `department` only when fullAdmin actually edits Firma (i.e., role is non-operator).

### Removed UI elements

- The "Şirket (Sahip Atölye)" `<select>` in both modals.
- The `companies.map((c) => <option ...>)` populating that dropdown — but `companies` state STAYS (it's used by the Hedef Firmalar checkboxes in both modals AND the bulk modal).
- The "Şirket" column header in the list — replaced by "Firma".
- The "Operatör" option in the create modal's role select.

## Error handling and edge cases

- **Bulk modal with no firmalar checked + Replace mode:** allowed. Clears every selected müşteri's target list. Confirm dialog: `"X müşterinin tüm hedef firmaları silinecek. Devam edilsin mi?"`. Add prevents this case (no-op).
- **Bulk modal includes a non-müşteri row in the selection (shouldn't happen — checkboxes only render for müşteri rows — but defense in depth):** backend skips the user and reports them in `failed[]`.
- **Operator with corrupted `company != department`** (pre-existing PB data drift from before this task): edit shows Firma read-only with the `department` value. Saving any unrelated field re-writes `company = department` automatically through the new mirror rule. Self-healing.
- **fullAdmin tries to change role away from operator via stale client:** backend rejects with 400 `"Operatör rolü değiştirilemez."`. Defense in depth.
- **Bulk endpoint called by yönetici (not fullAdmin):** 403 immediately.
- **Selection persists across pagination/filtering:** the selected set is by `pocketbase_id`, not row index. Filtering or searching doesn't touch the set; only "Seçimi Temizle" or a successful save clears it. Header `select all visible` ticks only currently-visible müşteri rows; unchecking it un-selects only those.
- **Filtering hides selected rows:** the bulk action bar continues to display the count (e.g., `5 müşteri seçili`) even if 2 of them are filtered out of view. Saving still applies to all 5.

## Testing

Backend (manual / endpoint level):
- `POST /management/users` with `role=operator` → 400 with the operator-rejection message.
- `POST /management/users` without `company` field → 201; PB record has `company = department`.
- `PUT /management/users/{operator_id}` with `department="X"` and existing department `"Y"` → 400 with `"Operatör için Firma bilgisi düzenlenemez"`.
- `PUT /management/users/{operator_id}` with `role="yonetici"` → 400 with `"Operatör rolü değiştirilemez."`.
- `PUT /management/users/{operator_id}` with `name="new"` → 200; `company` written as `department`.
- `PATCH /management/users/bulk-musteri-companies` with `mode=add`, 3 müşteri ids, 2 firmalar:
  - Each müşteri's `atolye:musteri_company:*` roles end up as `existing ∪ payload` (deduped).
  - Other roles preserved.
- `PATCH /management/users/bulk-musteri-companies` with `mode=replace`, 2 ids, empty `companies=[]`:
  - Each müşteri's `atolye:musteri_company:*` roles are wiped.
- `PATCH /management/users/bulk-musteri-companies` with one non-müşteri id mixed in → succeeded list excludes them, failed list includes them with `"Müşteri olmayan kullanıcı atlandı"`.
- Yönetici-only token calling `PATCH /bulk-musteri-companies` → 403.

Frontend (manual UI walkthrough):
- Listing shows checkbox column; only müşteri rows have a checkbox.
- Selecting all visible ticks only müşteris; non-müşteri rows stay unchecked.
- Toolbar appears with count; matches selection set size.
- Bulk modal opens; firmalar list matches `companies` state; mode radio defaults to "Mevcuta ekle".
- Save with `add` adds the picked firmalar to each selected müşteri without removing existing ones.
- Save with `replace` overwrites; an empty selection in `replace` mode shows the confirm dialog.
- Create modal has no "Operatör" option; no "Şirket" dropdown; the renamed "Firma" text input is present.
- Edit modal for a müşteri/yönetici/satinalma: "Firma" editable, no "Şirket" dropdown.
- Edit modal for an operator: "Firma" read-only and grey; role select disabled.
- After bulk save, list refreshes; selection clears; success banner shows the count.

## Reuse of existing code

- `_pb_create_user_record` (helper from the prior feature) is unchanged.
- `_extract_musteri_companies_from_roles` is unchanged (the bulk endpoint reuses this helper conceptually but inlines its logic to also retain non-musteri_company roles).
- The existing edit modal's Hedef Firmalar checkbox grid is the visual reference for the new bulk modal's checkbox grid — extract into a shared `<TargetFirmalarPicker>` sub-component if the file size grows beyond comfortable. Optional; defer to implementation plan.
