# Deployment Checklist - Aselsan Kaynaklı Durma Tracking

## Pre-Deployment Checks

### 1. File Verification
- [x] `sql/create_mekanik_sistemdeki_guncel_hata_sayisi.sql` created
- [x] `sql/create_kablaj_guncel_durus_view.sql` created
- [x] `sql/create_aselsan_kaynakli_durma_history.sql` created
- [x] `app/services/csuite_history_store.py` updated
- [x] `app/services/csuite_history_scheduler.py` updated
- [x] Documentation files created

### 2. Code Review
- [x] DatabaseCSuiteHistoryStore accepts platform parameter
- [x] write_weekly_snapshot_async writes to both tables
- [x] Scheduler fetches Talaşlı İmalat error data
- [x] Scheduler fetches Kablaj stop data
- [x] Error handling implemented
- [x] No linter errors

## Deployment Steps

### Step 1: Database Setup
```bash
# Connect to IVME database
psql -h <IVME_HOST> -U <USER> -d <DATABASE>
```

- [ ] Run: `\i dtbackend/sql/create_mekanik_sistemdeki_guncel_hata_sayisi.sql`
  - Expected: Table created with 10 sample records
  
- [ ] Run: `\i dtbackend/sql/create_kablaj_guncel_durus_view.sql`
  - Expected: Table + view created with 20+ sample records
  
- [ ] Run: `\i dtbackend/sql/create_aselsan_kaynakli_durma_history.sql`
  - Expected: History table created with sample records

### Step 2: Verification Queries
```sql
-- Check tables exist
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'mes_production'
    AND table_name IN (
        'mekanik_sistemdeki_guncel_hata_sayisi',
        'kablaj_durus_kayitlari',
        'kablaj_guncel_durus_view',
        'aselsan_kaynakli_durma_history'
    );
```
- [ ] All 4 tables/views exist

```sql
-- Test Talaşlı İmalat query
SELECT NAME, "Sistemdeki Güncel Hata Sayısı" 
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi
LIMIT 5;
```
- [ ] Returns 5 companies with error counts

```sql
-- Test Kablaj query
SELECT DISTINCT "Firma", COUNT("WORKORDERNO") OVER (PARTITION BY "Firma")
FROM (SELECT DISTINCT "WORKORDERNO", "Firma" FROM mes_production.kablaj_guncel_durus_view) s
LIMIT 5;
```
- [ ] Returns companies with work order counts

```sql
-- Check history table
SELECT * FROM mes_production.aselsan_kaynakli_durma_history LIMIT 5;
```
- [ ] Returns sample historical records

### Step 3: Backend Deployment
```bash
# Navigate to backend directory
cd dtbackend

# Optional: Run linter
# pylint app/services/csuite_history_store.py
# pylint app/services/csuite_history_scheduler.py

# Restart backend service
# Method depends on your deployment (systemd, docker, etc.)
```
- [ ] Backend restarted successfully
- [ ] No startup errors in logs

### Step 4: Monitor Scheduler
```bash
# Watch logs for scheduler activity
tail -f /path/to/logs/app.log | grep -E "(CSuite|Aselsan|scheduler)"
```

Expected log messages:
- [ ] "CSuite history scheduler started"
- [ ] "Talaşlı İmalat Aselsan Durma: <firma> - <count> hata"
- [ ] "Kablaj Aselsan Durma: <firma> - <count> hata"
- [ ] "CSuite weekly snapshot tick complete: firmas=X written_db=Y"

### Step 5: Wait for First Snapshot
- [ ] Wait until next Monday 00:00 (start of ISO week)
- [ ] Or manually trigger by changing system week

### Step 6: Verify Data Collection
After first week boundary:
```sql
SELECT platform, firma, week, hata_sayisi, recorded_at
FROM mes_production.aselsan_kaynakli_durma_history
WHERE week = (SELECT MAX(week) FROM mes_production.aselsan_kaynakli_durma_history)
ORDER BY platform, firma;
```
- [ ] New records appear for current week
- [ ] Both platforms represented (talasli_imalat, kablaj if applicable)
- [ ] Error counts match current data

## Post-Deployment Tests

### Test 1: Manual Data Update
```sql
-- Update Talaşlı İmalat error count
UPDATE mes_production.mekanik_sistemdeki_guncel_hata_sayisi
SET "Sistemdeki Güncel Hata Sayısı" = 99
WHERE "NAME" = 'Mikronmak Oto';

-- Wait for next scheduler tick (max 60 seconds)
-- Check if reflected in logs
```
- [ ] Scheduler logs new count: "Mikronmak Oto - 99 hata"

### Test 2: Add New Kablaj Stop
```sql
INSERT INTO mes_production.kablaj_durus_kayitlari 
    ("WORKORDERNO", "Firma", "DURUS_TIPI", "SORUMLU", "DURUM")
VALUES 
    ('WO-TEST-001', 'KabloTek A.Ş.', 'TEST', 'ASELSAN', 'ACIK');

-- Wait for scheduler tick
-- Check logs
```
- [ ] Scheduler logs updated count for KabloTek A.Ş.

### Test 3: Query Historical Trend
```sql
SELECT week, hata_sayisi
FROM mes_production.aselsan_kaynakli_durma_history
WHERE platform = 'talasli_imalat' AND firma = 'Mikronmak Oto'
ORDER BY week DESC
LIMIT 10;
```
- [ ] Returns chronological data
- [ ] Week format is YYYY-WNN
- [ ] Error counts are reasonable

### Test 4: Performance Check
```sql
-- Check query performance
EXPLAIN ANALYZE
SELECT platform, firma, week, hata_sayisi
FROM mes_production.aselsan_kaynakli_durma_history
WHERE week >= '2026-W01'
ORDER BY week DESC;
```
- [ ] Query completes in < 100ms
- [ ] Indexes are being used

## Troubleshooting

### Issue: Scheduler Not Running
**Check:**
- [ ] `CSUITE_HISTORY_SCHEDULER_ENABLED=true` in config
- [ ] IVME database connection configured
- [ ] No errors in startup logs

**Fix:** Review configuration and restart

### Issue: No Data Being Written
**Check:**
- [ ] Source tables have data
- [ ] Scheduler logs show data fetching
- [ ] No SQL errors in logs

**Fix:** Check table permissions and connection

### Issue: Duplicate Records
**Check:**
- [ ] Only one scheduler instance running
- [ ] UNIQUE constraints in place

**Fix:** Stop duplicate instances

### Issue: Performance Degradation
**Check:**
- [ ] Indexes exist on all tables
- [ ] VACUUM ANALYZE has been run

**Fix:**
```sql
VACUUM ANALYZE mes_production.aselsan_kaynakli_durma_history;
VACUUM ANALYZE mes_production.kablaj_durus_kayitlari;
```

## Rollback Plan (If Needed)

### Step 1: Stop Scheduler
```bash
# Set in config or environment
CSUITE_HISTORY_SCHEDULER_ENABLED=false

# Restart backend
```

### Step 2: Drop New Tables (Optional)
```sql
DROP TABLE IF EXISTS mes_production.aselsan_kaynakli_durma_history CASCADE;
DROP VIEW IF EXISTS mes_production.kablaj_guncel_durus_view CASCADE;
DROP TABLE IF EXISTS mes_production.kablaj_durus_kayitlari CASCADE;
DROP TABLE IF EXISTS mes_production.mekanik_sistemdeki_guncel_hata_sayisi CASCADE;
```

### Step 3: Revert Code Changes
```bash
git revert <commit-hash>
# Or restore previous versions of:
# - app/services/csuite_history_store.py
# - app/services/csuite_history_scheduler.py
```

## Sign-Off

### Developer
- [ ] All code changes reviewed
- [ ] All tests passing
- [ ] Documentation complete

Date: ____________  Signature: ____________________

### Database Admin
- [ ] Database schema reviewed
- [ ] Tables created successfully
- [ ] Indexes verified
- [ ] Backup plan in place

Date: ____________  Signature: ____________________

### Operations
- [ ] Deployment successful
- [ ] Monitoring configured
- [ ] No errors in logs
- [ ] Performance acceptable

Date: ____________  Signature: ____________________

## Support Contacts

**For Database Issues:**
- Check: `DATABASE_SETUP_GUIDE.md`
- Reference: `SQL_QUICK_REFERENCE.md`

**For Code Issues:**
- Check: `ASELSAN_KAYNAKLI_DURMA_IMPLEMENTATION.md`
- Review: Scheduler logs

**For General Questions:**
- Read: `IMPLEMENTATION_SUMMARY.md`

---

**Deployment Status**: ⬜ Not Started | ⬜ In Progress | ⬜ Complete | ⬜ Failed
**Date Started**: ____________
**Date Completed**: ____________
**Deployed By**: ____________________
