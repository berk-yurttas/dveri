from typing import List, Dict, Any, Optional
from .widget_factory import WidgetFactory


class DataService:
    """Service for handling widget data using factory pattern"""
    
    @staticmethod
    def get_widget_data(
        db_client,
        widget_type: str,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Get widget data using widget factory"""
        return WidgetFactory.create_widget_data(
            db_client=db_client,
            widget_type=widget_type,
            filters=filters
        )
    
    @staticmethod
    def get_infrastructure_list(db_client) -> List[Dict[str, Any]]:
        """Get list of available infrastructure/equipment for dropdown filters"""
        try:
            query = """
            SELECT 
                CihazID, 
                concat(DemirbasNo, ' / ', CihazModeli) as display_name
            FROM REHIS_TestTanim_Test_TabloTestCihaz
            ORDER BY CihazID
            """
            
            result = db_client.execute(query)
            
            infrastructure_list = []
            for row in result:
                infrastructure_list.append({
                    "id": int(row[0]),
                    "name": str(row[1]) if row[1] else f"Cihaz {row[0]}",
                    "value": int(row[0])  # For compatibility with frontend
                })
            
            return infrastructure_list
            
        except Exception as e:
            print(f"Error fetching infrastructure list: {e}")
            # Return error response instead of empty list
            raise ValueError(f"Failed to fetch infrastructure list: {str(e)}")
    
    @staticmethod
    def get_product_list(db_client) -> List[Dict[str, Any]]:
        """Get list of all products for dropdown filters"""
        try:
            query = """
            SELECT *
            FROM REHIS_TestTanim_Test_TabloUrun
            ORDER BY UrunID
            """
            
            result = db_client.execute(query)
            
            product_list = []
            for row in result:
                product_list.append({
                    "id": int(row[0]),  # UrunID
                    "name": str(row[1]) if len(row) > 1 and row[1] else f"Ürün {row[0]}",  # Tanim or product name
                    "value": int(row[0]),  # For compatibility with frontend
                    "description": str(row[2]) if len(row) > 2 and row[2] else "",  # Additional info if available
                })
            
            return product_list
            
        except Exception as e:
            print(f"Error fetching product list: {e}")
            raise ValueError(f"Failed to fetch product list: {str(e)}")
    
    @staticmethod
    def get_product_serial_numbers(db_client, product_id: int) -> List[Dict[str, Any]]:
        """Get serial numbers for a specific product"""
        try:
            query = f"""
            SELECT teu.SeriNo
            FROM REHIS_TestTanim_Test_TabloUrun u
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.UrunID = u.UrunID
            WHERE u.UrunID = {product_id}
            ORDER BY teu.TEUID
            """
            
            result = db_client.execute(query)
            
            serial_numbers = []
            for row in result:
                serial_numbers.append({
                    "serial_number": str(row[0])
                })
            
            return serial_numbers
            
        except Exception as e:
            print(f"Error fetching serial numbers for product {product_id}: {e}")
            raise ValueError(f"Failed to fetch serial numbers for product {product_id}: {str(e)}")
    
    @staticmethod
    def get_product_test_names(db_client, product_id: int) -> List[Dict[str, Any]]:
        """Get list of test names (TestAdi) for a specific product"""
        try:
            query = f"""
            SELECT DISTINCT t.TestAdi
            FROM REHIS_TestKayit_Test_TabloTest t
            LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup g 
                   ON g.TestGrupID = t.TestGrupID
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu 
                   ON teu.TEUID = g.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun tu 
                   ON tu.UrunID = teu.UrunID
            WHERE tu.UrunID = {product_id}
            ORDER BY t.TestAdi
            """
            
            result = db_client.execute(query)
            
            test_names = []
            for row in result:
                if row[0]:  # Check if TestAdi is not null
                    test_names.append({
                        "id": len(test_names) + 1,  # Generate sequential ID
                        "name": str(row[0]),  # TestAdi
                        "value": str(row[0]),  # For compatibility with frontend
                    })
            
            return test_names
            
        except Exception as e:
            print(f"Error fetching test names for product {product_id}: {e}")
            raise ValueError(f"Failed to fetch test names for product {product_id}: {str(e)}")

    @staticmethod
    def get_distinct_companies(db_client, product_id: int) -> List[Dict[str, Any]]:
        """Get list of distinct companies for dropdown filters"""
        try:
            query = f"""
            SELECT DISTINCT(upperUTF8(p.Firma))
            FROM REHIS_TestKayit_Test_TabloTestGrup g
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = g.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun u ON u.UrunID = teu.UrunID
            LEFT JOIN REHIS_TestTanim_Test_TabloPersonel p ON p.PersonelID = g.PersonelID
            WHERE u.UrunID = {product_id}
            ORDER BY upperUTF8(p.Firma)
            """
            
            result = db_client.execute(query)
            
            companies = []
            for row in result:
                companies.append({
                    "id": len(companies) + 1,
                    "name": str(row[0]),
                    "value": str(row[0]),
                })
            return companies
        except Exception as e:
            print(f"Error fetching distinct companies: {e}")
            raise ValueError(f"Failed to fetch distinct companies: {str(e)}")

    @staticmethod
    def get_test_statuses(db_client, product_id: int, test_name: str) -> List[Dict[str, Any]]:
        """Get list of test statuses for dropdown filters"""
        try:
            query = f"""
            SELECT
            DISTINCT p.TestDurum
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
            WHERE tu.UrunID = {product_id}
            AND t.TestAdi = '{test_name}'
            """
            
            result = db_client.execute(query)
            
            test_statuses = []
            for row in result:
                test_statuses.append({
                    "id": len(test_statuses) + 1,
                    "name": str(row[0]),
                    "value": str(row[0]),
                })
            return test_statuses
        except Exception as e:
            print(f"Error fetching test statuses: {e}")
            raise ValueError(f"Failed to fetch test statuses: {str(e)}")

    @staticmethod
    def get_measurement_locations(db_client, product_id: int, test_name: str, test_status: str) -> List[Dict[str, Any]]:
        """Get list of measurement locations for dropdown filters"""
        try:
            query = f"""
            SELECT
            DISTINCT p.OlcumYeri
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
            WHERE tu.UrunID = {product_id}
            AND t.TestAdi = '{test_name}'
            AND p.TestDurum = '{test_status}'
            """
            
            result = db_client.execute(query)
            
            measurement_locations = []
            for row in result:
                measurement_locations.append({
                    "id": len(measurement_locations) + 1,
                    "name": str(row[0]),
                    "value": str(row[0]),
                })
            return measurement_locations
        except Exception as e:
            print(f"Error fetching measurement locations: {e}")
            raise ValueError(f"Failed to fetch measurement locations: {str(e)}")