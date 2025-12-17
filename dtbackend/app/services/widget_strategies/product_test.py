from typing import Any

from .base import WidgetStrategy


class ProductTestWidgetStrategy(WidgetStrategy):
    """Strategy for product test analysis widget"""

    def get_query(self, filters: dict[str, Any] | None = None) -> str:
        """Get product test widget query with UrunID, SeriNo, and TestBaslangicTarihi filters"""

        # Filters are mandatory for product test widget
        if not filters:
            raise ValueError("Filters are mandatory for product test widget")

        # Required filter validation
        if not filters.get('urun_id'):
            raise ValueError("urun_id filter is mandatory for product test widget")
        if not filters.get('seri_no'):
            raise ValueError("seri_no filter is mandatory for product test widget")
        if not filters.get('date_from'):
            raise ValueError("date_from filter is mandatory for product test widget")
        if not filters.get('date_to'):
            raise ValueError("date_to filter is mandatory for product test widget")

        # Extract required filters
        urun_id = int(filters['urun_id'])
        seri_no = str(filters['seri_no'])

        # Build query with parent query for ratios by UrunID, StokNo, SeriNo, TestAdi
        query = f"""
        WITH test_details AS (
            SELECT 
                tu.UrunID as UrunID,
                tu.StokNo as StokNo,
                teu.SeriNo as SeriNo, 
                t.TestAdi as TestAdi,
                teu.IsEmriID as IsEmriID,
                COUNT(*) AS total,
                SUM(
                    CASE 
                        WHEN UPPER(t.TestGectiKaldi) IN ('GECTI', 'GECTII', 'PASS', 'OK') 
                        THEN 1 
                        ELSE 0 
                    END
                ) AS passed,
                CASE 
                    WHEN COUNT(*) = SUM(
                        CASE 
                            WHEN UPPER(t.TestGectiKaldi) IN ('GECTI', 'GECTII', 'PASS', 'OK') 
                            THEN 1 
                            ELSE 0 
                        END
                    ) THEN 1 
                    ELSE 0 
                END as first_pass
            FROM REHIS_TestKayit_Test_TabloTest t
            LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g 
                   ON g.TestGrupID = t.TestGrupID
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu 
                   ON teu.TEUID = g.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun tu 
                   ON tu.UrunID = teu.UrunID
            WHERE tu.UrunID = {urun_id}
              AND teu.SeriNo = '{seri_no}'
              AND t.TestBaslangicTarihi >= '{filters['date_from']}'
              AND t.TestBaslangicTarihi <= '{filters['date_to']}'
              AND g.YuklenmeTarihi IS NOT NULL
            GROUP BY 
                tu.UrunID, 
                tu.StokNo, 
                teu.SeriNo, 
                t.TestAdi,
                teu.IsEmriID
        )
        SELECT 
            td.UrunID,
            td.StokNo,
            td.SeriNo,
            td.TestAdi,
            ROUND((SUM(td.first_pass) * 100.0 / COUNT(*)), 2) AS first_pass_ratio_by_test,
            ROUND((SUM(td.passed) * 100.0 / SUM(td.total)), 2) AS overall_pass_ratio_by_test,
            SUM(td.total) AS total,
            SUM(td.passed) AS passed,
            SUM(td.first_pass) as first_pass_count,
            count() as total_count_for_first_pass
        FROM test_details td
        GROUP BY 
            td.UrunID,
            td.StokNo,
            td.SeriNo,
            td.TestAdi
        ORDER BY 
            td.UrunID ASC, 
            td.SeriNo, 
            td.TestAdi
        """

        return query

    def process_result(self, result: Any, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        """Process product test widget result"""

        if not filters:
            raise ValueError("Filters are mandatory for product test widget")

        if not result:
            return {
                "urun_id": int(filters.get('urun_id', 0)),
                "seri_no": str(filters.get('seri_no', '')),
                "stok_no": "",
                "test_results": [],
                "summary": {
                    "total_tests": 0,
                    "total_passed": 0,
                    "overall_pass_ratio": 0.0,
                    "first_pass_tests": 0,
                    "first_pass_ratio": 0.0
                }
            }

        # Process individual test results
        test_results = []
        total_tests_count = 0
        total_passed_count = 0
        first_pass_count = 0
        total_first_pass_count = 0
        total_total_count_for_first_pass = 0
        stok_no = ""

        for row in result:
            urun_id = int(row[0])
            stok_no = str(row[1]) if row[1] else ""
            seri_no = str(row[2])
            test_adi = str(row[3])
            first_pass_ratio_by_test = float(row[4])
            overall_pass_ratio_by_test = float(row[5])
            total = int(row[6])
            passed = int(row[7])
            first_pass_count = int(row[8])
            total_count_for_first_pass = int(row[9])

            test_result = {
                "test_name": test_adi,
                "total": total,
                "passed": passed,
                "pass_ratio": round(overall_pass_ratio_by_test, 2),
                "first_pass_ratio_by_test": first_pass_ratio_by_test,
                "overall_pass_ratio_by_test": overall_pass_ratio_by_test,
                "first_pass_count": first_pass_count,
                "total_count_for_first_pass": total_count_for_first_pass
            }

            test_results.append(test_result)

            # Accumulate totals
            total_tests_count += total
            total_passed_count += passed
            total_first_pass_count += first_pass_count
            total_total_count_for_first_pass += total_count_for_first_pass

        # Calculate overall ratios
        overall_pass_ratio = (total_passed_count / total_tests_count * 100) if total_tests_count > 0 else 0.0
        first_pass_ratio = (total_first_pass_count / total_total_count_for_first_pass * 100) if total_total_count_for_first_pass > 0 else 0.0

        return {
            "urun_id": int(filters['urun_id']),
            "seri_no": str(filters['seri_no']),
            "stok_no": stok_no,
            "test_results": test_results,
            "summary": {
                "total_tests": total_tests_count,
                "total_passed": total_passed_count,
                "overall_pass_ratio": round(overall_pass_ratio, 2),
                "first_pass_tests": total_first_pass_count,
                "first_pass_ratio": round(first_pass_ratio, 2)
            }
        }
