# Task 5: Entrance endpoint — accumulate entered pieces + audit

## Spec Compliance
- Reviewer: ✅ Spec compliant. `WorkOrderScan`/`PackageStatus` imports added; hard duplicate-400 replaced by existing-row lookup + `_check_entrance_scan` cap check; create-or-accumulate branch (`entered_quantity += scan_quantity` on re-scan, else create with `entered_quantity=scan_quantity, exited_quantity=0`); `WorkOrderScan(direction="in")` audit row; single commit+refresh. F5/F6, active-at-other-station, priority inherit, pairs-persist, integration push, `is_first_scan_for_group` all unchanged. Import ok; helper tests 13/13.

## Code Quality
- Reviewer: Approved. Cap check before mutation; both rows in one transaction; package counting unaffected; removing the duplicate-400 does not affect route/active checks (they key off exit_date/row existence). Notes: `PackageStatus` import is unused until Task 7 lands (resolves in this same branch at Wave D); `new_work_order` name slightly misleading on the accumulate path (cosmetic); cap is checked against incoming `quantity` not stored (edge case, per design).
- Base SHA: 2f2ecc99bb52a546b5003c916c7c84006652c2b2
- Head SHA: d16a2f088ba9d08f4193f191fc9b026626f28df8

## Resolution
- Issues found: 1 Important (unused import — bundled with Task 7 in this branch), rest minor
- Issues fixed: 0 required now (Task 7 in Wave D removes the unused-import concern)
- Final status: ✅ Approved
