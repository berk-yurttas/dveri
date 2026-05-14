# Atölye Kullanıcı Yönetimi — Firma Dropdown Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fullAdmin-only "Firma" text-input filter on the Atölye Kullanıcı Yönetimi page with a dropdown select that filters users by `department` OR `musteri_companies` membership (OR-logic).

**Architecture:** Frontend-only change. Two edits inside a single React client component: (1) widen the `matchesCompany` predicate inside the existing `filteredUsers` useMemo to test both fields with exact match, and (2) swap the `<input type="text">` in the table filter row for a `<select>` populated from the already-fetched `companies` state.

**Tech Stack:** Next.js 15 App Router, React (client component, `"use client"`), TypeScript, Tailwind classes (existing in file). No new dependencies. No backend changes.

**Spec:** [docs/superpowers/specs/2026-05-14-kullanici-yonetimi-firma-dropdown-filter-design.md](../specs/2026-05-14-kullanici-yonetimi-firma-dropdown-filter-design.md)

**Testing approach:** Per the spec, no automated tests are added — there is no existing Jest/RTL setup wired to this page. The implementer task is exempt from the RED/GREEN test-output requirement; it is verified via the manual checklist in Task 2.

---

## File Structure

Single file touched:

- **Modify:** `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`
  - Line 162-163: rewrite the `matchesCompany` predicate
  - Line 578-588: replace `<input type="text">` with `<select>` populated from `companies`

No files created. No files deleted.

---

### Task 1: Swap the filter logic and the input element

**Files:**
- Modify: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx:162-163` and `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx:578-588`

**Testing exemption:** This task is exempt from the RED/GREEN test-output requirement per the spec ("No automated tests are added — there is no existing test suite for this page"). Verification is the manual checklist in Task 2. The two edits are bundled into one task because landing them separately produces a degraded interim state (e.g., exact-match logic against free-text input).

**Current symbols (quoted from the file as it exists at base SHA):**

State, line 86:
```ts
const [filterCompany, setFilterCompany] = useState("");
```

`filteredUsers` useMemo, lines 153-165:
```ts
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

Firma filter cell, lines 578-588:
```tsx
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
```

Relevant types, lines 28-40 (unchanged — referenced for context only):
```ts
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

- [ ] **Step 1: Open the file**

Path: `dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx`

No content change yet — confirm the three quoted blocks above match the working tree before editing. If they don't (e.g., file has drifted), STOP and re-quote.

- [ ] **Step 2: Rewrite the `matchesCompany` predicate**

Find this exact line (line 163):
```ts
    const matchesCompany = !filterCompany || (u.company || "").toLowerCase().includes(filterCompany.toLowerCase());
```

Replace with:
```ts
    const matchesCompany =
      !filterCompany ||
      u.department === filterCompany ||
      u.musteri_companies.includes(filterCompany);
```

Rationale: `filterCompany` is now a canonical company name from the dropdown, so exact match on `department` is correct, and `musteri_companies` (always `string[]`, populated server-side) supports `.includes` without nullish guard. The useMemo dependency list (`[users, search, filterRole, filterAtolye, filterCompany, isFullAdmin]`) is already correct — no change.

- [ ] **Step 3: Replace the `<input>` with a `<select>` in the Firma filter cell**

Find this exact block (lines 578-588):
```tsx
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
```

Replace with:
```tsx
                  {isFullAdmin && (
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
                  )}
```

Rationale:
- Mirrors the styling of the existing `filterRole` `<select>` at lines 557-567 (`bg-white` added because native `<select>` defaults to a system color).
- `[...companies]` clones before sorting so we don't mutate the state array.
- Turkish-locale `localeCompare` so İ/I/ş/ç sort correctly.
- `"Hepsi"` (empty value) preserves the existing "no filter" sentinel — `filterCompany === ""`.

- [ ] **Step 4: Run the typechecker**

Run from the repo root:
```bash
cd dtfrontend && npx tsc --noEmit
```

Expected: exits 0, no errors. If errors appear in this file, they're real — fix them. Errors in unrelated files predate this change; record their text but don't fix them in this task.

- [ ] **Step 5: Run the linter (if configured)**

Run from the repo root:
```bash
cd dtfrontend && npm run lint
```

Expected: no new warnings or errors attributable to `kullanici-yonetimi/page.tsx`. If `npm run lint` is not defined (check `dtfrontend/package.json` scripts), skip this step and note it.

- [ ] **Step 6: Stage the change but DO NOT commit yet**

```bash
git add dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
git diff --cached dtfrontend/src/app/[platform]/atolye/kullanici-yonetimi/page.tsx
```

Expected: the diff shows exactly the `matchesCompany` rewrite and the `<input>`→`<select>` swap. Nothing else. If extra hunks appear (e.g. accidental whitespace changes), unstage and clean them up.

Commit happens in Task 2 after manual verification passes.

---

### Task 2: Manual verification in the browser

**Files:** none modified.

**Pre-req:** A fullAdmin account exists in the dev environment, and the backend has at least 2 companies registered with at least one user whose `department` equals company A, and at least one müşteri user whose `musteri_companies` includes company B (and ideally a user satisfying both for different companies).

- [ ] **Step 1: Start the frontend dev server**

```bash
cd dtfrontend && npm run dev
```

Expected: server starts on the configured port (check terminal output — typically `http://localhost:3000`). If the dev server is already running on this machine, skip starting it again.

- [ ] **Step 2: Sign in as a fullAdmin user and navigate to the page**

Open the browser, sign in, navigate to `/<platform>/atolye/kullanici-yonetimi`.

Expected: page loads, table renders, the "Firma" column header is visible.

- [ ] **Step 3: Confirm the filter is a dropdown**

In the filter row directly under the column headers, the "Firma" cell shows a `<select>` (not a text input). Default value: "Hepsi".

- [ ] **Step 4: Confirm the option list**

Open the dropdown. Options listed: `Hepsi`, then every company from the system in alphabetical Turkish order. Spot-check that a company starting with `İ` sorts in its Turkish position (between `I` and `J`), not the ASCII position.

- [ ] **Step 5: Filter by a `department`-only company**

Pick a company `A` whose users include at least one non-müşteri user with `department === A`. Select `A` in the dropdown.

Expected: the table shows users where `u.department === A` AND/OR `u.musteri_companies.includes(A)`. At minimum, the known `department === A` user appears.

- [ ] **Step 6: Filter by a `musteri_companies`-only company**

Pick a company `B` that appears in some müşteri's `musteri_companies` but is no user's `department`. Select `B`.

Expected: the relevant müşteri user(s) appear. No user whose `department` is some other company appears (unless their `musteri_companies` also includes `B`).

- [ ] **Step 7: Filter by a company that satisfies both for different users**

If available, pick a company `C` where one user has `department === C` and a different user has `C` in `musteri_companies`. Select `C`.

Expected: both users appear in the table.

- [ ] **Step 8: Filter by a company with no matches**

If a company exists that no current user is associated with on either field, pick it.

Expected: the empty-state row "Kullanıcı bulunamadı." renders.

- [ ] **Step 9: Reset and confirm composition with other filters**

Select "Hepsi" — full list restored.

Then with "Hepsi" selected, type something in the top search input, then in the "Atölye" filter cell, then change the "Rol" dropdown. Each should still narrow the list independently.

Finally, set the Firma dropdown to a company AND set the Rol dropdown to e.g. "Müşteri". Result should be the intersection (AND across filters).

- [ ] **Step 10: Sign in as a non-fullAdmin yönetici and confirm the column is hidden**

Sign out, sign in as a user with `atolye:yonetici` but without `fullAdmin:true`. Navigate to the same page.

Expected: the "Firma" column header is not rendered, the filter row's Firma cell is absent. (This matches the existing `isFullAdmin &&` gates.)

- [ ] **Step 11: Commit**

If all manual checks pass:
```bash
git commit -m "$(cat <<'EOF'
feat(kullanici-yonetimi): swap Firma filter to dropdown matching department + musteri_companies

Replaces the fullAdmin-only "Firma" text-input filter with a select
dropdown sourced from the existing /management/companies list. The
predicate now matches a user if u.department equals the selection OR
u.musteri_companies includes it (OR-logic across the two fields),
giving admins a single canonical filter that spans employees of a firma
and customers shipping to that firma.

Spec: docs/superpowers/specs/2026-05-14-kullanici-yonetimi-firma-dropdown-filter-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds. Pre-commit hooks (if any) pass without modification.

- [ ] **Step 12: Confirm the working tree is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. The plan is done.

---

## Self-Review

**Spec coverage:**
- Goal (replace text filter with dropdown, OR-logic across `department` and `musteri_companies`) → Task 1 Step 2 + Step 3.
- Non-goals (no backend changes, no other filters touched, no multi-select, no modal changes, fullAdmin-only) → preserved by editing only the two specified blocks; no surrounding code is touched.
- Filter logic exact match → Task 1 Step 2 snippet uses `===` and `.includes()`.
- Dropdown UI with "Hepsi" sentinel and Turkish-locale sort → Task 1 Step 3 snippet.
- Edge case: empty `companies` → renders dropdown with only "Hepsi" (Task 1 Step 3 map over empty array is a no-op).
- Edge case: stale selection → state retains value; spec says no defensive sync needed.
- Edge case: `department === null` → `null === filterCompany` is always false, falls through to `musteri_companies.includes` — covered by the snippet.
- Testing → Task 2 covers every manual checklist item from the spec's Testing section.
- Risks (substring→exact behavior change, `department` vs `company`) → noted in spec; plan does not introduce mitigations beyond what spec calls for.

**Placeholder scan:** no TBD/TODO/"add appropriate validation"/"similar to Task N"/"write tests for the above". Every code step has the full code. Every command step has the exact command and expected output.

**Type consistency:** uses `filterCompany: string`, `companies: string[]`, `u.department: string | null`, `u.musteri_companies: string[]` — all consistent with `ManagedUser` interface lines 28-40 and `useState` declarations in the file.
