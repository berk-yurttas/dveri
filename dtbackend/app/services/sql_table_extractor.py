"""Extract physical table names from report SQL (FROM / JOIN)."""

from __future__ import annotations

import re
from typing import Any, Iterable

_COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/|--[^\n]*")
_STRING_RE = re.compile(r"'(?:''|[^'])*'")
_IDENT = r'(?:"[^"]+"|[A-Za-z_][\w$]*)'
_FROM_JOIN_RE = re.compile(
    r"\b(?:FROM|JOIN)\s+(?:ONLY\s+)?(?:LATERAL\s+)?",
    re.IGNORECASE,
)
_QUOTED_IDENT_RE = re.compile(r'"[^"]*"')
_BARE_IDENT_RE = re.compile(r"[A-Za-z_][\w$]*")
_CTE_IDENT_AS_RE = re.compile(
    rf"({_IDENT})(?:\s*\([^)]*\))?\s+AS\b",
    re.IGNORECASE,
)
_MAIN_QUERY_RE = re.compile(r"(SELECT|INSERT|UPDATE|DELETE|MERGE)\b", re.IGNORECASE)

_SKIP_NAMES = {
    "dual",
    "unnest",
    "generate_series",
    "jsonb_each",
    "jsonb_each_text",
    "json_each",
    "json_each_text",
    "lateral",
    "values",
}


def _unquote_ident(ident: str) -> str:
    ident = ident.strip()
    if len(ident) >= 2 and ident[0] == '"' and ident[-1] == '"':
        return ident[1:-1].replace('""', '"')
    return ident


def _strip_sql_noise(sql: str) -> str:
    cleaned = _COMMENT_RE.sub(" ", sql)
    cleaned = _STRING_RE.sub(" ", cleaned)
    return cleaned


def _cte_names(sql: str) -> set[str]:
    """Collect CTE aliases from the WITH preamble only (not SELECT aliases)."""
    with_match = re.search(r"\bWITH\s+", sql, re.IGNORECASE)
    if not with_match:
        return set()

    names: set[str] = set()
    i = with_match.end()
    depth = 0
    while i < len(sql):
        ch = sql[i]
        if ch == "(":
            depth += 1
            i += 1
            continue
        if ch == ")":
            depth = max(0, depth - 1)
            i += 1
            continue
        if depth == 0:
            ident_match = _CTE_IDENT_AS_RE.match(sql, i)
            if ident_match:
                names.add(_unquote_ident(ident_match.group(1)).lower())
                i = ident_match.end()
                continue
            main_match = _MAIN_QUERY_RE.match(sql, i)
            if main_match:
                break
        i += 1
    return names


def _read_ident(sql: str, index: int) -> tuple[str | None, int]:
    quoted = _QUOTED_IDENT_RE.match(sql, index)
    if quoted:
        return _unquote_ident(quoted.group(0)), quoted.end()
    bare = _BARE_IDENT_RE.match(sql, index)
    if bare:
        return bare.group(0), bare.end()
    return None, index


def _read_table_ref(sql: str, index: int) -> tuple[str | None, int]:
    """Read schema.table (up to 3 identifiers). Skip function calls like generate_series(."""
    i = index
    parts: list[str] = []
    while len(parts) < 3:
        while i < len(sql) and sql[i].isspace():
            i += 1
        ident, next_i = _read_ident(sql, i)
        if not ident:
            break
        i = next_i
        while i < len(sql) and sql[i].isspace():
            i += 1
        if i < len(sql) and sql[i] == "(":
            return None, i
        parts.append(ident)
        if i < len(sql) and sql[i] == ".":
            i += 1
            continue
        break
    if not parts:
        return None, index
    return parts[-1], i


def extract_tables_from_sql(sql: str | None) -> list[str]:
    """Return unique table names referenced by FROM/JOIN, excluding CTE aliases."""
    if not sql or not str(sql).strip():
        return []

    cleaned = _strip_sql_noise(str(sql))
    cte_names = _cte_names(cleaned)
    tables: list[str] = []
    seen: set[str] = set()

    for match in _FROM_JOIN_RE.finditer(cleaned):
        table, _end = _read_table_ref(cleaned, match.end())
        if not table:
            continue
        key = table.lower()
        if key in cte_names or key in _SKIP_NAMES or key in seen:
            continue
        seen.add(key)
        tables.append(table)

    return tables


def _nested_list(obj: dict[str, Any], *keys: str) -> list[Any]:
    for key in keys:
        value = obj.get(key)
        if isinstance(value, list):
            return value
    return []


def collect_sql_from_nested(obj: Any, sqls: list[str]) -> None:
    if isinstance(obj, list):
        for item in obj:
            collect_sql_from_nested(item, sqls)
        return
    if not isinstance(obj, dict):
        return

    sql = obj.get("sql")
    if isinstance(sql, str) and sql.strip():
        sqls.append(sql)

    for filt in _nested_list(obj, "filters"):
        if not isinstance(filt, dict):
            continue
        dropdown = filt.get("dropdownQuery") or filt.get("dropdown_query")
        if isinstance(dropdown, str) and dropdown.strip():
            sqls.append(dropdown)

    collect_sql_from_nested(_nested_list(obj, "nestedQueries", "nested_queries"), sqls)

    chart = obj.get("chartOptions") or obj.get("chart_options")
    if isinstance(chart, dict):
        collect_sql_from_nested(chart, sqls)


def collect_sql_from_report(report: Any) -> list[str]:
    """Gather every SQL string stored on a report (queries, filters, nested)."""
    sqls: list[str] = []
    queries: list[Any] = []

    for query in getattr(report, "queries", None) or []:
        queries.append(query)
    for tab in getattr(report, "tabs", None) or []:
        for query in getattr(tab, "queries", None) or []:
            queries.append(query)

    seen_ids: set[Any] = set()
    for query in queries:
        query_id = getattr(query, "id", id(query))
        if query_id in seen_ids:
            continue
        seen_ids.add(query_id)

        sql = getattr(query, "sql", None)
        if isinstance(sql, str) and sql.strip():
            sqls.append(sql)

        viz = getattr(query, "visualization_config", None) or {}
        collect_sql_from_nested(viz, sqls)

        for filt in getattr(query, "filters", None) or []:
            dropdown = getattr(filt, "dropdown_query", None)
            if isinstance(dropdown, str) and dropdown.strip():
                sqls.append(dropdown)

    global_filters = getattr(report, "global_filters", None) or []
    if isinstance(global_filters, list):
        for filt in global_filters:
            if not isinstance(filt, dict):
                continue
            dropdown = filt.get("dropdownQuery") or filt.get("dropdown_query")
            if isinstance(dropdown, str) and dropdown.strip():
                sqls.append(dropdown)

    return sqls


def extract_tables_from_sqls(sqls: Iterable[str | None]) -> list[str]:
    tables: list[str] = []
    seen: set[str] = set()
    for sql in sqls:
        for table in extract_tables_from_sql(sql):
            key = table.lower()
            if key in seen:
                continue
            seen.add(key)
            tables.append(table)
    return tables
