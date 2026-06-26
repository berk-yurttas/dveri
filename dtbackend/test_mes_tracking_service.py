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


from datetime import datetime, date

from app.services.mes_tracking_service import assemble_matches


def _row(order="26Y2173D43", item="00030", op="Kaplama", mg="2",
         start=None, end=None, need=None, product="MM-0009-2244",
         rev="A", sub="1001", amount=9):
    return {
        "AselsanOrderCode": order, "WorkOrderItemNo": item,
        "ProductCode": product, "RevisionNo": rev,
        "OperationDesc": op, "Mes_MachineGroup": mg, "OperationCode": "OP",
        "OrderStatus": None,
        "ActualStartDate": start, "ActualEndDate": end, "NeedDate": need,
        "AselsanSectorCode": "RF", "SubcontractorID": sub,
        "WorkOrderAmount": amount, "PlannedQuantity": 3,
    }


class AssembleMatchesTest(unittest.TestCase):
    def test_two_pairs_yield_two_matches(self):
        rows = [_row(item="00030"), _row(item="00040")]
        matches = assemble_matches(rows, hedef_firma="Bosan",
                                   company_name_by_code={}, today=date(2026, 6, 25))
        self.assertEqual(len(matches), 2)

    def test_single_pair_with_two_ops_one_match_two_steps_in_order(self):
        rows = [
            _row(op="Boya", mg="3", start=datetime(2026, 6, 2)),
            _row(op="Kaplama", mg="1", start=datetime(2026, 6, 1), end=datetime(2026, 6, 2)),
        ]
        matches = assemble_matches(rows, hedef_firma="Bosan",
                                   company_name_by_code={}, today=date(2026, 6, 25))
        self.assertEqual(len(matches), 1)
        steps = matches[0].timeline
        self.assertEqual([s.station_name for s in steps], ["Kaplama", "Boya"])
        self.assertEqual(steps[0].status, "done")
        self.assertEqual(steps[1].status, "active")
        self.assertTrue(steps[-1].is_exit_station)

    def test_all_ops_done_is_tamamlandi(self):
        rows = [_row(start=datetime(2026, 6, 1), end=datetime(2026, 6, 2))]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.status, "Tamamlandı")

    def test_active_and_overdue_is_gecikmis(self):
        rows = [_row(start=datetime(2026, 6, 1), end=None, need=datetime(2026, 6, 10))]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.status, "Gecikmiş")

    def test_nothing_started_is_girisi_yapilmadi(self):
        rows = [_row(start=None, end=None)]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.status, "Girişi yapılmadı")
        self.assertIsNone(m.current_station_name)

    def test_company_from_resolved_from_subcontractor_id(self):
        rows = [_row(sub="1001")]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={"1001": "ASELSAN REHİS"},
                             today=date(2026, 6, 25))[0]
        self.assertEqual(m.company_from, "ASELSAN REHİS")
        self.assertEqual(m.coating_company, "Bosan")
        self.assertEqual(m.packages, [])
        self.assertEqual(m.total_packages, 1)
        self.assertEqual(m.work_order_group_id, "26Y2173D43-00030")

    def test_date_typed_actual_start_does_not_crash_sorting(self):
        # pyodbc may return datetime.date for a SQL DATE column; the tiebreak
        # sort must not crash comparing date vs datetime.max.
        rows = [
            _row(mg="5", start=date(2026, 6, 1), end=None, need=datetime(2026, 7, 1)),
            _row(mg="5", start=None, end=None),
        ]
        matches = assemble_matches(rows, hedef_firma="Bosan",
                                   company_name_by_code={}, today=date(2026, 6, 25))
        self.assertEqual(len(matches), 1)
        self.assertEqual(len(matches[0].timeline), 2)

    def test_exit_active_not_overdue_is_sevke_hazir(self):
        rows = [
            _row(op="Kaplama", mg="1", start=datetime(2026, 6, 1), end=datetime(2026, 6, 2)),
            _row(op="Sevkiyat", mg="2", start=datetime(2026, 6, 3), end=None, need=datetime(2026, 7, 1)),
        ]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.status, "Sevke Hazır")

    def test_active_non_exit_is_islemde(self):
        rows = [
            _row(op="Kaplama", mg="1", start=datetime(2026, 6, 1), end=None, need=datetime(2026, 7, 1)),
            _row(op="Sevkiyat", mg="2", start=None, end=None),
        ]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.status, "İşlemde")

    def test_company_from_falls_back_to_code_when_unresolved(self):
        rows = [_row(sub="9999")]
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.company_from, "9999")

    def test_total_quantity_falls_back_to_planned_when_amount_zero(self):
        rows = [_row(amount=0)]  # _row default PlannedQuantity=3
        m = assemble_matches(rows, hedef_firma="Bosan",
                             company_name_by_code={}, today=date(2026, 6, 25))[0]
        self.assertEqual(m.total_quantity, 3)

    def test_rows_with_null_order_or_item_are_skipped(self):
        rows = [
            {**_row(), "AselsanOrderCode": None},
            {**_row(), "WorkOrderItemNo": None},
            _row(),
        ]
        matches = assemble_matches(rows, hedef_firma="Bosan",
                                   company_name_by_code={}, today=date(2026, 6, 25))
        self.assertEqual(len(matches), 1)


import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows
    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None
    def all(self):
        return self._rows


class _FakeSession:
    """Minimal async session: returns queued results per execute() call."""
    def __init__(self, results):
        self._results = list(results)
    async def execute(self, *_args, **_kwargs):
        return self._results.pop(0)


class TrackFromMesTest(unittest.TestCase):
    def test_missing_config_returns_empty_matches(self):
        from app.services.mes_tracking_service import track_from_mes
        session = _FakeSession([_FakeResult([])])  # no config row
        resp = asyncio.run(track_from_mes(
            session, hedef_firma="Yok", order_number=None,
            order_item_number=None, part_number="X",
        ))
        self.assertEqual(resp.matches, [])

    def test_happy_path_returns_assembled_match(self):
        from app.services.mes_tracking_service import track_from_mes
        config = SimpleNamespace(
            company="Bosan", table_name="Mes_ProductionOrders_bosan",
            filter_column=None, filter_value=None,
        )
        company_rows = [("1001", "ASELSAN REHİS")]
        session = _FakeSession([_FakeResult([config]), _FakeResult(company_rows)])
        fake_rows = [_row(sub="1001")]
        with patch("app.services.mes_tracking_service._fetch_rows",
                   new=AsyncMock(return_value=fake_rows)) as mock_fetch:
            resp = asyncio.run(track_from_mes(
                session, hedef_firma="Bosan", order_number="26Y2173D43",
                order_item_number="00030", part_number=None,
            ))
        self.assertEqual(len(resp.matches), 1)
        self.assertEqual(resp.matches[0].company_from, "ASELSAN REHİS")
        mock_fetch.assert_awaited_once()


from fastapi import HTTPException

from app.api.v1.endpoints.romiot.station.work_order import track_product_mes


class TrackMesEndpointTest(unittest.TestCase):
    def _user(self, roles):
        return SimpleNamespace(role=roles, department="ASELSAN")

    def test_non_musteri_role_403(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(track_product_mes(
                hedef_firma="Bosan", order_number=None, order_item_number=None,
                part_number="X", current_user=self._user(["atolye:operator"]),
                romiot_db=_FakeSession([]),
            ))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_missing_hedef_firma_400(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(track_product_mes(
                hedef_firma="", order_number="A", order_item_number="B",
                part_number=None, current_user=self._user(["atolye:musteri"]),
                romiot_db=_FakeSession([]),
            ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_missing_search_params_400(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(track_product_mes(
                hedef_firma="Bosan", order_number=None, order_item_number=None,
                part_number=None, current_user=self._user(["atolye:musteri"]),
                romiot_db=_FakeSession([]),
            ))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_delegates_to_service_on_valid_request(self):
        from app.schemas.work_order import TrackResponse
        with patch("app.api.v1.endpoints.romiot.station.work_order.track_from_mes",
                   new=AsyncMock(return_value=TrackResponse(matches=[]))) as svc:
            resp = asyncio.run(track_product_mes(
                hedef_firma="Bosan", order_number="A", order_item_number="B",
                part_number=None, current_user=self._user(["atolye:musteri"]),
                romiot_db=_FakeSession([]),
            ))
        self.assertEqual(resp.matches, [])
        svc.assert_awaited_once()

    def test_service_value_error_returns_400(self):
        with patch("app.api.v1.endpoints.romiot.station.work_order.track_from_mes",
                   new=AsyncMock(side_effect=ValueError("Geçersiz SQL tanımlayıcısı: 'bad;name'"))):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(track_product_mes(
                    hedef_firma="Bosan", order_number="A", order_item_number="B",
                    part_number=None, current_user=self._user(["atolye:musteri"]),
                    romiot_db=_FakeSession([]),
                ))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Geçersiz", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
