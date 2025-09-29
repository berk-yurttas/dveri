from typing import Dict, Any, Optional, List, Union
from .base import WidgetStrategy

class SerialNoComparisonWidgetStrategy(WidgetStrategy):
    """Strategy for serial number comparison widget - compare serial numbers across different fields"""
    
    def get_query(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """Get serial number comparison widget query with SerialNo, Field1, Field2, Field3, Field4, Field5 filters"""
        
        # Filters are mandatory for serial number comparison widget
        if not filters:
            raise ValueError("Filters are mandatory for serial number comparison widget")
        
        # Required filter validation
        if not filters.get('urun_id'):
            raise ValueError("urun_id filter is mandatory for serial number comparison widget")
        if not filters.get('seri_no'):
            raise ValueError("seri_no filter is mandatory for serial number comparison widget")
        if not filters.get('test_adi'):
            raise ValueError("test_adi filter is mandatory for serial number comparison widget")
        if not filters.get('test_durum'):
            raise ValueError("test_durum filter is mandatory for serial number comparison widget")
        if not filters.get('olcum_yeri'):
            raise ValueError("olcum_yeri filter is mandatory for serial number comparison widget")
        if not filters.get('date_from'):
            raise ValueError("date_from filter is mandatory for serial number comparison widget")
        if not filters.get('date_to'):
            raise ValueError("date_to filter is mandatory for serial number comparison widget")
        
        # Extract and validate seri_no as array
        seri_no_input = filters['seri_no']
        if isinstance(seri_no_input, str):
            # If it's a single string, convert to list
            seri_no_list = [seri_no_input]
        elif isinstance(seri_no_input, list):
            # If it's already a list, validate all items are strings
            seri_no_list = [str(sn) for sn in seri_no_input if sn]  # Filter out empty values
        else:
            raise ValueError("seri_no must be a string or array of strings")
        
        if not seri_no_list:
            raise ValueError("seri_no array cannot be empty")
        
        # Extract other required filters
        urun_id = int(filters['urun_id'])
        test_adi = str(filters['test_adi'])
        test_durum = str(filters['test_durum'])
        olcum_yeri = str(filters['olcum_yeri'])
        date_from = str(filters['date_from'])
        date_to = str(filters['date_to'])
        
        # Create IN clause for serial numbers
        seri_no_in_clause = "', '".join(seri_no_list)
        seri_no_in_clause = f"'{seri_no_in_clause}'"
        
        # Build the query for serial number comparison
        query = f"""
        SELECT 
            U.StokNo,
            TE.SeriNo,
            tp.OlcumYeri,
            tp.TestDurum,
            tp.AltLimit,
            tp.UstLimit,
            ta.OlculenDeger,
            T.TestBaslangicTarihi
        FROM REHIS_TestKayit_Test_TabloTest AS T
        LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup AS TG 
            ON TG.TestGrupID = T.TestGrupID
        LEFT JOIN REHIS_TestKayit_Test_TabloTEU AS TE 
            ON TE.TEUID = TG.TEUID
        LEFT JOIN REHIS_TestTanim_Test_TabloUrun AS U 
            ON U.UrunID = TE.UrunID
        LEFT JOIN REHIS_TestKayit_Test_TabloTestAdimi AS ta 
            ON ta.TestID = T.TestID
        LEFT JOIN REHIS_TestTanim_Test_TabloTestPlan AS tp 
            ON tp.TPAdimID = ta.TPAdimID
        WHERE U.UrunID = {urun_id}
          AND TE.SeriNo IN ({seri_no_in_clause})
          AND T.TestAdi = '{test_adi}'
          AND tp.TestDurum = '{test_durum}'
          AND tp.OlcumYeri = '{olcum_yeri}'
          AND T.TestBaslangicTarihi >= '{date_from}'
          AND T.TestBaslangicTarihi <= '{date_to}'
          AND TG.YuklenmeTarihi IS NOT NULL
          AND tp.VeriTipi = 'numerical_comp'
        ORDER BY 
            TE.SeriNo ASC,
            T.TestBaslangicTarihi ASC
        """
        
        return query
    
    def process_result(self, result: Any, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process serial number comparison widget result for line chart display"""
        
        if not filters:
            raise ValueError("Filters are mandatory for serial number comparison widget")
        
        if not result:
            return {
                "urun_id": int(filters.get('urun_id', 0)),
                "test_adi": str(filters.get('test_adi', '')),
                "test_durum": str(filters.get('test_durum', '')),
                "olcum_yeri": str(filters.get('olcum_yeri', '')),
                "stok_no": "",
                "chart_data": {
                    "series": [],
                    "categories": [],
                    "limits": {
                        "alt_limit": None,
                        "ust_limit": None
                    }
                },
                "summary": {
                    "total_serials": 0,
                    "total_measurements": 0,
                    "date_range": {
                        "from": str(filters.get('date_from', '')),
                        "to": str(filters.get('date_to', ''))
                    }
                }
            }
        
        # Process serial number comparison results
        stok_no = ""
        measurement_count = 0
        alt_limit = None
        ust_limit = None
        
        # Group results by serial number
        serial_groups = {}
        all_timestamps = set()
        
        for row in result:
            stok_no = str(row[0]) if row[0] else ""
            seri_no = str(row[1])
            olcum_yeri = str(row[2])
            test_durum = str(row[3])
            alt_limit = float(row[4]) if row[4] is not None else alt_limit
            ust_limit = float(row[5]) if row[5] is not None else ust_limit
            olculen_deger = float(row[6]) if row[6] is not None else None
            test_baslangic = str(row[7]) if row[7] else ""
            
            # Add timestamp to global set for x-axis categories
            if test_baslangic:
                all_timestamps.add(test_baslangic)
            
            if seri_no not in serial_groups:
                serial_groups[seri_no] = []
            
            serial_groups[seri_no].append({
                "timestamp": test_baslangic,
                "value": olculen_deger,
                "olcum_yeri": olcum_yeri,
                "test_durum": test_durum
            })
            measurement_count += 1
        
        # Sort timestamps for consistent x-axis
        sorted_timestamps = sorted(list(all_timestamps))
        
        # Create series data for line chart
        series_data = []
        for seri_no, measurements in serial_groups.items():
            # Sort measurements by timestamp
            measurements.sort(key=lambda x: x["timestamp"])
            
            # Extract values for this series
            values = [m["value"] for m in measurements]
            timestamps = [m["timestamp"] for m in measurements]
            
            series_data.append({
                "name": seri_no,
                "data": values,
                "timestamps": timestamps,
                "measurement_count": len(measurements),
                "statistics": {
                    "avg": sum(v for v in values if v is not None) / len([v for v in values if v is not None]) if any(v is not None for v in values) else None,
                    "min": min(v for v in values if v is not None) if any(v is not None for v in values) else None,
                    "max": max(v for v in values if v is not None) if any(v is not None for v in values) else None
                }
            })
        
        # Sort series by serial number for consistent ordering
        series_data.sort(key=lambda x: x["name"])
        
        return {
            "urun_id": int(filters['urun_id']),
            "test_adi": str(filters['test_adi']),
            "test_durum": str(filters['test_durum']),
            "olcum_yeri": str(filters['olcum_yeri']),
            "stok_no": stok_no,
            "chart_data": {
                "series": series_data,
                "categories": sorted_timestamps,
                "limits": {
                    "alt_limit": alt_limit,
                    "ust_limit": ust_limit
                }
            },
            "summary": {
                "total_serials": len(series_data),
                "total_measurements": measurement_count,
                "date_range": {
                    "from": str(filters['date_from']),
                    "to": str(filters['date_to'])
                }
            }
        }