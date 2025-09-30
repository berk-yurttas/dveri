from typing import Dict, Any, Optional
from .base import WidgetStrategy


class MeasurementAnalysisWidgetStrategy(WidgetStrategy):
    """Strategy for measurement analysis widget - analyze measurement data with limits"""

    def get_query(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """Get measurement analysis widget query with filters"""

        # Filters are mandatory for measurement analysis widget
        if not filters:
            raise ValueError("Filters are mandatory for measurement analysis widget")

        # Required filter validation
        if not filters.get('stok_no'):
            raise ValueError("stok_no filter is mandatory for measurement analysis widget")
        if not filters.get('test_adi'):
            raise ValueError("test_adi filter is mandatory for measurement analysis widget")
        if not filters.get('test_durum'):
            raise ValueError("test_durum filter is mandatory for measurement analysis widget")
        if not filters.get('olcum_yeri'):
            raise ValueError("olcum_yeri filter is mandatory for measurement analysis widget")

        # Extract required filters
        stok_no = filters['stok_no']
        test_adi = filters['test_adi']
        test_durum = filters['test_durum']
        olcum_yeri = filters['olcum_yeri']

        # Optional date filters
        date_from = filters.get('date_from', '2024-01-01 00:00:00')
        date_to = filters.get('date_to', '2025-12-31 23:59:59')

        # Build query to get measurement data with limits
        query = f"""
        SELECT
            tu.StokNo,
            teu.SeriNo,
            t.TestAdi,
            p.TestDurum,
            p.OlcumYeri,
            ta.OlculenDeger,
            p.AltLimit,
            p.UstLimit,
            ta.TestAdimiGectiKaldi,
            p.VeriTipi,
            t.TestBaslangicTarihi
        FROM REHIS_TestKayit_Test_TabloTest t
        LEFT JOIN REHIS_TestKayit_Test_TabloTestAdimi ta
            ON ta.TestID = t.TestID
        LEFT JOIN REHIS_TestTanim_Test_TabloTestPlan p
            ON p.TPAdimID = ta.TPAdimID
        LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g
            ON g.TestGrupID = t.TestGrupID
        LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu
            ON teu.TEUID = g.TEUID
        LEFT JOIN REHIS_TestTanim_Test_TabloUrun tu
            ON tu.UrunID = teu.UrunID
        WHERE tu.StokNo = '{stok_no}'
          AND t.TestAdi = '{test_adi}'
          AND p.TestDurum = '{test_durum}'
          AND p.OlcumYeri = '{olcum_yeri}'
          AND t.TestBaslangicTarihi >= '{date_from}'
          AND t.TestBaslangicTarihi <= '{date_to}'
          AND p.VeriTipi = 'numerical_comp'
        """

        print(query)
        return query

    def process_result(self, result: Any, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process measurement analysis widget result - return raw data"""

        if not filters:
            raise ValueError("Filters are mandatory for measurement analysis widget")

        if not result:
            return {
                "data": [],
                "filters": filters,
                "alt_limit": None,
                "ust_limit": None
            }

        # Extract limits from first row if available
        alt_limit = result[0][6] if result and len(result[0]) > 6 else None
        ust_limit = result[0][7] if result and len(result[0]) > 7 else None

        # Convert result to list of dictionaries
        data = []
        for row in result:
            data.append({
                "stok_no": row[0] if row[0] else "",
                "seri_no": row[1] if row[1] else "",
                "test_adi": row[2] if row[2] else "",
                "test_durum": row[3] if row[3] else "",
                "olcum_yeri": row[4] if row[4] else "",
                "olculen_deger": row[5] if row[5] else "",
                "alt_limit": row[6] if row[6] else "",
                "ust_limit": row[7] if row[7] else "",
                "test_adimi_gecti_kaldi": row[8] if row[8] else "",
                "veri_tipi": row[9] if row[9] else "",
                "test_baslangic_tarihi": row[10] if row[10] else ""
            })

        return {
            "data": data,
            "filters": filters,
            "alt_limit": alt_limit,
            "ust_limit": ust_limit
        }