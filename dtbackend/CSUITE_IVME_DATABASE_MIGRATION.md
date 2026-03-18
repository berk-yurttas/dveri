# CSuite History Services - IVME Database Migration

## Summary

The CSuite history services (scheduler, service, and store) have been updated to use the **IVME platform database** instead of the main PostgreSQL database.

## What Changed

### 1. **csuite_history_scheduler.py** - Dynamic Database Connection

The scheduler now:
- Dynamically fetches the IVME platform configuration from the `platforms` table
- Creates an async PostgreSQL connection using the IVME platform's `db_config`
- Queries CSuite data from the IVME database instead of the main database

**Key Changes:**
- Added `_get_ivme_session_maker()` method that:
  - Fetches IVME platform configuration from the `platforms` table
  - Validates the configuration (must be PostgreSQL)
  - Creates an async engine with the IVME database credentials
  - Caches the session maker for reuse
- Updated `run_once()` to use the IVME session maker

### 2. **csuite_history_service.py** - No Changes Required

This service stores data to a local JSON file and doesn't interact with any database directly, so no changes were needed.

### 3. **csuite_history_store.py** - No Changes Required

This is an abstraction layer that delegates to the history service, so no changes were needed.

## How It Works

```
┌─────────────────────────────────┐
│  CSuiteHistoryScheduler         │
│  - Queries platforms table      │ ──┐
│    for 'ivme' configuration     │   │ Queries main DB
└─────────────────────────────────┘   │ for platform config
                 │                     │
                 │                     ▼
                 │            ┌──────────────────┐
                 │            │  Main PostgreSQL │
                 │            │  (dt_report DB)  │
                 │            │  - platforms     │
                 │            └──────────────────┘
                 │
                 ▼ Uses IVME DB connection
         ┌──────────────────┐
         │  IVME PostgreSQL │
         │  Database        │
         │  - csuite schema │
         │  - mes_production│
         └──────────────────┘
                 │
                 ├── mes_production.get_firma_makina_planlanan_doluluk() [Talaşlı İmalat]
                 └── csuite.aselsan_kaynakli_durma
```

## Data Sources

The scheduler now uses **different data sources** for different categories:

### Tedarikçi Kapasite Analizi

| Category | Data Source | Description | Status |
|----------|-------------|-------------|--------|
| **Talaşlı İmalat** | `mes_production.get_firma_makina_planlanan_doluluk()` | Real-time MES production data - Monthly planned machine occupancy rate | ✅ Active |
| **Kablaj/EMM** | _Under Construction_ | Placeholder (returns 0) | 🚧 Pending |
| **Kart Dizgi** | _Under Construction_ | Placeholder (returns 0) | 🚧 Pending |

### Aselsan Kaynaklı Durma

All categories use: `csuite.aselsan_kaynakli_durma` table (optional)

## Prerequisites

### 1. IVME Platform Must Be Configured

The IVME platform must exist in the `platforms` table with proper database configuration:

```sql
SELECT code, db_type, db_config 
FROM platforms 
WHERE code = 'ivme' AND is_active = true;
```

Expected result:
```
code  | db_type    | db_config
------|------------|------------------------------------------
ivme  | postgresql | {
      |            |   "host": "your-host",
      |            |   "port": 5432,
      |            |   "database": "ivme_db",
      |            |   "user": "postgres",
      |            |   "password": "your-password"
      |            | }
```

### 2. IVME Database Must Have CSuite Schema

The IVME database must contain:
- **`mes_production.get_firma_makina_planlanan_doluluk()`** function - Returns Talaşlı İmalat data with columns:
  - `"Firma Adı"` (text) - Company name
  - `"Aylık Planlanan Doluluk Oranı"` (numeric) - Monthly planned occupancy rate (0-100)
- **`csuite.aselsan_kaynakli_durma`** table (optional) - For Aselsan-related downtime with columns:
  - `firma`, `name`, `value`, `id`

**Note:** Kablaj/EMM and Kart Dizgi categories are currently under construction and will default to 0.

## Configuration Example

If you haven't configured the IVME platform yet, here's how to do it:

```sql
-- Insert or update IVME platform configuration
INSERT INTO platforms (
  code, 
  name, 
  display_name, 
  db_type, 
  db_config, 
  is_active
) VALUES (
  'ivme',
  'IVME',
  'IVME Platform',
  'postgresql',
  '{
    "host": "localhost",
    "port": 5432,
    "database": "ivme_db",
    "user": "postgres",
    "password": "your-password"
  }'::jsonb,
  true
)
ON CONFLICT (code) 
DO UPDATE SET 
  db_type = EXCLUDED.db_type,
  db_config = EXCLUDED.db_config,
  is_active = EXCLUDED.is_active;
```

## Error Handling

The scheduler will log clear error messages if:

1. **IVME platform not found:**
   ```
   ValueError: IVME platform not found or inactive in the database.
   Please configure the IVME platform with proper database settings.
   ```

2. **Wrong database type:**
   ```
   ValueError: IVME platform must use PostgreSQL database, but found: clickhouse
   ```

3. **Missing configuration:**
   ```
   ValueError: IVME platform has no database configuration (db_config is null)
   ```

4. **Incomplete configuration:**
   ```
   ValueError: IVME platform database configuration is incomplete.
   Required: database, user. Found: ['host', 'port']
   ```

## Testing

To test the configuration:

1. **Check IVME platform configuration:**
   ```bash
   cd dtbackend
   python check_ivme_config.py
   ```

2. **Run the scheduler manually:**
   ```python
   import asyncio
   from app.services.csuite_history_scheduler import CSuiteHistoryScheduler
   
   async def test():
       result = await CSuiteHistoryScheduler.run_once()
       print(f"Processed {result['firmas']} companies, wrote {result['written']} snapshots")
   
   asyncio.run(test())
   ```

3. **Check the logs:**
   Look for log messages like:
   ```
   Created IVME database connection: localhost:5432/ivme_db
   CSuite weekly snapshot tick complete: firmas=5 written=2 week=2026-W11
   ```

## Benefits

1. **Separation of Concerns**: CSuite data is now isolated in its own database
2. **Platform-Specific Configuration**: Uses the existing platform configuration system
3. **Dynamic Configuration**: No need to restart the application when changing IVME database credentials
4. **Better Scalability**: IVME database can be scaled independently
5. **Cleaner Architecture**: Follows the multi-tenant platform pattern

## Rollback

If you need to rollback to the old behavior (using main database), you can:

1. Create a migration that adds the CSuite schema to the main database
2. Revert the changes to `csuite_history_scheduler.py`
3. Restore the original import: `from app.core.database import AsyncSessionLocal`

However, the recommended approach is to properly configure the IVME platform database.
