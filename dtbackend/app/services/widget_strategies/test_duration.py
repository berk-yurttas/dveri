from typing import Any

from .base import WidgetStrategy


class TestDurationWidgetStrategy(WidgetStrategy):
    """Strategy for test duration widget - analyze total test duration by product"""

    def get_query(self, filters: dict[str, Any] | None = None) -> str:
        """Get test duration widget query with UrunID and TestBaslangicTarihi filters"""

        # Filters are mandatory for test duration widget
        if not filters:
            raise ValueError("Filters are mandatory for test duration widget")

        # Required filter validation
        if not filters.get('urun_id'):
            raise ValueError("urun_id filter is mandatory for test duration widget")
        if not filters.get("seri_no"):
            raise ValueError("seri_no filter is mandatory for test duration widget")
        if not filters.get('date_from'):
            raise ValueError("date_from filter is mandatory for test duration widget")
        if not filters.get('date_to'):
            raise ValueError("date_to filter is mandatory for test duration widget")

        # Extract required filters
        urun_id = int(filters['urun_id'])
        date_from = filters['date_from']
        date_to = filters['date_to']
        seri_no = filters['seri_no']

        # Build query with time duration calculation and first pass analysis
        query = f"""
        WITH duration_stats AS (
            SELECT 
                tu.UrunID as product_id,
                tu.StokNo as stock_no,
                teu.SeriNo as seri_no,
                SUM(
                    toFloat64OrZero(arrayElement(splitByChar(':', assumeNotNull(t.TestSuresi)), 1)) * 3600
                  + toFloat64OrZero(arrayElement(splitByChar(':', assumeNotNull(t.TestSuresi)), 2)) * 60
                  + toFloat64OrZero(arrayElement(splitByChar(':', assumeNotNull(t.TestSuresi)), 3))
                ) AS total_sure
            FROM REHIS_TestKayit_Test_TabloTest AS t
            LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup AS g 
                   ON g.TestGrupID = t.TestGrupID
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU AS teu 
                   ON teu.TEUID = g.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun AS tu 
                   ON tu.UrunID = teu.UrunID
            WHERE tu.UrunID = {urun_id}
              AND teu.SeriNo = '{seri_no}'
              AND t.TestBaslangicTarihi >= '{date_from}'
              AND t.TestBaslangicTarihi <= '{date_to}'
              AND t.TestBaslangicTarihi IS NOT NULL
              AND t.TestSuresi IS NOT NULL
              AND g.YuklenmeTarihi IS NOT NULL
            GROUP BY tu.UrunID, tu.StokNo, teu.SeriNo
        ),
        first_pass_stats AS (
            SELECT 
                product_id,
                stock_no,
                SeriNo,
                TestAdi,
                SUM(first_pass) AS first_pass_count,
                SUM(total) AS total,
                SUM(passed) AS passed,
                COUNT(*) AS total_count_for_first_pass
            FROM (
            SELECT 
                tu.UrunID as product_id,
                tu.StokNo as stock_no,
                teu.SeriNo, 
                teu.IsEmriID,
                t.TestAdi,
                count() AS total,
                sum(if(upperUTF8(t.TestGectiKaldi) IN ('GEÇTİ','GECTI','PASS','OK'), 1, 0)) AS passed,
                if(total = passed, 1, 0) AS first_pass
            FROM REHIS_TestKayit_Test_TabloTest AS t
            LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup AS g 
                   ON g.TestGrupID = t.TestGrupID
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU AS teu 
                   ON teu.TEUID = g.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun AS tu 
                   ON tu.UrunID = teu.UrunID
            WHERE tu.UrunID = {urun_id}
              AND t.TestBaslangicTarihi >= '{date_from}'
              AND t.TestBaslangicTarihi <= '{date_to}'
              AND t.TestBaslangicTarihi IS NOT NULL
              AND g.YuklenmeTarihi IS NOT NULL
            GROUP BY tu.UrunID, tu.StokNo, teu.SeriNo, teu.IsEmriID, t.TestAdi
            )
            GROUP BY product_id, stock_no, SeriNo, TestAdi
        )
        SELECT 
            ds.product_id,
            ds.stock_no,
            ds.total_sure,
            COUNT(fps.total) AS total_test_combinations,
            SUM(fps.first_pass_count) AS first_pass_count,
            SUM(fps.total_count_for_first_pass) AS total_count_for_first_pass,
            ROUND((SUM(fps.first_pass_count) * 100.0 / SUM(fps.total_count_for_first_pass)), 2) AS first_pass_percentage,
            SUM(fps.total) AS total_test_count,
            ds.total_sure / SUM(fps.total) AS average_duration_seconds
        FROM duration_stats ds
        LEFT JOIN first_pass_stats fps ON ds.product_id = fps.product_id AND ds.stock_no = fps.stock_no
        GROUP BY ds.product_id, ds.stock_no, ds.total_sure
        ORDER BY ds.total_sure DESC
        """

        return query

    def process_result(self, result: Any, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        """Process test duration widget result with first pass analysis"""

        if not filters:
            raise ValueError("Filters are mandatory for test duration widget")

        if not result:
            return {
                "urun_id": int(filters.get('urun_id', 0)),
                "stok_no": "",
                "total_duration_seconds": 0,
                "total_duration_formatted": "0s",
                "first_pass_percentage": 0.0,
                "summary": {
                    "total_tests": 0,
                    "average_duration_seconds": 0,
                    "average_duration_formatted": "0s",
                    "total_test_combinations": 0,
                    "first_pass_count": 0,
                    "first_pass_percentage": 0.0
                }
            }

        # Process results
        total_duration_seconds = 0
        total_test_combinations = 0
        total_first_pass_count = 0
        total_total_count_for_first_pass = 0
        total_test_count = 0
        stok_no = ""

        for row in result:
            urun_id = int(row[0])
            stok_no = str(row[1]) if row[1] else ""
            duration_seconds = float(row[2]) if row[2] is not None else 0
            test_combinations = int(row[3]) if row[3] is not None else 0
            first_pass_count = int(row[4]) if row[4] is not None else 0
            total_count_for_first_pass = int(row[5]) if row[5] is not None else 0
            first_pass_percentage = float(row[6]) if row[6] is not None else 0.0
            test_count = int(row[7]) if row[7] is not None else 0
            average_duration = float(row[8]) if row[8] is not None else 0.0

            total_duration_seconds += duration_seconds
            total_test_combinations += test_combinations
            total_first_pass_count += first_pass_count
            total_total_count_for_first_pass += total_count_for_first_pass
            total_test_count += test_count

        # Format duration for display
        def format_duration(seconds):
            """Convert seconds to human readable format"""
            if seconds < 60:
                return f"{int(seconds)}s"
            elif seconds < 3600:
                minutes = int(seconds // 60)
                remaining_seconds = int(seconds % 60)
                return f"{minutes}dk {remaining_seconds}s"
            else:
                hours = int(seconds // 3600)
                minutes = int((seconds % 3600) // 60)
                remaining_seconds = int(seconds % 60)
                return f"{hours}sa {minutes}dk {remaining_seconds}s"

        total_duration_formatted = format_duration(total_duration_seconds)
        overall_first_pass_percentage = (total_first_pass_count / total_total_count_for_first_pass * 100) if total_total_count_for_first_pass > 0 else 0.0
        # Calculate average duration by dividing total duration by total test count
        average_duration_seconds = (total_duration_seconds / total_test_count) if total_test_count > 0 else 0.0

        return {
            "urun_id": int(filters['urun_id']),
            "stok_no": stok_no,
            "total_duration_seconds": round(total_duration_seconds, 2),
            "total_duration_formatted": total_duration_formatted,
            "first_pass_percentage": round(overall_first_pass_percentage, 2),
            "summary": {
                "total_tests": len(result),
                "average_duration_seconds": round(average_duration_seconds, 2),
                "average_duration_formatted": format_duration(average_duration_seconds),
                "total_test_combinations": total_test_combinations,
                "first_pass_count": total_first_pass_count,
                "first_pass_percentage": round(overall_first_pass_percentage, 2),
                "total_test_count": total_test_count
            }
        }
