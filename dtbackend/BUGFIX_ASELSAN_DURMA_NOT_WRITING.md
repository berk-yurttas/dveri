# Bug Fix: Aselsan Kaynaklı Durma Data Not Being Written

## Problem
The scheduler was successfully executing the queries to fetch error data from:
- `mekanik_sistemdeki_guncel_hata_sayisi` (Talaşlı İmalat)
- `kablaj_guncel_durus_view` (Kablaj)

However, no data was being written to the `aselsan_kaynakli_durma_history` table.

## Root Causes

### Issue 1: Missing Company Matching
**Problem**: Companies in the error tables might not exist in the doluluk table, causing them to be skipped.

**Location**: `csuite_history_scheduler.py` line 202-220

**Before**:
```python
# Only stored error data for companies that already existed in per_firma_tedarikci
per_firma_aselsan.setdefault(firma, {})["hata_sayisi"] = hata_sayisi
```

**After**:
```python
# Ensure the firma exists in per_firma_tedarikci (add with zero doluluk if missing)
if firma not in per_firma_tedarikci:
    per_firma_tedarikci[firma] = {"Talaşlı İmalat": 0}
    logger.debug(f"Added missing firma to tedarikci dict: {firma}")

per_firma_aselsan.setdefault(firma, {})["hata_sayisi"] = hata_sayisi
```

**Why**: The write logic only processes companies that exist in `per_firma_tedarikci`. If a company has errors but no doluluk data, it would be skipped entirely.

### Issue 2: Insufficient Logging
**Problem**: No visibility into what data was being prepared for writing or why writes were skipped.

**Location**: `csuite_history_scheduler.py` line 254-269

**Added Logging**:
```python
logger.debug(f"Checking {firma}: latest_week={latest_db_week}, current_week={current_week}")
logger.info(f"Writing to DB: firma={firma}, tedarikci={per_firma_tedarikci[firma]}, aselsan={aselsan_data}")
logger.info(f"✓ Wrote Talaşlı İmalat data to database for {firma}")
logger.debug(f"Skipping {firma} - week {current_week} already recorded")
```

**Why**: Better logging helps diagnose issues and confirms successful writes.

### Issue 3: Conditional Write Logic
**Problem**: The write condition in the store checked `if hata_sayisi is not None:` which would pass even for zero values, but the check wasn't clear.

**Location**: `csuite_history_store.py` line 157-180

**Before**:
```python
hata_sayisi = aselsan_kaynakli_durma.get("hata_sayisi", 0)

if hata_sayisi is not None:  # Ambiguous condition
    # Write to database
```

**After**:
```python
# Only write if we have the hata_sayisi key (even if value is 0)
if "hata_sayisi" in aselsan_kaynakli_durma:
    hata_sayisi = aselsan_kaynakli_durma.get("hata_sayisi", 0)
    # Write to database
```

**Why**: More explicit check - we only write if the dictionary has the "hata_sayisi" key, making it clear we have actual data to write (even if the count is 0).

## Changes Made

### File: `csuite_history_scheduler.py`

#### Change 1: Auto-add missing companies (lines 202-227)
```python
# Fetch Aselsan Kaynaklı Durma data for Talaşlı İmalat
try:
    talasli_durma_rows = await session.execute(...)
    for row in talasli_durma_rows.all():
        firma = str(row[0] or "").strip()
        hata_sayisi = int(row[1] or 0)
        if not firma:
            continue
        
        # NEW: Ensure this firma exists in per_firma_tedarikci
        if firma not in per_firma_tedarikci:
            per_firma_tedarikci[firma] = {"Talaşlı İmalat": 0}
            logger.debug(f"Added missing firma to tedarikci dict: {firma}")
        
        per_firma_aselsan.setdefault(firma, {})["hata_sayisi"] = hata_sayisi
        logger.debug(f"Talaşlı İmalat Aselsan Durma: {firma} - {hata_sayisi} hata")
except Exception as e:
    logger.warning(f"Failed to fetch Talaşlı İmalat Aselsan durma data: {e}")
```

#### Change 2: Enhanced logging (lines 254-276)
```python
if firma in per_firma_tedarikci and "Talaşlı İmalat" in per_firma_tedarikci[firma]:
    try:
        latest_db_week = await cls._database_store.latest_week_for_company_async(firma)
        logger.debug(f"Checking {firma}: latest_week={latest_db_week}, current_week={current_week}")
        
        if latest_db_week != current_week:
            aselsan_data = per_firma_aselsan.get(firma, {})
            logger.info(f"Writing to DB: firma={firma}, tedarikci={per_firma_tedarikci[firma]}, aselsan={aselsan_data}")
            
            await cls._database_store.write_weekly_snapshot_async(...)
            written_db += 1
            logger.info(f"✓ Wrote Talaşlı İmalat data to database for {firma}")
        else:
            logger.debug(f"Skipping {firma} - week {current_week} already recorded")
    except Exception as e:
        logger.error(f"Failed to write Talaşlı İmalat data to database for {firma}: {e}", exc_info=True)
```

### File: `csuite_history_store.py`

#### Change: Explicit key check (lines 157-179)
```python
# 2. Write aselsan_kaynakli_durma (hata sayısı)
# Only write if we have the hata_sayisi key (even if value is 0)
if "hata_sayisi" in aselsan_kaynakli_durma:
    hata_sayisi = aselsan_kaynakli_durma.get("hata_sayisi", 0)
    
    await session.execute(
        text(
            """
            INSERT INTO mes_production.aselsan_kaynakli_durma_history 
                (platform, firma, week, hata_sayisi, recorded_at)
            VALUES (:platform, :firma, :week, :hata_sayisi, :recorded_at)
            ON CONFLICT (platform, firma, week) 
            DO UPDATE SET 
                hata_sayisi = EXCLUDED.hata_sayisi,
                recorded_at = EXCLUDED.recorded_at
            """
        ),
        {
            "platform": self._platform,
            "firma": firma,
            "week": week,
            "hata_sayisi": hata_sayisi,
            "recorded_at": datetime.now(timezone.utc)
        }
    )
```

## Testing the Fix

### Step 1: Restart Backend
```bash
# Stop current backend
# Ctrl+C or kill process

# Restart backend
python main.py
```

### Step 2: Monitor Logs
Look for these new log messages:
```
DEBUG: Added missing firma to tedarikci dict: <firma_name>
DEBUG: Talaşlı İmalat Aselsan Durma: <firma> - <count> hata
DEBUG: Checking <firma>: latest_week=2026-W10, current_week=2026-W11
INFO: Writing to DB: firma=<firma>, tedarikci={'Talaşlı İmalat': 85}, aselsan={'hata_sayisi': 8}
INFO: ✓ Wrote Talaşlı İmalat data to database for <firma>
```

### Step 3: Verify Database
```sql
-- Check if data was written
SELECT 
    platform,
    firma,
    week,
    hata_sayisi,
    recorded_at
FROM mes_production.aselsan_kaynakli_durma_history
ORDER BY recorded_at DESC
LIMIT 10;
```

### Step 4: Check Specific Company
```sql
-- Verify a specific company's data
SELECT * FROM mes_production.aselsan_kaynakli_durma_history
WHERE firma = 'Mikronmak Oto'
ORDER BY week DESC;
```

## Expected Behavior After Fix

1. ✅ Scheduler fetches error data from both tables
2. ✅ Missing companies are auto-added to `per_firma_tedarikci`
3. ✅ Detailed logging shows what's being written
4. ✅ Data is written to `aselsan_kaynakli_durma_history`
5. ✅ Both doluluk and hata_sayisi are stored together

## Verification Checklist

- [ ] Backend restarted
- [ ] New log messages appear (DEBUG/INFO level)
- [ ] `aselsan_kaynakli_durma_history` table has data
- [ ] Data matches current error counts
- [ ] Both platforms work (talasli_imalat, kablaj when enabled)

## Rollback (If Needed)

If issues occur:
1. Check logs for error messages
2. Verify table exists: `\d mes_production.aselsan_kaynakli_durma_history`
3. Check query results manually to ensure source data exists
4. Review any exception stack traces in logs

## Notes

- Companies with 0 errors will still be written (hata_sayisi = 0)
- Week check prevents duplicate writes
- ON CONFLICT ensures idempotent writes
- Kablaj data is currently logged only (not written to database yet)
