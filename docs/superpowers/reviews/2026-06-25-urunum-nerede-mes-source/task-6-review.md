# Task 6: GET /track-mes endpoint

## Spec Compliance
- Reviewer: ✅ Spec compliant. `@router.get("/track-mes", response_model=TrackResponse)`
  on the existing `work_order.router`; import added once near `push_and_sync`; validation
  order: role(403) → hedef_firma-blank(400) → search-params(400) → service call;
  `has_order` gates pass-None correctly; `ValueError` → 400; no `api.py` change; old
  `track_product` untouched; 24 tests pass.

## Code Quality
- Reviewer: Approved with 1 Important gap (fixed). Auth pattern mirrors sibling
  `track_product` exactly; ValueError messages are our own (not secrets) so `str(exc)`
  in 400 detail is safe; both short-circuits and delegation covered.
- Fixed: added `test_service_value_error_returns_400` — patches `track_from_mes` to
  raise `ValueError`, asserts handler converts to 400 with the message in detail.
- Minor non-blocking: import order is `toy→mes→user` (per-plan placement, not alpha;
  mid-file test imports are cosmetic layout). Not changed.
- Base SHA: abdc426
- Head SHA: 993f2aa (test gap), preceded by 1fca0ac (impl)

## Resolution
- Issues found: 1 Important (untested ValueError→400 branch), 2 Minor cosmetic
- Issues fixed: 1 Important (new test, 25/25 pass)
- Final status: ✅ Approved
