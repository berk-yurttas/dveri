# Database Selection for Reports - Implementation Summary

## Overview
This document describes the implementation of database selection functionality for reports. Reports can now select a specific database configuration from the platform's available databases, allowing each report to use a different database connection.

## Changes Summary

### Backend Changes

#### 1. Database Model (`dtbackend/app/models/postgres_models.py`)
- Added `db_config` field (JSONB type) to the `Report` model
- Stores the selected database configuration from the platform's `db_configs` array
- Example structure:
  ```json
  {
    "name": "Primary Database",
    "db_type": "clickhouse",
    "host": "localhost",
    "port": 9000,
    "database": "dt_report",
    "user": "default",
    "password": "ClickHouse@2024"
  }
  ```

#### 2. Schemas (`dtbackend/app/schemas/reports.py`)
- Added `db_config` field to `ReportBase`, `ReportUpdate`, `ReportFullUpdate`, and `ReportList` schemas
- Uses `Field(None, alias="dbConfig")` for proper camelCase JSON serialization
- Type: `dict[str, Any] | None`

#### 3. Database Migration (`dtbackend/alembic/versions/add_db_config_to_reports.py`)
- **Revision ID**: `add_db_config_002`
- **Depends on**: `add_db_configs_001` (platform db_configs migration)
- **Actions**:
  - Adds `db_config` column (JSONB) to `reports` table
  - Migrates existing reports to use platform's first `db_config` from `db_configs` array
  - Falls back to legacy `db_config` if platform doesn't have `db_configs`
  - Handles null values for reports without platform association

**Migration SQL Logic**:
```sql
UPDATE reports r
SET db_config = (
    SELECT CASE
        -- If platform has db_configs array with items, use the first one
        WHEN p.db_configs IS NOT NULL AND jsonb_array_length(p.db_configs) > 0 THEN
            p.db_configs->0
        -- Otherwise, build from legacy db_type and db_config
        WHEN p.db_config IS NOT NULL THEN
            jsonb_build_object(...)
        ELSE NULL
    END
    FROM platforms p
    WHERE p.id = r.platform_id
)
WHERE r.platform_id IS NOT NULL
```

### Frontend Changes

#### 1. TypeScript Types (`dtfrontend/src/types/reports.ts`)
- Added `DatabaseConfig` interface:
  ```typescript
  export interface DatabaseConfig {
    name: string
    db_type: string
    host: string
    port: number
    database: string
    user: string
    password: string
    driver?: string
    connection_string?: string
  }
  ```
- Added `dbConfig?: DatabaseConfig` to:
  - `ReportConfig`
  - `SavedReport`
  - `ReportDetail`

#### 2. Add Report Page (`dtfrontend/src/app/[platform]/reports/add/page.tsx`)
**New Features**:
- Fetches platform data using `platformService.getPlatformByCode(platformCode)`
- Loads available databases from `platform.db_configs`
- Auto-selects default database (marked with `is_default: true`) or first available
- Displays database selection dropdown in Report Basic Info section

**State Management**:
```typescript
const [platform, setPlatform] = useState<Platform | null>(null)
const [availableDatabases, setAvailableDatabases] = useState<DatabaseConfig[]>([])
const [selectedDbName, setSelectedDbName] = useState<string>('')
```

**UI Component**:
```tsx
{!report.isDirectLink && availableDatabases.length > 0 && (
  <div className="space-y-2">
    <Label htmlFor="databaseSelect" className="text-sm">
      Veritabanı Seçimi *
    </Label>
    <Select
      id="databaseSelect"
      value={selectedDbName}
      onValueChange={(value) => {
        setSelectedDbName(value)
        const selectedDb = availableDatabases.find(db => db.name === value)
        if (selectedDb) {
          setReport(prev => ({ ...prev, dbConfig: selectedDb }))
        }
      }}
    >
      {availableDatabases.map((db) => (
        <option key={db.name} value={db.name}>
          {db.name} ({db.db_type})
        </option>
      ))}
    </Select>
  </div>
)}
```

#### 3. Edit Report Page (`dtfrontend/src/app/[platform]/reports/[id]/edit/page.tsx`)
**New Features**:
- Fetches platform data on component mount
- Loads report's existing `dbConfig` and sets selected database
- Allows changing database selection
- Same UI component as add page

**Load Report Logic**:
```typescript
const convertedReport: ReportConfig & { layoutConfig?: any[] } = {
  // ... other fields
  dbConfig: (reportData as any).dbConfig,  // Preserve the database configuration
  // ... queries
}

setReport(convertedReport)

// Set the selected database name from the report's db_config
if (convertedReport.dbConfig) {
  setSelectedDbName(convertedReport.dbConfig.name)
}
```

## Key Features

### 1. Database Selection
- Reports can select from multiple database configurations defined at the platform level
- Each report stores its own copy of the database configuration
- Database dropdown shows: `{name} ({db_type})` (e.g., "Primary Database (clickhouse)")

### 2. Backward Compatibility
- Migration handles existing reports by copying platform's database configuration
- Supports both new `db_configs` array and legacy `db_config` field
- Reports without platform association remain unchanged

### 3. Direct Link Reports
- Database selection is hidden for direct link reports (isDirectLink: true)
- Direct link reports don't need database configuration as they redirect to external URLs

### 4. Auto-Selection
- On add page: automatically selects default database or first available
- On edit page: preserves the report's existing database selection

## Usage Flow

### Creating a New Report
1. User navigates to add report page
2. Platform databases are fetched automatically
3. Default database is pre-selected
4. User can change database selection from dropdown
5. Selected database config is saved with the report

### Editing an Existing Report
1. User opens edit report page
2. Report's current database configuration is loaded
3. Database dropdown shows current selection
4. User can change to a different database
5. Updated database config is saved on update

## Migration Steps

To apply the changes:

1. **Run the migration**:
   ```bash
   cd dtbackend
   alembic upgrade head
   ```

2. **Verify migration**:
   - Check that `db_config` column exists in `reports` table
   - Verify existing reports have `db_config` populated from platform
   - Confirm JSONB structure is correct

3. **Test frontend**:
   - Create a new report and verify database selection works
   - Edit an existing report and verify current selection is shown
   - Change database and save to verify update works

## Benefits

1. **Flexibility**: Each report can use a different database from the platform's available connections
2. **Isolation**: Database configuration is stored per-report, allowing independent changes
3. **Multi-Database Support**: Platforms can offer multiple databases (prod, staging, analytics, etc.)
4. **Migration Safety**: Existing reports automatically inherit platform's database configuration
5. **User Experience**: Simple dropdown interface for database selection

## Future Enhancements

Potential improvements:
1. Database connection testing before saving report
2. Visual indicators for database type (icons for ClickHouse, PostgreSQL, MSSQL)
3. Database performance metrics in report execution
4. Ability to override connection parameters per report (e.g., read-only mode)
5. Database usage analytics (which databases are most used by reports)

## Notes

- Reports created before this update will automatically use the platform's default database
- Database passwords are stored in the report's `db_config` (consider encryption in production)
- Database selection is only available for normal reports, not direct link reports
- The database selection affects all queries within the report

