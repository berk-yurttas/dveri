# Platform Database Configuration Guide

This guide shows how to configure different database types for each platform in the multi-tenant system.

## Database Types Supported

- **ClickHouse** - Default, high-performance columnar database
- **Microsoft SQL Server (MSSQL)** - Enterprise relational database
- **PostgreSQL** - Open-source relational database

## Configuration Format

Each platform's database configuration is stored in the `db_config` JSONB field of the `platforms` table.

---

## Example Configurations

### 1. ClickHouse Configuration

```json
{
  "host": "localhost",
  "port": 9000,
  "database": "deriniz_data",
  "user": "default",
  "password": "your_password",
  "settings": {
    "max_execution_time": 300,
    "send_progress_in_http_headers": 1
  }
}
```

**OR using connection string:**

```json
{
  "connection_string": "clickhouse://default:password@localhost:9000/deriniz_data"
}
```

---

### 2. Microsoft SQL Server (MSSQL) Configuration

```json
{
  "host": "localhost",
  "port": 1433,
  "database": "app2_data",
  "user": "sa",
  "password": "your_password",
  "driver": "ODBC Driver 17 for SQL Server"
}
```

**OR using connection string:**

```json
{
  "connection_string": "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost,1433;DATABASE=app2_data;UID=sa;PWD=your_password"
}
```

**Available ODBC Drivers:**
- `ODBC Driver 17 for SQL Server` (recommended)
- `ODBC Driver 18 for SQL Server`
- `SQL Server Native Client 11.0`

---

### 3. PostgreSQL Configuration

```json
{
  "host": "localhost",
  "port": 5432,
  "database": "app3_data",
  "user": "postgres",
  "password": "your_password"
}
```

**OR using connection string:**

```json
{
  "connection_string": "postgresql://postgres:password@localhost:5432/app3_data"
}
```

---

## Sample Platform Records

### Insert Platforms with Different Database Types

```sql
-- Platform 1: DerinIZ with ClickHouse
INSERT INTO platforms (
  code, name, display_name, db_type, db_config, logo_url, theme_config, is_active
) VALUES (
  'deriniz',
  'DerinIZ',
  'DerinIZ Platform',
  'clickhouse',
  '{
    "host": "localhost",
    "port": 9000,
    "database": "deriniz_data",
    "user": "default",
    "password": "your_password"
  }',
  '/logos/deriniz.png',
  '{
    "primaryColor": "#3B82F6",
    "secondaryColor": "#8B5CF6",
    "accentColor": "#10B981"
  }',
  true
);

-- Platform 2: App2 with MSSQL
INSERT INTO platforms (
  code, name, display_name, db_type, db_config, logo_url, theme_config, is_active
) VALUES (
  'app2',
  'App2',
  'Application 2',
  'mssql',
  '{
    "host": "mssql-server",
    "port": 1433,
    "database": "app2_data",
    "user": "sa",
    "password": "your_password",
    "driver": "ODBC Driver 17 for SQL Server"
  }',
  '/logos/app2.png',
  '{
    "primaryColor": "#10B981",
    "secondaryColor": "#059669",
    "accentColor": "#F59E0B"
  }',
  true
);

-- Platform 3: App3 with PostgreSQL
INSERT INTO platforms (
  code, name, display_name, db_type, db_config, logo_url, theme_config, is_active
) VALUES (
  'app3',
  'App3',
  'Application 3',
  'postgresql',
  '{
    "host": "postgres-server",
    "port": 5432,
    "database": "app3_data",
    "user": "postgres",
    "password": "your_password"
  }',
  '/logos/app3.png',
  '{
    "primaryColor": "#EF4444",
    "secondaryColor": "#DC2626",
    "accentColor": "#F59E0B"
  }',
  true
);

-- Platform 4: App4 with ClickHouse (different database)
INSERT INTO platforms (
  code, name, display_name, db_type, db_config, logo_url, theme_config, is_active
) VALUES (
  'app4',
  'App4',
  'Application 4',
  'clickhouse',
  '{
    "host": "localhost",
    "port": 9000,
    "database": "app4_data",
    "user": "default",
    "password": "your_password"
  }',
  '/logos/app4.png',
  '{
    "primaryColor": "#8B5CF6",
    "secondaryColor": "#7C3AED",
    "accentColor": "#EC4899"
  }',
  true
);
```

---

## Usage in Code

### Using DatabaseConnectionFactory

```python
from app.core.platform_db import DatabaseConnectionFactory
from app.models.postgres_models import Platform

# Get platform from database
platform = db.query(Platform).filter(Platform.code == "deriniz").first()

# Execute query regardless of database type
result = DatabaseConnectionFactory.execute_query(
    platform=platform,
    query="SELECT * FROM measurements WHERE date >= %(start_date)s",
    params={"start_date": "2024-01-01"}
)

# Result format is the same for all database types
columns = result["columns"]  # ["id", "name", "value", ...]
data = result["data"]        # [[1, "test", 100], ...]
row_count = result["row_count"]  # 150
```

### Using FastAPI Dependency

```python
from fastapi import APIRouter, Depends
from app.core.platform_db import get_platform_db_client
from app.models.postgres_models import Platform

router = APIRouter()

@router.get("/data")
async def get_data(
    platform: Platform = Depends(get_current_platform),
    db_client = Depends(get_platform_db_client)
):
    # db_client is automatically the correct type based on platform
    # (ClickHouse Client, pyodbc Connection, or psycopg2 Connection)
    
    if platform.db_type == "clickhouse":
        result = db_client.execute("SELECT * FROM table")
    elif platform.db_type == "mssql":
        cursor = db_client.cursor()
        cursor.execute("SELECT * FROM table")
        result = cursor.fetchall()
    elif platform.db_type == "postgresql":
        cursor = db_client.cursor()
        cursor.execute("SELECT * FROM table")
        result = cursor.fetchall()
    
    return result
```

---

## Environment Variables (Optional)

You can also use environment variables for default configurations:

```env
# Default ClickHouse
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=9000
CLICKHOUSE_DB=default
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# Default MSSQL
MSSQL_HOST=localhost
MSSQL_PORT=1433
MSSQL_USER=sa
MSSQL_PASSWORD=your_password

# Default PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
```

---

## Security Best Practices

1. **Never commit passwords** to version control
2. **Use environment variables** for sensitive credentials
3. **Encrypt db_config** field if storing passwords directly
4. **Use connection pooling** for production environments
5. **Implement query timeouts** to prevent long-running queries
6. **Use read-only users** where possible
7. **Validate and sanitize** all user inputs in SQL queries
8. **Use parameterized queries** to prevent SQL injection

---

## Migration Notes

When migrating existing data:

1. Create the platforms table with the migration
2. Insert platform records with appropriate configurations
3. Update existing dashboards and reports with `platform_id`
4. Test database connections for each platform
5. Verify queries work with the new multi-database system

---

## Troubleshooting

### ClickHouse Connection Issues
- Check if port 9000 is accessible
- Verify user has permissions to database
- Check firewall settings

### MSSQL Connection Issues
- Install ODBC Driver: https://docs.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server
- Check SQL Server authentication mode (Windows vs SQL Server)
- Verify TCP/IP protocol is enabled in SQL Server Configuration Manager

### PostgreSQL Connection Issues
- Verify pg_hba.conf allows connections from your IP
- Check if password authentication is enabled
- Ensure PostgreSQL service is running

---

## Performance Considerations

- **ClickHouse**: Best for analytical queries, time-series data, large datasets
- **MSSQL**: Good for transactional workloads, complex joins, stored procedures
- **PostgreSQL**: Excellent for mixed workloads, JSON data, full-text search

Choose the appropriate database type based on your platform's data patterns and query requirements.

