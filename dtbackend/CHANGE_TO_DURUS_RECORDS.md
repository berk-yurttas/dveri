# Change from Error Counts to Stop Records (Duruşlar)

## Overview
Changed from storing aggregated error **counts** to storing actual stop/downtime **records** with reason and start time.

## Changes Made

### 1. Source Tables/Views - NEW

#### Talaşlı İmalat (`create_mekanik_duruslar_v3.sql`)
**Base Table**: `mes_production.mekanik_duruslar_kayitlari`
```sql
CREATE TABLE mekanik_duruslar_kayitlari (
    id SERIAL PRIMARY KEY,
    "NAME" TEXT NOT NULL,
    "Reason" TEXT,
    "StartTime" TIMESTAMP WITH TIME ZONE
);
```

**View**: `mes_production.mekanik_duruslar_v3`
```sql
SELECT "NAME", "Reason", "StartTime"
FROM mes_production.mekanik_duruslar_kayitlari;
```

**Sample Data**: 15+ stop records across 7 companies

#### Kablaj (`create_kablo_duruslar_v3.sql`)
**Base Table**: `mes_production.kablo_duruslar_kayitlari`
```sql
CREATE TABLE kablo_duruslar_kayitlari (
    id SERIAL PRIMARY KEY,
    "Firma" TEXT NOT NULL,
    "STOP_START_DATE" TIMESTAMP WITH TIME ZONE,
    "FAULT_DESCRIPTION" TEXT
);
```

**View**: `mes_production.kablo_duruslar_v3`
```sql
SELECT "Firma", "STOP_START_DATE", "FAULT_DESCRIPTION"
FROM mes_production.kablo_duruslar_kayitlari;
```

**Sample Data**: 24+ stop records across 6 companies

### 2. History Table - REPLACED

#### OLD: `aselsan_kaynakli_durma_history`
```sql
-- Stored only counts
CREATE TABLE aselsan_kaynakli_durma_history (
    platform TEXT,
    firma TEXT,
    week TEXT,
    hata_sayisi INTEGER,  -- Just a count
    ...
);
```

**Problems**:
- Lost detail about what the stops were
- No way to analyze stop reasons over time
- No timestamps for individual stops

#### NEW: `durus_history` (`create_durus_history.sql`)
```sql
-- Stores individual stop records
CREATE TABLE durus_history (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    firma TEXT NOT NULL,
    week TEXT NOT NULL,
    durus_reason TEXT NOT NULL,  -- What caused the stop
    durus_start_time TIMESTAMP WITH TIME ZONE NOT NULL,  -- When it started
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_platform_firma_week_stop 
        UNIQUE (platform, firma, week, durus_start_time)
);
```

**Benefits**:
- ✅ Stores full stop details (reason + timestamp)
- ✅ Can analyze which reasons are most common
- ✅ Can track when stops occur
- ✅ Multiple stops per company per week
- ✅ Can calculate stop counts when needed

## Data Structure Comparison

### OLD Approach (Counts)
```
Platform       | Firma          | Week     | Hata Sayısı
---------------|----------------|----------|------------
talasli_imalat | Mikronmak Oto | 2026-W11 | 8
kablaj         | KabloTek A.Ş. | 2026-W11 | 6
```
❌ **Lost**: What were the 8 stops? When did they happen?

### NEW Approach (Records)
```
Platform       | Firma          | Week     | Reason                    | Start Time
---------------|----------------|----------|---------------------------|------------------
talasli_imalat | Mikronmak Oto | 2026-W11 | Malzeme Eksikliği        | 2026-03-16 10:30
talasli_imalat | Mikronmak Oto | 2026-W11 | Kalite Kontrol Bekleniyor| 2026-03-16 14:00
talasli_imalat | Mikronmak Oto | 2026-W11 | Takım Değişimi           | 2026-03-16 15:30
...
kablaj         | KabloTek A.Ş. | 2026-W11 | Terminal Eksikliği       | 2026-03-16 09:00
kablaj         | KabloTek A.Ş. | 2026-W11 | Pres Makinası Arızası    | 2026-03-16 11:30
...
```
✅ **Preserved**: Full details of each stop

## Query Patterns

### Get Stop Count (Same as Before)
```sql
SELECT 
    platform,
    firma,
    week,
    COUNT(*) as stop_count
FROM mes_production.durus_history
WHERE week = '2026-W11'
GROUP BY platform, firma, week;
```

### NEW: Analyze Stop Reasons
```sql
SELECT 
    durus_reason,
    COUNT(*) as occurrence_count,
    COUNT(DISTINCT firma) as affected_companies
FROM mes_production.durus_history
WHERE platform = 'talasli_imalat'
    AND week >= '2026-W09'
GROUP BY durus_reason
ORDER BY occurrence_count DESC;
```

### NEW: See All Stops for a Company
```sql
SELECT 
    week,
    durus_reason,
    durus_start_time
FROM mes_production.durus_history
WHERE platform = 'talasli_imalat'
    AND firma = 'Mikronmak Oto'
ORDER BY week DESC, durus_start_time DESC;
```

### NEW: Track Stop Timing Patterns
```sql
SELECT 
    EXTRACT(HOUR FROM durus_start_time) as hour_of_day,
    COUNT(*) as stop_count
FROM mes_production.durus_history
WHERE platform = 'kablaj'
    AND week = '2026-W11'
GROUP BY hour_of_day
ORDER BY hour_of_day;
```

## Source Query Changes

### OLD Queries (Counts)
```sql
-- Talaşlı İmalat
SELECT NAME, "Sistemdeki Güncel Hata Sayısı" 
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi

-- Kablaj
SELECT DISTINCT "Firma", COUNT("WORKORDERNO") OVER (PARTITION BY "Firma")
FROM (SELECT DISTINCT "WORKORDERNO", "Firma" FROM mes_production.kablaj_guncel_durus_view)
```

### NEW Queries (Records)
```sql
-- Talaşlı İmalat
SELECT "NAME", "Reason", "StartTime"
FROM mes_production.mekanik_duruslar_v3

-- Kablaj
SELECT "Firma", "STOP_START_DATE", "FAULT_DESCRIPTION"
FROM mes_production.kablo_duruslar_v3
```

## Migration Steps

### Step 1: Create New Source Tables
```bash
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_mekanik_duruslar_v3.sql
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_kablo_duruslar_v3.sql
```

### Step 2: Create New History Table
```bash
psql -h <host> -U <user> -d <database> -f dtbackend/sql/create_durus_history.sql
```

### Step 3: Verify Tables
```sql
-- Check source tables
SELECT COUNT(*) FROM mes_production.mekanik_duruslar_v3;
SELECT COUNT(*) FROM mes_production.kablo_duruslar_v3;

-- Check history table
SELECT platform, COUNT(*) FROM mes_production.durus_history GROUP BY platform;
```

### Step 4: Optional - Archive Old Table
```sql
-- Rename old table for backup
ALTER TABLE mes_production.aselsan_kaynakli_durma_history 
RENAME TO aselsan_kaynakli_durma_history_backup;

-- Or drop if not needed
-- DROP TABLE mes_production.aselsan_kaynakli_durma_history CASCADE;
```

## Next Steps - Code Changes Required

The backend scheduler code needs to be updated to:

1. **Change source queries** from count queries to record queries
2. **Change data structure** from storing counts to storing records
3. **Update write logic** to insert multiple records per company per week
4. **Update latest_week check** to query `durus_history` instead of old table

These code changes will be implemented in the next step.

## Benefits of New Approach

### Analysis Capabilities
- ✅ **Reason Analysis**: Which stop reasons are most common?
- ✅ **Timing Analysis**: When do stops typically occur?
- ✅ **Trend Analysis**: Are specific reasons increasing/decreasing?
- ✅ **Pattern Recognition**: Do certain companies have similar issues?

### Reporting
- ✅ **Detailed Reports**: Show actual stop records, not just counts
- ✅ **Root Cause**: Identify recurring problem areas
- ✅ **Actionable Data**: Know what to fix, not just that there's a problem

### Data Quality
- ✅ **Complete History**: Never lose stop details
- ✅ **Audit Trail**: Know exactly when each stop was recorded
- ✅ **Flexible Queries**: Calculate anything from raw records

## File Structure

```
dtbackend/sql/
├── create_mekanik_duruslar_v3.sql          ← NEW (Talaşlı source)
├── create_kablo_duruslar_v3.sql            ← NEW (Kablaj source)
├── create_durus_history.sql                 ← NEW (History table)
│
├── create_mekanik_sistemdeki_guncel_hata_sayisi.sql  ← OLD (can archive)
├── create_kablaj_guncel_durus_view.sql              ← OLD (can archive)
└── create_aselsan_kaynakli_durma_history.sql        ← OLD (can archive)
```

## Summary

**OLD System**: Stored counts → Limited analysis
**NEW System**: Stores records → Rich analysis + flexibility

The new approach provides significantly more value while maintaining backward compatibility (you can still count stops when needed).
