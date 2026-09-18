"""Pure report health checks that do not need a live database.

Used by the automated test runner and unit tests. Each function returns
a list of case dicts the runner stores historically.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse


VALID_FILTER_TYPES = {"date", "dropdown", "multiselect", "number", "text"}
VALID_VIZ_TYPES = {
    "table",
    "expandable",
    "bar",
    "line",
    "pie",
    "area",
    "scatter",
    "pareto",
    "boxplot",
    "histogram",
    "card",
}
CHART_AXIS_TYPES = {"bar", "line", "area", "scatter", "pareto", "boxplot", "histogram"}
DANGEROUS_SQL = re.compile(
    r"\b(DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)\b",
    re.IGNORECASE,
)
SELECT_OR_WITH = re.compile(r"^\s*(SELECT|WITH)\s+", re.IGNORECASE)


def case(
    case_id: str,
    category: str,
    name: str,
    status: str,
    message: str,
    duration_ms: float = 0,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "case_id": case_id,
        "category": category,
        "name": name,
        "status": status,
        "message": message,
        "duration_ms": round(duration_ms, 2),
    }
    if meta:
        payload["meta"] = meta
    return payload


def _viz(query: Any) -> dict[str, Any]:
    viz = getattr(query, "visualization_config", None)
    if viz is None:
        viz = getattr(query, "visualization", None)
    return viz if isinstance(viz, dict) else {}


def _viz_type(viz: dict[str, Any]) -> str:
    raw = viz.get("type") or ""
    if hasattr(raw, "value"):
        raw = raw.value
    return str(raw).lower().strip()


def _viz_field(viz: dict[str, Any], *names: str) -> str | None:
    for name in names:
        value = viz.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _chart_options(viz: dict[str, Any]) -> dict[str, Any]:
    chart = viz.get("chartOptions") or viz.get("chart_options") or {}
    return chart if isinstance(chart, dict) else {}


def _nested_queries(viz: dict[str, Any]) -> list[dict[str, Any]]:
    chart = _chart_options(viz)
    nested = (
        chart.get("nestedQueries")
        or chart.get("nested_queries")
        or viz.get("nestedQueries")
        or viz.get("nested_queries")
        or []
    )
    return nested if isinstance(nested, list) else []


def normalize_filter(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        field_name = raw.get("fieldName") or raw.get("field_name") or ""
        display_name = raw.get("displayName") or raw.get("display_name") or field_name
        filter_type = raw.get("type") or raw.get("filter_type") or raw.get("filterType") or ""
        dropdown_query = raw.get("dropdownQuery") or raw.get("dropdown_query")
        required = bool(raw.get("required", False))
        sql_expression = raw.get("sqlExpression") or raw.get("sql_expression")
        depends_on = raw.get("dependsOn") or raw.get("depends_on")
    else:
        field_name = getattr(raw, "field_name", "") or ""
        display_name = getattr(raw, "display_name", "") or field_name
        filter_type = getattr(raw, "filter_type", None) or getattr(raw, "type", "") or ""
        dropdown_query = getattr(raw, "dropdown_query", None)
        required = bool(getattr(raw, "required", False))
        sql_expression = getattr(raw, "sql_expression", None)
        depends_on = getattr(raw, "depends_on", None)
    if hasattr(filter_type, "value"):
        filter_type = filter_type.value
    return {
        "field_name": str(field_name).strip(),
        "display_name": str(display_name).strip() if display_name else str(field_name).strip(),
        "type": str(filter_type).lower().strip(),
        "dropdown_query": dropdown_query.strip() if isinstance(dropdown_query, str) else dropdown_query,
        "required": required,
        "sql_expression": sql_expression,
        "depends_on": str(depends_on).strip() if depends_on else None,
    }


def check_sql_shape(sql: str | None, case_id: str, name: str) -> dict[str, Any]:
    text = (sql or "").strip()
    if not text:
        return case(case_id, "query", name, "failed", "SQL is empty")
    if DANGEROUS_SQL.search(text):
        return case(case_id, "query", name, "failed", "SQL contains a forbidden statement (only SELECT/WITH is allowed)")
    if not SELECT_OR_WITH.match(text):
        return case(case_id, "query", name, "failed", "SQL must start with SELECT or WITH")
    return case(case_id, "query", name, "passed", "SQL shape is valid")


def check_report_structure(report: Any) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    name = (getattr(report, "name", None) or "").strip()
    if not name:
        cases.append(case("structure_name", "structure", "Report has a name", "failed", "Report name is empty"))
    else:
        cases.append(case("structure_name", "structure", "Report has a name", "passed", f"Name: {name}"))

    is_direct = bool(getattr(report, "is_direct_link", False))
    queries = list(getattr(report, "queries", None) or [])
    if is_direct:
        link = (getattr(report, "direct_link", None) or "").strip()
        if not link:
            cases.append(case("structure_direct_link", "ui", "Direct-link URL", "failed", "Direct-link report has no URL"))
        else:
            parsed = urlparse(link)
            if parsed.scheme and parsed.netloc:
                cases.append(case("structure_direct_link", "ui", "Direct-link URL", "passed", f"URL: {link}"))
            else:
                cases.append(case(
                    "structure_direct_link",
                    "ui",
                    "Direct-link URL",
                    "failed",
                    f"Direct-link URL is not a valid absolute URL: {link}",
                ))
    elif not queries:
        cases.append(case(
            "structure_queries",
            "structure",
            "Report has queries",
            "failed",
            "Report has no queries and is not a direct link",
        ))
    else:
        cases.append(case(
            "structure_queries",
            "structure",
            "Report has queries",
            "passed",
            f"{len(queries)} query(ies)",
            meta={"query_count": len(queries)},
        ))

    if not getattr(report, "platform_id", None) and not getattr(report, "db_config", None):
        cases.append(case(
            "structure_db",
            "structure",
            "Database configuration",
            "warning",
            "Report has no platform or db_config; execution will fall back to default ClickHouse",
        ))
    else:
        cases.append(case("structure_db", "structure", "Database configuration", "passed", "Database target is configured"))

    tabs = list(getattr(report, "tabs", None) or [])
    if tabs:
        empty_tabs = [t.name for t in tabs if not (getattr(t, "name", None) or "").strip()]
        if empty_tabs:
            cases.append(case("structure_tabs", "ui", "Tabs have names", "failed", "One or more tabs have an empty name"))
        else:
            cases.append(case("structure_tabs", "ui", "Tabs have names", "passed", f"{len(tabs)} tab(s)"))

        tab_ids = {getattr(t, "id", None) for t in tabs}
        orphan_queries = []
        for q in queries:
            tab_id = getattr(q, "tab_id", None)
            if tab_id is not None and tab_id not in tab_ids:
                orphan_queries.append(getattr(q, "name", None) or f"id={getattr(q, 'id', '?')}")
        if orphan_queries:
            cases.append(case(
                "structure_tab_queries",
                "ui",
                "Queries belong to existing tabs",
                "failed",
                f"Queries point at missing tabs: {', '.join(orphan_queries[:8])}",
            ))

        queries_by_tab: dict[Any, int] = {}
        for q in queries:
            tab_id = getattr(q, "tab_id", None)
            if tab_id is not None:
                queries_by_tab[tab_id] = queries_by_tab.get(tab_id, 0) + 1
        empty = [t.name for t in tabs if queries_by_tab.get(getattr(t, "id", None), 0) == 0]
        if empty:
            cases.append(case(
                "structure_empty_tabs",
                "ui",
                "Tabs contain queries",
                "warning",
                f"Empty tabs: {', '.join(empty[:8])}",
            ))

    color = getattr(report, "color", None)
    if color and isinstance(color, str) and not re.match(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", color.strip()):
        cases.append(case("structure_color", "ui", "Theme color", "warning", f"Color is not a hex value: {color}"))

    return cases


def check_layout(report: Any) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    queries = list(getattr(report, "queries", None) or [])
    query_ids = {str(getattr(q, "id", "")) for q in queries}

    def _check_one(layout: Any, label: str, case_id: str) -> None:
        if not layout:
            return
        if not isinstance(layout, list):
            cases.append(case(case_id, "ui", label, "warning", "Layout config is not a list"))
            return
        unknown = []
        for item in layout:
            if not isinstance(item, dict):
                continue
            key = item.get("i") if item.get("i") is not None else item.get("queryId") or item.get("query_id")
            if key is None:
                continue
            if str(key) not in query_ids:
                unknown.append(str(key))
        if unknown:
            cases.append(case(
                case_id,
                "ui",
                label,
                "warning",
                f"Layout references unknown query ids: {', '.join(unknown[:8])}",
            ))
        else:
            cases.append(case(case_id, "ui", label, "passed", f"{len(layout)} layout item(s)"))

    _check_one(getattr(report, "layout_config", None), "Report layout", "ui_layout")
    for tab in getattr(report, "tabs", None) or []:
        tab_name = getattr(tab, "name", None) or f"tab-{getattr(tab, 'id', '?')}"
        _check_one(
            getattr(tab, "layout_config", None),
            f"Tab layout: {tab_name}",
            f"ui_layout_tab_{getattr(tab, 'id', 'x')}",
        )
    return cases


def check_query_ui(query: Any) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    qid = getattr(query, "id", "x")
    qname = getattr(query, "name", None) or f"Query {qid}"

    sql_case = check_sql_shape(getattr(query, "sql", None), f"query_{qid}_sql", f"SQL shape: {qname}")
    cases.append(sql_case)

    viz = _viz(query)
    if not viz:
        cases.append(case(f"query_{qid}_viz", "visualization", f"Visualization config: {qname}", "failed", "visualization_config is missing"))
        return cases

    vtype = _viz_type(viz)
    if vtype not in VALID_VIZ_TYPES:
        cases.append(case(
            f"query_{qid}_viz_type",
            "visualization",
            f"Visualization type: {qname}",
            "failed",
            f"Unknown visualization type '{vtype or '(empty)'}'",
        ))
        return cases
    cases.append(case(f"query_{qid}_viz_type", "visualization", f"Visualization type: {qname}", "passed", vtype))

    if vtype in CHART_AXIS_TYPES:
        x_axis = _viz_field(viz, "xAxis", "x_axis")
        y_axis = _viz_field(viz, "yAxis", "y_axis")
        if not x_axis and not y_axis:
            cases.append(case(
                f"query_{qid}_axes",
                "visualization",
                f"Chart axes: {qname}",
                "warning",
                f"{vtype} chart has no xAxis/yAxis configured; the UI may not render",
            ))
        else:
            cases.append(case(
                f"query_{qid}_axes",
                "visualization",
                f"Chart axes: {qname}",
                "passed",
                f"x={x_axis or '-'} y={y_axis or '-'}",
            ))
    elif vtype == "pie":
        label_field = _viz_field(viz, "labelField", "label_field")
        value_field = _viz_field(viz, "valueField", "value_field")
        if not label_field or not value_field:
            cases.append(case(
                f"query_{qid}_pie_fields",
                "visualization",
                f"Pie fields: {qname}",
                "warning",
                "Pie chart is missing labelField or valueField",
            ))
        else:
            cases.append(case(
                f"query_{qid}_pie_fields",
                "visualization",
                f"Pie fields: {qname}",
                "passed",
                f"label={label_field} value={value_field}",
            ))
    elif vtype == "card":
        value_field = _viz_field(viz, "valueField", "value_field")
        if not value_field:
            cases.append(case(
                f"query_{qid}_card_field",
                "visualization",
                f"Card value field: {qname}",
                "warning",
                "Card visualization has no valueField",
            ))

    if vtype == "expandable":
        nested = _nested_queries(viz)
        if not nested:
            cases.append(case(
                f"query_{qid}_nested",
                "visualization",
                f"Expandable nested queries: {qname}",
                "warning",
                "Expandable table has no nestedQueries",
            ))
        else:
            cases.append(case(
                f"query_{qid}_nested",
                "visualization",
                f"Expandable nested queries: {qname}",
                "passed",
                f"{len(nested)} nested query(ies)",
            ))
            for index, nested_query in enumerate(nested):
                if not isinstance(nested_query, dict):
                    continue
                nested_sql = nested_query.get("sql") or ""
                cases.append(check_sql_shape(
                    nested_sql,
                    f"query_{qid}_nested_{index}_sql",
                    f"Nested SQL [{index}] of {qname}",
                ))
                fields = nested_query.get("expandableFields") or nested_query.get("expandable_fields") or []
                if not fields:
                    cases.append(case(
                        f"query_{qid}_nested_{index}_fields",
                        "visualization",
                        f"Nested expandable fields [{index}] of {qname}",
                        "warning",
                        "Nested query has no expandableFields",
                    ))

    clickable = _chart_options(viz).get("clickable")
    if clickable and not _nested_queries(viz):
        cases.append(case(
            f"query_{qid}_clickable",
            "visualization",
            f"Clickable chart nested query: {qname}",
            "warning",
            "Chart is clickable but has no nestedQueries for drill-down",
        ))

    return cases


def check_filters(filters: list[Any], scope: str, scope_id: str) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    seen: dict[str, int] = {}
    normalized = [normalize_filter(item) for item in filters]
    field_names = {item["field_name"] for item in normalized if item["field_name"]}

    for item in normalized:
        field = item["field_name"] or "unknown"
        prefix = f"filter_{scope_id}_{field}"
        label = f"{scope} filter '{item['display_name'] or field}'"

        if not item["field_name"]:
            cases.append(case(f"{prefix}_name", "filter", label, "failed", "Filter is missing fieldName"))
            continue
        seen[field] = seen.get(field, 0) + 1

        if item["type"] not in VALID_FILTER_TYPES:
            cases.append(case(
                f"{prefix}_type",
                "filter",
                f"{label} type",
                "failed",
                f"Unknown filter type '{item['type'] or '(empty)'}'",
            ))
        else:
            cases.append(case(f"{prefix}_type", "filter", f"{label} type", "passed", item["type"]))

        if item["type"] in {"dropdown", "multiselect"}:
            if not item["dropdown_query"]:
                cases.append(case(
                    f"{prefix}_dropdown_sql",
                    "filter",
                    f"{label} options query",
                    "failed",
                    "Dropdown/multiselect filter has no dropdownQuery",
                ))
            else:
                cases.append(check_sql_shape(
                    item["dropdown_query"],
                    f"{prefix}_dropdown_sql",
                    f"{label} options query",
                ))

        depends_on = item["depends_on"]
        if depends_on and depends_on not in field_names:
            cases.append(case(
                f"{prefix}_depends",
                "filter",
                f"{label} cascade",
                "failed",
                f"dependsOn '{depends_on}' does not match any filter in this scope",
            ))
        elif depends_on:
            cases.append(case(
                f"{prefix}_depends",
                "filter",
                f"{label} cascade",
                "passed",
                f"Depends on '{depends_on}'",
            ))

    duplicates = [name for name, count in seen.items() if count > 1]
    if duplicates:
        cases.append(case(
            f"filter_{scope_id}_duplicates",
            "filter",
            f"{scope} duplicate field names",
            "warning",
            f"Duplicate filter fields: {', '.join(duplicates)}",
        ))

    return cases


def check_result_columns(
    query: Any,
    columns: list[str],
    row_count: int,
    execution_time_ms: float,
    slow_ms: int,
) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    qid = getattr(query, "id", "x")
    qname = getattr(query, "name", None) or f"Query {qid}"
    viz = _viz(query)
    vtype = _viz_type(viz)
    col_set = {str(col) for col in columns}
    col_lower = {str(col).lower(): str(col) for col in columns}
    duration = round(float(execution_time_ms or 0), 2)

    def _has_column(name: str | None) -> bool:
        if not name:
            return True
        return name in col_set or name.lower() in col_lower

    if not columns:
        cases.append(case(
            f"query_{qid}_columns",
            "query",
            f"Result columns: {qname}",
            "failed" if row_count else "warning",
            "Query returned no columns",
            duration,
        ))
    else:
        cases.append(case(
            f"query_{qid}_columns",
            "query",
            f"Result columns: {qname}",
            "passed",
            f"{len(columns)} column(s)",
            duration,
            meta={"columns": columns[:40], "column_count": len(columns)},
        ))

    cases.append(case(
        f"query_{qid}_row_count",
        "query",
        f"Row count: {qname}",
        "warning" if row_count == 0 else "passed",
        f"{row_count} row(s)" + (" — empty result (may be legitimate)" if row_count == 0 else ""),
        duration,
        meta={"row_count": row_count, "visualization": vtype},
    ))

    if execution_time_ms >= slow_ms:
        cases.append(case(
            f"query_{qid}_perf",
            "performance",
            f"Query duration: {qname}",
            "warning",
            f"{execution_time_ms:.0f} ms exceeds slow-query threshold ({slow_ms} ms)",
            duration,
            meta={"execution_time_ms": execution_time_ms},
        ))
    else:
        cases.append(case(
            f"query_{qid}_perf",
            "performance",
            f"Query duration: {qname}",
            "passed",
            f"{execution_time_ms:.0f} ms",
            duration,
            meta={"execution_time_ms": execution_time_ms},
        ))

    fields_to_check: list[tuple[str, str | None]] = [
        ("xAxis", _viz_field(viz, "xAxis", "x_axis")),
        ("yAxis", _viz_field(viz, "yAxis", "y_axis")),
        ("labelField", _viz_field(viz, "labelField", "label_field")),
        ("valueField", _viz_field(viz, "valueField", "value_field")),
        ("groupBy", _viz_field(viz, "groupBy", "group_by")),
    ]
    missing = [label for label, name in fields_to_check if name and not _has_column(name)]
    if missing and columns:
        cases.append(case(
            f"query_{qid}_viz_columns",
            "visualization",
            f"Visualization fields exist in result: {qname}",
            "failed",
            f"Configured fields not found in result columns: {', '.join(missing)}",
            duration,
            meta={"columns": columns[:40]},
        ))
    elif any(name for _, name in fields_to_check) and columns:
        cases.append(case(
            f"query_{qid}_viz_columns",
            "visualization",
            f"Visualization fields exist in result: {qname}",
            "passed",
            "Chart/table fields match result columns",
            duration,
        ))

    return cases


def rollup_status(cases: list[dict[str, Any]]) -> str:
    statuses = {item.get("status") for item in cases}
    if "failed" in statuses:
        return "failed"
    if "warning" in statuses:
        return "warning"
    if cases and statuses <= {"skipped"}:
        return "skipped"
    return "passed"


def summarize_cases(cases: list[dict[str, Any]]) -> str:
    failed = [item for item in cases if item.get("status") == "failed"]
    warnings = [item for item in cases if item.get("status") == "warning"]
    if failed:
        first = failed[0].get("message") or failed[0].get("name")
        extra = f" (+{len(failed) - 1} tane daha)" if len(failed) > 1 else ""
        return f"{len(failed)} hata: {first}{extra}"
    if warnings:
        first = warnings[0].get("message") or warnings[0].get("name")
        extra = f" (+{len(warnings) - 1} tane daha)" if len(warnings) > 1 else ""
        return f"{len(warnings)} uyarı: {first}{extra}"
    return "Sorun bulunmadı"
