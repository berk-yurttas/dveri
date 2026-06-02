# Task 16: EntryStationBadge component

## Spec Compliance
- Reviewer: ✅ Spec compliant — named export `EntryStationBadge`; props `{ isEntry: boolean|undefined; size?: "sm"|"md" }` default "sm"; returns null when `!isEntry`; emerald pill (`bg-emerald-100 text-emerald-800 border-emerald-300`); `LogIn` lucide icon; "Giriş Atölyesi"; sm/md sizing. Drop-in sibling of ExitStationBadge (same export style + size contract).

## Code Quality
- Reviewer: ✅ Approved. Icon `aria-hidden`; Tailwind valid; uses real lucide `LogIn` (cleaner than sibling's inline SVG). Central `tsc --noEmit` passes.
- Base SHA: `5cfb7c5` → on gok2: `7315cf1`

## Resolution
- Issues found: 0 blocking (Minor: sibling adds a `title` tooltip + size-varied gap; Entry uses fixed gap, no title — per-plan, acceptable).
- Issues fixed: 0
- Final status: ✅ Approved
