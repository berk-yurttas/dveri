"""Unit tests for mes_tracking_service. No DB/network: SQL building and
assembly are pure functions; orchestration mocks pyodbc + the session.
Run with: python -m unittest test_mes_tracking_service -v
"""
import unittest

from app.services.mes_tracking_service import build_track_query


class BuildTrackQueryTest(unittest.TestCase):
    def test_order_search_exact_predicates_and_params(self):
        sql, params = build_track_query(
            table_name="Mes_ProductionOrders_bosan",
            filter_column=None, filter_value=None,
            order_number="26Y2173D43", order_item_number="00030",
            part_number=None,
        )
        self.assertIn("FROM dbo.[Mes_ProductionOrders_bosan]", sql)
        self.assertIn("AselsanOrderCode = ?", sql)
        self.assertIn("WorkOrderItemNo = ?", sql)
        self.assertIn("IsDeleted = 0 OR IsDeleted IS NULL", sql)
        self.assertNotIn("ProductCode LIKE", sql)
        self.assertEqual(params, ["26Y2173D43", "00030"])

    def test_part_search_uses_like_with_wildcards(self):
        sql, params = build_track_query(
            table_name="Mes_ProductionOrders_mekasan",
            filter_column=None, filter_value=None,
            order_number=None, order_item_number=None,
            part_number="MM-0009",
        )
        self.assertIn("ProductCode LIKE ?", sql)
        self.assertNotIn("AselsanOrderCode = ?", sql)
        self.assertEqual(params, ["%MM-0009%"])

    def test_optional_filter_prepended_when_configured(self):
        sql, params = build_track_query(
            table_name="Mes_ProductionOrders_mekasan",
            filter_column="SourceCompany", filter_value="ASELSAN",
            order_number=None, order_item_number=None,
            part_number="X",
        )
        self.assertIn("SourceCompany = ?", sql)
        self.assertEqual(params, ["ASELSAN", "%X%"])

    def test_invalid_table_name_raises(self):
        with self.assertRaises(ValueError):
            build_track_query(
                table_name="Mes; DROP TABLE x;--",
                filter_column=None, filter_value=None,
                order_number=None, order_item_number=None, part_number="X",
            )

    def test_invalid_filter_column_raises(self):
        with self.assertRaises(ValueError):
            build_track_query(
                table_name="Mes_ProductionOrders_bosan",
                filter_column="a = 1; --", filter_value="x",
                order_number=None, order_item_number=None, part_number="X",
            )

    def test_no_search_criteria_yields_no_search_predicates(self):
        sql, params = build_track_query(
            table_name="Mes_ProductionOrders_bosan",
            filter_column=None, filter_value=None,
            order_number=None, order_item_number=None, part_number=None,
        )
        self.assertNotIn("AselsanOrderCode = ?", sql)
        self.assertNotIn("ProductCode LIKE", sql)
        self.assertIn("IsDeleted = 0 OR IsDeleted IS NULL", sql)
        self.assertEqual(params, [])

    def test_filter_column_without_value_raises(self):
        with self.assertRaises(ValueError):
            build_track_query(
                table_name="Mes_ProductionOrders_bosan",
                filter_column="SourceCompany", filter_value=None,
                order_number=None, order_item_number=None, part_number="X",
            )


if __name__ == "__main__":
    unittest.main()
