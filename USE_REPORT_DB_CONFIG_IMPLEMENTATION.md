# Use Report's Database Configuration Implementation

## Overview
Updated the reports service and API endpoints to use the report's `db_config` field instead of the platform's database configuration. This allows each report to use a specific database from the platform's available database configurations.

## ⚠️ Important Fix Applied
Added `_get_db_connection_from_config()` method to `ReportsService` class to fix the AttributeError when calling filter options endpoint.

## Changes Made

### 1. Backend Service Updates

#### File: `dtbackend/app/services/reports_service.py`

**Added New Helper Method to ReportsService:**
- `_get_db_connection_from_config()`: Creates database connections directly from a db_config dictionary
  - Supports PostgreSQL and MSSQL
  - Takes db_config dict and db_type as parameters
  - Returns a database connection
  - Added to both `ConnectionPool` and `ReportsService` classes for proper access

**Updated `create_report()` Method:**
- Added `db_config=report_data.db_config` when creating new Report instances
- Ensures report's database configuration is saved during creation

**Updated `update_report()` Method:**
- Added logic to update `db_report.db_config` when `report_data.db_config` is provided
- Maintains database configuration during report updates

**Updated `update_report_full()` Method:**
- Added logic to update `db_report.db_config` when `report_data.db_config` is provided
- Ensures full updates also preserve database configuration

**Updated `execute_query()` Method:**
- Added `db_config` parameter to method signature
- Modified database type determination to prioritize `db_config` over `platform`
- Updated PostgreSQL connection logic:
  - First tries to use `db_config` via `_get_db_connection_from_config()`
  - Falls back to platform's connection pool if no `db_config`
  - Properly closes connection if using `db_config` (not pooled)
- Updated MSSQL connection logic:
  - First tries to use `db_config` via `_get_db_connection_from_config()`
  - Falls back to platform's connection via `DatabaseConnectionFactory`
  
**Updated `execute_report()` Method:**
- Added `report_db_config = report.db_config` to extract report's database configuration
- Updated validation logic to check for report db_config before falling back to platform
- Passes `db_config=report_db_config` to all `execute_query()` calls

**Updated `get_filter_options()` Method:**
- Added logic to extract `report_db_config` from the report
- Modified database type determination to prioritize `report_db_config` over `platform`
- Updated PostgreSQL connection logic to use `report_db_config` first
- Updated MSSQL connection logic to use `report_db_config` first
- Properly handles connection cleanup based on connection source

## How It Works

### Priority Order for Database Connections:
1. **Report's `db_config`** (highest priority)
   - If a report has a `db_config` set, it will be used
   - Direct connection created from config (not pooled)
2. **Platform's database configuration** (fallback)
   - Uses platform's connection pool or factory methods
3. **ClickHouse client** (legacy fallback)
   - Only for backward compatibility

### Connection Management:
- **Report db_config connections**: Created on-demand and closed after use
- **Platform connections**: Managed via connection pool (PostgreSQL) or factory (MSSQL)
- Proper cleanup ensures no connection leaks

## Benefits

1. **Per-Report Database Selection**: Each report can now use a different database from the platform's `db_configs` array
2. **Backward Compatibility**: Existing reports without `db_config` will continue to work using platform's default configuration
3. **Flexibility**: Reports can access different databases even within the same platform
4. **Clean Architecture**: Report-specific configuration takes precedence over platform defaults

## Testing

To test the implementation:

1. **Create a platform with multiple database configurations**
2. **Create a report and select a specific database**
3. **Execute the report** - it should connect to the selected database
4. **Test filter dropdowns** - they should also use the report's database
5. **Verify existing reports** - they should continue working with platform defaults

## Example Flow

```python
# Report has db_config selected
report.db_config = {
    "name": "Analytics DB",
    "db_type": "postgresql",
    "host": "analytics.example.com",
    "port": 5432,
    "database": "analytics",
    "user": "reporter",
    "password": "****"
}

# When executing queries, the service will:
# 1. Extract report.db_config
# 2. Create direct connection using this config
# 3. Execute queries against this specific database
# 4. Close connection after use
```

### 2. Backend API Updates

#### File: `dtbackend/app/api/v1/endpoints/reports.py`

**Updated `/preview` Endpoint:**
- Added `db_config` field to `ReportPreviewRequest` schema
- Modified database type determination to prioritize `request.db_config`
- Updated PostgreSQL connection logic to use `request.db_config` if provided
- Updated MSSQL connection logic to use `request.db_config` if provided

**Updated `/validate-syntax` Endpoint:**
- Added `db_config` query parameter (JSON string)
- Parses and uses `db_config` if provided
- Prioritizes `db_config` over platform configuration

#### File: `dtbackend/app/schemas/data.py`

**Updated ReportPreviewRequest Schema:**
- Added `db_config: dict[str, Any] | None = None` field

### 3. Frontend Updates

#### File: `dtfrontend/src/types/reports.ts`

**Updated ReportPreviewRequest Interface:**
- Added `db_config?: Record<string, any> | null` field

#### File: `dtfrontend/src/app/[platform]/reports/[id]/edit/page.tsx`

**Updated Preview Query Calls:**
- Now passes `db_config: report.dbConfig || null` to preview requests

#### File: `dtfrontend/src/app/[platform]/reports/add/page.tsx`

**Updated Preview Query Calls:**
- Now passes `db_config: report.dbConfig || null` to preview requests

#### File: `dtfrontend/src/app/[platform]/reports/[id]/page.tsx`

**Updated ReportData Interface:**
- Added `dbConfig?: Record<string, any> | null` field

**Updated Nested Query Preview:**
- Now passes `db_config: report?.dbConfig || null` to preview requests

## Notes

- The implementation maintains backward compatibility with existing reports
- Connection pooling is only used for platform-level connections
- Report-level connections are created fresh each time (simple approach, can be optimized later if needed)
- All database types (ClickHouse, PostgreSQL, MSSQL) are supported
- Preview and validation endpoints now support custom database configurations

