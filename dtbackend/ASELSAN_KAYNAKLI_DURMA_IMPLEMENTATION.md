# Aselsan Kaynaklı Durma History Storage Implementation

## Overview
This document describes the implementation of historical storage for "Aselsan Kaynaklı Durma" (Aselsan-caused stops/system errors) data, following the same pattern as the existing "Firma Makina Planlanan Doluluk" history storage.

## Changes Made

### 1. Database Schema (`sql/create_aselsan_kaynakli_durma_history.sql`)
Created a new table to store weekly snapshots of system errors:

```sql
CREATE TABLE mes_production.aselsan_kaynakli_durma_history (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,  -- 'talasli_imalat' or 'kablaj'
    firma TEXT NOT NULL,
    week TEXT NOT NULL,  -- Format: YYYY-WNN
    hata_sayisi INTEGER NOT NULL,  -- Sistemdeki Güncel Hata Sayısı
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_platform_firma_week UNIQUE (platform, firma, week)
);
```

**Key Features:**
- Supports both Talaşlı İmalat and Kablaj platforms
- Stores weekly snapshots (one record per platform/company/week)
- Indexed for optimal query performance
- Includes sample data for testing

### 2. Updated `DatabaseCSuiteHistoryStore` (`app/services/csuite_history_store.py`)

**Constructor Changes:**
- Added `platform` parameter (default: "talasli_imalat")
- Used to differentiate between Talaşlı İmalat and Kablaj data

**`write_weekly_snapshot_async` Method:**
Now writes to **two** tables:
1. `firma_makina_planlanan_doluluk_history` - stores tedarikci_kapasite_analizi (doluluk oranı)
2. `aselsan_kaynakli_durma_history` - stores aselsan_kaynakli_durma (hata sayısı)

### 3. Updated `CSuiteHistoryScheduler` (`app/services/csuite_history_scheduler.py`)

**Data Fetching:**
Added two new queries to fetch system error data:

#### Talaşlı İmalat Query:
```sql
SELECT NAME, "Sistemdeki Güncel Hata Sayısı" 
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi
```

#### Kablaj Query:
```sql
SELECT DISTINCT "Firma", COUNT("WORKORDERNO") OVER (PARTITION BY "Firma") AS "Sistemdeki Güncel Hata Sayısı" 
FROM (
    SELECT DISTINCT "WORKORDERNO", "Firma" 
    FROM mes_production.kablaj_guncel_durus_view
) subquery
```

**Data Storage:**
- Collects data in `per_firma_aselsan` dictionary
- Passes it to the database store's `write_weekly_snapshot_async` method
- Stored with the format: `{"hata_sayisi": <count>}`

## Data Flow

```
1. Scheduler runs periodically (every N seconds)
   ↓
2. Fetches current week's data from IVME database:
   - Tedarikci Kapasite Analizi (doluluk oranı)
   - Aselsan Kaynaklı Durma (hata sayısı) - NEW
   ↓
3. For each firma:
   - Check if current week already recorded
   - If not, write to database:
     * firma_makina_planlanan_doluluk_history (doluluk oranı)
     * aselsan_kaynakli_durma_history (hata sayısı) - NEW
```

## Database Setup

To set up the new table in your IVME database:

```bash
# Connect to your IVME PostgreSQL database
psql -h <host> -p <port> -U <user> -d <database>

# Run the SQL script
\i dtbackend/sql/create_aselsan_kaynakli_durma_history.sql
```

## Testing

The SQL script includes:
- Sample data for testing (recent weeks)
- Verification queries to check data
- Test queries for both platforms

## Future Enhancements

1. **Kablaj Platform Support:**
   - Currently logs Kablaj data but doesn't store it
   - Can be enabled by creating a separate `DatabaseCSuiteHistoryStore` instance with `platform="kablaj"`

2. **Frontend Integration:**
   - Add API endpoints to retrieve historical data
   - Create visualization widgets for trending

3. **Alerting:**
   - Add threshold-based alerts for high error counts
   - Trend analysis to identify degrading systems

## Notes

- The implementation follows the same pattern as `firma_makina_doluluk_history` for consistency
- Weekly snapshots prevent duplicate data
- Both tables use the same week format (YYYY-WNN)
- Error handling ensures partial failures don't stop the entire process
