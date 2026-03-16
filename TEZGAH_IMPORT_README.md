# Tezgah (Machine) Import Feature - Implementation Summary

## Overview
Added import functionality for the "Talaşlı İmalat Tezgah Bilgileri" tab to upload machine data from Excel files.

## Database Table
Uses existing table: `dbo.Mes_Machines_Manual_Data_out`

### Table Structure:
```sql
create table dbo.Mes_Machines_Manual_Data_out
(
    MachineID_Manual_Data int identity primary key,
    Firma                 varchar(255),
    TezgahNo              varchar(255),
    MakineAdi             varchar(255),
    Tip                   varchar(255),
    ModelYili             int,
    Marka                 varchar(255),
    SeriNo                varchar(255),
    AselsanBolum          varchar(255),
    Proje                 varchar(255),
    Olculer               varchar(255),
    EksenSayisi           int,
    MaxDevir              int not null,
    MesEntegrasyon        varchar(255)
)
```

## Excel Template Structure
File: `dtfrontend/public/import_templates/tezgah-template.xlsx`

**Column Order (Row 1 - Header):**
1. Firma
2. Tezgah No
3. Mes Entegrasyonu Var Mı ?
4. Makine Adı
5. Tip
6. Model Yılı
7. Marka
8. Seri No
9. Aselsan Bölüm
10. Proje
11. Ölçüler
12. Eksen Sayısı
13. Max Devir

**Data starts from Row 2** - Simple table format with headers in row 1.

## Changes Made

### Backend (`dtbackend/app/api/v1/endpoints/personel.py`)

#### New Endpoint: `POST /personel/upload-tezgah-excel`
- Accepts Excel file upload
- Reads Excel file with pandas (first row as header)
- Maps Excel columns to database fields
- **Deletes all existing records** from `Mes_Machines_Manual_Data_out` table
- Inserts new records
- Returns success message with record count

**Column Mapping:**
```python
'Firma' → Firma
'Tezgah No' → TezgahNo
'Mes Entegrasyonu Var Mı ?' → MesEntegrasyon
'Makine Adı' → MakineAdi
'Tip' → Tip
'Model Yılı' → ModelYili
'Marka' → Marka
'Seri No' → SeriNo
'Aselsan Bölüm' → AselsanBolum
'Proje' → Proje
'Ölçüler' → Olculer
'Eksen Sayısı' → EksenSayisi
'Max Devir' → MaxDevir
```

### Frontend (`dtfrontend/src/app/[platform]/personel/page.tsx`)

#### New Function: `handleUploadTezgah()`
- Handles file upload for tezgah data
- Calls `/personel/upload-tezgah-excel` endpoint
- Shows success/error messages
- Resets file input after upload

#### New Component: `renderTezgahUploadSection()`
- Renders upload UI for tezgah tab
- Template download button (downloads `tezgah-template.xlsx`)
- File selection and upload buttons
- Success/error message display
- Important notes section

#### Updated Tab Rendering
- Third tab now shows functional upload section instead of placeholder
- Same UI pattern as other tabs for consistency

## Usage

1. Navigate to Personnel page
2. Click on "Talaşlı İmalat Tezgah Bilgileri" tab
3. Download the template if needed
4. Fill in the Excel template with machine data
5. Upload the file
6. System will:
   - Delete all existing machine records
   - Import new records from Excel
   - Show success message with count

## Important Notes

- **Full Replace:** Unlike personnel imports (which delete only matching `firma_tipi`), tezgah import deletes ALL existing machine records before importing
- **Required Field:** `MaxDevir` is required (defaults to 0 if empty)
- **Integer Fields:** `ModelYili`, `EksenSayisi`, `MaxDevir` must be valid integers
- **Simple Format:** Plain Excel table with headers in row 1, data starting row 2
- No merged cells or complex formatting needed

## Files Modified

1. `dtbackend/app/api/v1/endpoints/personel.py` - Added new endpoint
2. `dtfrontend/src/app/[platform]/personel/page.tsx` - Added upload UI for tezgah tab
3. `dtfrontend/public/import_templates/tezgah-template.xlsx` - Template file (already created by user)

## Testing Checklist

- [ ] Download template from UI
- [ ] Fill template with test data
- [ ] Upload template
- [ ] Verify success message shows
- [ ] Check database for imported records
- [ ] Test with empty rows (should skip)
- [ ] Test error handling (invalid file, missing columns, etc.)
