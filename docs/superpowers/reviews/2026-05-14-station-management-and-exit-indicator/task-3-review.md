# Task 3: Create `ExitStationBadge` shared component

## Spec Compliance
- Reviewer: ✅ Spec compliant. Single new file `dtfrontend/src/components/atolye/ExitStationBadge.tsx` (38 insertions, no other files touched). Named export `export function ExitStationBadge` (not default). Props exactly `isExit: boolean | undefined; size?: "sm" | "md";`. Returns `null` when `!isExit`. Class strings match the plan byte-for-byte for both `sm` (`"text-xs px-2 py-0.5 gap-1"`, `"h-3 w-3"`) and `md` (`"text-sm px-2.5 py-1 gap-1.5"`, `"h-4 w-4"`). Tailwind colors `bg-amber-100 text-amber-800 border-amber-300`. SVG `d=` attribute byte-identical to plan and to source at `operator/page.tsx:806`. Badge text and title attribute retain proper Turkish accents and em-dash. No extra props, no extra size variants.

## Code Quality
- Reviewer: **Approved.** Strengths: single responsibility, narrow 38-line surface; matches sibling components' export pattern (`OrderFilesViewer.tsx`, `SelectOrdersFolder.tsx` — named export + `interface FooProps` + destructured-props signature); badge anatomy matches the established shape used at `operator/page.tsx:1053,1057,1181,1183` and `is-emirleri/page.tsx:420,426` (`inline-flex items-center rounded-full ... text-xs font-medium bg-{c}-100 text-{c}-800`); amber is unused elsewhere in the atolye palette, making it a clean semantic differentiator (green=Atölyede, blue=Çıkış yapıldı, yellow=pending, red=priority/error are all taken); defensive API (`boolean | undefined` short-circuits) lets callers forward without coercion; icon reuse keeps visual vocabulary consistent.
- Issues (Minor, non-blocking suggestions):
  - No `'use client'` directive — component has no hooks/state so it works as a Server Component, which is actually correct. **Not addressed** (intentional).
  - `title` attribute on the wrapper provides tooltip; an `aria-label` could be a more reliable screen-reader path, but the visible text "Çıkış Atölyesi" already conveys meaning. **Not addressed** (optional polish).
  - Template-literal class assembly is idiomatic in this codebase (sibling `operator/page.tsx:1020` uses the same pattern). No need for `clsx`.
- Base SHA: `8a268cef41ec83c8bfefdafcef77a69c23eff307`
- Head SHA: `843e0fdb4c12f7fca6fcb4402b51500fa5ce19ae`

## Resolution
- Issues found: 3 (all Minor, all optional polish)
- Issues fixed: 0
- Final status: ✅ Approved

## Notes
- TypeScript compile (`pnpm exec tsc --noEmit`): exit code 0, no errors.
- Path alias `@/components/atolye/*` confirmed working via existing tsconfig.
- Downstream tasks (T4, T5, T6) will bridge from these exact symbols (`ExitStationBadge` named export, `isExit` + `size` props).
- Visual smoke test deferred to T9 user-driven walkthrough.
