from typing import Any

from .base import WidgetStrategy


class EfficiencyWidgetStrategy(WidgetStrategy):
    """Strategy for efficiency widget"""

    def get_query(self, filters: dict[str, Any] | None = None) -> str:
        """Get efficiency widget query using real ClickHouse schema"""

        # Filters are mandatory for efficiency widget
        if not filters:
            raise ValueError("Filters are mandatory for efficiency widget")

        # Required filter validation
        if not filters.get('infrastructure_id'):
            raise ValueError("infrastructure_id filter is mandatory for efficiency widget")
        if not filters.get('date_from'):
            raise ValueError("date_from filter is mandatory for efficiency widget")
        if not filters.get('date_to'):
            raise ValueError("date_to filter is mandatory for efficiency widget")

        # Extract required filters
        cihaz_id = str(filters['infrastructure_id'])
        date_from = filters['date_from']
        date_to = filters['date_to']

        query = f"""
        WITH efficiency_stats AS (
            SELECT
                tc.CihazID as infrastructure_id,
                tc.DemirbasNo as infrastructure_name,
                sum(toSecondsFromHHMMSS(assumeNotNull(tt.TestSuresi))) AS ToplamSureSaniye,
                toUnixTimestamp('{date_to}') - toUnixTimestamp('{date_from}') AS TarihAraligiSaniye,
                (sum(toSecondsFromHHMMSS(assumeNotNull(tt.TestSuresi))) * 100.0
                    / (toUnixTimestamp('{date_to}') - toUnixTimestamp('{date_from}'))) AS VerimlilikOrani
            FROM REHIS_TestKayit_Test_TabloTestGrup g
            LEFT JOIN REHIS_TestKayit_Test_TabloTest tt ON tt.TestGrupID = g.TestGrupID
            LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
            WHERE tc.CihazID = {cihaz_id}
              AND tt.TestBaslangicTarihi >= '{date_from}'
              AND tt.TestBaslangicTarihi <= '{date_to}'
              AND tt.TestBaslangicTarihi IS NOT NULL
              AND g.YuklenmeTarihi IS NOT NULL
            GROUP BY tc.CihazID, tc.DemirbasNo
        ),
        pass_fail_stats AS (
            SELECT
                tc.CihazID as infrastructure_id,
                sum(if(upperUTF8(tt.TestGectiKaldi) IN ('GEÇTİ', 'GECTI', 'PASS', 'OK'), 1, 0)) AS Passed,
                count(*) AS Total,
                100.0 * Passed / Total AS PassedOrani
            FROM REHIS_TestKayit_Test_TabloTestGrup g
            LEFT JOIN REHIS_TestKayit_Test_TabloTest tt ON tt.TestGrupID = g.TestGrupID
            LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
            WHERE tc.CihazID = {cihaz_id}
              AND tt.TestBaslangicTarihi >= '{date_from}'
              AND tt.TestBaslangicTarihi <= '{date_to}'
              AND tt.TestBaslangicTarihi IS NOT NULL
              AND g.YuklenmeTarihi IS NOT NULL
            GROUP BY tc.CihazID
        ),
        failed_products AS (
            SELECT
                tc.CihazID as infrastructure_id,
                tu.Tanim as product_name,
                tu.UrunID as product_id,
                sum(if(upperUTF8(g.GenelGectiKaldi) IN ('GEÇTİ', 'GECTI', 'PASS', 'OK'), 1, 0)) AS Passed,
                count(*) AS Total,
                Total - Passed AS Failed,
                100.0 * Passed / Total AS PassedOrani,
                100.0 * Failed / Total AS FailedOrani
            FROM REHIS_TestKayit_Test_TabloTestGrup g
            LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = g.SetupHashID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON g.TEUID = teu.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun tu ON tu.UrunID = teu.UrunID
            WHERE tc.CihazID = {cihaz_id}
              AND g.BitisTarihi >= '{date_from}'
              AND g.BitisTarihi <= '{date_to}'
              AND g.BitisTarihi IS NOT NULL
              AND g.YuklenmeTarihi IS NOT NULL
            GROUP BY tc.CihazID, tu.UrunID, tu.Tanim
            ORDER BY FailedOrani DESC, Failed DESC
            LIMIT 5
        )
        SELECT 
            es.infrastructure_id,
            es.infrastructure_name,
            es.VerimlilikOrani as efficiency_percentage,
            pfs.Total as total_tested_products,
            pfs.PassedOrani as pass_percentage,
            fp.product_name,
            fp.Failed as fail_count,
            fp.FailedOrani as fail_percentage
        FROM efficiency_stats es
        LEFT JOIN pass_fail_stats pfs ON es.infrastructure_id = pfs.infrastructure_id
        LEFT JOIN failed_products fp ON es.infrastructure_id = fp.infrastructure_id
        ORDER BY fp.FailedOrani DESC
        """

        return query

    def process_result(self, result: Any, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        """Process efficiency widget result from real ClickHouse queries"""
        # Filters are mandatory for efficiency widget
        if not filters:
            raise ValueError("Filters are mandatory for efficiency widget")

        if not result:
            # Return empty state structure instead of raising error
            return {
                "infrastructure_id": str(filters.get('infrastructure_id', '')),
                "infrastructure_name": f"Cihaz {filters.get('infrastructure_id', '')}",
                "efficiency_percentage": 0.0,
                "total_tested_products": 0,
                "pass_percentage": 0.0,
                "top_failed_products": []
            }

        # Group results by infrastructure
        infra_data = {}
        for row in result:
            infra_id = str(row[0])  # infrastructure_id (CihazID)
            if infra_id not in infra_data:
                efficiency = float(row[2]) if row[2] is not None else 0
                if efficiency > 100:
                    efficiency = 100.0
                infra_data[infra_id] = {
                    "infrastructure_id": infra_id,
                    "infrastructure_name": row[1] if row[1] else f"Cihaz {infra_id}",  # DemirbasNo
                    "efficiency_percentage": efficiency,  # VerimlilikOrani
                    "total_tested_products": int(row[3]) if row[3] is not None else 0,  # Total tests
                    "pass_percentage": float(row[4]) if row[4] is not None else 0,  # PassedOrani
                    "top_failed_products": []
                }

            # Add failed product if exists
            if len(row) > 5 and row[5]:  # product_name (UrunID)
                product_name = str(row[5])
                fail_count = int(row[6]) if row[6] is not None else 0
                fail_percentage = float(row[7]) if row[7] is not None else 0

                # Check if this product is already added to avoid duplicates
                existing_product = next((p for p in infra_data[infra_id]["top_failed_products"]
                                       if p["name"] == product_name), None)

                if not existing_product:
                    infra_data[infra_id]["top_failed_products"].append({
                        "name": product_name,
                        "fail_count": fail_count,
                        "fail_percentage": fail_percentage
                    })

        # Return first infrastructure data (or filtered one)
        target_infra = str(filters.get('infrastructure_id')) if filters and filters.get('infrastructure_id') else None
        if target_infra and target_infra in infra_data:
            return infra_data[target_infra]
        elif infra_data:
            return list(infra_data.values())[0]

        # Return empty state if no matching data found
        return {
            "infrastructure_id": str(filters.get('infrastructure_id', '')),
            "infrastructure_name": f"Cihaz {filters.get('infrastructure_id', '')}",
            "efficiency_percentage": 0.0,
            "total_tested_products": 0,
            "pass_percentage": 0.0,
            "top_failed_products": []
        }
