# Task 15: toy_api_service.py — pair-aware Mekasan push

## Spec Compliance
- Reviewer: ✅ Spec compliant — `send_production_order(work_order, station, api_url, api_key, company, pairs)`; helpers `_build_payload_item` + `_post_one`; empty pairs → warn+return; single pair → 1 POST, `Mes_OrderId = {group}-{station.id}` (unchanged); multi-pair → N parallel POSTs via `asyncio.gather`.

## Code Quality
- Reviewer: ✅ Approved (after one fix).
- Base SHA: `e1adc01`
- Impl SHA: `bc3314f` · Fix SHA: `0997bcb`

## Resolution
- Issues found: 1 Important (Mes_OrderId collision), 1 Important pre-existing/out-of-scope, 1 Suggestion.
- **Mes_OrderId collision** (multi-pair keyed only on `aselsan_order_number` collides when one order has several line items — same sipariş_no, different kalem_no — which is the *primary* multi-pair use case): FIXED — suffix now `{sipariş_no}-{kalem_no}` so each pair gets a unique, traceable id. Still contains the sipariş no the spec (F3.6) called for; strict improvement. **Surfaced to the user in a progress note for objection.**
- Confirmed by reviewer: single-pair payload field-complete & equivalent (sourced from `pairs[0]` via `_pairs_for_group`); `asyncio.gather` cannot raise (each `_post_one` swallows exceptions), so fire-and-forget contract holds even multi-pair; safe inside the caller's `create_task` with no unawaited-coroutine risk.
- Not actioned: (Important, pre-existing) unretained `create_task` can be GC'd before completion — existed before this task (old call was also `create_task`); flagged to backlog. (Suggestion) share one `AsyncClient` across the gather — skipped, N is small (1–3 pairs typically).
- Final status: ✅ Approved
