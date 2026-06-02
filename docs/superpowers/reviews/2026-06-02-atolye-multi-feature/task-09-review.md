# Task 09: New work_order_route schema

## Spec Compliance
- Reviewer: ✅ Spec compliant — single new file; all four classes (`WorkOrderRoutePosition`, `WorkOrderRouteCreate`, `WorkOrderRouteUpdate`, `WorkOrderRouteResponse`) present with exact field/config specs. `Create` has group_id (max 50) + station_ids (min 1); `Update` has only station_ids; `Response` has positions list + optional created_at. No extras.

## Code Quality
- Reviewer: ✅ Approved — 0 Critical/Important. Confirmed clean contract for the T14 endpoint: `station_ids` ordered `list[int]` with `min_length=1` guarantees safe `[0]`/`[-1]` indexing; role-dependent position-0 pin correctly kept server-side and documented in docstrings rather than leaking into the request body; `created_at` Optional default matches group-level response semantics.
- Base SHA: `881ff43`
- Head SHA: `438422a`

## Resolution
- Issues found: 1 Suggestion (mixed `model_config` dict form vs legacy `class Config` within the file)
- Issues fixed: 0 — left as-is. The mix actually conforms to the repo's de-facto convention (request bodies use `model_config={"extra":"forbid"}`, ORM-read models use `class Config: from_attributes=True`). Normalizing would make this file inconsistent with its siblings; any normalization should be a separate package-wide cleanup.
- Final status: ✅ Approved
