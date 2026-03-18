# Cleanup: Removed Durma History Tracking from Scheduler

## Summary
Removed all durma (stop/downtime) tracking from the history scheduler since durma records are not being stored in history tables.

## What Was Removed

### 1. Class Variables (`csuite_history_scheduler.py`)
**Removed**:
```python
_kablaj_database_store: DatabaseCSuiteHistoryStore | None = None  # For Kablaj
```

**Why**: No longer tracking Kablaj durma in history

### 2. Store Initialization (`csuite_history_scheduler.py`)
**Before**:
```python
cls._database_store = DatabaseCSuiteHistoryStore(..., platform="talasli_imalat")
cls._kablaj_database_store = DatabaseCSuiteHistoryStore(..., platform="kablaj")
logger.info("Initialized database stores for Talaşlı İmalat and Kablaj platforms")
```

**After**:
```python
cls._database_store = DatabaseCSuiteHistoryStore(..., platform="talasli_imalat")
logger.info("Initialized database store for Talaşlı İmalat doluluk tracking")
```

### 3. Data Dictionaries (`csuite_history_scheduler.py`)
**Removed**:
```python
per_firma_aselsan: dict[str, dict[str, int]] = {}
per_firma_kablaj: dict[str, dict[str, int]] = {}
```

**Why**: No longer fetching or storing durma data

### 4. Durma Data Fetching (`csuite_history_scheduler.py`)
**Removed entire sections**:
- Talaşlı İmalat durma query (mekanik_sistemdeki_guncel_hata_sayisi)
- Kablaj durma query (kablaj_guncel_durus_view)  
- Data processing loops for both

**Queries Removed**:
```python
# Talaşlı İmalat - REMOVED
SELECT "NAME", "Sistemdeki Güncel Hata Sayısı" 
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi

# Kablaj - REMOVED  
SELECT DISTINCT "Firma", COUNT("WORKORDERNO") OVER (PARTITION BY "Firma")
FROM (SELECT DISTINCT "WORKORDERNO", "Firma" FROM mes_production.kablaj_guncel_durus_view)
```

### 5. Kablaj Write Logic (`csuite_history_scheduler.py`)
**Removed entire Kablaj write section** (~25 lines):
```python
# Write Kablaj data to database
if firma in per_firma_kablaj:
    # Check latest week, write to database
    await cls._kablaj_database_store.write_weekly_snapshot_async(...)
```

### 6. Company Loop Simplification (`csuite_history_scheduler.py`)
**Before**:
```python
all_firmas = sorted(set(per_firma_tedarikci.keys()) | set(per_firma_aselsan.keys()) | set(per_firma_kablaj.keys()))
```

**After**:
```python
all_firmas = sorted(set(per_firma_tedarikci.keys()))
```

**Why**: Only processing companies from doluluk data now

### 7. Write Parameters Updated (`csuite_history_scheduler.py`)
**Before**:
```python
await cls._database_store.write_weekly_snapshot_async(
    firma=firma,
    week=current_week,
    tedarikci_kapasite_analizi=per_firma_tedarikci[firma],
    aselsan_kaynakli_durma=aselsan_data,  # Had real data
)
```

**After**:
```python
await cls._database_store.write_weekly_snapshot_async(
    firma=firma,
    week=current_week,
    tedarikci_kapasite_analizi=per_firma_tedarikci[firma],
    aselsan_kaynakli_durma={},  # Empty - not storing durma
)
```

### 8. Logging Simplified (`csuite_history_scheduler.py`)
**Before**:
```python
logger.info(f"Writing to DB: firma={firma}, tedarikci={...}, aselsan={...}")
logger.info("CSuite weekly snapshot tick complete: firmas=%s written_talasli=%s written_kablaj=%s written_json=%s week=%s")
return {"firmas": total_firmas, "written": written_db + written_kablaj + written_json}
```

**After**:
```python
logger.info(f"Writing doluluk to DB: firma={firma}, tedarikci={...}")
logger.info("CSuite weekly snapshot tick complete: firmas=%s written_db=%s written_json=%s week=%s")
return {"firmas": total_firmas, "written": written_db + written_json}
```

### 9. Store Simplified (`csuite_history_store.py`)

#### latest_week_for_company_async
**Before**: Checked both doluluk and durma tables
**After**: Only checks doluluk table

```python
# Removed durma history check
durma_result = await session.execute(...)
```

#### write_weekly_snapshot_async  
**Before**: Wrote to both doluluk and durma tables
**After**: Only writes to doluluk table

```python
# Removed entire durma write section
if "hata_sayisi" in aselsan_kaynakli_durma:
    await session.execute(INSERT INTO aselsan_kaynakli_durma_history ...)
```

## What Remains

### Still Tracked
✅ **Talaşlı İmalat Doluluk Oranı** - Weekly snapshots to database
✅ **Kablaj/EMM Doluluk** - Weekly snapshots to JSON (under construction)
✅ **Kart Dizgi Doluluk** - Weekly snapshots to JSON (under construction)

### Not Tracked in History
❌ **Durma/Stop Records** - Not stored in history tables
❌ **Error Counts** - Not stored in history tables

## Current Data Flow

```
Scheduler runs every 60s
    ↓
Fetch doluluk data from MES
    ↓
For each company:
    - Check if current week recorded
    - If not, write doluluk to database
    ↓
Log summary: "firmas=X written_db=Y"
```

## Database Impact

### Tables Still Used
✅ `mes_production.firma_makina_planlanan_doluluk_history` - Active
✅ `mes_production.get_firma_makina_planlanan_doluluk` - Active (source)

### Tables No Longer Used by Scheduler
❌ `mes_production.aselsan_kaynakli_durma_history` - Not written to
❌ `mes_production.mekanik_sistemdeki_guncel_hata_sayisi` - Not queried
❌ `mes_production.kablaj_guncel_durus_view` - Not queried

**Note**: These tables may still be used by other parts of the application for real-time display, just not for historical tracking.

## Benefits of Cleanup

### Performance
- ✅ Fewer database queries per scheduler tick
- ✅ Reduced processing time
- ✅ Less database load

### Simplicity
- ✅ Clearer code purpose (doluluk tracking only)
- ✅ Easier to maintain
- ✅ Less confusion about what's being tracked

### Consistency
- ✅ Scheduler focuses on one clear job: doluluk history
- ✅ Durma can be tracked separately if needed later

## Testing

### Verify After Restart
1. **Check logs** - Should NOT see durma-related messages:
   ```
   ❌ "Talaşlı İmalat Aselsan Durma: ..."
   ❌ "Kablaj Aselsan Durma: ..."
   ❌ "Writing Kablaj to DB: ..."
   ❌ "written_kablaj=..."
   ```

2. **Should see** - Only doluluk tracking:
   ```
   ✅ "Writing doluluk to DB: firma=Mikronmak Oto..."
   ✅ "✓ Wrote Talaşlı İmalat doluluk data to database..."
   ✅ "CSuite weekly snapshot tick complete: firmas=10 written_db=5 written_json=5"
   ```

3. **Database checks**:
   ```sql
   -- Should continue to populate
   SELECT COUNT(*) FROM mes_production.firma_makina_planlanan_doluluk_history;
   
   -- Should NOT have new records (if table exists)
   SELECT MAX(recorded_at) FROM mes_production.aselsan_kaynakli_durma_history;
   ```

## Files Modified
- ✅ `app/services/csuite_history_scheduler.py` - Removed all durma tracking
- ✅ `app/services/csuite_history_store.py` - Simplified to doluluk only

## Future Considerations

If durma history tracking is needed later:
1. Create separate scheduler dedicated to durma
2. Use new durus_history table (created in SQL files)
3. Store individual stop records, not just counts
4. Keep separate from doluluk tracking for clarity

## Summary

The scheduler is now **focused and simplified**: it tracks only doluluk (capacity utilization) history for Talaşlı İmalat. All durma (stop/downtime) tracking code has been removed since that data is not being stored in history tables.
