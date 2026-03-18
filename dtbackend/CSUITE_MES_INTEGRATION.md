# CSuite Scheduler - MES Production Data Integration

## Summary

The CSuite history scheduler has been updated to fetch **Talaşlı İmalat** data from the **MES Production system** instead of the CSuite table. This provides real-time machine occupancy data directly from the production monitoring system.

## What Changed

### Data Source Update for Talaşlı İmalat

**Before:**
```sql
-- All categories from the same table
SELECT firma, name, value
FROM csuite.tedarikci_kapasite
WHERE name IN ('Talaşlı İmalat', 'Kablaj/EMM', 'Kart Dizgi')
```

**After:**
```sql
-- Talaşlı İmalat from MES function
SELECT "Firma Adı", "Aylık Planlanan Doluluk Oranı"
FROM mes_production.get_firma_makina_planlanan_doluluk()

-- Other categories still from CSuite table
SELECT firma, name, value
FROM csuite.tedarikci_kapasite
WHERE name IN ('Kablaj/EMM', 'Kart Dizgi')
```

## Data Sources by Category

| Category | Data Source | Column Mapping | Status |
|----------|-------------|----------------|--------|
| **Talaşlı İmalat** | `mes_production.get_firma_makina_planlanan_doluluk()` | `"Firma Adı"` → firma<br>`"Aylık Planlanan Doluluk Oranı"` → value | ✅ Active |
| **Kablaj/EMM** | _Under Construction_ | Placeholder value: 0 | 🚧 Pending |
| **Kart Dizgi** | _Under Construction_ | Placeholder value: 0 | 🚧 Pending |

## MES Function Requirements

### Function Signature

```sql
CREATE OR REPLACE FUNCTION mes_production.get_firma_makina_planlanan_doluluk()
RETURNS TABLE (
    "Firma Adı" TEXT,
    "Aylık Planlanan Doluluk Oranı" NUMERIC
)
```

### Expected Return Format

```
Firma Adı               | Aylık Planlanan Doluluk Oranı
------------------------|------------------------------
FIRMA A                 | 85.5
FIRMA B                 | 92.3
FIRMA C                 | 78.0
```

### Data Processing

The scheduler automatically:
1. Converts `"Aylık Planlanan Doluluk Oranı"` to integer
2. Clamps values to 0-100 range
3. Handles null/invalid values (defaults to 0)
4. Trims whitespace from company names

```python
# Example conversion
doluluk_orani = 85.5  # From MES
value = int(float(85.5))  # Converts to 85
value = max(0, min(100, value))  # Ensures 0 <= value <= 100
```

## Error Handling

### Graceful Degradation

If the MES function fails, the scheduler:
- Logs a warning message
- Continues processing other categories (Kablaj/EMM, Kart Dizgi)
- Does not crash or stop the scheduler

```python
try:
    # Fetch MES data for Talaşlı İmalat
    mes_rows = await session.execute(...)
except Exception as e:
    logger.warning(f"Failed to fetch MES production data for Talaşlı İmalat: {e}")
    # Scheduler continues with other categories
```

### Logging

The scheduler logs:
- **Debug level**: Individual company data points
  ```
  MES data: FIRMA A - Talaşlı İmalat = 85%
  ```
- **Warning level**: MES function failures
  ```
  Failed to fetch MES production data for Talaşlı İmalat: relation "mes_production.get_firma_makina_planlanan_doluluk" does not exist
  ```

## Testing

### 1. Test MES Function Directly

```sql
-- Verify the function exists and returns data
SELECT "Firma Adı", "Aylık Planlanan Doluluk Oranı"
FROM mes_production.get_firma_makina_planlanan_doluluk();
```

### 2. Test Scheduler Integration

```python
import asyncio
from app.services.csuite_history_scheduler import CSuiteHistoryScheduler

async def test():
    result = await CSuiteHistoryScheduler.run_once()
    print(f"Processed {result['firmas']} companies")
    print(f"Wrote {result['written']} snapshots")

asyncio.run(test())
```

### 3. Check Stored Data

```python
from app.services.csuite_history_service import CSuiteHistoryService

# Get history for a specific company
history = CSuiteHistoryService.get_company_history(firma="FIRMA A", limit=1)
print(history['weeks'][-1]['tedarikci_kapasite_analizi']['Talaşlı İmalat'])
```

Expected output:
```json
{
  "firma": "FIRMA A",
  "weeks": [
    {
      "week": "2026-W11",
      "tedarikci_kapasite_analizi": {
        "Talaşlı İmalat": 85,  // From MES
        "Kablaj/EMM": 0,       // Under construction (placeholder)
        "Kart Dizgi": 0        // Under construction (placeholder)
      }
    }
  ]
}
```

## Under Construction Categories

### Kablaj/EMM and Kart Dizgi

These categories are currently **under construction** and not yet available:

- **Current behavior**: Both categories default to `0` for all companies
- **Data structure**: Still included in the JSON output for consistency
- **Frontend display**: Will show 0% capacity until data sources are ready
- **Future implementation**: Add data sources in the scheduler when available

To add data sources later:

```python
# Example: When Kablaj/EMM data becomes available
kablaj_rows = await session.execute(
    text("SELECT firma, value FROM your_kablaj_source")
)
for row in kablaj_rows.all():
    per_firma_tedarikci.setdefault(row[0], {})["Kablaj/EMM"] = row[1]
```

## Benefits

✅ **Real-time Data**: Talaşlı İmalat data comes directly from MES production system  
✅ **Accurate Metrics**: Machine occupancy rates reflect actual production planning  
✅ **Fault Tolerant**: MES failures don't break the scheduler  
✅ **Future Ready**: Easy to add Kablaj/EMM and Kart Dizgi data sources when ready  
✅ **Consistent Structure**: All three categories always present in output (0 for pending ones)  

## Migration Notes

### If MES Function Is Not Available

If the MES function doesn't exist yet, the scheduler will:
1. Log a warning
2. Skip Talaşlı İmalat data for that tick
3. Continue processing other categories normally

You can create a temporary placeholder function:

```sql
CREATE OR REPLACE FUNCTION mes_production.get_firma_makina_planlanan_doluluk()
RETURNS TABLE (
    "Firma Adı" TEXT,
    "Aylık Planlanan Doluluk Oranı" NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Temporary placeholder - replace with real MES logic
    RETURN QUERY
    SELECT 
        firma AS "Firma Adı",
        value::numeric AS "Aylık Planlanan Doluluk Oranı"
    FROM csuite.tedarikci_kapasite
    WHERE name = 'Talaşlı İmalat';
END;
$$;
```

### Rollback to Old Behavior

If you need to revert to using only the CSuite table:

```python
# In csuite_history_scheduler.py, replace the MES query section with:
tedarikci_rows = await session.execute(
    text(
        """
        SELECT firma, name, value
        FROM csuite.tedarikci_kapasite
        ORDER BY firma, id
        """
    )
)
```

## Architecture Diagram

```
┌──────────────────────────────┐
│  CSuite History Scheduler    │
└──────────────┬───────────────┘
               │
               │
               ▼
    ┌──────────────────────────┐
    │  MES Production Function │
    ├──────────────────────────┤
    │ Talaşlı İmalat           │
    │ (Real-time MES data)     │
    └──────────────────────────┘
               │
               │
    ┌──────────┴──────────────────┐
    │ Kablaj/EMM = 0              │
    │ Kart Dizgi = 0              │
    │ (Under Construction)        │
    └─────────────────────────────┘
               │
               ▼
    ┌──────────────────────────┐
    │  JSON History File       │
    │  Storage                 │
    └──────────────────────────┘
```

## Performance Considerations

- **MES Function Call**: Executed once per scheduler tick (default: every 6 hours)
- **Caching**: Session maker is cached to avoid repeated platform config lookups
- **Parallel Queries**: MES and CSuite queries could be parallelized in future optimizations
- **Error Recovery**: MES failures don't impact CSuite table queries

## Future Enhancements

Potential improvements:
1. **Parallel Queries**: Fetch MES and CSuite data concurrently
2. **Caching**: Cache MES results for a short period to reduce database load
3. **Multiple MES Sources**: Support different MES functions for other categories
4. **Alerting**: Send notifications when MES data is unavailable
5. **Metrics**: Track MES query performance and success rates
