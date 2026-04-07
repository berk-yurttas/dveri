from datetime import date, datetime
from typing import Dict, Any

from app.core.platform_db import DatabaseConnectionFactory
from app.core.config import settings
from app.models.postgres_models import Platform

class RomiotService:
    @staticmethod
    def _get_otomasyon_platform() -> Platform:
        """Create a Platform object for the otomasyon_db"""
        return Platform(
            code="otomasyon_backend",
            db_type="postgresql",
            db_config={
                "host": settings.OTOMASYON_DB_HOST,
                "port": settings.OTOMASYON_DB_PORT,
                "database": settings.OTOMASYON_DB_NAME,
                "user": settings.OTOMASYON_DB_USER,
                "password": settings.OTOMASYON_DB_PASSWORD
            }
        )

    @staticmethod
    def get_dashboard_stats(start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Calculate dashboard stats for the given date range.
        
        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            
        Returns:
            Dictionary with stats
        """
        platform = RomiotService._get_otomasyon_platform()
        
        # Format dates for queries
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        
        # 1. Operasyon Sayısı
        operation_count = 0
        try:
            op_query = f"""
            SELECT
                SUM("Test Adedi") "Denetlenen Mekanik Sayısı"
            FROM
            (
                (
                    SELECT
                        'TRBlok Mekanik Denetim Otomasyonu' AS "Otomasyon",
                        COUNT(DISTINCT CONCAT(company, '|', file_id)) "Test Adedi"
                    FROM
                        helicoil."trBlok_points"
                    WHERE
                        "DateReported" BETWEEN '{start_str}' AND '{end_str}'
                )
                UNION ALL
                (
                    SELECT
                        'Soğuk Plaka Mekanik Denetim Otomasyonu' AS "Otomasyon",
                        COUNT(DISTINCT CONCAT(company, '|', file_id)) "Test Adedi"
                    FROM
                        helicoil."sogukPlaka_points"
                    WHERE
                        "DateReported" BETWEEN '{start_str}' AND '{end_str}'
                )
                UNION ALL
                (
                    SELECT
                        'Yapı Taşı Kartı Otomasyonu' AS "Otomasyon",
                        COUNT(DISTINCT "TESTED_PRODUCT_ID") "Test Adedi"
                    FROM
                        yapitasi."dbo_TEST_RESULT"
                    WHERE
                        TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') > '2025-08-01'
                        AND TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') BETWEEN '{start_str}' AND '{end_str}'
                )
                UNION ALL
                (
                    SELECT
                        'Anten Görsel Denetim Otomasyon Sistemi' AS "Otomasyon",
                        COUNT(DISTINCT csv_adi) AS "Test Adedi"
                    FROM
                        point_data.points
                    WHERE
                        TO_DATE(SPLIT_PART(csv_adi, '_', 3), 'DD-MM-YYYY') BETWEEN '{start_str}' AND '{end_str}'
                )
                UNION ALL
                (
                    SELECT
                        'AMR' AS "Otomasyon",
                        SUM(operasyon_toplam) "Test Adedi"
                    FROM amr.amr_data
                    WHERE tarih >= '{start_str}' AND tarih <= '{end_str}'
                )
                UNION ALL
                (
                    SELECT
                        'F16 AESA-100 Burun Radarı Otomasyon Sistemi' AS "Otomasyon",
                        COUNT(*) AS "Test Adedi"
                    FROM
                        f16.f16_calisma_durumu
                    WHERE giristarihi >= '{start_str}' AND cikistarihi <= '{end_str}'
                )
            ) AS combined_stats
            """
            op_result = DatabaseConnectionFactory.execute_query(platform, op_query)
            if op_result['row_count'] > 0 and op_result['data'][0][0] is not None:
                operation_count = int(op_result['data'][0][0])
        except Exception as e:
            print(f"Error fetching Operasyon Sayısı stats: {e}")

        # 2. Yakalanan Uygunsuzluk
        non_conformance_count = 0
        try:
            nok_query = f"""
            SELECT
                SUM("Yakalanan Uygunsuzluk") "Yakalanan Uygunsuzluk"
            FROM
            (
                (
                    SELECT
                        'TRBlok Helicoil Denetim' AS "Otomasyon",
                        COUNT(*) AS "Yakalanan Uygunsuzluk"
                    FROM helicoil."trBlok_points"
                    WHERE durum = 'NOK'
                    AND file_date >= '{start_str} 00:00:00' AND file_date <= '{end_str} 23:59:59'
                )
                UNION ALL
                (
                    SELECT
                        'Soğuk Plaka Mekanik Denetim Otomasyon Sistemi' AS "Otomasyon",
                        COUNT(*)
                    FROM helicoil."sogukPlaka_points"
                    WHERE durum = 'NOK'
                    AND file_date >= '{start_str} 00:00:00' AND file_date <= '{end_str} 23:59:59'
                )
                UNION ALL
                (
                    SELECT
                        'Yapıtaşı Kartı Otomasyon Sistemi' AS "Otomasyon",
                        COUNT(*)
                    FROM yapitasi."dbo_TEST_RESULT"
                    WHERE "RES_TESTS_RESULT" LIKE '%%Kaldı%%'
                    AND TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') >= '{start_str} 00:00:00'
                    AND TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') <= '{end_str} 23:59:59'
                )
                UNION ALL
                (
                    SELECT
                        'Anten Denetim Otomasyon Sistemi' AS "Otomasyon",
                        COUNT(*)
                    FROM point_data.points
                    WHERE "Sonuç" NOT LIKE 'OK'
                    AND TO_DATE(SPLIT_PART(csv_adi, '_', 3), 'DD-MM-YYYY') BETWEEN '{start_str}' AND '{end_str}'
                )
            ) AS combined_stats
            """
            nok_result = DatabaseConnectionFactory.execute_query(platform, nok_query)
            if nok_result['row_count'] > 0 and nok_result['data'][0][0] is not None:
                non_conformance_count = int(nok_result['data'][0][0])
        except Exception as e:
            print(f"Error fetching Yakalanan Uygunsuzluk stats: {e}")

        # 3. Sensör Sayısı
        sensor_count = 0
        try:
            sensor_query = """
            SELECT COUNT(*) AS "Sensör Sayısı"
            FROM sensor.wificards AS uo
            """
            sensor_result = DatabaseConnectionFactory.execute_query(platform, sensor_query)
            if sensor_result['row_count'] > 0 and sensor_result['data'][0][0] is not None:
                sensor_count = int(sensor_result['data'][0][0])
        except Exception as e:
            print(f"Error fetching Sensor stats: {e}")

        # 4. Toplam Çalışma Saati
        working_hours_str = "0 sa 0 dk"
        try:
            hours_query = f"""
            SELECT
                SUM("Saat") AS "Çalışma Saati"
            FROM
            (
                (
                    SELECT
                        'Soğuk Plaka Mekanik Denetim' AS "Otomasyon",
                        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (max_date - min_date))), 0) / 3600, 2) AS "Saat"
                    FROM (
                        SELECT MAX("DateReported") as max_date, MIN("DateReported") as min_date
                        FROM helicoil."sogukPlaka_points"
                        WHERE "DateReported" >= '{start_str} 00:00:00' AND "DateReported" <= '{end_str} 23:59:59'
                        GROUP BY company, file_id, file_date
                    ) as grouped
                )
                UNION ALL
                (
                    SELECT
                        'TRBlok Helicoil Mekanik Denetim' AS "Otomasyon",
                        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (max_date - min_date))), 0) / 3600, 2) AS "Saat"
                    FROM (
                        SELECT MAX("DateReported") as max_date, MIN("DateReported") as min_date
                        FROM helicoil."trBlok_points"
                        WHERE "DateReported" >= '{start_str} 00:00:00' AND "DateReported" <= '{end_str} 23:59:59'
                        GROUP BY company, file_id, file_date
                    ) as grouped
                )
                UNION ALL
                (
                    SELECT
                        'Yapıtaşı Kartı Otomasyon Sistemi' AS "Otomasyon",
                        ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (
                            TO_TIMESTAMP("RES_DATE", 'DD.MM.YYYY HH24:MI:SS') -
                            TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS')
                        ))), 0)/ 3600, 2) AS "Saat"
                    FROM yapitasi."dbo_TEST_RESULT"
                    WHERE TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') >= '{start_str} 00:00:00'
                    AND TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') <= '{end_str} 23:59:59'
                )
                UNION ALL
                (
                    SELECT
                        'Anten Görsel Denetim Otomasyon Sistemi' AS "Otomasyon",
                        ROUND(COUNT(*) * 45.0 / 60.0, 2) AS "Saat"
                    FROM
                        (SELECT DISTINCT "csv_adi" FROM point_data.points WHERE TO_DATE(SPLIT_PART(csv_adi, '_', 3), 'DD-MM-YYYY') BETWEEN '{start_str}' AND '{end_str}') AS sub_csv
                )
                UNION ALL
                (
                    SELECT
                        'Bullet Test Otomasyon Sistemi' AS "Otomasyon",
                        COUNT(*)*20 AS "Saat"
                    FROM
                        bullet."bullet_is_emirleri"
                    WHERE
                        "startdate" BETWEEN '{start_str}' AND '{end_str}'
                )
                UNION ALL
                (
                    SELECT
                        'ABC Otomasyon Hattı' AS "Otomasyon",
                        ROUND(
                            EXTRACT(EPOCH FROM SUM(cikistarihi - giristarihi)) / 3600
                        , 2) AS "Saat"
                    FROM f16.f16_calisma_durumu
                    WHERE
                        cikistarihi IS NOT NULL
                        AND giristarihi IS NOT NULL
                        AND giristarihi BETWEEN '{start_str}' AND '{end_str}'
                )
            ) AS combined_stats
            """
            hours_result = DatabaseConnectionFactory.execute_query(platform, hours_query)
            if hours_result['row_count'] > 0 and hours_result['data'][0][0] is not None:
                total_hours = float(hours_result['data'][0][0])
                total_seconds = total_hours * 3600
                h = int(total_seconds // 3600)
                m = int((total_seconds % 3600) // 60)
                working_hours_str = f"{h} sa {m} dk"
        except Exception as e:
            print(f"Error fetching Toplam Çalışma Saati stats: {e}")

        # Fetch ISTek Sayısı Placeholder
        request_count = 0

        return {
            "operationCount": operation_count,
            "nonConformanceCount": non_conformance_count,
            "workingHours": working_hours_str,
            "requestCount": request_count,
            "sensorCount": sensor_count
        }
