from typing import Dict, Any, Optional
import io
import pandas as pd
import re
from datetime import datetime
from .base import WidgetStrategy


class ExcelExportWidgetStrategy(WidgetStrategy):
    """Strategy for Excel export widget - exports detailed test data to Excel"""

    def _extract_column_names_from_query(self, query: str) -> list:
        """Extract column names from SELECT statement"""
        try:
            # Remove comments and normalize whitespace
            query_clean = re.sub(r'--.*?\n', '', query)
            query_clean = re.sub(r'/\*.*?\*/', '', query_clean, flags=re.DOTALL)
            query_clean = ' '.join(query_clean.split())

            # Extract SELECT part (between SELECT and FROM)
            select_match = re.search(r'SELECT\s+(.*?)\s+FROM', query_clean, re.IGNORECASE | re.DOTALL)
            if not select_match:
                return []

            select_part = select_match.group(1)

            # Split by comma (handling nested parentheses)
            columns = []
            current_column = ""
            paren_count = 0

            for char in select_part:
                if char == '(':
                    paren_count += 1
                elif char == ')':
                    paren_count -= 1
                elif char == ',' and paren_count == 0:
                    columns.append(current_column.strip())
                    current_column = ""
                    continue
                current_column += char

            # Add the last column
            if current_column.strip():
                columns.append(current_column.strip())

            # Extract column names/aliases
            column_names = []
            for col in columns:
                col = col.strip()

                # Handle table.* selections
                if col.endswith('.*'):
                    # For wildcard selections, we'll use table prefixes
                    table_alias = col.replace('.*', '').strip()
                    if table_alias:
                        # Generate placeholder names for wildcard columns
                        # These will be replaced with actual table column names if needed
                        column_names.append(f"{table_alias}_columns")
                    else:
                        column_names.append("all_columns")
                    continue

                # Check for AS alias
                as_match = re.search(r'\s+as\s+(\w+)\s*$', col, re.IGNORECASE)
                if as_match:
                    column_names.append(as_match.group(1))
                    continue

                # Check for implicit alias (space-separated)
                parts = col.split()
                if len(parts) > 1 and not any(keyword in parts[-1].upper() for keyword in ['FROM', 'WHERE', 'GROUP', 'ORDER']):
                    # Last part might be an alias
                    possible_alias = parts[-1]
                    if re.match(r'^[a-zA-Z_]\w*$', possible_alias):
                        column_names.append(possible_alias)
                        continue

                # Extract function or column name
                if '(' in col:
                    # It's a function, try to extract meaningful name
                    func_match = re.search(r'(\w+)\s*\(', col)
                    if func_match:
                        column_names.append(func_match.group(1).lower())
                    else:
                        column_names.append("calculated_field")
                else:
                    # Simple column reference
                    if '.' in col:
                        # table.column format
                        column_names.append(col.split('.')[-1])
                    else:
                        column_names.append(col)

            return column_names

        except Exception as e:
            print(f"Error extracting column names from query: {e}")
            return []

    def get_query(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """Get Excel export query with UrunID, date filters, and Firma filter"""
        
        # Filters are mandatory for Excel export widget
        if not filters:
            raise ValueError("Filters are mandatory for Excel export widget")
        
        # Required filter validation
        if not filters.get('urun_id'):
            raise ValueError("urun_id filter is mandatory for Excel export widget")
        if not filters.get('date_from'):
            raise ValueError("date_from filter is mandatory for Excel export widget")
        if not filters.get('date_to'):
            raise ValueError("date_to filter is mandatory for Excel export widget")
        if not filters.get('firma'):
            raise ValueError("firma filter is mandatory for Excel export widget")
        
        # Extract required filters
        urun_id = int(filters['urun_id'])
        date_from = filters['date_from']
        date_to = filters['date_to']
        firma = filters.get('firma', '')  # Optional firma filter
        seri_no = filters.get('seri_no', '')  # Optional serial number filter
        
        # Build query with all the joins as specified
        query = f"""
        SELECT
            t.*,
            ta.*,
            tp.*,
            g.*,
            p.*,
            teu.*,
            cs.*,
            tc.*,
            tu.*
        FROM REHIS_TestKayit_Test_TabloTest AS t
        LEFT JOIN REHIS_TestKayit_Test_TabloTestAdimi AS ta 
            ON ta.TestID = t.TestID
        LEFT JOIN REHIS_TestTanim_Test_TabloTestPlan AS tp 
            ON tp.TPAdimID = ta.TPAdimID
        LEFT JOIN REHIS_TestKayit_Test_TabloTestGrup AS g 
            ON g.TestGrupID = t.TestGrupID
        LEFT JOIN REHIS_TestTanim_Test_TabloPersonel AS p 
            ON p.PersonelID = g.PersonelID
        LEFT JOIN REHIS_TestKayit_Test_TabloTEU AS teu 
            ON teu.TEUID = g.TEUID
        LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup AS cs 
            ON cs.SetupHashID = g.SetupHashID
        LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz AS tc 
            ON tc.CihazID = cs.CihazID
        LEFT JOIN REHIS_TestTanim_Test_TabloUrun AS tu 
            ON tu.UrunID = teu.UrunID
        WHERE tu.UrunID = {urun_id}
          AND t.TestBaslangicTarihi >= '{date_from}'
          AND t.TestBaslangicTarihi <= '{date_to}'
          AND p.Firma = '{firma}'
        """

        # Add serial number filter if provided
        if seri_no:
            query += f" AND teu.SeriNo = '{seri_no}'"
        
        query += " ORDER BY t.TestBaslangicTarihi DESC"
        
        print(query)
        return query
    
    def process_result(self, result: Any, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process Excel export result - returns Excel file as bytes"""

        if not filters:
            raise ValueError("Filters are mandatory for Excel export widget")

        if not result:
            # Create empty Excel file
            df = pd.DataFrame()
            excel_buffer = io.BytesIO()
            df.to_excel(excel_buffer, index=False, engine='openpyxl')
            excel_buffer.seek(0)

            return {
                "excel_file": excel_buffer.getvalue(),
                "filename": f"test_data_empty_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
                "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "urun_id": int(filters.get('urun_id', 0)),
                "firma": filters.get('firma', ''),
                "date_from": filters.get('date_from', ''),
                "date_to": filters.get('date_to', ''),
                "total_records": 0,
                "message": "No data found for the specified filters"
            }

        # Convert result to DataFrame
        df = pd.DataFrame(result)

        # Get column names from the query that was executed
        query = self.get_query(filters)
        extracted_column_names = self._extract_column_names_from_query(query)

        # Generate column names for DataFrame
        num_columns = len(df.columns)
        column_names = []

        # Handle wildcard selections (t.*, ta.*, etc.) by expanding them
        if extracted_column_names:
            for i, extracted_name in enumerate(extracted_column_names):
                if extracted_name.endswith('_columns'):
                    # This was a wildcard selection, generate appropriate names
                    table_prefix = extracted_name.replace('_columns', '')
                    if table_prefix == 't':
                        # Test table columns
                        table_columns = ['TestID', 'TestGrupID', 'TestAdi', 'TestBaslangicTarihi', 'TestBitisTarihi',
                                       'TestSuresi', 'TestGectiKaldi', 'TestSonucu', 'TestNotu']
                    elif table_prefix == 'ta':
                        # TestAdimi table columns
                        table_columns = ['TPAdimID', 'TestAdimi', 'AdimSuresi', 'AdimSonucu']
                    elif table_prefix == 'tp':
                        # TestPlan table columns
                        table_columns = ['TestPlanID', 'PlanAdi', 'PlanAciklama']
                    elif table_prefix == 'g':
                        # TestGrup table columns
                        table_columns = ['TestGrupID', 'TEUID', 'PersonelID', 'SetupHashID', 'YuklenmeTarihi']
                    elif table_prefix == 'p':
                        # Personel table columns
                        table_columns = ['PersonelID', 'PersonelAdi', 'PersonelSoyadi', 'Firma', 'Departman']
                    elif table_prefix == 'teu':
                        # TEU table columns
                        table_columns = ['TEUID', 'UrunID', 'SeriNo', 'IsEmriID', 'UretimTarihi']
                    elif table_prefix == 'cs':
                        # TestCihazSetup table columns
                        table_columns = ['SetupHashID', 'CihazID', 'SetupTarihi', 'SetupAciklama']
                    elif table_prefix == 'tc':
                        # TestCihaz table columns
                        table_columns = ['CihazID', 'CihazAdi', 'CihazModeli', 'DemirbasNo', 'Durum']
                    elif table_prefix == 'tu':
                        # Urun table columns
                        table_columns = ['UrunID', 'StokNo', 'UrunAdi', 'UrunAciklama']
                    else:
                        # Unknown table, use generic names
                        table_columns = [f'{table_prefix}_col_{j+1}' for j in range(10)]  # Assume 10 columns max

                    column_names.extend(table_columns)
                else:
                    column_names.append(extracted_name)

        # Adjust column names list to match actual number of columns in result
        if len(column_names) < num_columns:
            # Add generic names for any missing columns
            for i in range(len(column_names), num_columns):
                column_names.append(f"Column_{i+1}")
        elif len(column_names) > num_columns:
            # Trim to match actual number of columns
            column_names = column_names[:num_columns]

        # Fallback: if no column names were extracted, use generic names
        if not column_names:
            column_names = [f"Column_{i+1}" for i in range(num_columns)]

        # Update DataFrame column names
        df.columns = column_names
        
        # Generate Excel file
        excel_buffer = io.BytesIO()
        
        with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
            # Write main data
            df.to_excel(writer, sheet_name='Test Data', index=False)
            
            # Add summary sheet
            summary_data = {
                'Filter': ['Urun ID', 'Firma', 'Serial Number', 'Date From', 'Date To', 'Total Records', 'Export Date'],
                'Value': [
                    filters.get('urun_id', ''),
                    filters.get('firma', ''),
                    filters.get('seri_no', 'All'),
                    filters.get('date_from', ''),
                    filters.get('date_to', ''),
                    len(result),
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ]
            }
            summary_df = pd.DataFrame(summary_data)
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
        
        excel_buffer.seek(0)
        
        # Generate filename
        urun_id = filters.get('urun_id', 'unknown')
        firma = filters.get('firma', 'unknown').replace(' ', '_')
        seri_no = filters.get('seri_no', '')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        if seri_no:
            filename = f"test_data_urun_{urun_id}_firma_{firma}_seri_{seri_no}_{timestamp}.xlsx"
        else:
            filename = f"test_data_urun_{urun_id}_firma_{firma}_{timestamp}.xlsx"
        
        return {
            "excel_file": excel_buffer.getvalue(),
            "filename": filename,
            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "urun_id": int(filters['urun_id']),
            "firma": filters.get('firma', ''),
            "date_from": filters['date_from'],
            "date_to": filters['date_to'],
            "total_records": len(result),
            "message": f"Successfully generated Excel file with {len(result)} records"
        }
