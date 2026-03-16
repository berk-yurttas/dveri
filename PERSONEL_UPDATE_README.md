# Personel Page Update - Migration Guide

## Overview
Updated the personnel page to support three tabs:
1. **Kablaj Personel Sayıları** - Cable personnel counts
2. **Talaşlı İmalat Personel Sayıları** - Machining personnel counts  
3. **Talaşlı İmalat Tezgah Bilgileri** - Machining equipment info (placeholder)

## Database Migration Required

Before using the updated functionality, you must run the database migration to add the `firma_tipi` column:

### Steps:
1. Connect to your MSSQL database (AflowDB)
2. Run the migration script:
   ```bash
   sqlcmd -S your_server -d AflowDB -i dtbackend/sql/alter_personel_add_firma_tipi.sql
   ```
   
   Or execute the SQL directly in SQL Server Management Studio:
   ```sql
   -- Run the contents of dtbackend/sql/alter_personel_add_firma_tipi.sql
   ```

## Changes Made

### Frontend (`dtfrontend/src/app/[platform]/personel/page.tsx`)
- Added 3-tab interface
- Each tab (Kablaj & Talaşlı İmalat) has:
  - Template download button
  - File upload section
  - Separate upload handling per type
- Removed the data display section (no longer shows imported data)
- Added `firma_tipi` parameter to upload API calls

### Backend (`dtbackend/app/api/v1/endpoints/personel.py`)
- Modified `/upload-excel` endpoint to accept `firma_tipi` form parameter
- Added validation for `firma_tipi` (must be 'kablaj' or 'talasli')
- **Updated parsing logic to use template structure:**
  - Rows 2-4 contain the template headers
  - Row 3 (index 2): Upper department headers
  - Row 4 (index 3): Sub-department headers  
  - Row 7+ (index 6+): Data starts here
  - Each company has: Company name row → "Personel Sayısı" label row → Count numbers row → 2 blank rows
- Updated delete logic to only delete records matching the `firma_tipi`
- Added `firma_tipi` to all record insertions
- Updated `/data` endpoint to include `firma_tipi` in results

### Database (`dtbackend/sql/alter_personel_add_firma_tipi.sql`)
- Adds `firma_tipi NVARCHAR(20)` column to `personel.personel_count` table
- Creates index on `firma_tipi` for better query performance
- Sets default value for existing records (if any)

## Excel Template Structure

The templates follow this structure:

```
Row 1: Instructions
Row 2: "Firma İsmi" header
Row 3: Upper department headers (Geçici Kabul | Üretim | Test | Kalite | Planlama | İdari)
Row 4: "Personel Sayısı" labels with sub-departments for Üretim (RF Üretim | CX Üretim | Birim İçi Üretim)
Row 5-6: Blank
Row 7: Company Name
Row 8: "Personel Sayısı" label
Row 9: Actual count numbers
Row 10-11: Blank (separator between companies)
Row 12+: Next company...
```

## Template Files
- Kablaj template: `dtfrontend/public/import_templates/kablaj-template.xlsx`
- Talaşlı İmalat template: `dtfrontend/public/import_templates/talasli-template.xlsx`

## Usage
1. Navigate to the Personnel page
2. Select the appropriate tab (Kablaj or Talaşlı İmalat)
3. Download the template if needed
4. Upload your Excel file
5. The system will:
   - Delete existing records of that `firma_tipi`
   - Import new records with the `firma_tipi` set automatically

## Important Notes
- When importing Kablaj data, only Kablaj records are deleted/replaced
- When importing Talaşlı İmalat data, only Talaşlı records are deleted/replaced
- This allows maintaining both types of data independently
- The third tab (Tezgah Bilgileri) is a placeholder for future development
