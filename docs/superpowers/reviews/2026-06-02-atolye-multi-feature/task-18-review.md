# Task 18: RouteWarningModal component

## Spec Compliance
- Reviewer: ✅ Spec compliant — named export; props `{ open, message, onCancel, onConfirm, loading? }`; returns null when `!open`; yellow warning block showing `⚠ {message}` with `whitespace-pre-line`; "İptal" (onCancel) + "Yine de Devam Et" (onConfirm) buttons, both `disabled={loading}`, confirm shows "İşleniyor..." when loading; backdrop matches project modal convention.

## Code Quality
- Reviewer: ✅ Approved. Classes correct; no `role=dialog` (matches the project's existing modals); central `tsc --noEmit` passes.
- Base SHA: `5cfb7c5` → on gok2: `1060fe6`

## Resolution
- Issues found: 0
- Issues fixed: 0
- Final status: ✅ Approved
