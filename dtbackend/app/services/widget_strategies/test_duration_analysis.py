from typing import Dict, Any, List, Optional
from .base import WidgetStrategy


class TestDurationAnalysisWidgetStrategy(WidgetStrategy):
    """Widget strategy for test duration analysis with line and area chart visualization"""

    def get_query(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """
        Get test duration analysis query for specific product and test

        Expected filters:
        - urunId: Product ID (required)
        - testAdi: Test name (required)
        - dateFrom: Start date (required)
        - dateTo: End date (required)
        """
        # Validate required filters
        if not filters:
            raise ValueError("Filters are mandatory for test duration analysis widget")

        required_filters = ['urunId', 'testAdi', 'dateFrom', 'dateTo']
        missing_filters = [f for f in required_filters if f not in filters or not filters[f]]

        if missing_filters:
            raise ValueError(f"Missing required filters: {', '.join(missing_filters)}")

        urun_id = filters['urunId']
        test_adi = filters['testAdi']
        date_from = filters['dateFrom']
        date_to = filters['dateTo']

        query = f"""
        SELECT
            teu.SeriNo as serial_number,
            t.TestBaslangicTarihi as test_start_date,
            t.TestSuresi as test_duration
        FROM REHIS_TestKayit_Test_TabloTest t
        LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g ON g.TestGrupID = t.TestGrupID
        LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = g.TEUID
        LEFT JOIN REHIS_TestTanim_Test_TabloUrun u ON u.UrunID = teu.UrunID
        WHERE u.UrunID = {urun_id}
        AND t.TestAdi = '{test_adi}'
        AND t.TestBaslangicTarihi >= '{date_from}'
        AND t.TestBaslangicTarihi <= '{date_to}'
        AND teu.SeriNo IS NOT NULL
        ORDER BY t.TestBaslangicTarihi ASC
        """

        return query

    def process_result(self, result: Any, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process the query result into widget-specific format"""
        try:
            # Helper function to convert HH:MM:SS string to seconds
            def time_string_to_seconds(time_str):
                if not time_str or time_str == '0' or time_str == '':
                    return 0.0
                try:
                    # Handle HH:MM:SS format
                    if isinstance(time_str, str) and ':' in time_str:
                        parts = time_str.split(':')
                        if len(parts) == 3:
                            hours = int(parts[0])
                            minutes = int(parts[1])
                            seconds = int(parts[2])
                            return hours * 3600 + minutes * 60 + seconds
                        elif len(parts) == 2:
                            minutes = int(parts[0])
                            seconds = int(parts[1])
                            return minutes * 60 + seconds
                    # Handle numeric values (already in seconds)
                    return float(time_str)
                except (ValueError, TypeError):
                    return 0.0

            # Transform data for frontend consumption
            data = []
            for row in result:
                test_duration_seconds = time_string_to_seconds(row[2])
                data.append({
                    'serial_number': row[0],
                    'test_start_date': row[1],
                    'test_duration': test_duration_seconds
                })

            # Get unique serial numbers for dropdown
            serial_numbers = list(set([item['serial_number'] for item in data if item['serial_number']]))
            serial_numbers.sort()

            return {
                "data": data,
                "serial_numbers": serial_numbers,
                "total_records": len(data),
                "filters_applied": {
                    "product_id": filters.get('urunId') if filters else None,
                    "test_name": filters.get('testAdi') if filters else None,
                    "date_range": f"{filters.get('dateFrom')} to {filters.get('dateTo')}" if filters else None
                }
            }

        except Exception as e:
            return {
                "error": True,
                "message": f"Failed to process test duration analysis data: {str(e)}"
            }