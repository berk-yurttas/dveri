# Task 20: musteri/page.tsx — F1 typeahead + F3 multi-pair

## Spec Compliance
- Reviewer: ✅ Spec compliant — all 8 steps verified: `pairs` replaces scalars; userCompanies role plumbing removed; CompanyTypeahead wired (raw onChange, yönetici-only lock); Malzemeler section with char filters + Malzeme Ekle + per-row validation; payload sends pairs; print + preview single-pair UNCHANGED, multi-pair nested table; import present.

## Code Quality
- Reviewer: ✅ Approved (after fixes). Central tsc + lint PASS. Confirmed immutability of pairs updates, remove-hidden-on-last-row, validatePair correctness (ASELSAN-only format, dup detection, empty rejection), single-pair preview byte-match.
- Base SHA: `0f042d7` → impl `853b9e7`/`fd73f60` → fixes `5fcb83c`

## Resolution
- Issues found: 1 Important, Minors.
- **Important #1** (lost explicit client target guard → UX regression, esp. disabled-yönetici-with-blank-company that POSTs empty target): FIXED — added an explicit Hedef Firma guard in `handleGenerateBarcode`, and the payload now sends `effectiveTarget` (= userOwnCompany for yönetici-only, whose disabled typeahead never fires onChange). This also fixes a latent bug where yönetici-only QR creation sent an empty target.
- **Minor #4** (onChange unsanitized → separators slip in via drag/IME/autofill; non-ASELSAN had no format validation): FIXED — both sipariş (`[^A-Za-z0-9]`) and kalem (`[^0-9]`) onChange handlers now sanitize, closing every input vector for ALL customers. This directly satisfies the user's explicit "block , and - and other separators" requirement.
- **Minor #3** (single-pair print inline-CSS spacing differs from sibling rows): cosmetic, from the plan verbatim, renders identically — left as-is.
- Final status: ✅ Approved
