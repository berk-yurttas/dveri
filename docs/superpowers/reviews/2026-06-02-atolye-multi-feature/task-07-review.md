# Task 07: qr_code schema — replace scalars with pairs

## Spec Compliance
- Reviewer: ✅ Spec compliant — `aselsan_order_number`/`order_item_number` removed from `QRCodeBatchCreate`; `pairs: list[OrderPair]` added with `min_length=1`; `OrderPair` imported; `model_config = {"extra": "forbid"}` retained; all other fields and sibling classes intact.

## Code Quality
- Reviewer: ✅ Approved — 0 actionable. `min_length=1` correct (every group has ≥1 pair via M1 backfill); `extra="forbid"` gives a clean 422 on the removed scalar fields. Trimmed one-line docstrings on unchanged classes match the plan's verbatim target text and lose no load-bearing info — acceptable.
- Base SHA: `881ff43`
- Head SHA: `cd35087`

## Resolution
- Issues found: 0 actionable
- Issues fixed: 0
- Final status: ✅ Approved

## Forward dependency note
The reviewer confirmed `qr_code.py` endpoint lines 223–224 (old `generate_qr_code_batch`) still reference `batch_data.aselsan_order_number`/`order_item_number`, which no longer exist — `POST /generate-batch` is non-functional between T07 and T11. **This is the planned T11 rewrite** (Wave 2), not a T07 defect. The branch must not be deployed until T11 lands.
