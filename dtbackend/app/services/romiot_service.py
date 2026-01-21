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
        
        # 1. AMR Data: Sum operasyon_toplam
        # Table: amr.amr_data
        # Column: tarih (date)
        amr_query = f"""
            SELECT SUM(operasyon_toplam) 
            FROM amr.amr_data 
            WHERE tarih >= '{start_str}' AND tarih <= '{end_str}'
        """
        try:
            amr_result = DatabaseConnectionFactory.execute_query(platform, amr_query)
            amr_count = amr_result['data'][0][0] if amr_result['row_count'] > 0 and amr_result['data'][0][0] is not None else 0
        except Exception as e:
            print(f"Error fetching AMR stats: {e}")
            amr_count = 0

        # 2. Helicoil Data: Count unique (company + file_id + file_date)
        # Tables: helicoil.trBlok_points, helicoil.sogukPlaka_points
        # Column: file_date (timestamp)
        helicoil_query_1 = f"""
            SELECT COUNT(DISTINCT CONCAT(company, file_id, file_date))
            FROM helicoil."trBlok_points"
            WHERE file_date >= '{start_str} 00:00:00' AND file_date <= '{end_str} 23:59:59'
        """
        
        helicoil_query_2 = f"""
            SELECT COUNT(DISTINCT CONCAT(company, file_id, file_date))
            FROM helicoil."sogukPlaka_points"
            WHERE file_date >= '{start_str} 00:00:00' AND file_date <= '{end_str} 23:59:59'
        """
        
        try:
            h1_result = DatabaseConnectionFactory.execute_query(platform, helicoil_query_1)
            h1_count = h1_result['data'][0][0] if h1_result['row_count'] > 0 else 0
            
            h2_result = DatabaseConnectionFactory.execute_query(platform, helicoil_query_2)
            h2_count = h2_result['data'][0][0] if h2_result['row_count'] > 0 else 0
            
            helicoil_count = h1_count + h2_count
        except Exception as e:
            print(f"Error fetching Helicoil stats: {e}")
            helicoil_count = 0

        # 3. Points Data: Count unique csv_adi by parsing date from filename
        # Table: points_data.data
        # Column: csv_adi (text) - format "abc-1234-5678_1111_02-07-2025" or similar ending with date
        # We need to extract the date part and compare it.
        # Since doing string parsing logic in SQL for this specific format might be brittle/complex across engines,
        # but here we know it's PostgreSQL.
        # Regex to extract date at end: \d{2}-\d{2}-\d{4}$
        # But for performance and simplicity, if the date format is consistent dd-mm-yyyy at the end:
        # We can try to match string pattern.
        
        # Validating date format "dd-mm-yyyy"
        # Since we can't easily convert "dd-mm-yyyy" to date in standard SQL without custom functions if strict,
        # we will fetch all distinct csv_adi and filter in Python for safety, or use a regex filter in SQL.
        # Given it's a specific requirement: "according to the date at the end"
        
        points_count = 0
        try:
            # Fetch distinct csv_adi to filter in Python (safer for irregular formats)
            # Limit to likely candidates to avoid full table scan if huge? 
            # Or just fetch all unique names? Assuming table size is manageable for stats.
            # "points" table usually implies large data, so fetching all might be bad.
            # Let's try SQL regex.
            # Date part: substring(csv_adi from '\d{2}-\d{2}-\d{4}$')
            
            # Construct a SQL query that extracts the date and compares it
            # TO_DATE(substring(csv_adi from '\d{2}-\d{2}-\d{4}$'), 'DD-MM-YYYY')
            
            points_query = f"""
                SELECT COUNT(DISTINCT csv_adi)
                FROM points_data.data
                WHERE csv_adi ~ '\d{{2}}-\d{{2}}-\d{{4}}'
                AND TO_DATE(substring(csv_adi from '\d{{2}}-\d{{2}}-\d{{4}}'), 'DD-MM-YYYY') BETWEEN '{start_str}' AND '{end_str}'
            """
            
            points_result = DatabaseConnectionFactory.execute_query(platform, points_query)
            points_count = points_result['data'][0][0] if points_result['row_count'] > 0 else 0
            
        except Exception as e:
            print(f"Error fetching Points stats: {e}")
            points_count = 0

        # 4. Test Results: Count rows
        # Table: yapitasi.dbo_TEST_RESULT
        # Column: TEST_START_DATE (timestamp?)
        # User said "time format is different here". Let's assume standard timestamp first, 
        # but if it fails we might need to adjust.
        # In inspector output: "yapitasi.dbo_TEST_RESULT" exists.
        
        try:
            # dbo_TEST_RESULT has TEST_START_DATE as VARCHAR in 'DD.MM.YYYY HH:MM:SS' format
            # We must parse it to timestamp for comparison.
            
            test_query = f"""
                SELECT COUNT(*)
                FROM yapitasi."dbo_TEST_RESULT"
                WHERE TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') >= '{start_str} 00:00:00' 
                AND TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') <= '{end_str} 23:59:59'
            """
            
            test_result = DatabaseConnectionFactory.execute_query(platform, test_query)
            test_count = test_result['data'][0][0] if test_result['row_count'] > 0 else 0
            
        except Exception as e:
            print(f"Error fetching Test stats: {e}")
            test_count = 0

        # 5. Non-Conformance (Uygunsuzluk) Calculation
        # Helicoil: durum = 'NOK'
        # Points: Sonuç starts with 'NOK'
        # Test Result: RES_TESTS_RESULT contains 'Kaldı'
        
        non_conformance_count = 0
        try:
            # Helicoil NOK
            h1_nok_query = f"""
                SELECT COUNT(*)
                FROM helicoil."trBlok_points"
                WHERE durum = 'NOK'
                AND file_date >= '{start_str} 00:00:00' AND file_date <= '{end_str} 23:59:59'
            """
            h2_nok_query = f"""
                SELECT COUNT(*)
                FROM helicoil."sogukPlaka_points"
                WHERE durum = 'NOK'
                AND file_date >= '{start_str} 00:00:00' AND file_date <= '{end_str} 23:59:59'
            """
            
            h1_nok_res = DatabaseConnectionFactory.execute_query(platform, h1_nok_query)
            h2_nok_res = DatabaseConnectionFactory.execute_query(platform, h2_nok_query)
            
            helicoil_nok = (h1_nok_res['data'][0][0] if h1_nok_res['row_count'] > 0 else 0) + \
                           (h2_nok_res['data'][0][0] if h2_nok_res['row_count'] > 0 else 0)

            # Points NOK (Sonuç starts with NOK)
            # Regex match dates as before
            # NOTE: We must escape % as %% because psycopg2 uses % for parameter formatting
            points_nok_query = f"""
                SELECT COUNT(*)
                FROM points_data.data
                WHERE "Sonuç" LIKE 'NOK%%'
                AND csv_adi ~ '\d{{2}}-\d{{2}}-\d{{4}}'
                AND TO_DATE(substring(csv_adi from '\d{{2}}-\d{{2}}-\d{{4}}'), 'DD-MM-YYYY') BETWEEN '{start_str}' AND '{end_str}'
            """
            points_nok_res = DatabaseConnectionFactory.execute_query(platform, points_nok_query)
            points_nok = points_nok_res['data'][0][0] if points_nok_res['row_count'] > 0 else 0

            # Test Result NOK (RES_TESTS_RESULT contains 'Kaldı')
            test_nok_query = f"""
                SELECT COUNT(*)
                FROM yapitasi."dbo_TEST_RESULT"
                WHERE "RES_TESTS_RESULT" LIKE '%%Kaldı%%'
                AND TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') >= '{start_str} 00:00:00' 
                AND TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') <= '{end_str} 23:59:59'
            """
            test_nok_res = DatabaseConnectionFactory.execute_query(platform, test_nok_query)
            test_nok = test_nok_res['data'][0][0] if test_nok_res['row_count'] > 0 else 0

            non_conformance_count = int(helicoil_nok) + int(points_nok) + int(test_nok)

        except Exception as e:
            print(f"Error fetching Non-Conformance stats: {e}")
            non_conformance_count = 0

        # 6. Working Hours (Çalışma Saati) Calculation
        # Helicoil: Sum(Max(DateReported) - Min(DateReported)) per group
        # Test Result: Sum(RES_DATE - TEST_START_DATE)
        
        working_hours = 0
        try:
            # Helicoil Duration (seconds)
            # Group by company, file_id, file_date
            h1_dur_query = f"""
                SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (max_date - min_date))), 0)
                FROM (
                    SELECT MAX("DateReported") as max_date, MIN("DateReported") as min_date
                    FROM helicoil."trBlok_points"
                    WHERE "DateReported" >= '{start_str} 00:00:00' AND "DateReported" <= '{end_str} 23:59:59'
                    GROUP BY company, file_id, file_date
                ) as grouped
            """
            h2_dur_query = f"""
                SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (max_date - min_date))), 0)
                FROM (
                    SELECT MAX("DateReported") as max_date, MIN("DateReported") as min_date
                    FROM helicoil."sogukPlaka_points"
                    WHERE "DateReported" >= '{start_str} 00:00:00' AND "DateReported" <= '{end_str} 23:59:59'
                    GROUP BY company, file_id, file_date
                ) as grouped
            """
            
            h1_dur_res = DatabaseConnectionFactory.execute_query(platform, h1_dur_query)
            h2_dur_res = DatabaseConnectionFactory.execute_query(platform, h2_dur_query)
            
            helicoil_seconds = float(h1_dur_res['data'][0][0] if h1_dur_res['row_count'] > 0 else 0) + \
                               float(h2_dur_res['data'][0][0] if h2_dur_res['row_count'] > 0 else 0)

            # Test Result Duration (seconds)
            # RES_DATE - TEST_START_DATE
            test_dur_query = f"""
                SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
                    TO_TIMESTAMP("RES_DATE", 'DD.MM.YYYY HH24:MI:SS') - 
                    TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS')
                ))), 0)
                FROM yapitasi."dbo_TEST_RESULT"
                WHERE TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') >= '{start_str} 00:00:00' 
                AND TO_TIMESTAMP("TEST_START_DATE", 'DD.MM.YYYY HH24:MI:SS') <= '{end_str} 23:59:59'
            """
            
            test_dur_res = DatabaseConnectionFactory.execute_query(platform, test_dur_query)
            test_seconds = float(test_dur_res['data'][0][0] if test_dur_res['row_count'] > 0 else 0)
            
            total_seconds = helicoil_seconds + test_seconds
            hours = int(total_seconds // 3600)
            minutes = int((total_seconds % 3600) // 60)
            working_hours = f"{hours} sa {minutes} dk"

        except Exception as e:
            print(f"Error fetching Working Hours stats: {e}")
            working_hours = "0 sa 0 dk"

        # Total Operation Count
        total_operation_count = int(amr_count) + int(helicoil_count) + int(points_count) + int(test_count)

        # 7. Sensor Count (Sensör Sayısı) Calculation
        # Catalog: urun_ozellik where ozellik_id = 208
        # Value is in quotes, e.g. "220", need to strip them.
        
        sensor_count = 0
        try:
            sensor_query = """
                SELECT deger 
                FROM catalog.urun_ozellik 
                WHERE ozellik_id = 208
            """
            sensor_res = DatabaseConnectionFactory.execute_query(platform, sensor_query)
            if sensor_res['row_count'] > 0:
                raw_val = sensor_res['data'][0][0]
                # Strip quotes if present
                clean_val = raw_val.replace('"', '').replace("'", "")
                try:
                    sensor_count = int(clean_val)
                except ValueError:
                    print(f"Error parsing sensor value '{raw_val}': Not an integer")
                    sensor_count = 0
        except Exception as e:
            print(f"Error fetching Sensor stats: {e}")
            sensor_count = 0

        # Total Operation Count
        total_operation_count = int(amr_count) + int(helicoil_count) + int(points_count) + int(test_count)

        return {
            "operationCount": total_operation_count,
            "nonConformanceCount": non_conformance_count,
            "workingHours": working_hours,
            "requestCount": 0,        # Placeholder
            "sensorCount": sensor_count
        }
