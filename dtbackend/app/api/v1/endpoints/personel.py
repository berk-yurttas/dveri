from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
import pandas as pd
import io
from app.core.database import get_aflow_connection
import pyodbc

router = APIRouter()

@router.post("/upload-excel")
async def upload_personel_excel(
    file: UploadFile = File(...)
):
    """Upload Excel file and update personel_count table"""
    
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
        
        # Parse data
        records = []
        
        i = 0
        while i < len(df):
            row = df.iloc[i]
            
            # Look for "Personel Sayısı" row
            if pd.notna(row[0]) and "Personel" in str(row[0]):
                print(f"\nFound 'Personel Sayısı' at row {i}")
                count_row = row
                
                # The row 2 positions before has company name and upper departments
                if i >= 2:
                    upper_row = df.iloc[i - 2]
                    dept_row = df.iloc[i - 1]
                    
                    print(f"Upper row (index {i-2}): {[upper_row[j] if pd.notna(upper_row[j]) else 'NaN' for j in range(min(10, len(upper_row)))]}")
                    print(f"Dept row (index {i-1}): {[dept_row[j] if pd.notna(dept_row[j]) else 'NaN' for j in range(min(10, len(dept_row)))]}")
                    print(f"Count row (index {i}): {[count_row[j] if pd.notna(count_row[j]) else 'NaN' for j in range(min(10, len(count_row)))]}")
                    
                    # Get company name from column A of upper row
                    current_firma = str(upper_row[0]).strip() if pd.notna(upper_row[0]) else "Unknown"
                    print(f"Company: {current_firma}")
                    
                    # Column B (index 1): Geçici Kabul
                    if pd.notna(count_row[1]) and count_row[1] != 0:
                        ust_birim = str(upper_row[1]).strip() if pd.notna(upper_row[1]) else 'Geçici Kabul'
                        records.append({
                            'firma_adi': current_firma,
                            'ust_birim': ust_birim,
                            'birim': None,
                            'personel_sayisi': int(count_row[1])
                        })
                        print(f"  Added: {current_firma} - {ust_birim} - None - {int(count_row[1])}")
                    
                    # Columns C, D, E (indices 2, 3, 4): Üretim with sub-departments
                    ust_birim_uretim = str(upper_row[2]).strip() if pd.notna(upper_row[2]) else 'Üretim'
                    
                    for col_idx in [2, 3, 4]:
                        if pd.notna(count_row[col_idx]) and count_row[col_idx] != 0:
                            birim_name = str(dept_row[col_idx]).strip() if pd.notna(dept_row[col_idx]) else None
                            records.append({
                                'firma_adi': current_firma,
                                'ust_birim': ust_birim_uretim,
                                'birim': birim_name,
                                'personel_sayisi': int(count_row[col_idx])
                            })
                            print(f"  Added: {current_firma} - {ust_birim_uretim} - {birim_name} - {int(count_row[col_idx])}")
                    
                    # Columns F, G, H, I (indices 5, 6, 7, 8): Test, Kalite, Planlama, İdari
                    for col_idx in [5, 6, 7, 8]:
                        if pd.notna(count_row[col_idx]) and count_row[col_idx] != 0:
                            ust_birim = str(upper_row[col_idx]).strip() if pd.notna(upper_row[col_idx]) else f'Birim {col_idx}'
                            records.append({
                                'firma_adi': current_firma,
                                'ust_birim': ust_birim,
                                'birim': None,
                                'personel_sayisi': int(count_row[col_idx])
                            })
                            print(f"  Added: {current_firma} - {ust_birim} - None - {int(count_row[col_idx])}")
            
            i += 1
        
        print(f"\nTotal records parsed: {len(records)}\n")

        
        # Connect to database and update table
        conn = get_aflow_connection()
        cursor = conn.cursor()
        
        try:
            # Truncate table
            cursor.execute("DELETE FROM personel.personel_count")
            
            # Insert new records
            insert_query = """
                INSERT INTO personel.personel_count (firma_adi, ust_birim, birim, personel_sayisi)
                VALUES (?, ?, ?, ?)
            """
            
            for record in records:
                cursor.execute(
                    insert_query,
                    record['firma_adi'],
                    record['ust_birim'],
                    record['birim'],
                    record['personel_sayisi']
                )
            
            conn.commit()
            
            return {
                "success": True,
                "message": f"Successfully imported {len(records)} records",
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
                created_at
            FROM personel.personel_count
            ORDER BY firma_adi, ust_birim, birim
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
