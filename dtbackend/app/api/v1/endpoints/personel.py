from fastapi import APIRouter, UploadFile, File, HTTPException, Form, Depends
from typing import List
import pandas as pd
import io
from app.core.database import get_aflow_connection
from app.core.auth import check_authenticated
from app.schemas.user import User

router = APIRouter()

@router.post("/upload-excel")
async def upload_personel_excel(
    file: UploadFile = File(...),
    firma_tipi: str = Form(...)
):
    """Upload Excel file and update personel_count table"""
    
    if firma_tipi not in ['kablaj', 'talasli']:
        raise HTTPException(status_code=400, detail="firma_tipi must be 'kablaj' or 'talasli'")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
    try:
        # Read Excel file
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents), header=None)
        
        # Debug: Print first 15 rows
        print("\n" + "="*80)
        print(f"Excel file: {file.filename}")
        print(f"Total rows: {len(df)}, Total columns: {len(df.columns)}")
        print("="*80)
        for i in range(min(15, len(df))):
            row = df.iloc[i]
            row_data = []
            for col_idx in range(min(10, len(row))):
                val = row[col_idx]
                if pd.notna(val):
                    row_data.append(f"{chr(65+col_idx)}={val}")
            if row_data:
                print(f"Row {i}: {', '.join(row_data)}")
        print("="*80 + "\n")
        
        # Parse data starting from row 7 (index 6)
        # Template structure:
        # Row 3 (index 2): Department headers (Geçici Kabul in B, Üretim merged C-E, Test in F, etc.)
        # Row 4 (index 3): Sub-department headers (but has "Personel Sayısı" labels, not actual dept names)
        # Row 7+ (index 6+): Company name, then "Personel Sayısı", then count numbers
        # Note: We hard-code department names because Excel merged cells and template structure
        #       make it unreliable to read from header rows
        
        records = []
        
        # Get template headers from rows 3-4 (indices 2-3) - for debugging only
        if len(df) < 7:
            raise HTTPException(status_code=400, detail="Excel file must have at least 7 rows")
        
        upper_dept_row = df.iloc[2]  # Row 3: Upper department headers
        sub_dept_row = df.iloc[3]     # Row 4: Sub-department headers
        
        print(f"Upper dept row (index 2): {[upper_dept_row[j] if pd.notna(upper_dept_row[j]) else 'NaN' for j in range(min(10, len(upper_dept_row)))]}")
        print(f"Sub dept row (index 3): {[sub_dept_row[j] if pd.notna(sub_dept_row[j]) else 'NaN' for j in range(min(10, len(sub_dept_row)))]}")
        
        # Parse data rows starting from row 7 (index 6)
        i = 6  # Start from row 7 (0-based index 6)
        while i < len(df):
            row = df.iloc[i]
            
            # Check if this is a company name row (has company name in column A, not "Personel")
            if pd.notna(row[0]) and str(row[0]).strip() != "" and "Personel" not in str(row[0]):
                current_firma = str(row[0]).strip()
                print(f"\nProcessing company: {current_firma} at row {i+1} (Excel row)")
                
                # Next row should have "Personel Sayısı" label
                # Row after that should have the actual counts
                if i + 2 < len(df):
                    count_row = df.iloc[i + 2]  # Skip the "Personel Sayısı" label row
                else:
                    print(f"Warning: No count row found for company {current_firma}")
                    i += 1
                    continue
                
                print(f"Count row (index {i+2}): {[count_row[j] if pd.notna(count_row[j]) else 'NaN' for j in range(min(10, len(count_row)))]}")
                
                # Column B (index 1): Geçici Kabul
                if pd.notna(count_row[1]) and count_row[1] != 0:
                    ust_birim = 'Geçici Kabul'
                    records.append({
                        'firma_adi': current_firma,
                        'ust_birim': ust_birim,
                        'birim': None,
                        'personel_sayisi': int(count_row[1]),
                        'firma_tipi': firma_tipi
                    })
                    print(f"  Added: {current_firma} - {ust_birim} - None - {int(count_row[1])} - {firma_tipi}")
                
                # Columns C, D, E (indices 2, 3, 4): Üretim with sub-departments
                # Hard-code sub-department names to avoid reading "Personel Sayısı" from template
                uretim_subdepts = [
                    (2, 'RF Üretim'),
                    (3, 'CX Üretim'),
                    (4, 'Birim İçi Üretim')
                ]
                
                for col_idx, birim_name in uretim_subdepts:
                    if pd.notna(count_row[col_idx]) and count_row[col_idx] != 0:
                        records.append({
                            'firma_adi': current_firma,
                            'ust_birim': 'Üretim',
                            'birim': birim_name,
                            'personel_sayisi': int(count_row[col_idx]),
                            'firma_tipi': firma_tipi
                        })
                        print(f"  Added: {current_firma} - Üretim - {birim_name} - {int(count_row[col_idx])} - {firma_tipi}")
                
                # Columns F, G, H, I (indices 5, 6, 7, 8): Test, Kalite, Planlama, İdari
                other_depts = [
                    (5, 'Test'),
                    (6, 'Kalite'),
                    (7, 'Planlama'),
                    (8, 'İdari')
                ]
                
                for col_idx, ust_birim in other_depts:
                    if pd.notna(count_row[col_idx]) and count_row[col_idx] != 0:
                        records.append({
                            'firma_adi': current_firma,
                            'ust_birim': ust_birim,
                            'birim': None,
                            'personel_sayisi': int(count_row[col_idx]),
                            'firma_tipi': firma_tipi
                        })
                        print(f"  Added: {current_firma} - {ust_birim} - None - {int(count_row[col_idx])} - {firma_tipi}")
                
                # Move past this company's data (company name + "Personel Sayısı" + counts + 2 blank rows = 5 rows)
                i += 5
            else:
                i += 1
        
        print(f"\nTotal records parsed: {len(records)}\n")

        
        # Connect to database and update table
        conn = get_aflow_connection()
        cursor = conn.cursor()
        
        try:
            # Delete only records with matching firma_tipi
            cursor.execute("DELETE FROM personel.personel_count WHERE firma_tipi = ?", firma_tipi)
            
            # Insert new records
            insert_query = """
                INSERT INTO personel.personel_count (firma_adi, ust_birim, birim, personel_sayisi, firma_tipi)
                VALUES (?, ?, ?, ?, ?)
            """
            
            for record in records:
                cursor.execute(
                    insert_query,
                    record['firma_adi'],
                    record['ust_birim'],
                    record['birim'],
                    record['personel_sayisi'],
                    record['firma_tipi']
                )
            
            conn.commit()
            
            return {
                "success": True,
                "message": f"Successfully imported {len(records)} records for {firma_tipi}",
                "records_count": len(records)
            }
            
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        finally:
            cursor.close()
            conn.close()
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.get("/data")
async def get_personel_data():
    """Get all personel count data"""
    
    try:
        conn = get_aflow_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT 
                id,
                firma_adi,
                ust_birim,
                birim,
                personel_sayisi,
                firma_tipi,
                created_at
            FROM personel.personel_count
            ORDER BY firma_tipi, firma_adi, ust_birim, birim
        """
        
        cursor.execute(query)
        columns = [column[0] for column in cursor.description]
        results = []
        
        for row in cursor.fetchall():
            results.append(dict(zip(columns, row)))
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "data": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/upload-tezgah-excel")
async def upload_tezgah_excel(
    file: UploadFile = File(...),
    current_user: User = Depends(check_authenticated)
):
    """Upload Excel file with machine (tezgah) data"""
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
    try:
        # Get user's department as default firma
        user_firma = (current_user.department or "").strip()
        if not user_firma:
            raise HTTPException(status_code=400, detail="User department not found. Cannot determine firma.")
        
        print(f"User firma from department: {user_firma}")
        
        # Read Excel file
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # Check if 'Firma' column exists in Excel
        has_firma_column = 'Firma' in df.columns
        print(f"Excel has 'Firma' column: {has_firma_column}")
        
        # Debug: Print column names and first few rows
        print("\n" + "="*80)
        print(f"Excel file: {file.filename}")
        print(f"Total rows: {len(df)}, Total columns: {len(df.columns)}")
        print(f"Columns: {list(df.columns)}")
        print("="*80)
        print(df.head())
        print("="*80 + "\n")
        
        # Parse data
        records = []
        
        # Column mapping - updated to match new Excel template
        # Expected columns: Firma (optional), Tezgah No, Tezgah Adı, Tip, Model Yılı, Marka, Ölçüler, 
        #                   Eksen Sayısı, Max Devir, Seri No, Aselsan Bölüm, Proje, 
        #                   ASELSAN'a Çalışan Tezgah
        # If 'Firma' column doesn't exist, use user's department
        
        # Iterate through rows
        for idx, row in df.iterrows():
            try:
                # Determine firma value
                if has_firma_column:
                    # If Firma column exists, use it (or user's firma if empty)
                    firma_value = str(row['Firma']).strip() if pd.notna(row['Firma']) and str(row['Firma']).strip() != '' else user_firma
                else:
                    # If Firma column doesn't exist, use user's firma
                    firma_value = user_firma
                
                # Skip rows where all key fields are empty (except Firma)
                if pd.isna(row['Tezgah No']) or str(row['Tezgah No']).strip() == '':
                    continue
                
                record = {
                    'Firma': firma_value,
                    'TezgahNo': str(row['Tezgah No']).strip() if pd.notna(row['Tezgah No']) else None,
                    'TezgahAdi': str(row['Tezgah Adı']).strip() if pd.notna(row['Tezgah Adı']) else None,
                    'Tip': str(row['Tip']).strip() if pd.notna(row['Tip']) else None,
                    'ModelYili': int(row['Model Yılı']) if pd.notna(row['Model Yılı']) else None,
                    'Marka': str(row['Marka']).strip() if pd.notna(row['Marka']) else None,
                    'Olculer': str(row['Ölçüler']).strip() if pd.notna(row['Ölçüler']) else None,
                    'EksenSayisi': int(row['Eksen Sayısı']) if pd.notna(row['Eksen Sayısı']) else None,
                    'MaxDevir': int(row['Max Devir']) if pd.notna(row['Max Devir']) else 0,
                    'SeriNo': str(row['Seri No']).strip() if pd.notna(row['Seri No']) else None,
                    'AselsanBolum': str(row['Aselsan Bölüm']).strip() if pd.notna(row['Aselsan Bölüm']) else None,
                    'Proje': str(row['Proje']).strip() if pd.notna(row['Proje']) else None,
                    'AselsanaCalisanTezgah': str(row['ASELSAN\'a Çalışan Tezgah']).strip() if pd.notna(row['ASELSAN\'a Çalışan Tezgah']) else None
                }
                
                records.append(record)
                print(f"Row {idx}: {record['Firma']} - {record['TezgahNo']} - {record['TezgahAdi']}")
                
            except Exception as e:
                print(f"Error parsing row {idx}: {str(e)}")
                continue
        
        print(f"\nTotal records parsed: {len(records)}\n")
        
        if len(records) == 0:
            raise HTTPException(status_code=400, detail="No valid records found in Excel file")
        
        # Connect to database and update table
        conn = get_aflow_connection()
        cursor = conn.cursor()
        
        try:
            # Insert new records (without deleting existing ones)
            insert_query = """
                INSERT INTO dbo.Mes_Machines_Manual_Data_out 
                (Firma, TezgahNo, TezgahAdi, Tip, ModelYili, Marka, Olculer, 
                 EksenSayisi, MaxDevir, SeriNo, AselsanBolum, Proje, AselsanaCalisanTezgah)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            for record in records:
                cursor.execute(
                    insert_query,
                    record['Firma'],
                    record['TezgahNo'],
                    record['TezgahAdi'],
                    record['Tip'],
                    record['ModelYili'],
                    record['Marka'],
                    record['Olculer'],
                    record['EksenSayisi'],
                    record['MaxDevir'],
                    record['SeriNo'],
                    record['AselsanBolum'],
                    record['Proje'],
                    record['AselsanaCalisanTezgah']
                )
            
            conn.commit()
            print(f"Successfully inserted {len(records)} records")
            
            return {
                "success": True,
                "message": f"Successfully imported {len(records)} machine records",
                "records_count": len(records)
            }
            
        except Exception as e:
            conn.rollback()
            print(f"Database error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        finally:
            cursor.close()
            conn.close()
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error processing file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
