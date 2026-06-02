# Task 11: qr_code.py rewrite (F1 + F3)

## Spec Compliance
- Reviewer: ✅ Spec compliant — `_extract_musteri_companies_from_roles` deleted; generate-batch validates target against `company_integrations` (400 "Hedef firma bulunamadı"), keeps yönetici→own-company lock, writes `pairs` JSON, persists `WorkOrderPair`; both read endpoints normalize legacy pairs; müşteri filtered by `company_from = department`.

## Code Quality
- Reviewer: ✅ Approved (after one fix).
- Base SHA: `e1adc01`
- Impl SHA: `e5c1e41` · Fix SHA: `0997bcb`

## Resolution
- Issues found: 1 Important (legacy-pair normalization duplicated across `retrieve_qr_data` and `get_qr_codes_by_work_order_group` with a `pairs: null` behavioral divergence), plus Suggestions (status-code style mix; JSONB-scan perf note).
- Issues fixed: 1 — extracted a shared `_normalize_pairs(payload)` helper using `isinstance(pairs, list)`, applied in both read endpoints so the shape is identical (a `pairs: null` payload now coerces to `[]` consistently in both).
- Confirmed by reviewer: WorkOrderPair persistence + QR-code inserts commit atomically (single commit; rollback on short-code collision discards everything); SQL is fully parameterized (no injection); no unused imports.
- Suggestions not actioned: status-code style mix (mixed bare ints vs `status.*` — pre-existing convention, low priority); JSONB full-scan for müşteri (perf backlog — would need an expression index or denormalized `company_from` column).
- Final status: ✅ Approved
