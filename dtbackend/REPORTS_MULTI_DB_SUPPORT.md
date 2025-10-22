# Reports Multi-Database Support

## Overview
The Reports Service has been enhanced to support multiple database types based on the platform's configuration. Previously, the service only supported ClickHouse databases. Now it supports:
- **ClickHouse** (existing)
- **PostgreSQL** (new)
- **MSSQL** (new)

## Changes Made

### 1. Import Updates

**File:** `dtbackend/app/services/reports_service.py`

Added imports for:
- `Platform` model from `app.models.postgres_models`
- `DatabaseConnectionFactory` from `app.core.platform_db`

**File:** `dtbackend/app/api/v1/endpoints/reports.py`

Added imports for:
- `get_optional_platform` from `app.core.platform_middleware`
- `DatabaseConnectionFactory` from `app.core.platform_db`

### 2. Filter Application Enhancement
**Method:** `apply_filters_to_query()`

- Added `db_type` parameter to support database-specific SQL syntax
- Implemented database-specific date functions:
  - ClickHouse: `toDate()`
  - PostgreSQL/MSSQL: `DATE()`
- Maintains backward compatibility with default `db_type="clickhouse"`

**Usage:**
```python
sql = self.apply_filters_to_query(
    sql, 
    query.filters, 
    filter_values, 
    db_type="postgresql"  # or "clickhouse", "mssql"
)
```

### 3. Query Execution Enhancement
**Method:** `execute_query()`

- Added optional `platform` parameter
- Auto-detects database type from platform's `db_type` field
- Implements database-specific query execution logic:
  - **ClickHouse**: Uses existing `clickhouse_driver.Client`
  - **PostgreSQL**: Uses `psycopg2` connection via `DatabaseConnectionFactory`
  - **MSSQL**: Uses `pyodbc` connection via `DatabaseConnectionFactory`
- Handles pagination for all database types
- Implements database-specific pagination:
  - ClickHouse/PostgreSQL: `LIMIT x OFFSET y`
  - MSSQL: `OFFSET x ROWS FETCH NEXT y ROWS ONLY`
- Implements database-specific limits:
  - ClickHouse/PostgreSQL: `LIMIT x`
  - MSSQL: `SELECT TOP x`
- Falls back to ClickHouse client if no platform is provided (backward compatibility)

**Usage:**
```python
result = self.execute_query(
    query=query,
    filter_values=filters,
    platform=platform  # Platform instance with db_type and db_config
)
```

### 4. Report Execution Enhancement
**Method:** `execute_report()`

- Loads platform relationship when fetching report
- Passes platform to `execute_query()` for each query execution
- Validates database connection availability (either platform or clickhouse_client)

**Changes:**
```python
# Before
report = await self.get_report(request.report_id, username)

# After
stmt = select(Report).options(
    selectinload(Report.queries).selectinload(ReportQuery.filters),
    selectinload(Report.platform)  # NEW: Load platform relationship
).where(...)
```

### 5. Filter Options Enhancement
**Method:** `get_filter_options()`

- Loads platform relationship when fetching filter
- Executes dropdown queries based on platform's database type
- Supports all database types (ClickHouse, PostgreSQL, MSSQL)

### 6. Preview Query Endpoint Enhancement
**Endpoint:** `POST /api/v1/reports/preview`

- Added `platform` parameter via `get_optional_platform` dependency
- Detects database type from platform configuration
- Implements database-specific query execution and LIMIT syntax
- Falls back to ClickHouse if no platform is provided
- Returns success message indicating which database type was used

**Changes:**
```python
# Before
async def preview_report_query(
    request: ReportPreviewRequest,
    db_client: Client = Depends(get_clickhouse_db)
)

# After
async def preview_report_query(
    request: ReportPreviewRequest,
    platform: Optional[Platform] = Depends(get_optional_platform),
    db_client: Client = Depends(get_clickhouse_db)
)
```

### 7. Validate SQL Syntax Endpoint Enhancement
**Endpoint:** `GET /api/v1/reports/validate-syntax`

- Added `platform` parameter via `get_optional_platform` dependency
- Supports database-specific EXPLAIN commands:
  - **ClickHouse**: `EXPLAIN query`
  - **PostgreSQL**: `EXPLAIN query`
  - **MSSQL**: `SET SHOWPLAN_TEXT ON` / query / `SET SHOWPLAN_TEXT OFF`
- Falls back to ClickHouse if no platform is provided

**Changes:**
```python
# Before
async def validate_sql_syntax(
    query: str = Query(..., description="SQL query to validate"),
    db_client: Client = Depends(get_clickhouse_db)
)

# After
async def validate_sql_syntax(
    query: str = Query(..., description="SQL query to validate"),
    platform: Optional[Platform] = Depends(get_optional_platform),
    db_client: Client = Depends(get_clickhouse_db)
)
```

## Database Type Detection

The system determines which database to use based on:

1. **Platform Configuration** (primary):
   - Each Report has a `platform_id` that references a Platform
   - Each Platform has a `db_type` field: `'clickhouse'`, `'postgresql'`, or `'mssql'`
   - Each Platform has a `db_config` JSON field with connection details

2. **Fallback** (backward compatibility):
   - If no platform is configured, falls back to `clickhouse_client`
   - Maintains compatibility with existing reports without platforms

## Example Platform Configuration

```json
{
  "platform_id": 1,
  "db_type": "postgresql",
  "db_config": {
    "host": "localhost",
    "port": 5432,
    "database": "mydb",
    "user": "postgres",
    "password": "password"
  }
}
```

## SQL Syntax Differences Handled

### Date Functions
- **ClickHouse**: `toDate(field_name)`
- **PostgreSQL/MSSQL**: `DATE(field_name)`

### Pagination
- **ClickHouse/PostgreSQL**: `SELECT ... LIMIT 10 OFFSET 20`
- **MSSQL**: `SELECT ... OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY`

### Result Limits
- **ClickHouse/PostgreSQL**: `SELECT ... LIMIT 10`
- **MSSQL**: `SELECT TOP 10 ...`

## Error Handling

The service properly handles:
- Missing platform configuration
- Unsupported database types
- Connection failures
- Query execution errors
- Maintains detailed error messages for debugging

## Backward Compatibility

✅ **Fully backward compatible**
- Reports without platforms continue to use `clickhouse_client`
- Existing ClickHouse-only workflows remain unchanged
- No breaking changes to API

## Testing Recommendations

1. **ClickHouse Reports** (existing):
   - Verify existing reports continue to work
   - Test with and without platform_id

2. **PostgreSQL Reports** (new):
   - Create report with PostgreSQL platform
   - Test query execution
   - Test pagination
   - Test date filters
   - Test dropdown filters

3. **MSSQL Reports** (new):
   - Create report with MSSQL platform
   - Test query execution
   - Test pagination with OFFSET/FETCH syntax
   - Test TOP clause for limits

## Dependencies

Required Python packages (already in `requirements.txt`):
- `clickhouse-driver` - ClickHouse support
- `psycopg2-binary==2.9.9` - PostgreSQL support
- `pyodbc==5.0.1` - MSSQL support

## Migration Notes

For existing reports:
1. **No action required** - they will continue to work with `clickhouse_client`
2. **Optional**: Associate reports with platforms to use platform-specific databases
3. **Platform Association**: Set `platform_id` on Report to enable multi-database support

## Future Enhancements

Potential improvements:
- Connection pooling for PostgreSQL and MSSQL
- Query caching across database types
- Database-specific query optimization
- Support for additional database types (MySQL, Oracle, etc.)

