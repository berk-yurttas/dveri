"""Regression tests for `_work_order_to_schema` — serializing a WorkOrder ORM
row to its response schema with pairs attached.

The response schema's `pairs` field is required (min_length=1) but is NOT an ORM
column, so validating the bare ORM row raises ValidationError. In the endpoint
that surfaced as an unhandled 500 → "Failed to fetch" in the browser. The helper
must attach pairs before validation. No DB needed.

Run with: python -m unittest test_work_order_serialization_helper -v
"""
import unittest

from app.api.v1.endpoints.romiot.station.work_order import _work_order_to_schema
from app.models.romiot_models import WorkOrder
from app.schemas.order_pair import OrderPair
from app.schemas.work_order import WorkOrder as WorkOrderSchema


def _orm_row():
    """A WorkOrder ORM instance shaped like one fresh after commit+refresh."""
    wo = WorkOrder(
        id=7, station_id=1, user_id=1, work_order_group_id="WO-1",
        main_customer="m", sector="s", company_from="c", teklif_number="MKS-1",
        part_number="P1", quantity=1, total_quantity=1, package_index=1, total_packages=1,
    )
    wo.priority = 0
    wo.prioritized_by = None
    wo.delivered = False
    wo.route_violation = False
    wo.entrance_date = None
    wo.exit_date = None
    wo.revision_number = None
    wo.target_date = None
    wo.qr_code = None
    wo.qr_created_at = None
    wo.aselsan_order_number = "A1"
    wo.order_item_number = "K1"
    return wo


class WorkOrderToSchemaTest(unittest.TestCase):
    def test_bare_orm_row_cannot_be_validated(self):
        """Documents the bug: validating the ORM row directly raises (pairs missing)."""
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            WorkOrderSchema.model_validate(_orm_row())

    def test_helper_attaches_pairs_and_validates(self):
        """The fix: helper attaches pairs, so serialization succeeds."""
        pairs = [
            OrderPair(aselsan_order_number="A1", order_item_number="K1"),
            OrderPair(aselsan_order_number="A2", order_item_number="K2"),
        ]
        schema = _work_order_to_schema(_orm_row(), pairs)
        self.assertEqual(schema.id, 7)
        self.assertEqual(
            [(p.aselsan_order_number, p.order_item_number) for p in schema.pairs],
            [("A1", "K1"), ("A2", "K2")],
        )


if __name__ == "__main__":
    unittest.main()
