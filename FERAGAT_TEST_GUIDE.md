# Feragat Formu Test Data Guide

## Setup Instructions

### 1. Connect to the database
```bash
psql -h 10.60.139.11 -p 5437 -U postgres -d aflow_db
# Password: postgres
```

### 2. Run the SQL file
```bash
psql -h 10.60.139.11 -p 5437 -U postgres -d aflow_db -f test_feragat_data.sql
```

Or copy and paste the SQL commands from `test_feragat_data.sql` directly into psql.

## Test Data Overview

The SQL file creates:

### Tables
- `step_definitions` - Contains step definition metadata (name, assignee)
- `job_step_definitions` - Links job instances to step definitions with completion status

### Dummy Data

#### Section E (HAZIRLAYAN) - 3 rows
- Feragat Talebi Onayı
- Feragat Sorumlusu Onayı
- Sorumlu Bölge Müdürü Onayı

#### Section F (KONTROL) - 10 rows for Radar OR 12 rows for Elektronik Harp
**Radar:**
- Radar Program Dir. Onayı
- Radar Sistem Müh. Dir. Onayı
- Radom Düşük Gör. ve İleri Malz. Tsr. Dir. Onayı
- Yazılım Mühendisliği Dir. Onayı
- Platform Ent. Müh. ve Çevre Brm. Tsr. Dir Onayı
- Süreç Tasarım ve Ürün Yön. Dir. Onayı
- Test ve Doğrulama Dir. Onayı
- Üretim Dir. Onayı
- Entegre Lojistik Destek Dir. Onayı
- Kalite Yönetim Dir. Onayı

**Elektronik Harp:** (additional to Radar list)
- Elektronik Harp Prog. Dir Onayı
- Hab. EH ve Kendini Kor. Sis. Müh. Dir. Onayı
- Radar Elektronik Harp Sis. Müh. Dir. Onayı
- Donanım Tasarım Dir. Onayı

#### Section G (ONAY) - 1 row
- REHİS Sektör Başkanı Onayı

### Test Job Instances
- `test` - For testing with Radar type (make sure job_instance_attributes has Feragat Türü = "Radar")
- `test_eh` - For testing with Elektronik Harp type (make sure job_instance_attributes has Feragat Türü = "Elektronik Harp")

## Testing the PDF

### 1. Make sure the job_instance_attributes table has data for your test job
```sql
-- Check if test job has Feragat Türü attribute
SELECT 
    ad."name",
    ia.value
FROM 
    job_instance_attributes ia
LEFT JOIN attribute_definitions ad ON ia.attribute_definition_id = ad.id
WHERE ia.job_instance_id = 'test'
AND ad."name" LIKE '%Feragat Türü%';
```

If it doesn't exist, you need to insert it:
```sql
-- Get attribute_definition_id for "Feragat Türü"
SELECT id FROM attribute_definitions WHERE name LIKE '%Feragat Türü%';

-- Insert with that ID (example: assuming id is 10)
INSERT INTO job_instance_attributes (job_instance_id, attribute_definition_id, value)
VALUES ('test', 10, '"Radar"');
```

### 2. Access the PDF endpoint
```
GET http://localhost:8000/api/v1/feragat-formu/download-pdf?job_instance_id=test
```

### 3. Expected Results

**Sections E, F, G should show:**
- **Görev** column: Department/role names (without " Onayı" suffix)
- **Ad/Soyad** column: User's name and surname from PocketBase (yarenkaymak's full name)
- **Tarih** column: Completion timestamp formatted as DD-MM-YYYY HH:MM
- **İmza** column: Empty (for manual signature)

## Troubleshooting

### If PocketBase user lookup fails:
The system will fallback to showing just the username ("yarenkaymak") without surname.

### If step definitions don't show up:
1. Verify the job_instance_id exists in job_step_definitions
2. Verify status = 'done'
3. Verify sd.name ends with " Onayı"
4. Check the backend logs for "[create_feragat_pdf]" messages

### Query to verify step data:
```sql
SELECT 
    sd.name,
    sd.assignee,
    jsd.completed_at,
    jsd.status
FROM 
    job_step_definitions jsd
LEFT JOIN step_definitions sd ON jsd.step_definition_id = sd.id
WHERE jsd.job_instance_id = 'test'
ORDER BY sd.id;
```

## Notes

- All dummy data uses `yarenkaymak` as the assignee (matching the image provided)
- Timestamps are set to April 8, 2026 (matching the image dates)
- The " Onayı" suffix is automatically removed by the `get_step_definitions_data()` function
- Section F rows are dynamically generated based on "Feragat Türü" attribute value
