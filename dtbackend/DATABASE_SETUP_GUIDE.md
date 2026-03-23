# Database Setup Guide for Aselsan Kaynaklı Durma Tracking

## Overview
This guide walks through setting up all required tables and views for tracking Aselsan-caused stops/errors in the CSuite history system.

## Database Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MES_PRODUCTION SCHEMA                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Source Tables/Views (Data Collection)                           │
│  ├── mekanik_sistemdeki_guncel_hata_sayisi                      │
│  │   └── Stores: Talaşlı İmalat current errors per company      │
│  │                                                               │
│  └── kablaj_guncel_durus_view                                   │
│      ├── Base: kablaj_durus_kayitlari (table)                   │
│      └── View: Filters only ACIK (open) stops                   │
│                                                                   │
│  History Tables (Weekly Snapshots)                               │
│  ├── firma_makina_planlanan_doluluk_history                     │
│  │   └── Stores: Weekly doluluk oranı per company               │
│  │                                                               │
│  └── aselsan_kaynakli_durma_history ← NEW                       │
│      └── Stores: Weekly error counts per platform/company       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### Step 1: Create Source Tables/Views

#### 1.1 Talaşlı İmalat Error Tracking
```bash
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_mekanik_sistemdeki_guncel_hata_sayisi.sql
```

**What it creates:**
- Table: `mes_production.mekanik_sistemdeki_guncel_hata_sayisi`
- Columns: NAME, "Sistemdeki Güncel Hata Sayısı"
- Sample data: 10 companies with varying error counts

**Query used by scheduler:**
```sql
SELECT NAME, "Sistemdeki Güncel Hata Sayısı" 
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi
```

#### 1.2 Kablaj Stop Tracking
```bash
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_kablaj_guncel_durus_view.sql
```

**What it creates:**
- Table: `mes_production.kablaj_durus_kayitlari` (base table)
- View: `mes_production.kablaj_guncel_durus_view` (filters ACIK stops)
- Sample data: 20+ work orders across 5 companies

**Query used by scheduler:**
```sql
SELECT DISTINCT "Firma", 
       COUNT("WORKORDERNO") OVER (PARTITION BY "Firma") AS "Sistemdeki Güncel Hata Sayısı" 
FROM (
    SELECT DISTINCT "WORKORDERNO", "Firma" 
    FROM mes_production.kablaj_guncel_durus_view
) subquery
```

### Step 2: Create History Tables

#### 2.1 Doluluk Oranı History (Already Exists)
```bash
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_firma_makina_doluluk_history.sql
```

#### 2.2 Aselsan Kaynaklı Durma History (NEW)
```bash
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_aselsan_kaynakli_durma_history.sql
```

**What it creates:**
- Table: `mes_production.aselsan_kaynakli_durma_history`
- Stores: platform, firma, week, hata_sayisi
- Sample data: Historical data for both platforms

### Step 3: Verify Installation

Run these verification queries:

```sql
-- Check Talaşlı İmalat current errors
SELECT 
    "NAME",
    "Sistemdeki Güncel Hata Sayısı"
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi
ORDER BY "Sistemdeki Güncel Hata Sayısı" DESC
LIMIT 10;

-- Check Kablaj current stops
SELECT DISTINCT 
    "Firma", 
    COUNT("WORKORDERNO") OVER (PARTITION BY "Firma") AS "Sistemdeki Güncel Hata Sayısı" 
FROM (
    SELECT DISTINCT "WORKORDERNO", "Firma" 
    FROM mes_production.kablaj_guncel_durus_view
) subquery
ORDER BY "Sistemdeki Güncel Hata Sayısı" DESC;

-- Check history table structure
SELECT 
    platform,
    firma,
    week,
    hata_sayisi,
    recorded_at
FROM mes_production.aselsan_kaynakli_durma_history
ORDER BY week DESC, platform, firma
LIMIT 20;

-- Verify all tables exist
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'mes_production'
    AND table_name IN (
        'mekanik_sistemdeki_guncel_hata_sayisi',
        'kablaj_durus_kayitlari',
        'kablaj_guncel_durus_view',
        'firma_makina_planlanan_doluluk_history',
        'aselsan_kaynakli_durma_history'
    )
ORDER BY table_name;
```

## Data Flow

### Real-Time Data (Current State)
1. **Talaşlı İmalat**: 
   - System continuously updates `mekanik_sistemdeki_guncel_hata_sayisi`
   - Shows current error count per company

2. **Kablaj**:
   - Work order stops recorded in `kablaj_durus_kayitlari`
   - `kablaj_guncel_durus_view` filters only open stops (DURUM = 'ACIK')

### Historical Data (Weekly Snapshots)
1. **Scheduler runs** (every N seconds, default 60s)
2. **Fetches current data** from source tables/views
3. **Writes weekly snapshot** (once per week per company):
   - `firma_makina_planlanan_doluluk_history` ← doluluk oranı
   - `aselsan_kaynakli_durma_history` ← hata sayısı

### Scheduler Behavior
- ✅ One snapshot per ISO week (e.g., 2026-W11)
- ✅ Automatic deduplication via UNIQUE constraints
- ✅ Updates existing record if week already exists
- ✅ Separate tracking for Talaşlı İmalat and Kablaj

## Expected Data Volume

### Current State Tables
- **mekanik_sistemdeki_guncel_hata_sayisi**: ~10-50 rows (one per company)
- **kablaj_durus_kayitlari**: Grows continuously (one row per stop)
- **kablaj_guncel_durus_view**: Filtered subset (only open stops)

### History Tables
- **firma_makina_planlanan_doluluk_history**: ~52 rows per company per year
- **aselsan_kaynakli_durma_history**: ~52 rows per platform per company per year

**Example**: 20 companies × 52 weeks × 2 platforms = ~2,080 rows per year

## Maintenance Operations

### Close a Kablaj Stop
```sql
UPDATE mes_production.kablaj_durus_kayitlari
SET 
    "DURUM" = 'KAPALI', 
    "DURUS_BITIS" = NOW(),
    "SURE_DAKIKA" = EXTRACT(EPOCH FROM (NOW() - "DURUS_BASLANGIC")) / 60,
    updated_at = NOW()
WHERE "WORKORDERNO" = 'WO-KBL-2024-001';
```

### Update Talaşlı İmalat Error Count
```sql
UPDATE mes_production.mekanik_sistemdeki_guncel_hata_sayisi
SET 
    "Sistemdeki Güncel Hata Sayısı" = 5,
    updated_at = NOW()
WHERE "NAME" = 'Mikronmak Oto';
```

### Add New Kablaj Stop
```sql
INSERT INTO mes_production.kablaj_durus_kayitlari 
    ("WORKORDERNO", "Firma", "PRODUCTCODE", "DURUS_TIPI", "SORUMLU", "DURUM")
VALUES 
    ('WO-KBL-2024-999', 'New Company Ltd.', 'KB-999', 'MALZEME_EKSIK', 'ASELSAN', 'ACIK');
```

### Query Historical Trends
```sql
-- Trend for a specific company
SELECT 
    week,
    hata_sayisi,
    recorded_at
FROM mes_production.aselsan_kaynakli_durma_history
WHERE platform = 'talasli_imalat' 
    AND firma = 'Mikronmak Oto'
ORDER BY week DESC
LIMIT 10;

-- Compare platforms
SELECT 
    platform,
    AVG(hata_sayisi)::numeric(10,2) as avg_errors,
    MAX(hata_sayisi) as max_errors,
    COUNT(DISTINCT firma) as company_count
FROM mes_production.aselsan_kaynakli_durma_history
WHERE week >= '2026-W01'
GROUP BY platform;
```

## Monitoring

### Check Scheduler Status
```bash
# In your application logs, look for:
grep "CSuite weekly snapshot tick complete" /path/to/logs/app.log

# Expected output:
# CSuite weekly snapshot tick complete: firmas=15 written_db=12 written_json=3 week=2026-W11
```

### Verify Data Freshness
```sql
-- Check most recent snapshots
SELECT 
    platform,
    firma,
    week,
    hata_sayisi,
    recorded_at,
    NOW() - recorded_at as age
FROM mes_production.aselsan_kaynakli_durma_history
WHERE week = (
    SELECT MAX(week) 
    FROM mes_production.aselsan_kaynakli_durma_history
)
ORDER BY platform, firma;
```

## Troubleshooting

### No Data Being Written
1. Check scheduler is enabled: `CSUITE_HISTORY_SCHEDULER_ENABLED=true`
2. Verify IVME database connection in logs
3. Check source tables have data
4. Review error logs for SQL exceptions

### Duplicate Week Entries
- Should not happen due to UNIQUE constraints
- If occurring, check scheduler is not running multiple instances

### Missing Companies
- Verify company exists in source tables
- Check company name spelling (case-sensitive)
- Review scheduler logs for fetch errors

## Performance Tuning

### Indexes (Already Created)
All tables include proper indexes for:
- ✅ Company name lookups
- ✅ Week-based queries
- ✅ Date-based sorting
- ✅ UNIQUE constraint enforcement

### Vacuum Maintenance
```sql
-- Run periodically to maintain performance
VACUUM ANALYZE mes_production.kablaj_durus_kayitlari;
VACUUM ANALYZE mes_production.aselsan_kaynakli_durma_history;
VACUUM ANALYZE mes_production.mekanik_sistemdeki_guncel_hata_sayisi;
```

## Next Steps

1. ✅ Run all SQL scripts in order
2. ✅ Verify tables exist and contain sample data
3. ✅ Restart backend application
4. ✅ Monitor scheduler logs for successful writes
5. ⏳ Wait for first week boundary to see automatic snapshots
6. ⏳ Create frontend visualizations for historical data

## Files Reference

- `create_mekanik_sistemdeki_guncel_hata_sayisi.sql` - Talaşlı İmalat errors
- `create_kablaj_guncel_durus_view.sql` - Kablaj stops
- `create_aselsan_kaynakli_durma_history.sql` - History storage
- `create_firma_makina_doluluk_history.sql` - Doluluk history (existing)
