# Task 10: Wire QuantityModal into the operator scan flow

## Spec Compliance
- Reviewer: ✅ Spec compliant. `QuantityModal` import + `PackageStatus` interface; both map fns take `scanQuantity` and emit `scan_quantity` (entrance keeps `quantity` cap); modal state + `quantityModalOpenRef` mirror; scanner `handleKeyPress` bails while modal open; `handleQRCodeScan` now fetches `/package-status`, computes remaining, short-circuits on 0 with a message, else opens the modal; new `handleQuantityConfirm` posts with `scan_quantity`, handles route-deviation re-post (carries scan_quantity via pendingPayload), scanProgress, first-scan route picker; `<QuantityModal/>` rendered after `<RouteWarningModal/>`. No direct POST on scan anymore; no unrelated logic removed. tsc clean.

## Code Quality
- Reviewer: Approved. Ref-mirror pause correctly sequenced (first line of handleKeyPress); mode captured from snapshot (no toggle race); remaining===0 short-circuit; route re-post carries scan_quantity via payload spread; no double-submit (Confirm disabled on loading/invalid + `quantityModalLoading` set/cleared); accurate useCallback deps; backend contract matches. 
- Important note: dev-only `window.testQRCodeScan` (and any direct caller) bypassed the scanner pause and could overwrite an open modal.
- Minor: `PackageStatus.exists` fetched but unused; duplicated error-shape handling (pre-existing pattern).
- Base SHA: 75950a7976e5d2767fed632ff9ef2ba82dfaec58
- Head SHA: 80dc196c176103098828c233c0377de480818b22

## Resolution
- Issues found: 1 Important (direct-caller bypass of modal-open guard), rest minor
- Issues fixed: 1 — added `if (quantityModalOpenRef.current) return;` as the first statement of `handleQRCodeScan`; tsc re-verified clean.
- Fix commit: (see git log — "harden handleQRCodeScan guard")
- Final status: ✅ Approved
