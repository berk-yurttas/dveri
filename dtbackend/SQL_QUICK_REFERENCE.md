# SQL Quick Reference - Aselsan Kaynaklı Durma

## Installation Commands

```bash
# 1. Create Talaşlı İmalat error tracking table
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_mekanik_sistemdeki_guncel_hata_sayisi.sql

# 2. Create Kablaj stop tracking table and view
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_kablaj_guncel_durus_view.sql

# 3. Create history storage table
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_aselsan_kaynakli_durma_history.sql
```

## Quick Queries

### Current Errors by Company

#### Talaşlı İmalat
```sql
SELECT NAME, "Sistemdeki Güncel Hata Sayısı" 
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi
ORDER BY "Sistemdeki Güncel Hata Sayısı" DESC;
```

#### Kablaj
```sql
SELECT DISTINCT "Firma", 
       COUNT("WORKORDERNO") OVER (PARTITION BY "Firma") AS "Sistemdeki Güncel Hata Sayısı" 
FROM (
    SELECT DISTINCT "WORKORDERNO", "Firma" 
    FROM mes_production.kablaj_guncel_durus_view
) subquery
ORDER BY "Sistemdeki Güncel Hata Sayısı" DESC;
```

### Historical Data

#### Last 10 Weeks for All Companies
```sql
SELECT platform, firma, week, hata_sayisi, recorded_at
FROM mes_production.aselsan_kaynakli_durma_history
ORDER BY week DESC, platform, firma
LIMIT 20;
```

#### Trend for Specific Company
```sql
SELECT week, hata_sayisi
FROM mes_production.aselsan_kaynakli_durma_history
WHERE platform = 'talasli_imalat' AND firma = 'Mikronmak Oto'
ORDER BY week DESC;
```

#### Average Errors by Platform
```sql
SELECT 
    platform,
    AVG(hata_sayisi)::numeric(10,2) as avg_errors,
    MAX(hata_sayisi) as max_errors,
    MIN(hata_sayisi) as min_errors
FROM mes_production.aselsan_kaynakli_durma_history
WHERE week >= '2026-W01'
GROUP BY platform;
```

## Data Operations

### Update Current Error Count (Talaşlı İmalat)
```sql
UPDATE mes_production.mekanik_sistemdeki_guncel_hata_sayisi
SET "Sistemdeki Güncel Hata Sayısı" = 10, updated_at = NOW()
WHERE "NAME" = 'Mikronmak Oto';
```

### Add New Kablaj Stop
```sql
INSERT INTO mes_production.kablaj_durus_kayitlari 
    ("WORKORDERNO", "Firma", "PRODUCTCODE", "DURUS_TIPI", "SORUMLU", "DURUM")
VALUES 
    ('WO-KBL-2024-999', 'KabloTek A.Ş.', 'KB-999', 'MALZEME_EKSIK', 'ASELSAN', 'ACIK');
```

### Close a Kablaj Stop
```sql
UPDATE mes_production.kablaj_durus_kayitlari
SET "DURUM" = 'KAPALI', 
    "DURUS_BITIS" = NOW(),
    "SURE_DAKIKA" = EXTRACT(EPOCH FROM (NOW() - "DURUS_BASLANGIC")) / 60,
    updated_at = NOW()
WHERE "WORKORDERNO" = 'WO-KBL-2024-001';
```

## Verification Queries

### Check All Tables Exist
```sql
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'mes_production'
    AND table_name IN (
        'mekanik_sistemdeki_guncel_hata_sayisi',
        'kablaj_durus_kayitlari',
        'kablaj_guncel_durus_view',
        'aselsan_kaynakli_durma_history'
    )
ORDER BY table_name;
```

### Check Data Freshness
```sql
SELECT 
    MAX(recorded_at) as last_snapshot,
    NOW() - MAX(recorded_at) as age,
    COUNT(DISTINCT firma) as companies,
    COUNT(*) as total_records
FROM mes_production.aselsan_kaynakli_durma_history
WHERE week = (SELECT MAX(week) FROM mes_production.aselsan_kaynakli_durma_history);
```

### Statistics
```sql
-- Talaşlı İmalat Stats
SELECT 
    COUNT(*) as companies,
    SUM("Sistemdeki Güncel Hata Sayısı") as total_errors,
    AVG("Sistemdeki Güncel Hata Sayısı")::numeric(10,2) as avg_errors
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi;

-- Kablaj Stats
SELECT 
    COUNT(DISTINCT "Firma") as companies,
    COUNT(DISTINCT "WORKORDERNO") as total_work_orders,
    COUNT(*) as total_stop_records
FROM mes_production.kablaj_guncel_durus_view;
```

## Table Schemas

### mekanik_sistemdeki_guncel_hata_sayisi
```
NAME (TEXT) - Company name
"Sistemdeki Güncel Hata Sayısı" (INTEGER) - Current error count
updated_at (TIMESTAMPTZ) - Last update time
```

### kablaj_durus_kayitlari
```
WORKORDERNO (TEXT) - Work order number
Firma (TEXT) - Company name
DURUS_TIPI (TEXT) - Stop type
SORUMLU (TEXT) - Responsible party (ASELSAN/TEDARIKCI)
DURUM (TEXT) - Status (ACIK/KAPALI)
```

### aselsan_kaynakli_durma_history
```
platform (TEXT) - talasli_imalat or kablaj
firma (TEXT) - Company name
week (TEXT) - ISO week (YYYY-WNN)
hata_sayisi (INTEGER) - Error count
recorded_at (TIMESTAMPTZ) - Snapshot timestamp
```
