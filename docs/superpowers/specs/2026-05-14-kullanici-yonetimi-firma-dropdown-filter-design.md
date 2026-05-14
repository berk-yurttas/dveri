# Atölye Kullanıcı Yönetimi — Firma Dropdown Filter Design

**Date:** 2026-05-14
**Page:** [dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx)
**Scope:** Frontend only. No backend or schema changes.

## Goal

Replace the fullAdmin-only "Firma" text-input filter in the user-management table with a dropdown select that filters users by company across two fields with OR-logic:

- A user's own `department` (their firma)
- A user's `musteri_companies` (target firmalar, derived from `atolye:musteri_company:<company_name>` roles)

When the admin picks a company `C` from the dropdown, the table shows every user whose `department === C` **or** whose `musteri_companies.includes(C)`.

## Motivation

Today the page exposes a free-text "Firma" filter that substring-matches `u.company`. This makes it impossible to ask "show me everyone associated with company X" in one shot — a user who works at X (their `department`) and a customer who can ship to X (`musteri_company:X` role) are not both reachable through a single filter.

A canonical dropdown closes that gap and removes typos as a failure mode.

## Non-Goals

- No backend changes. `/romiot/station/stations/management/users` and `/romiot/station/stations/management/companies` are already sufficient.
- No change to the existing `filterRole`, `filterAtolye`, or top-of-page search input.
- No multi-select; one company at a time.
- No change to the create/edit user modals or the bulk hedef-firma modal.
- Does not expose the filter to yönetici (non-fullAdmin) — matches current visibility of the "Firma" column.

## Current Behavior (Baseline)

Relevant code lives in [kullanici-yonetimi/page.tsx](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx).

- State: `const [filterCompany, setFilterCompany] = useState("");` ([line 86](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx#L86))
- Filter logic (inside the `filteredUsers` useMemo, [line 162-163](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx#L162-L163)):
  ```ts
  const matchesCompany =
    !filterCompany || (u.company || "").toLowerCase().includes(filterCompany.toLowerCase());
  ```
- UI: a `<input type="text" placeholder="Filtrele...">` rendered in the "Firma" filter row, fullAdmin only ([line 578-588](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx#L578-L588)).
- `companies: string[]` is already fetched (fullAdmin only) from `/romiot/station/stations/management/companies` and stored in state ([line 122-124](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx#L122-L124)).
- `ManagedUser` carries both `department: string | null` and `musteri_companies: string[]` ([line 28-40](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx#L28-L40)).

## Target Behavior

### Filter logic

Update the `matchesCompany` clause in the `filteredUsers` useMemo to:

```ts
const matchesCompany =
  !filterCompany ||
  u.department === filterCompany ||
  u.musteri_companies.includes(filterCompany);
```

Notes:

- Exact match on `department` (no `.toLowerCase()`, no substring). The dropdown produces canonical values from the same list the backend persists, so casing/spacing already align.
- The empty string sentinel (`""`) continues to mean "no filter" — matches the current `!filterCompany` convention.
- `u.musteri_companies` is always an array (initialized server-side and to `[]` in the fallback path), so `.includes` is safe without a nullish check.

### UI

Replace the existing text input with a `<select>` in the same table cell:

```tsx
<td className="px-4 py-2">
  <select
    value={filterCompany}
    onChange={(e) => setFilterCompany(e.target.value)}
    className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
  >
    <option value="">Hepsi</option>
    {[...companies]
      .sort((a, b) => a.localeCompare(b, "tr"))
      .map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
  </select>
</td>
```

Notes:

- Sorted alphabetically with Turkish locale (`localeCompare(_, "tr")`) so İ/I/ş/ç order correctly.
- The cell remains gated by `isFullAdmin`, identical to the current text-input cell.
- Styling mirrors the existing `filterRole` `<select>` ([line 557-567](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx#L557-L567)) for visual consistency.

### Edge cases

- `companies` empty: dropdown still renders with only the "Hepsi" option. The filter is effectively a no-op, which is correct.
- Stale selection: if a company is selected and then admin removes that company from the system (via some other page) and the user list refetches, the selected option might no longer exist in the dropdown. The `<select>` will fall back to the first option ("Hepsi") visually but `filterCompany` state retains the old value until the user re-selects. This is acceptable — refetching the page resets state anyway. No defensive sync needed.
- User with `department === null`: `null === filterCompany` is always false, so they only appear if their `musteri_companies` matches. Correct.

## Implementation Surface

Single file: [dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx)

Two edits:

1. In the `filteredUsers` useMemo (around [line 162-163](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx#L162-L163)): replace the `matchesCompany` expression as shown above.
2. In the Firma filter `<td>` (around [line 578-588](../../../dtfrontend/src/app/%5Bplatform%5D/atolye/kullanici-yonetimi/page.tsx#L578-L588)): swap the `<input>` for the `<select>` as shown above.

No other files are touched.

## Testing

Manual verification in the running frontend, signed in as a fullAdmin user:

1. Open Atölye → Kullanıcı Yönetimi.
2. Confirm the "Firma" filter cell now shows a dropdown, not a text input.
3. Confirm "Hepsi" is the default and the list is sorted by company name (Turkish locale).
4. Select a company that has at least one operator/yönetici/satınalma whose `department` equals it — they appear.
5. Select a company that is in some müşteri user's `musteri_companies` — that müşteri appears.
6. Select a company that satisfies both conditions for different users — both sets appear.
7. Select a company that satisfies neither — "Kullanıcı bulunamadı." shown.
8. Switch back to "Hepsi" — full list restored.
9. Confirm yönetici users (non-fullAdmin) still see no Firma column or filter cell.
10. Confirm `filterAtolye`, `filterRole`, and the top search input still work and compose correctly with the new dropdown.

No automated tests are added — there is no existing test suite for this page and the change is a small, locally-scoped UI tweak.

## Risks

- **Behavior change for fullAdmins** who relied on substring matching against `u.company` (e.g. typing "ASEL" to match "ASELSAN MGEO" *and* "ASELSAN HBT"). Mitigation: this is a deliberate trade-off the admin asked for; canonical exact match is the requested semantics. Substring search is still available via the top-of-page search input, which already covers `u.company`.
- **`department` vs `company` divergence**: the previous filter used `u.company`; the new logic uses `u.department`. For non-operator users these typically hold the same string but the data model allows divergence. If a real user is found where they differ, the dropdown will match on `department` only. This is intentional and matches the requested wording ("filter both department and atolye:musteri_company"). Revisit only if a concrete data case shows up where matching `company` instead would be correct.
