"""Unit tests for report filter SQL injection. No DB.

Run with: python -m unittest test_reports_filter_sql -v
"""
import unittest

from app.schemas.reports import FilterValue
from app.services.reports_service import (
    ReportsService,
    extract_dropdown_placeholders,
    inject_where_condition,
    prepare_dropdown_query,
    select_aliases,
    wrap_query_with_where,
)


def _norm(sql: str) -> str:
    return " ".join(sql.split())


class InjectWhereConditionTest(unittest.TestCase):
    def test_appends_where_when_query_has_none(self):
        sql = "SELECT a FROM t"
        self.assertEqual(
            _norm(inject_where_condition(sql, "status = 'open'")),
            "SELECT a FROM t WHERE (status = 'open')",
        )

    def test_ands_onto_existing_where(self):
        sql = "SELECT a FROM t WHERE a > 0"
        self.assertEqual(
            _norm(inject_where_condition(sql, "status = 'open'")),
            "SELECT a FROM t WHERE a > 0 AND (status = 'open')",
        )

    def test_creates_where_before_group_by(self):
        sql = "SELECT a, count(*) FROM t GROUP BY a"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT a, count(*) FROM t WHERE (status = 'open') GROUP BY a",
        )

    def test_ands_before_group_by_when_where_exists(self):
        sql = "SELECT a, count(*) FROM t WHERE a > 0 GROUP BY a"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT a, count(*) FROM t WHERE a > 0 AND (status = 'open') GROUP BY a",
        )

    def test_creates_where_before_order_by(self):
        sql = "SELECT a FROM t ORDER BY a"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT a FROM t WHERE (status = 'open') ORDER BY a",
        )

    def test_ands_before_order_by_when_where_exists(self):
        sql = "SELECT a FROM t WHERE a > 0 ORDER BY a DESC"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT a FROM t WHERE a > 0 AND (status = 'open') ORDER BY a DESC",
        )

    def test_creates_where_before_limit(self):
        sql = "SELECT a FROM t LIMIT 10"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT a FROM t WHERE (status = 'open') LIMIT 10",
        )

    def test_creates_where_before_having(self):
        sql = "SELECT a, count(*) FROM t GROUP BY a HAVING count(*) > 1"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT a, count(*) FROM t WHERE (status = 'open') GROUP BY a HAVING count(*) > 1",
        )

    def test_ignores_inner_where_and_creates_final_where(self):
        sql = """
            SELECT x.a, count(*)
            FROM (SELECT a FROM t WHERE inner_flag = 1) x
            GROUP BY x.a
            ORDER BY x.a
        """
        result = inject_where_condition(sql, "x.a > 0")
        normalized = _norm(result)
        self.assertIn("WHERE inner_flag = 1", normalized)
        self.assertIn(") x WHERE (x.a > 0) GROUP BY x.a ORDER BY x.a", normalized)
        self.assertFalse(normalized.endswith("AND (x.a > 0)"))

    def test_adds_to_final_where_when_inner_and_outer_exist(self):
        sql = """
            SELECT x.a
            FROM (SELECT a FROM t WHERE inner_flag = 1) x
            WHERE x.a > 0
            ORDER BY x.a
        """
        result = inject_where_condition(sql, "status = 'open'")
        normalized = _norm(result)
        self.assertIn("WHERE inner_flag = 1", normalized)
        self.assertIn("WHERE x.a > 0 AND (status = 'open') ORDER BY x.a", normalized)
        self.assertNotIn("inner_flag = 1 AND (status = 'open')", normalized)

    def test_cte_inner_where_creates_outer_where_before_order_by(self):
        sql = """
            WITH cte AS (
                SELECT a FROM t WHERE inner_flag = 1
            )
            SELECT a FROM cte
            ORDER BY a
        """
        result = inject_where_condition(sql, "a > 0")
        normalized = _norm(result)
        self.assertIn("WHERE inner_flag = 1", normalized)
        self.assertIn("SELECT a FROM cte WHERE (a > 0) ORDER BY a", normalized)

    def test_skips_where_inside_comments_and_strings(self):
        sql = """
            -- WHERE fake = 1
            SELECT a FROM t WHERE name = 'WHERE'
            /* WHERE also_fake = 2 */
            GROUP BY a
        """
        result = inject_where_condition(sql, "status = 'open'")
        normalized = _norm(result)
        self.assertIn("WHERE name = 'WHERE' /* WHERE also_fake = 2 */ AND (status = 'open') GROUP BY a", normalized)

    def test_preserves_semicolon(self):
        sql = "SELECT a FROM t GROUP BY a;"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT a FROM t WHERE (status = 'open') GROUP BY a;",
        )

    def test_union_creates_where_on_last_branch(self):
        sql = """
            SELECT a FROM t1 WHERE x = 1
            UNION ALL
            SELECT a FROM t2
            ORDER BY a
        """
        result = inject_where_condition(sql, "a > 0")
        normalized = _norm(result)
        self.assertIn("WHERE x = 1 UNION ALL SELECT a FROM t2 WHERE (a > 0) ORDER BY a", normalized)

    def test_in_subquery_where_adds_to_outer_where(self):
        sql = "SELECT a FROM t WHERE a IN (SELECT id FROM x WHERE y = 1) GROUP BY a"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT a FROM t WHERE a IN (SELECT id FROM x WHERE y = 1) AND (status = 'open') GROUP BY a",
        )

    def test_select_list_format_is_not_treated_as_trailing_clause(self):
        sql = "SELECT format(a) FROM t GROUP BY a"
        result = inject_where_condition(sql, "status = 'open'")
        self.assertEqual(
            _norm(result),
            "SELECT format(a) FROM t WHERE (status = 'open') GROUP BY a",
        )


class ApplyFiltersToQueryTest(unittest.TestCase):
    def setUp(self):
        self.service = object.__new__(ReportsService)
        self.filt = type("obj", (object,), {
            "field_name": "status",
            "display_name": "Status",
            "filter_type": "dropdown",
            "sql_expression": None,
            "required": False,
        })()
        self.value = FilterValue(field_name="status", value="open", operator="=")

    def test_execute_filters_go_before_group_by(self):
        sql = "SELECT status, count(*) FROM events GROUP BY status"
        result = self.service.apply_filters_to_query(sql, [self.filt], [self.value])
        self.assertEqual(
            _norm(result),
            "SELECT status, count(*) FROM events WHERE (status = 'open') GROUP BY status",
        )

    def test_execute_filters_go_before_order_by(self):
        sql = "SELECT status FROM events ORDER BY status"
        result = self.service.apply_filters_to_query(sql, [self.filt], [self.value])
        self.assertEqual(
            _norm(result),
            "SELECT status FROM events WHERE (status = 'open') ORDER BY status",
        )

    def test_placeholder_path_unchanged(self):
        sql = "SELECT status FROM events WHERE 1=1 {{dynamic_filters}} ORDER BY status"
        result = self.service.apply_filters_to_query(sql, [self.filt], [self.value])
        self.assertEqual(
            _norm(result),
            "SELECT status FROM events WHERE 1=1 AND status = 'open' ORDER BY status",
        )

    def test_alias_filter_wraps_query(self):
        sql = "SELECT u.name AS full_name FROM users u"
        alias_filter = type("obj", (object,), {
            "field_name": "full_name",
            "display_name": "Full name",
            "filter_type": "dropdown",
            "sql_expression": None,
            "required": False,
        })()
        value = FilterValue(field_name="full_name", value="Ada", operator="=")
        result = self.service.apply_filters_to_query(sql, [alias_filter], [value])
        self.assertEqual(
            _norm(result),
            "SELECT * FROM (SELECT u.name AS full_name FROM users u) AS _dt_filtered WHERE (full_name = 'Ada')",
        )

    def test_alias_filter_wraps_group_by_query(self):
        sql = "SELECT dept AS department, count(*) AS cnt FROM events GROUP BY dept ORDER BY cnt"
        alias_filter = type("obj", (object,), {
            "field_name": "department",
            "display_name": "Department",
            "filter_type": "dropdown",
            "sql_expression": None,
            "required": False,
        })()
        value = FilterValue(field_name="department", value="IT", operator="=")
        result = self.service.apply_filters_to_query(sql, [alias_filter], [value])
        self.assertEqual(
            _norm(result),
            "SELECT * FROM (SELECT dept AS department, count(*) AS cnt FROM events GROUP BY dept ORDER BY cnt) "
            "AS _dt_filtered WHERE (department = 'IT')",
        )

    def test_alias_filter_hoists_limit(self):
        sql = "SELECT name AS full_name FROM users LIMIT 10"
        alias_filter = type("obj", (object,), {
            "field_name": "full_name",
            "display_name": "Full name",
            "filter_type": "dropdown",
            "sql_expression": None,
            "required": False,
        })()
        value = FilterValue(field_name="full_name", value="Ada", operator="=")
        result = self.service.apply_filters_to_query(sql, [alias_filter], [value])
        self.assertEqual(
            _norm(result),
            "SELECT * FROM (SELECT name AS full_name FROM users) AS _dt_filtered WHERE (full_name = 'Ada') LIMIT 10",
        )

    def test_sql_expression_stays_inside_when_alias_also_present(self):
        sql = "SELECT t.name AS full_name, t.secret FROM t"
        alias_filter = type("obj", (object,), {
            "field_name": "full_name",
            "display_name": "Full name",
            "filter_type": "dropdown",
            "sql_expression": None,
            "required": False,
        })()
        inner_filter = type("obj", (object,), {
            "field_name": "secret",
            "display_name": "Secret",
            "filter_type": "dropdown",
            "sql_expression": "t.secret",
            "required": False,
        })()
        result = self.service.apply_filters_to_query(
            sql,
            [alias_filter, inner_filter],
            [
                FilterValue(field_name="full_name", value="Ada", operator="="),
                FilterValue(field_name="secret", value="x", operator="="),
            ],
        )
        self.assertEqual(
            _norm(result),
            "SELECT * FROM (SELECT t.name AS full_name, t.secret FROM t WHERE (t.secret = 'x')) "
            "AS _dt_filtered WHERE (full_name = 'Ada')",
        )


class SelectAliasParseTest(unittest.TestCase):
    def test_explicit_as_alias(self):
        self.assertEqual(select_aliases("SELECT u.name AS full_name FROM users u"), {"full_name"})

    def test_implicit_alias(self):
        self.assertEqual(select_aliases("SELECT count(*) cnt FROM t"), {"cnt"})

    def test_passthrough_column_is_not_alias(self):
        self.assertEqual(select_aliases("SELECT status, t.dept FROM events t"), set())

    def test_cast_as_text_is_not_select_alias(self):
        self.assertEqual(select_aliases("SELECT CAST(x AS TEXT) AS label FROM t"), {"label"})

    def test_wrap_helper(self):
        sql = "SELECT a AS b FROM t ORDER BY a LIMIT 5"
        result = wrap_query_with_where(sql, "b = 1")
        self.assertEqual(
            _norm(result),
            "SELECT * FROM (SELECT a AS b FROM t ORDER BY a) AS _dt_filtered WHERE (b = 1) LIMIT 5",
        )


class DropdownPlaceholderTest(unittest.TestCase):
    def test_extracts_parent_names(self):
        sql = 'SELECT "Kod", "Ad" FROM t WHERE "Firma" = {{Firma Adı}} AND x = {{x}}'
        self.assertEqual(extract_dropdown_placeholders(sql), ["Firma Adı", "x"])

    def test_neutralizes_unbound_parent(self):
        sql = 'SELECT value, label FROM opts WHERE "Firma" = {{Firma Adı}} ORDER BY label'
        self.assertEqual(
            _norm(prepare_dropdown_query(sql)),
            'SELECT value, label FROM opts WHERE 1=1 ORDER BY label',
        )

    def test_binds_parent_value(self):
        sql = 'SELECT value, label FROM opts WHERE "Firma" = {{Firma Adı}}'
        self.assertEqual(
            _norm(prepare_dropdown_query(sql, {"Firma Adı": "ASELSAN"})),
            "SELECT value, label FROM opts WHERE \"Firma\" = 'ASELSAN'",
        )

    def test_in_placeholder_without_parent(self):
        sql = "SELECT value, label FROM opts WHERE dept IN ({{Departman}})"
        self.assertEqual(
            _norm(prepare_dropdown_query(sql)),
            "SELECT value, label FROM opts WHERE 1=1",
        )


if __name__ == "__main__":
    unittest.main()
