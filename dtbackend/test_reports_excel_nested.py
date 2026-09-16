"""Unit tests for expandable nested Excel flattening. No DB.

Run with: python -m unittest test_reports_excel_nested -v
"""
import unittest

from app.services.reports_service import (
    apply_expandable_placeholders,
    extract_expandable_nested_queries,
    flatten_nested_export,
)


class ExtractNestedQueriesTest(unittest.TestCase):
    def test_reads_camel_case_chart_options(self):
        viz = {
            "type": "expandable",
            "chartOptions": {
                "nestedQueries": [{"sql": "SELECT 1", "expandableFields": ["id"]}],
            },
        }
        nested = extract_expandable_nested_queries(viz)
        self.assertEqual(len(nested), 1)
        self.assertEqual(nested[0]["sql"], "SELECT 1")

    def test_reads_snake_case_chart_options(self):
        viz = {
            "type": "expandable",
            "chart_options": {
                "nested_queries": [{"sql": "SELECT 1", "expandable_fields": ["id"]}],
            },
        }
        nested = extract_expandable_nested_queries(viz)
        self.assertEqual(len(nested), 1)

    def test_ignores_non_expandable_visualizations(self):
        viz = {
            "type": "bar",
            "chartOptions": {
                "nestedQueries": [{"sql": "SELECT 1"}],
            },
        }
        self.assertEqual(extract_expandable_nested_queries(viz), [])


class PlaceholderTest(unittest.TestCase):
    def test_replaces_parent_field(self):
        sql = "SELECT * FROM child WHERE parent_id = {{id}}"
        result = apply_expandable_placeholders(sql, ["id"], ["id", "name"], [7, "Ada"])
        self.assertEqual(result, "SELECT * FROM child WHERE parent_id = '7'")

    def test_escapes_quotes(self):
        sql = "SELECT * FROM child WHERE name = {{name}}"
        result = apply_expandable_placeholders(sql, ["name"], ["name"], ["O'Brien"])
        self.assertEqual(result, "SELECT * FROM child WHERE name = 'O''Brien'")


class FlattenNestedExportTest(unittest.TestCase):
    def test_repeats_parent_for_each_child(self):
        nested = [{
            "sql": "SELECT * FROM child WHERE parent_id = {{id}}",
            "expandableFields": ["id"],
        }]
        fetched = {
            "SELECT * FROM child WHERE parent_id = '1'": (["child_name"], [["a"], ["b"]]),
            "SELECT * FROM child WHERE parent_id = '2'": (["child_name"], [["c"]]),
        }

        def fetch_sql(sql: str):
            return fetched.get(sql, ([], []))

        columns, data = flatten_nested_export(
            ["id", "name"],
            [[1, "Ada"], [2, "Grace"]],
            nested,
            fetch_sql,
            concurrency=1,
        )
        self.assertEqual(columns, ["id", "name", "child_name"])
        self.assertEqual(data, [
            [1, "Ada", "a"],
            [1, "Ada", "b"],
            [2, "Grace", "c"],
        ])

    def test_keeps_parent_when_child_is_empty(self):
        nested = [{
            "sql": "SELECT * FROM child WHERE parent_id = {{id}}",
            "expandableFields": ["id"],
        }]

        def fetch_sql(_sql: str):
            return ["child_name"], []

        columns, data = flatten_nested_export(
            ["id"],
            [[1]],
            nested,
            fetch_sql,
            concurrency=1,
        )
        self.assertEqual(columns, ["id", "child_name"])
        self.assertEqual(data, [[1, ""]])

    def test_renames_overlapping_child_columns(self):
        nested = [{
            "sql": "SELECT * FROM child WHERE parent_id = {{id}}",
            "expandableFields": ["id"],
        }]

        def fetch_sql(_sql: str):
            return ["id", "extra"], [[9, "x"]]

        columns, data = flatten_nested_export(
            ["id"],
            [[1]],
            nested,
            fetch_sql,
            concurrency=1,
        )
        self.assertEqual(columns, ["id", "id (L1)", "extra"])
        self.assertEqual(data, [[1, 9, "x"]])

    def test_flattens_second_level(self):
        nested = [{
            "sql": "SELECT * FROM child WHERE parent_id = {{id}}",
            "expandableFields": ["id"],
            "nestedQueries": [{
                "sql": "SELECT * FROM grandchild WHERE child_id = {{child_id}}",
                "expandableFields": ["child_id"],
            }],
        }]
        fetched = {
            "SELECT * FROM child WHERE parent_id = '1'": (["child_id"], [[10]]),
            "SELECT * FROM grandchild WHERE child_id = '10'": (["detail"], [["leaf"]]),
        }

        def fetch_sql(sql: str):
            return fetched.get(sql, ([], []))

        columns, data = flatten_nested_export(
            ["id"],
            [[1]],
            nested,
            fetch_sql,
            concurrency=1,
        )
        self.assertEqual(columns, ["id", "child_id", "detail"])
        self.assertEqual(data, [[1, 10, "leaf"]])


if __name__ == "__main__":
    unittest.main()
