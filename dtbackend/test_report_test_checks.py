"""Unit tests for report health structural/UI checks. No DB.

Run with: python -m unittest test_report_test_checks -v
"""
import unittest
from types import SimpleNamespace

from app.services.report_test_checks import (
    check_filters,
    check_query_ui,
    check_report_structure,
    check_result_columns,
    check_sql_shape,
    rollup_status,
    summarize_cases,
)


def _report(**kwargs):
    defaults = dict(
        name="Ops",
        is_direct_link=False,
        direct_link=None,
        queries=[],
        tabs=[],
        platform_id=1,
        db_config=None,
        color="#3B82F6",
        global_filters=[],
        layout_config=[],
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _query(**kwargs):
    defaults = dict(
        id=1,
        name="Main",
        sql="SELECT 1 AS value",
        visualization_config={"type": "table"},
        filters=[],
        tab_id=None,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class SqlShapeTest(unittest.TestCase):
    def test_rejects_empty(self):
        result = check_sql_shape("  ", "s", "sql")
        self.assertEqual(result["status"], "failed")

    def test_rejects_delete(self):
        result = check_sql_shape("DELETE FROM t", "s", "sql")
        self.assertEqual(result["status"], "failed")

    def test_accepts_select(self):
        result = check_sql_shape("SELECT * FROM t", "s", "sql")
        self.assertEqual(result["status"], "passed")

    def test_accepts_with(self):
        result = check_sql_shape("WITH x AS (SELECT 1) SELECT * FROM x", "s", "sql")
        self.assertEqual(result["status"], "passed")


class ReportStructureTest(unittest.TestCase):
    def test_fails_without_queries(self):
        cases = check_report_structure(_report())
        failed = [c for c in cases if c["status"] == "failed"]
        self.assertTrue(any("no queries" in c["message"] for c in failed))

    def test_direct_link_requires_url(self):
        cases = check_report_structure(_report(is_direct_link=True, direct_link="not-a-url"))
        self.assertTrue(any(c["case_id"] == "structure_direct_link" and c["status"] == "failed" for c in cases))

    def test_valid_direct_link_passes(self):
        cases = check_report_structure(_report(
            is_direct_link=True,
            direct_link="https://example.com/report",
        ))
        link = next(c for c in cases if c["case_id"] == "structure_direct_link")
        self.assertEqual(link["status"], "passed")

    def test_orphan_tab_query(self):
        tab = SimpleNamespace(id=10, name="A", layout_config=[])
        query = _query(tab_id=99)
        cases = check_report_structure(_report(queries=[query], tabs=[tab]))
        self.assertTrue(any(c["case_id"] == "structure_tab_queries" and c["status"] == "failed" for c in cases))


class QueryUiTest(unittest.TestCase):
    def test_unknown_visualization(self):
        cases = check_query_ui(_query(visualization_config={"type": "heatmap"}))
        self.assertTrue(any(c["status"] == "failed" and "Unknown visualization" in c["message"] for c in cases))

    def test_bar_without_axes_passes(self):
        cases = check_query_ui(_query(visualization_config={"type": "bar"}))
        self.assertTrue(any(c["case_id"].endswith("_axes") and c["status"] == "passed" for c in cases))

    def test_expandable_without_nested_passes(self):
        cases = check_query_ui(_query(visualization_config={"type": "expandable"}))
        self.assertTrue(any(c["case_id"].endswith("_nested") and c["status"] == "passed" for c in cases))

    def test_expandable_nested_sql(self):
        cases = check_query_ui(_query(visualization_config={
            "type": "expandable",
            "chartOptions": {"nestedQueries": [{"sql": "SELECT 1", "expandableFields": ["id"]}]},
        }))
        nested_sql = next(c for c in cases if c["case_id"].endswith("_nested_0_sql"))
        self.assertEqual(nested_sql["status"], "passed")


class FilterCheckTest(unittest.TestCase):
    def test_dropdown_requires_query(self):
        cases = check_filters([{
            "fieldName": "product",
            "displayName": "Product",
            "type": "dropdown",
            "required": False,
        }], "Query", "q1")
        self.assertTrue(any(c["status"] == "failed" and "dropdownQuery" in c["message"] for c in cases))

    def test_depends_on_missing_field(self):
        cases = check_filters([{
            "fieldName": "city",
            "displayName": "City",
            "type": "dropdown",
            "dropdownQuery": "SELECT 1 AS value, 1 AS label",
            "dependsOn": "country",
        }], "Query", "q1")
        self.assertTrue(any(c["case_id"].endswith("_depends") and c["status"] == "failed" for c in cases))

    def test_unknown_type(self):
        cases = check_filters([{
            "fieldName": "x",
            "displayName": "X",
            "type": "slider",
        }], "Query", "q1")
        self.assertTrue(any(c["status"] == "failed" and "Unknown filter type" in c["message"] for c in cases))


class ResultColumnTest(unittest.TestCase):
    def test_missing_axis_column_fails(self):
        query = _query(visualization_config={"type": "bar", "xAxis": "day", "yAxis": "total"})
        cases = check_result_columns(query, ["day", "count"], 3, 12, slow_ms=15000)
        viz = next(c for c in cases if c["case_id"].endswith("_viz_columns"))
        self.assertEqual(viz["status"], "failed")

    def test_empty_rows_pass(self):
        query = _query()
        cases = check_result_columns(query, ["value"], 0, 10, slow_ms=15000)
        row = next(c for c in cases if c["case_id"].endswith("_row_count"))
        self.assertEqual(row["status"], "passed")

    def test_slow_query_passes(self):
        query = _query()
        cases = check_result_columns(query, ["value"], 4, 20000, slow_ms=15000)
        perf = next(c for c in cases if c["case_id"].endswith("_perf"))
        self.assertEqual(perf["status"], "passed")


class RollupTest(unittest.TestCase):
    def test_failed_beats_passed(self):
        self.assertEqual(rollup_status([
            {"status": "skipped"},
            {"status": "failed"},
            {"status": "passed"},
        ]), "failed")

    def test_passed_without_failures(self):
        self.assertEqual(rollup_status([
            {"status": "skipped"},
            {"status": "passed"},
        ]), "passed")

    def test_summary_mentions_first_failure(self):
        text = summarize_cases([
            {"status": "failed", "message": "SQL is empty", "name": "sql"},
            {"status": "failed", "message": "other", "name": "x"},
        ])
        self.assertIn("SQL is empty", text)
        self.assertIn("+1 tane daha", text)


class SchemaWarningFoldTest(unittest.TestCase):
    def test_case_and_result_warning_become_passed(self):
        from app.schemas.report_tests import ReportTestCase, ReportTestResultOut, ReportTestRunOut

        case = ReportTestCase(
            case_id="x",
            category="ui",
            name="n",
            status="warning",
            message="old",
        )
        self.assertEqual(case.status, "passed")
        result = ReportTestResultOut(
            id=1,
            run_id=1,
            report_id=1,
            report_name="R",
            status="warning",
            cases=[],
        )
        self.assertEqual(result.status, "passed")
        run = ReportTestRunOut(
            id=1,
            status="success",
            trigger="manual",
            passed_reports=3,
            warning_reports=2,
            failed_reports=1,
            passed_cases=10,
            warning_cases=4,
        )
        self.assertEqual(run.passed_reports, 5)
        self.assertEqual(run.passed_cases, 14)
        self.assertFalse(hasattr(run, "warning_reports") and "warning_reports" in run.model_fields)


if __name__ == "__main__":
    unittest.main()
