# Talaşlı İmalat Database Storage Implementation

## Summary

The CSuite history scheduler has been updated to write **Talaşlı İmalat** capacity data directly to a **database table** instead of JSON files. This provides better query performance, data integrity, and scalability.

## Architecture Changes

### Previous Architecture (JSON Storage)

```
MES Function → Scheduler → JSON File
```

### New Architecture (Database Storage)

```
MES Function → Scheduler → Database Table (mes_production.firma_makina_planlanan_doluluk_history)
```

## Database Table Structure

### Table: `mes_production.firma_makina_planlanan_doluluk_history`

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | SERIAL | Primary key | PRIMARY KEY |
| `"Firma Adı"` | TEXT | Company name | NOT NULL |
| `week` | TEXT | ISO week (e.g., "2026-W11") | NOT NULL |
| `"Aylık Planlanan Doluluk Oranı"` | NUMERIC | Occupancy rate (0-100) | NOT NULL, CHECK (0-100) |
| `recorded_at` | TIMESTAMP WITH TIME ZONE | When recorded | NOT NULL, DEFAULT NOW() |

**Unique Constraint:** `("Firma Adı", week)` - One record per company per week

**Indexes:**
- `idx_firma_makina_doluluk_history_firma` on `"Firma Adı"`
- `idx_firma_makina_doluluk_history_week` on `week DESC`
- `idx_firma_makina_doluluk_history_recorded_at` on `recorded_at DESC`

## Implementation Details

### 1. Storage Abstraction Layer

Created `DatabaseCSuiteHistoryStore` class in `csuite_history_store.py`:

```python
class DatabaseCSuiteHistoryStore(CSuiteHistoryStore):
    """
    Database-backed implementation for Talaşlı İmalat.
    Writes to mes_production.firma_makina_planlanan_doluluk_history table.
    """
```

**Key Methods:**
- `write_weekly_snapshot_async()` - Writes data to database with UPSERT logic
- `latest_week_for_company_async()` - Checks if week already exists
- Uses async SQLAlchemy for non-blocking database operations

### 2. Scheduler Updates

The scheduler now:
1. Fetches Talaşlı İmalat data from MES function
2. Writes to database using `DatabaseCSuiteHistoryStore`
3. Still writes other categories to JSON (Kablaj/EMM, Kart Dizgi are under construction)

```python
# Write Talaşlı İmalat to database
await cls._database_store.write_weekly_snapshot_async(
    firma=firma,
    week=current_week,
    tedarikci_kapasite_analizi={"Talaşlı İmalat": value},
    aselsan_kaynakli_durma={},
)
```

### 3. UPSERT Logic

Uses PostgreSQL `ON CONFLICT` for automatic insert/update:

```sql
INSERT INTO mes_production.firma_makina_planlanan_doluluk_history 
    ("Firma Adı", week, "Aylık Planlanan Doluluk Oranı", recorded_at)
VALUES (:firma, :week, :doluluk_orani, :recorded_at)
ON CONFLICT ("Firma Adı", week) 
DO UPDATE SET 
    "Aylık Planlanan Doluluk Oranı" = EXCLUDED."Aylık Planlanan Doluluk Oranı",
    recorded_at = EXCLUDED.recorded_at
```

## Setup Instructions

### 1. Create the Database Table

Run the SQL script in the IVME database:

```bash
# Connect to IVME database
psql -h <host> -U <user> -d <ivme_database>

# Run the migration script
\i sql/create_firma_makina_doluluk_history.sql
```

Or execute directly:

```bash
psql -h <host> -U <user> -d <ivme_database> -f sql/create_firma_makina_doluluk_history.sql
```

### 2. Verify Table Creation

```sql
-- Check if table exists
SELECT * FROM mes_production.firma_makina_planlanan_doluluk_history LIMIT 5;

-- Check indexes
\d mes_production.firma_makina_planlanan_doluluk_history
```

### 3. Restart the Scheduler

The scheduler will automatically start writing to the database table.

## Querying Historical Data

### Get Latest Week for a Company

```sql
SELECT week, "Aylık Planlanan Doluluk Oranı", recorded_at
FROM mes_production.firma_makina_planlanan_doluluk_history
WHERE "Firma Adı" = 'FIRMA A'
ORDER BY week DESC
LIMIT 1;
```

### Get Last 10 Weeks for a Company

```sql
SELECT week, "Aylık Planlanan Doluluk Oranı", recorded_at
FROM mes_production.firma_makina_planlanan_doluluk_history
WHERE "Firma Adı" = 'FIRMA A'
ORDER BY week DESC
LIMIT 10;
```

### Get All Companies for a Specific Week

```sql
SELECT "Firma Adı", "Aylık Planlanan Doluluk Oranı"
FROM mes_production.firma_makina_planlanan_doluluk_history
WHERE week = '2026-W11'
ORDER BY "Firma Adı";
```

### Calculate Week-over-Week Changes

```sql
WITH current_week AS (
    SELECT "Firma Adı", "Aylık Planlanan Doluluk Oranı" as current_value
    FROM mes_production.firma_makina_planlanan_doluluk_history
    WHERE week = '2026-W11'
),
previous_week AS (
    SELECT "Firma Adı", "Aylık Planlanan Doluluk Oranı" as previous_value
    FROM mes_production.firma_makina_planlanan_doluluk_history
    WHERE week = '2026-W10'
)
SELECT 
    c."Firma Adı",
    c.current_value,
    p.previous_value,
    c.current_value - p.previous_value as change,
    ROUND(((c.current_value - p.previous_value)::numeric / p.previous_value * 100), 1) as change_percent
FROM current_week c
LEFT JOIN previous_week p ON c."Firma Adı" = p."Firma Adı"
ORDER BY c."Firma Adı";
```

### Get Historical Trend

```sql
SELECT 
    week,
    AVG("Aylık Planlanan Doluluk Oranı") as avg_doluluk,
    MIN("Aylık Planlanan Doluluk Oranı") as min_doluluk,
    MAX("Aylık Planlanan Doluluk Oranı") as max_doluluk,
    COUNT(*) as firma_count
FROM mes_production.firma_makina_planlanan_doluluk_history
WHERE week >= '2026-W01'
GROUP BY week
ORDER BY week DESC;
```

## API Integration

### Create New Endpoint (Optional)

Add to `app/api/v1/endpoints/data.py`:

```python
@router.get("/csuite/talasli-imalat/history")
async def get_talasli_imalat_history(
    firma: str = Query(..., description="Company name"),
    limit: int = Query(10, ge=1, le=52, description="Number of weeks")
):
    """Get Talaşlı İmalat historical data from database."""
    # Get IVME session maker
    ivme_session_maker = await CSuiteHistoryScheduler._get_ivme_session_maker()
    
    async with ivme_session_maker() as session:
        result = await session.execute(
            text("""
                SELECT week, "Aylık Planlanan Doluluk Oranı", recorded_at
                FROM mes_production.firma_makina_planlanan_doluluk_history
                WHERE "Firma Adı" = :firma
                ORDER BY week DESC
                LIMIT :limit
            """),
            {"firma": firma, "limit": limit}
        )
        
        rows = result.fetchall()
        return {
            "firma": firma,
            "history": [
                {
                    "week": row[0],
                    "doluluk_orani": row[1],
                    "recorded_at": row[2].isoformat()
                }
                for row in rows
            ]
        }
```

## Benefits

### Performance
✅ **Faster Queries** - Database indexes provide O(log n) lookups  
✅ **Scalable** - Can handle millions of records  
✅ **Concurrent Access** - Multiple processes can read/write safely  

### Data Integrity
✅ **ACID Compliance** - Transactions ensure data consistency  
✅ **Constraints** - Check constraints enforce valid data (0-100 range)  
✅ **Unique Constraint** - Prevents duplicate week records  

### Features
✅ **Advanced Queries** - SQL joins, aggregations, window functions  
✅ **Backup & Recovery** - Standard database backup tools work  
✅ **Monitoring** - Database monitoring tools can track usage  

## Migration Notes

### Existing JSON Data

The JSON files (`csuite_weekly_history.json`) are still used for:
- Kablaj/EMM data (under construction - placeholder zeros)
- Kart Dizgi data (under construction - placeholder zeros)
- Aselsan Kaynaklı Durma data

### Future: Migrate All Categories to Database

When Kablaj/EMM and Kart Dizgi become available, you can:
1. Create additional columns or separate tables
2. Update `DatabaseCSuiteHistoryStore` to handle all categories
3. Migrate historical JSON data to database

## Monitoring

### Check Scheduler Status

```python
import asyncio
from app.services.csuite_history_scheduler import CSuiteHistoryScheduler

async def check_status():
    result = await CSuiteHistoryScheduler.run_once()
    print(f"Processed {result['firmas']} companies")
    print(f"Wrote {result['written']} records")

asyncio.run(check_status())
```

### Check Database Records

```sql
-- Count total records
SELECT COUNT(*) FROM mes_production.firma_makina_planlanan_doluluk_history;

-- Count records per company
SELECT firma, COUNT(*) as weeks
FROM mes_production.firma_makina_planlanan_doluluk_history
GROUP BY firma
ORDER BY weeks DESC;

-- Latest recording time
SELECT MAX(recorded_at) as last_update
FROM mes_production.firma_makina_planlanan_doluluk_history;
```

## Troubleshooting

### Table Not Found Error

```
ERROR: relation "mes_production.firma_makina_planlanan_doluluk_history" does not exist
```

**Solution:** Run the SQL migration script to create the table.

### Permission Denied Error

```
ERROR: permission denied for schema mes_production
```

**Solution:** Grant necessary permissions:

```sql
GRANT USAGE ON SCHEMA mes_production TO your_user;
GRANT SELECT, INSERT, UPDATE ON mes_production.firma_makina_planlanan_doluluk_history TO your_user;
GRANT USAGE, SELECT ON SEQUENCE mes_production.firma_makina_planlanan_doluluk_history_id_seq TO your_user;
```

### Unique Constraint Violation (Unexpected)

If you see duplicate key errors when UPSERT should handle them:

```sql
-- Check for any data issues
SELECT "Firma Adı", week, COUNT(*)
FROM mes_production.firma_makina_planlanan_doluluk_history
GROUP BY "Firma Adı", week
HAVING COUNT(*) > 1;
```

## Rollback

To revert to JSON storage only:

1. Remove database writes from scheduler:
   ```python
   # Comment out database write section in run_once()
   ```

2. Use only JSON store:
   ```python
   cls._history_store.write_weekly_snapshot(...)
   ```

3. Keep the database table for historical reference or drop it:
   ```sql
   DROP TABLE mes_production.firma_makina_planlanan_doluluk_history;
   ```
