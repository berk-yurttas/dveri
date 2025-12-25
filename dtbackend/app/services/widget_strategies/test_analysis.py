from typing import Any

from .base import WidgetStrategy


class TestAnalysisWidgetStrategy(WidgetStrategy):
    """Strategy for test analysis widget - analyze specific test across serial numbers"""

    def get_query(self, filters: dict[str, Any] | None = None) -> str:
        """Get test analysis widget query with UrunID, TestAdi, and TestBaslangicTarihi filters"""

        # Filters are mandatory for test analysis widget
        if not filters:
            raise ValueError("Filters are mandatory for test analysis widget")

        # Required filter validation
        if not filters.get('urun_id'):
            raise ValueError("urun_id filter is mandatory for test analysis widget")
        if not filters.get('test_adi'):
            raise ValueError("test_adi filter is mandatory for test analysis widget")
        if not filters.get('date_from'):
            raise ValueError("date_from filter is mandatory for test analysis widget")
        if not filters.get('date_to'):
            raise ValueError("date_to filter is mandatory for test analysis widget")

        # Extract required filters
        urun_id = int(filters['urun_id'])
        test_adi = str(filters['test_adi'])

        # Build base query
        query = f"""
        SELECT 
            tu.UrunID, 
            tu.StokNo, 
            teu.SeriNo, 
            t.TestAdi,
            COUNT(*) AS total,
            SUM(
                CASE 
                    WHEN UPPER(t.TestGectiKaldi) IN ('GECTI', 'GECTII', 'PASS', 'OK') 
                    THEN 1 
                    ELSE 0 
                END
            ) AS passed,
            COUNT(*) - passed AS failed,
            100.0 * passed/total as pass_ratio,
            100.0 * failed/total as fail_ratio
        FROM REHIS_TestKayit_Test_TabloTest t
        LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g 
               ON g.TestGrupID = t.TestGrupID
        LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu 
               ON teu.TEUID = g.TEUID
        LEFT JOIN REHIS_TestTanim_Test_TabloUrun tu 
               ON tu.UrunID = teu.UrunID
        WHERE tu.UrunID = {urun_id}
          AND t.TestAdi = '{test_adi}'
          AND t.TestBaslangicTarihi >= '{filters['date_from']}'
          AND t.TestBaslangicTarihi <= '{filters['date_to']}'
          AND g.YuklenmeTarihi IS NOT NULL
        GROUP BY 
            tu.UrunID, 
            tu.StokNo, 
            teu.SeriNo, 
            t.TestAdi
        ORDER BY 
            fail_ratio DESC, 
            failed DESC, 
            teu.SeriNo ASC
        """

        return query

    def process_result(self, result: Any, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        """Process test analysis widget result"""

        if not filters:
            raise ValueError("Filters are mandatory for test analysis widget")

        if not result:
            return {
                "urun_id": int(filters.get('urun_id', 0)),
                "test_adi": str(filters.get('test_adi', '')),
                "stok_no": "",
                "serial_results": [],
                "summary": {
                    "total_tests": 0,
                    "total_passed": 0,
                    "overall_pass_ratio": 0.0,
                    "first_pass_serials": 0,
                    "first_pass_ratio": 0.0,
                    "total_serials": 0
                }
            }

        # Process individual serial number results
        serial_results = []
        total_tests_count = 0
        total_passed_count = 0
        first_pass_count = 0
        stok_no = ""

        for row in result:
            urun_id = int(row[0])
            stok_no = str(row[1]) if row[1] else ""
            seri_no = str(row[2])
            test_adi = str(row[3])
            total = int(row[4])
            passed = int(row[5])
            failed = int(row[6])
            pass_ratio = float(row[7])
            fail_ratio = float(row[8])

            # Determine if this is a first pass (total=1 and passed=1)
            print(total, passed)
            first_pass = total == passed

            serial_result = {
                "seri_no": seri_no,
                "total": total,
                "passed": passed,
                "failed": failed,
                "pass_ratio": pass_ratio,
                "fail_ratio": fail_ratio,
                "first_pass": first_pass
            }

            serial_results.append(serial_result)

            # Accumulate totals
            total_tests_count += total
            total_passed_count += passed
            if first_pass:
                first_pass_count += 1

        # Calculate overall ratios
        overall_pass_ratio = (total_passed_count / total_tests_count * 100) if total_tests_count > 0 else 0.0
        first_pass_ratio = (first_pass_count / len(serial_results) * 100) if serial_results else 0.0

        return {
            "urun_id": int(filters['urun_id']),
            "test_adi": str(filters['test_adi']),
            "stok_no": stok_no,
            "serial_results": serial_results,
            "summary": {
                "total_tests": total_tests_count,
                "total_passed": total_passed_count,
                "overall_pass_ratio": round(overall_pass_ratio, 2),
                "first_pass_serials": first_pass_count,
                "first_pass_ratio": round(first_pass_ratio, 2),
                "total_serials": len(serial_results)
            }
        }
