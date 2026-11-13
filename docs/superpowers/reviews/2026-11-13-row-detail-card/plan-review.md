# Plan: Row detail card, trace panel ("Operasyon, CMM ve Test İzleri") and report PDF export

- Spec compliance: ✅ Approved — detail card (table + expandable parent rows, query with row-param injection, no "Malzeme Notları"), child-row trace panel (Operasyon Akışı query, Süre Dağılımı query, Doküman Linkleri URL templates), full-width panels below the grid, one click expands + opens card, add/edit editors, save/load round-trip, whole-report PDF via print.
- Code quality: ✅ Approved (after fix rounds) (base SHA: 3510010, head SHA: 64923cd)
  - Editor branch review (02292ff): Approved with minor — 5 issues, all fixed (3d58522) + coordinator fix for a possible render loop in the param-field text resync (0732986).
  - Viewer branch review (c8ab70b): Changes required — 10 issues (stale selection during reload, print chrome, global print CSS leak, fullscreen panels hidden, focus loss, selection style, nested state leak on paging, duplicate keys; reducer extraction skipped as optional; print-layout limits documented). Fixed in 667161d, re-reviewed.
  - Coordinator fix: isSafeHref hardened against tab/newline/control-char obfuscated schemes (64f8194, 4647a9f).
  - Integration review over merged result: Approved with minor — 6 issues (parent-row keyboard focus, placeholder syntax mismatch, link-safety drift between editor and runtime, empty trace panel, fullscreen collapse, named @page through flex ancestors). Fixed in 64923cd; verified by coordinator (diff read, 29/29 util tests).
- Issues found / fixed: 22 / 21 (1 optional item skipped: hook guard logic not extracted into a pure reducer)
- Verification:
  - Frontend: `node --test src/utils/` 29/29 pass; `npx tsc --noEmit` 0 errors; eslint clean on changed files; `next build` succeeds.
  - Backend: `test_row_detail_config.py` new, passes; all other standalone `test_*.py` pass except `test_mes_tracking_service.py` and `test_work_order_serialization_helper.py`, which fail identically on base `main` (3510010); `test_excel_parse.py` needs a file argument; two scripts need `PYTHONIOENCODING=utf-8` on Windows consoles.
  - Not verified: no browser rendering (panel visuals, selection ring on `<tr>`, print preview) — manual check required.
- Final status: ✅ Approved
