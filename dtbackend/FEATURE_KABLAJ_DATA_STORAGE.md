# Feature Addition: Kablaj Data Storage to History Table

## Summary
Enabled full storage of Kablaj platform error data to the `aselsan_kaynakli_durma_history` table. Previously, Kablaj data was only being logged but not persisted to the database.

## Changes Made

### 1. Class-Level Variables (`csuite_history_scheduler.py` line 25-31)

**Added**:
```python
_kablaj_database_store: DatabaseCSuiteHistoryStore | None = None  # For Kablaj
```

**Why**: Need a separate database store instance for Kablaj platform (with `platform="kablaj"`)

### 2. Kablaj Store Initialization (`csuite_history_scheduler.py` line 101-105)

**Added**:
```python
# Initialize database stores for both platforms
cls._database_store = DatabaseCSuiteHistoryStore(cls._ivme_session_maker, platform="talasli_imalat")
cls._kablaj_database_store = DatabaseCSuiteHistoryStore(cls._ivme_session_maker, platform="kablaj")

logger.info("Initialized database stores for Talaşlı İmalat and Kablaj platforms")
```

**Why**: Creates separate store instances for each platform so they write with correct platform identifier

### 3. Kablaj Data Dictionary (`csuite_history_scheduler.py` line 160-164)

**Added**:
```python
per_firma_kablaj: dict[str, dict[str, int]] = {}  # For Kablaj platform
```

**Why**: Store Kablaj error data separately from Talaşlı İmalat

### 4. Kablaj Data Collection (`csuite_history_scheduler.py` line 231-251)

**Before**:
```python
# Just logged, data stored in local variable that went out of scope
logger.debug(f"Kablaj Aselsan Durma: {firma} - {hata_sayisi} hata")
```

**After**:
```python
# Store in per_firma_kablaj dictionary
for row in kablaj_durma_rows.all():
    firma = str(row[0] or "").strip()
    hata_sayisi = int(row[1] or 0)
    if not firma:
        continue
    per_firma_kablaj[firma] = {"hata_sayisi": hata_sayisi}
    logger.debug(f"Kablaj Aselsan Durma: {firma} - {hata_sayisi} hata")
```

**Why**: Persist Kablaj data so it can be written to database later

### 5. Include Kablaj in Company Loop (`csuite_history_scheduler.py` line 262-263)

**Before**:
```python
all_firmas = sorted(set(per_firma_tedarikci.keys()) | set(per_firma_aselsan.keys()))
```

**After**:
```python
all_firmas = sorted(set(per_firma_tedarikci.keys()) | set(per_firma_aselsan.keys()) | set(per_firma_kablaj.keys()))
```

**Why**: Include Kablaj companies in the processing loop

### 6. Kablaj Write Logic (`csuite_history_scheduler.py` line 291-314)

**Added Complete Write Block**:
```python
# Write Kablaj data to database
if firma in per_firma_kablaj:
    try:
        # Check if we already have this week's data for Kablaj
        latest_kablaj_week = await cls._kablaj_database_store.latest_week_for_company_async(firma)
        logger.debug(f"Checking Kablaj {firma}: latest_week={latest_kablaj_week}, current_week={current_week}")
        
        if latest_kablaj_week != current_week:
            kablaj_data = per_firma_kablaj[firma]
            logger.info(f"Writing Kablaj to DB: firma={firma}, aselsan={kablaj_data}")
            
            # For Kablaj, we don't have tedarikci data, so pass empty dict
            await cls._kablaj_database_store.write_weekly_snapshot_async(
                firma=firma,
                week=current_week,
                tedarikci_kapasite_analizi={},  # No doluluk data for Kablaj
                aselsan_kaynakli_durma=kablaj_data,
            )
            written_kablaj += 1
            logger.info(f"✓ Wrote Kablaj data to database for {firma}")
        else:
            logger.debug(f"Skipping Kablaj {firma} - week {current_week} already recorded")
    except Exception as e:
        logger.error(f"Failed to write Kablaj data to database for {firma}: {e}", exc_info=True)
```

**Why**: Actually persist Kablaj data to database (was missing before)

### 7. Updated Logging (`csuite_history_scheduler.py` line 328-335)

**Before**:
```python
logger.info(
    "CSuite weekly snapshot tick complete: firmas=%s written_db=%s written_json=%s week=%s",
    total_firmas, written_db, written_json, current_week,
)
```

**After**:
```python
logger.info(
    "CSuite weekly snapshot tick complete: firmas=%s written_talasli=%s written_kablaj=%s written_json=%s week=%s",
    total_firmas, written_db, written_kablaj, written_json, current_week,
)
```

**Why**: Show separate counts for each platform

### 8. Conditional Tedarikci Write (`csuite_history_store.py` line 128-157)

**Before**:
```python
# Always tried to write doluluk data, would fail for Kablaj
talasli_imalat_value = tedarikci_kapasite_analizi.get("Talaşlı İmalat", 0)
await session.execute(...)  # Always executed
```

**After**:
```python
# Only write if we have tedarikci data
if tedarikci_kapasite_analizi:
    talasli_imalat_value = tedarikci_kapasite_analizi.get("Talaşlı İmalat", 0)
    await session.execute(...)  # Conditional
```

**Why**: Kablaj doesn't have doluluk data, so skip this insert for Kablaj platform

## Data Flow

### Talaşlı İmalat (Unchanged)
```
1. Fetch doluluk data → per_firma_tedarikci
2. Fetch error data → per_firma_aselsan
3. Write both to database with platform="talasli_imalat"
   - firma_makina_planlanan_doluluk_history (doluluk)
   - aselsan_kaynakli_durma_history (errors)
```

### Kablaj (NEW - Now Enabled)
```
1. Fetch error data → per_firma_kablaj
2. Write to database with platform="kablaj"
   - aselsan_kaynakli_durma_history (errors only)
   - Skip firma_makina_planlanan_doluluk_history (no doluluk data)
```

## Database Storage

### aselsan_kaynakli_durma_history Table
Now contains data for **both platforms**:

```sql
SELECT platform, COUNT(*), AVG(hata_sayisi) 
FROM mes_production.aselsan_kaynakli_durma_history
GROUP BY platform;
```

Expected results:
```
platform        | count | avg
----------------|-------|-----
talasli_imalat  |  XXX  | X.XX
kablaj          |  YYY  | Y.YY
```

## Testing

### Step 1: Restart Backend
```bash
# Stop and restart to load new code
python main.py
```

### Step 2: Watch Logs
Look for new Kablaj messages:
```
INFO: Writing Kablaj to DB: firma=KabloTek A.Ş., aselsan={'hata_sayisi': 6}
INFO: ✓ Wrote Kablaj data to database for KabloTek A.Ş.
INFO: CSuite weekly snapshot tick complete: firmas=20 written_talasli=10 written_kablaj=5 written_json=5 week=2026-W11
```

### Step 3: Verify Database

#### Check Both Platforms Exist
```sql
SELECT DISTINCT platform 
FROM mes_production.aselsan_kaynakli_durma_history;

-- Expected:
-- talasli_imalat
-- kablaj
```

#### Check Kablaj Data
```sql
SELECT 
    firma,
    week,
    hata_sayisi,
    recorded_at
FROM mes_production.aselsan_kaynakli_durma_history
WHERE platform = 'kablaj'
ORDER BY recorded_at DESC
LIMIT 10;
```

#### Compare Platforms
```sql
SELECT 
    platform,
    COUNT(DISTINCT firma) as companies,
    COUNT(*) as total_records,
    AVG(hata_sayisi)::numeric(10,2) as avg_errors,
    MAX(hata_sayisi) as max_errors
FROM mes_production.aselsan_kaynakli_durma_history
GROUP BY platform;
```

## Expected Behavior

### Before This Change
- ❌ Kablaj data: Logged only, not stored
- ✅ Talaşlı İmalat data: Fully stored
- ❌ `platform='kablaj'` records: None in database

### After This Change
- ✅ Kablaj data: Fully stored to database
- ✅ Talaşlı İmalat data: Fully stored (unchanged)
- ✅ `platform='kablaj'` records: Present in database
- ✅ Separate counts for each platform in logs

## Benefits

1. **Complete Data Coverage**: Both platforms now have historical error tracking
2. **Platform Separation**: Clear distinction between Talaşlı İmalat and Kablaj in database
3. **Flexible Design**: Platforms can have different data (Kablaj has no doluluk data)
4. **Better Monitoring**: Separate counts show exactly what's being written
5. **Historical Analysis**: Can now trend Kablaj errors over time

## Notes

- Kablaj companies don't have doluluk (capacity) data, only error counts
- The `firma_makina_planlanan_doluluk_history` table only contains Talaşlı İmalat data
- The `aselsan_kaynakli_durma_history` table contains **both** platforms
- Each platform has its own `DatabaseCSuiteHistoryStore` instance with the correct platform identifier

## Verification Checklist

- [ ] Backend restarted
- [ ] Logs show "Initialized database stores for Talaşlı İmalat and Kablaj platforms"
- [ ] Logs show "Writing Kablaj to DB" messages
- [ ] Logs show "written_kablaj=X" in summary
- [ ] Database has records with `platform='kablaj'`
- [ ] Both platforms have recent data (check `recorded_at`)
- [ ] Week format is correct (YYYY-WNN)
