# Reports Multi-Database Usage Examples

## Scenario 1: Creating a Report for PostgreSQL Database

### Step 1: Create a Platform with PostgreSQL Configuration

```python
# Platform with PostgreSQL database
platform = Platform(
    code="app1",
    name="Application 1",
    display_name="App 1",
    db_type="postgresql",  # Specify PostgreSQL
    db_config={
        "host": "postgres.example.com",
        "port": 5432,
        "database": "app1_db",
        "user": "app1_user",
        "password": "secure_password"
    },
    is_active=True
)
```

### Step 2: Create a Report Associated with the Platform

```python
# Create report with platform_id
report_data = ReportCreate(
    name="PostgreSQL Test Results Report",
    description="Test results from PostgreSQL database",
    is_public=False,
    queries=[
        QueryConfigCreate(
            name="Test Results",
            sql="""
                SELECT 
                    product_code,
                    serial_number,
                    test_name,
                    test_result,
                    test_date
                FROM test_results
                WHERE DATE(test_date) >= DATE('2025-01-01')
                {{dynamic_filters}}
                ORDER BY test_date DESC
            """,
            visualization=VisualizationConfig(
                type="table",
                title="Test Results"
            ),
            filters=[
                FilterConfigCreate(
                    field_name="test_date",
                    display_name="Test Date",
                    type="date",
                    required=False
                ),
                FilterConfigCreate(
                    field_name="product_code",
                    display_name="Product",
                    type="dropdown",
                    dropdown_query="SELECT DISTINCT product_code, product_name FROM products ORDER BY product_name",
                    required=False
                )
            ]
        )
    ]
)

# Associate report with platform
report = await service.create_report(report_data, username="admin")
await db.execute(
    update(Report)
    .where(Report.id == report.id)
    .values(platform_id=platform.id)
)
```

### Step 3: Execute the Report

```python
# Execute the report - it will automatically use PostgreSQL
request = ReportExecutionRequest(
    report_id=report.id,
    filters=[
        FilterValue(
            field_name="test_date",
            value=["2025-01-01", "2025-03-31"],
            operator="BETWEEN"
        )
    ],
    page_size=50,
    page_limit=1,
    sort_by="test_date",
    sort_direction="desc"
)

# The service will:
# 1. Load the report with platform relationship
# 2. Detect db_type = "postgresql"
# 3. Use DatabaseConnectionFactory.get_postgresql_connection(platform)
# 4. Execute query with PostgreSQL-specific syntax (DATE() instead of toDate())
response = await service.execute_report(request, username="admin")
```

## Scenario 2: Creating a Report for MSSQL Database

### Step 1: Create a Platform with MSSQL Configuration

```python
platform = Platform(
    code="app2",
    name="Application 2",
    display_name="App 2",
    db_type="mssql",  # Specify MSSQL
    db_config={
        "host": "mssql.example.com",
        "port": 1433,
        "database": "app2_db",
        "user": "app2_user",
        "password": "secure_password",
        "driver": "ODBC Driver 17 for SQL Server"
    },
    is_active=True
)
```

### Step 2: Create Report with MSSQL-Compatible SQL

```python
report_data = ReportCreate(
    name="MSSQL Performance Report",
    description="Performance metrics from MSSQL",
    queries=[
        QueryConfigCreate(
            name="Top Products by Tests",
            sql="""
                SELECT 
                    product_code,
                    product_name,
                    COUNT(*) as test_count,
                    SUM(CASE WHEN test_result = 'PASS' THEN 1 ELSE 0 END) as pass_count
                FROM test_results
                WHERE DATE(test_date) >= DATE('2025-01-01')
                {{dynamic_filters}}
                GROUP BY product_code, product_name
                ORDER BY test_count DESC
            """,
            visualization=VisualizationConfig(
                type="bar",
                xAxis="product_name",
                yAxis="test_count",
                title="Tests by Product"
            )
        )
    ]
)
```

### Step 3: Execute with Pagination

```python
# MSSQL will use OFFSET/FETCH syntax automatically
request = ReportExecutionRequest(
    report_id=report.id,
    page_size=20,
    page_limit=2  # Get page 2 (rows 21-40)
)

# Generated SQL for MSSQL:
# SELECT ... OFFSET 20 ROWS FETCH NEXT 20 ROWS ONLY
```

## Scenario 3: Backward Compatibility (ClickHouse without Platform)

### Existing Reports Continue to Work

```python
# Old-style report without platform_id
report = await service.create_report(report_data, username="admin")
# platform_id is None

# Execute still works - uses clickhouse_client fallback
request = ReportExecutionRequest(report_id=report.id)
response = await service.execute_report(request, username="admin")
# Uses self.clickhouse_client automatically
```

## Database-Specific SQL Considerations

### Date Filtering

**ClickHouse:**
```sql
WHERE toDate(test_date) BETWEEN toDate('2025-01-01') AND toDate('2025-03-31')
```

**PostgreSQL/MSSQL:**
```sql
WHERE DATE(test_date) BETWEEN DATE('2025-01-01') AND DATE('2025-03-31')
```

The service automatically converts based on `db_type`.

### Pagination

**ClickHouse/PostgreSQL:**
```sql
SELECT ... LIMIT 50 OFFSET 0
```

**MSSQL:**
```sql
SELECT ... OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY
```

### Result Limits

**ClickHouse/PostgreSQL:**
```sql
SELECT ... LIMIT 1000
```

**MSSQL:**
```sql
SELECT TOP 1000 ...
```

## API Usage from Frontend

### Preview Query with Platform

```typescript
// POST /api/v1/reports/preview
// Include X-Platform-Code header to specify which database to use
const response = await fetch('/api/v1/reports/preview', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'X-Platform-Code': 'app1'  // Specify platform (PostgreSQL, MSSQL, etc.)
  },
  body: JSON.stringify({
    sql_query: "SELECT * FROM test_results WHERE test_date >= '2025-01-01'",
    limit: 100
  })
});

const result = await response.json();
// {
//   "columns": ["product_code", "test_name", "test_result", ...],
//   "data": [["PROD001", "Test A", "PASS", ...], ...],
//   "total_rows": 100,
//   "execution_time_ms": 23.45,
//   "success": true,
//   "message": "Query executed successfully on POSTGRESQL. Retrieved 100 rows."
// }
```

### Validate SQL Syntax with Platform

```typescript
// GET /api/v1/reports/validate-syntax?query=SELECT...
// Include X-Platform-Code header to validate against specific database
const query = encodeURIComponent("SELECT * FROM test_results");
const response = await fetch(
  `/api/v1/reports/validate-syntax?query=${query}`,
  {
    headers: {
      'X-Platform-Code': 'app1'  // Validate for PostgreSQL
    }
  }
);

const result = await response.json();
// {
//   "success": true,
//   "message": "Query syntax is valid for POSTGRESQL",
//   "execution_time_ms": 12.34,
//   "explain_plan": [...]
// }
```

### Execute Report Request

```typescript
// POST /api/v1/reports/execute
const response = await fetch('/api/v1/reports/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    report_id: 123,
    query_id: 456,  // Optional: execute specific query
    filters: [
      {
        field_name: "test_date",
        value: ["2025-01-01", "2025-03-31"],
        operator: "BETWEEN"
      },
      {
        field_name: "product_code",
        value: "PROD001",
        operator: "="
      }
    ],
    page_size: 50,
    page_limit: 1,
    sort_by: "test_date",
    sort_direction: "desc"
  })
});

const result = await response.json();
// {
//   "report_id": 123,
//   "report_name": "Test Results",
//   "results": [
//     {
//       "query_id": 456,
//       "query_name": "Test Results",
//       "columns": ["product_code", "serial_number", "test_name", ...],
//       "data": [
//         ["PROD001", "SN001", "Test A", ...],
//         ["PROD001", "SN002", "Test B", ...]
//       ],
//       "total_rows": 150,
//       "execution_time_ms": 45.23,
//       "success": true,
//       "message": "Query executed successfully. Retrieved 50 rows of 150 total."
//     }
//   ],
//   "total_execution_time_ms": 47.56,
//   "success": true,
//   "message": "Report executed successfully"
// }
```

### Get Filter Options

```typescript
// GET /api/v1/reports/{report_id}/queries/{query_id}/filters/{filter_field}/options
const response = await fetch('/api/v1/reports/123/queries/456/filters/product_code/options');
const options = await response.json();
// [
//   { "value": "PROD001", "label": "Product 1" },
//   { "value": "PROD002", "label": "Product 2" }
// ]
```

## Error Handling Examples

### Platform Not Found
```python
# Report has platform_id but platform was deleted
response = await service.execute_report(request, username="admin")
# Error: "Platform not found for this report"
```

### Unsupported Database Type
```python
# Platform has db_type = "oracle" (not yet supported)
response = await service.execute_report(request, username="admin")
# Error: "Unsupported database type: oracle"
```

### Connection Failure
```python
# Platform has invalid db_config
response = await service.execute_report(request, username="admin")
# Error: "Query execution failed: could not connect to server: Connection refused"
```

## Best Practices

1. **Always set platform_id** for new reports to enable multi-database support
2. **Use {{dynamic_filters}} placeholder** in SQL for filter injection
3. **Use database-agnostic SQL** when possible (standard SQL syntax)
4. **Test queries** on target database before creating reports
5. **Handle errors gracefully** in frontend when queries fail
6. **Use pagination** for large result sets to improve performance
7. **Validate db_config** when creating platforms to ensure connectivity

