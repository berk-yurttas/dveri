"""
Report transfer/export SQL generator.

Builds a single, self-contained PL/pgSQL script that can be executed against
another dt_report PostgreSQL database to recreate a report together with its
tabs, queries and query filters (tables: reports, report_tabs,
report_queries, report_query_filters).

New primary keys are assigned by the *target* database (via
`RETURNING id INTO ...`), so the generated script does not depend on the
source system's IDs. Relationships between tabs/queries/filters are
preserved at runtime through small JSONB id maps declared inside the DO
block.
"""

import json
from datetime import datetime, timezone
from typing import Any

from app.models.postgres_models import Report


def _sql_str(value: str | None) -> str:
    """Render a Python string as a single-quoted SQL literal (or NULL)."""
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def _sql_bool(value: bool | None) -> str:
    if value is None:
        return "NULL"
    return "TRUE" if value else "FALSE"


def _sql_number(value: Any) -> str:
    if value is None:
        return "NULL"
    return str(value)


def _sql_text_array(values: list[str] | None) -> str:
    if not values:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(_sql_str(v) for v in values) + "]::text[]"


def _sql_jsonb(value: Any) -> str:
    if value is None:
        return "NULL"
    return _sql_str(json.dumps(value, ensure_ascii=False)) + "::jsonb"


def _layout_remap_update_sql(table: str, id_expr: str, layout_config: Any) -> list[str]:
    """
    Build an UPDATE statement that rewrites a layout_config JSONB array so its
    grid items (`{"i": "<query_id>", ...}`) point at the *new* query IDs.

    `layout_config` items are keyed by the original (source-system) query ID
    stored as text in the `i` field. Since report_queries are re-inserted with
    freshly assigned IDs, `i` must be remapped using `v_query_id_map`
    (old query id -> new query id) once all queries have been inserted -
    otherwise the frontend can't match the layout to the new queries and
    silently falls back to an auto-generated default layout.

    Items whose `i` no longer resolves to a known query (i.e. missing from
    the map) are dropped rather than left dangling.
    """
    if not layout_config:
        return []

    return [
        f"    UPDATE {table} SET layout_config = (",
        "        SELECT COALESCE(",
        "            jsonb_agg(",
        "                jsonb_set(elem, '{i}', to_jsonb(v_query_id_map ->> (elem ->> 'i')))",
        "                ORDER BY elem_ord",
        "            ),",
        "            '[]'::jsonb",
        "        )",
        f"        FROM jsonb_array_elements({_sql_jsonb(layout_config)}) WITH ORDINALITY AS t(elem, elem_ord)",
        "        WHERE v_query_id_map ? (elem ->> 'i')",
        f"    ) WHERE id = {id_expr};",
        "",
    ]


def generate_report_transfer_sql(report: Report) -> str:
    """Generate the transfer SQL script for the given (fully loaded) report.

    The `report` instance is expected to have `tabs` (each with `queries`)
    and `queries` (each with `filters`) eagerly loaded.
    """
    lines: list[str] = []

    lines.append("-- ============================================================")
    lines.append(f'-- Rapor Aktarim Scripti: "{report.name}" (Kaynak Rapor ID: {report.id})')
    lines.append(f"-- Olusturulma Tarihi: {datetime.now(timezone.utc).isoformat()}")
    lines.append("--")
    lines.append("-- Bu script; reports, report_tabs, report_queries ve")
    lines.append("-- report_query_filters tablolarina yeni kayitlar ekleyerek raporu")
    lines.append("-- hedef sisteme aktarir. Kaynak sistemdeki ID'ler korunmaz, hedef")
    lines.append("-- veritabani tarafindan otomatik olarak yeniden atanir.")
    lines.append("--")
    lines.append("-- ONEMLI: owner_id ve platform_id, kaynak sistemdeki users ve")
    lines.append("-- platforms tablolarina referans verir. Bu scripti calistirmadan")
    lines.append("-- once hedef sistemde gecerli olduklarindan emin olun ya da")
    lines.append("-- asagidaki degerleri manuel olarak guncelleyin.")
    lines.append("-- ============================================================")
    lines.append("")
    lines.append("DO $REPORT_TRANSFER$")
    lines.append("DECLARE")
    lines.append("    v_report_id INTEGER;")
    lines.append("    v_tab_id_map JSONB := '{}'::jsonb;")
    lines.append("    v_query_id_map JSONB := '{}'::jsonb;")
    lines.append("    v_new_id INTEGER;")
    lines.append("BEGIN")

    lines.append("    -- Rapor (report)")
    lines.append("    INSERT INTO reports (")
    lines.append("        platform_id, name, description, owner_id, is_public, tags,")
    lines.append("        global_filters, layout_config, color, allowed_departments,")
    lines.append("        allowed_users, is_direct_link, direct_link, db_config,")
    lines.append("        filter_by_department, department_filter_level, filter_by_step_department,")
    lines.append("        created_at, updated_at")
    lines.append("    ) VALUES (")
    lines.append(
        f"        {_sql_number(report.platform_id)}, {_sql_str(report.name)}, "
        f"{_sql_str(report.description)}, {_sql_number(report.owner_id)}, "
        f"{_sql_bool(report.is_public)}, {_sql_text_array(report.tags)},"
    )
    lines.append(
        f"        {_sql_jsonb(report.global_filters)}, NULL, "
        f"{_sql_str(report.color)}, {_sql_text_array(report.allowed_departments)},"
    )
    lines.append(
        f"        {_sql_text_array(report.allowed_users)}, {_sql_bool(report.is_direct_link)}, "
        f"{_sql_str(report.direct_link)}, {_sql_jsonb(report.db_config)},"
    )
    lines.append(
        f"        {_sql_bool(report.filter_by_department)}, {_sql_str(report.department_filter_level)}, "
        f"{_sql_bool(report.filter_by_step_department)},"
    )
    lines.append("        now(), now()")
    lines.append("    ) RETURNING id INTO v_report_id;")
    lines.append("    -- layout_config gecici olarak NULL birakildi; asagida yeni query")
    lines.append("    -- ID'leri ile yeniden yazilacak.")
    lines.append("")

    tabs = sorted(report.tabs or [], key=lambda t: (t.order_index or 0, t.id))
    if tabs:
        lines.append("    -- Rapor Sekmeleri (report_tabs)")
        for tab in tabs:
            lines.append(f"    -- Kaynak Tab ID: {tab.id} ({tab.name})")
            lines.append(
                "    INSERT INTO report_tabs (report_id, name, order_index, layout_config, created_at, updated_at)"
            )
            lines.append(
                f"    VALUES (v_report_id, {_sql_str(tab.name)}, {_sql_number(tab.order_index)}, "
                f"NULL, now(), now())"
            )
            lines.append("    RETURNING id INTO v_new_id;")
            lines.append(f"    v_tab_id_map := v_tab_id_map || jsonb_build_object('{tab.id}', v_new_id);")
            lines.append("")

    queries = sorted(report.queries or [], key=lambda q: (q.order_index or 0, q.id))
    if queries:
        lines.append("    -- Rapor Sorgulari (report_queries)")
        for query in queries:
            tab_id_expr = "NULL"
            if query.tab_id is not None:
                tab_id_expr = f"(v_tab_id_map->>'{query.tab_id}')::integer"

            lines.append(f"    -- Kaynak Query ID: {query.id} ({query.name})")
            lines.append(
                "    INSERT INTO report_queries (report_id, tab_id, name, sql, visualization_config, order_index, created_at, updated_at)"
            )
            lines.append(
                f"    VALUES (v_report_id, {tab_id_expr}, {_sql_str(query.name)}, {_sql_str(query.sql)}, "
                f"{_sql_jsonb(query.visualization_config)}, {_sql_number(query.order_index)}, now(), now())"
            )
            lines.append("    RETURNING id INTO v_new_id;")
            lines.append(f"    v_query_id_map := v_query_id_map || jsonb_build_object('{query.id}', v_new_id);")
            lines.append("")

            for filt in (query.filters or []):
                lines.append(f"    -- Kaynak Filter ID: {filt.id} ({filt.display_name})")
                lines.append(
                    "    INSERT INTO report_query_filters (query_id, field_name, display_name, filter_type, "
                    "dropdown_query, required, sql_expression, depends_on, created_at, updated_at)"
                )
                lines.append(
                    f"    VALUES ((v_query_id_map->>'{query.id}')::integer, {_sql_str(filt.field_name)}, "
                    f"{_sql_str(filt.display_name)}, {_sql_str(filt.filter_type)}, {_sql_str(filt.dropdown_query)}, "
                    f"{_sql_bool(filt.required)}, {_sql_str(filt.sql_expression)}, {_sql_str(filt.depends_on)}, now(), now());"
                )
                lines.append("")

    # layout_config items are keyed by the *source* query IDs (`i` field), so
    # they can only be corrected once v_query_id_map is fully populated above.
    report_layout_lines = _layout_remap_update_sql("reports", "v_report_id", report.layout_config)
    if report_layout_lines:
        lines.append("    -- Rapor Layout Guncelleme (query ID eslemesi ile)")
        lines.extend(report_layout_lines)

    tabs_with_layout = [t for t in tabs if t.layout_config]
    if tabs_with_layout:
        lines.append("    -- Sekme Layout Guncelleme (query ID eslemesi ile)")
        for tab in tabs_with_layout:
            lines.append(f"    -- Kaynak Tab ID: {tab.id} ({tab.name})")
            lines.extend(
                _layout_remap_update_sql(
                    "report_tabs", f"(v_tab_id_map->>'{tab.id}')::integer", tab.layout_config
                )
            )

    lines.append("    RAISE NOTICE 'Rapor basariyla aktarildi. Yeni Rapor ID: %', v_report_id;")
    lines.append("END $REPORT_TRANSFER$;")
    lines.append("")

    return "\n".join(lines)
