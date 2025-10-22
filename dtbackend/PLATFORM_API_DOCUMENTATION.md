# Platform API Documentation

Complete REST API for managing platforms in the multi-tenant system.

## Base URL

```
http://localhost:8000/api/v1/platforms
```

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/platforms` | List all platforms |
| GET | `/platforms/count` | Get platform count |
| GET | `/platforms/{id}` | Get platform by ID |
| GET | `/platforms/code/{code}` | Get platform by code |
| GET | `/platforms/{id}/stats` | Get platform statistics |
| GET | `/platforms/{id}/with-stats` | Get platform with stats |
| POST | `/platforms` | Create new platform |
| PUT | `/platforms/{id}` | Update platform |
| PATCH | `/platforms/{id}/activate` | Activate platform |
| PATCH | `/platforms/{id}/deactivate` | Deactivate platform |
| DELETE | `/platforms/{id}` | Delete platform |
| POST | `/platforms/{id}/test-connection` | Test database connection |

---

## Authentication

All endpoints require authentication via JWT token in cookies.

---

## 1. List Platforms

Get paginated list of platforms with optional filtering.

**Endpoint:** `GET /platforms`

**Query Parameters:**
- `skip` (int, optional): Number of records to skip (default: 0)
- `limit` (int, optional): Maximum records to return (default: 100, max: 500)
- `include_inactive` (bool, optional): Include inactive platforms (default: false)
- `search` (string, optional): Search by code or name

**Example Request:**
```bash
curl -X GET "http://localhost:8000/api/v1/platforms?limit=10&include_inactive=false" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
[
  {
    "id": 1,
    "code": "deriniz",
    "name": "DerinIZ",
    "display_name": "DerinIZ Platform",
    "description": "Test analysis and reporting platform",
    "db_type": "clickhouse",
    "logo_url": "/logos/deriniz.png",
    "is_active": true,
    "created_at": "2024-01-10T10:00:00Z"
  },
  {
    "id": 2,
    "code": "app2",
    "name": "App2",
    "display_name": "Application 2",
    "description": "Second platform",
    "db_type": "mssql",
    "logo_url": "/logos/app2.png",
    "is_active": true,
    "created_at": "2024-01-10T11:00:00Z"
  }
]
```

---

## 2. Get Platform Count

Get total number of platforms.

**Endpoint:** `GET /platforms/count`

**Query Parameters:**
- `include_inactive` (bool, optional): Include inactive platforms (default: false)

**Example Request:**
```bash
curl -X GET "http://localhost:8000/api/v1/platforms/count?include_inactive=true" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
{
  "total": 4,
  "active_only": false
}
```

---

## 3. Get Platform by ID

Get detailed platform information by ID.

**Endpoint:** `GET /platforms/{platform_id}`

**Path Parameters:**
- `platform_id` (int): Platform ID

**Example Request:**
```bash
curl -X GET "http://localhost:8000/api/v1/platforms/1" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
{
  "id": 1,
  "code": "deriniz",
  "name": "DerinIZ",
  "display_name": "DerinIZ Platform",
  "description": "Test analysis and reporting platform",
  "db_type": "clickhouse",
  "db_config": {
    "host": "localhost",
    "port": 9000,
    "database": "dt_report",
    "user": "default",
    "password": "ClickHouse@2024"
  },
  "logo_url": "/logos/deriniz.png",
  "theme_config": {
    "primaryColor": "#3B82F6",
    "secondaryColor": "#8B5CF6"
  },
  "is_active": true,
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": null
}
```

---

## 4. Get Platform by Code

Get platform by its unique code.

**Endpoint:** `GET /platforms/code/{platform_code}`

**Path Parameters:**
- `platform_code` (string): Platform code (e.g., 'deriniz', 'app2')

**Example Request:**
```bash
curl -X GET "http://localhost:8000/api/v1/platforms/code/deriniz" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
{
  "id": 1,
  "code": "deriniz",
  "name": "DerinIZ",
  "display_name": "DerinIZ Platform",
  "description": "Test analysis and reporting platform",
  "db_type": "clickhouse",
  "db_config": {...},
  "logo_url": "/logos/deriniz.png",
  "theme_config": {...},
  "is_active": true,
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": null
}
```

---

## 5. Get Platform Statistics

Get platform statistics including dashboard, report, and user counts.

**Endpoint:** `GET /platforms/{platform_id}/stats`

**Path Parameters:**
- `platform_id` (int): Platform ID

**Example Request:**
```bash
curl -X GET "http://localhost:8000/api/v1/platforms/1/stats" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
{
  "platform_id": 1,
  "platform_code": "deriniz",
  "platform_name": "DerinIZ",
  "dashboard_count": 15,
  "report_count": 8,
  "user_count": 25
}
```

---

## 6. Get Platform with Statistics

Get platform details combined with statistics.

**Endpoint:** `GET /platforms/{platform_id}/with-stats`

**Path Parameters:**
- `platform_id` (int): Platform ID

**Example Request:**
```bash
curl -X GET "http://localhost:8000/api/v1/platforms/1/with-stats" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
{
  "id": 1,
  "code": "deriniz",
  "name": "DerinIZ",
  "display_name": "DerinIZ Platform",
  "description": "Test analysis and reporting platform",
  "db_type": "clickhouse",
  "db_config": {...},
  "logo_url": "/logos/deriniz.png",
  "theme_config": {...},
  "is_active": true,
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": null,
  "dashboard_count": 15,
  "report_count": 8,
  "user_count": 25
}
```

---

## 7. Create Platform

Create a new platform.

**Endpoint:** `POST /platforms`

**Request Body:**
```json
{
  "code": "app5",
  "name": "Application 5",
  "display_name": "Fifth Platform",
  "description": "Fifth platform description",
  "db_type": "postgresql",
  "db_config": {
    "host": "localhost",
    "port": 5432,
    "database": "app5_data",
    "user": "postgres",
    "password": "password"
  },
  "logo_url": "/logos/app5.png",
  "theme_config": {
    "primaryColor": "#10B981",
    "secondaryColor": "#059669"
  },
  "is_active": true
}
```

**Required Fields:**
- `code`: Unique platform code (alphanumeric, lowercase)
- `name`: Platform name
- `display_name`: Display name for UI
- `db_type`: Database type (`clickhouse`, `mssql`, or `postgresql`)

**Optional Fields:**
- `description`: Platform description
- `db_config`: Database connection configuration
- `logo_url`: URL to platform logo
- `theme_config`: Theme configuration
- `is_active`: Active status (default: true)

**Example Request:**
```bash
curl -X POST "http://localhost:8000/api/v1/platforms" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "app5",
    "name": "Application 5",
    "display_name": "Fifth Platform",
    "db_type": "postgresql",
    "db_config": {
      "host": "localhost",
      "port": 5432,
      "database": "app5_data",
      "user": "postgres",
      "password": "password"
    }
  }'
```

**Example Response (201 Created):**
```json
{
  "id": 5,
  "code": "app5",
  "name": "Application 5",
  "display_name": "Fifth Platform",
  "description": null,
  "db_type": "postgresql",
  "db_config": {...},
  "logo_url": null,
  "theme_config": null,
  "is_active": true,
  "created_at": "2024-01-10T15:30:00Z",
  "updated_at": null
}
```

**Error Response (400):**
```json
{
  "detail": "Platform with code 'app5' already exists"
}
```

---

## 8. Update Platform

Update platform information.

**Endpoint:** `PUT /platforms/{platform_id}`

**Path Parameters:**
- `platform_id` (int): Platform ID

**Request Body (all fields optional):**
```json
{
  "name": "Updated Name",
  "display_name": "Updated Display Name",
  "description": "Updated description",
  "db_type": "mssql",
  "db_config": {...},
  "logo_url": "/new-logo.png",
  "theme_config": {...},
  "is_active": false
}
```

**Example Request:**
```bash
curl -X PUT "http://localhost:8000/api/v1/platforms/1" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated platform description",
    "theme_config": {
      "primaryColor": "#EF4444",
      "secondaryColor": "#DC2626"
    }
  }'
```

**Example Response:**
```json
{
  "id": 1,
  "code": "deriniz",
  "name": "DerinIZ",
  "display_name": "DerinIZ Platform",
  "description": "Updated platform description",
  "db_type": "clickhouse",
  "db_config": {...},
  "logo_url": "/logos/deriniz.png",
  "theme_config": {
    "primaryColor": "#EF4444",
    "secondaryColor": "#DC2626"
  },
  "is_active": true,
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": "2024-01-10T16:00:00Z"
}
```

---

## 9. Activate Platform

Activate a platform (set is_active = true).

**Endpoint:** `PATCH /platforms/{platform_id}/activate`

**Path Parameters:**
- `platform_id` (int): Platform ID

**Example Request:**
```bash
curl -X PATCH "http://localhost:8000/api/v1/platforms/1/activate" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
{
  "id": 1,
  "code": "deriniz",
  "name": "DerinIZ",
  "display_name": "DerinIZ Platform",
  "description": "...",
  "db_type": "clickhouse",
  "is_active": true,
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": "2024-01-10T16:10:00Z"
}
```

---

## 10. Deactivate Platform

Deactivate a platform (set is_active = false).

**Endpoint:** `PATCH /platforms/{platform_id}/deactivate`

**Path Parameters:**
- `platform_id` (int): Platform ID

**Example Request:**
```bash
curl -X PATCH "http://localhost:8000/api/v1/platforms/1/deactivate" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
{
  "id": 1,
  "code": "deriniz",
  "name": "DerinIZ",
  "display_name": "DerinIZ Platform",
  "description": "...",
  "db_type": "clickhouse",
  "is_active": false,
  "created_at": "2024-01-10T10:00:00Z",
  "updated_at": "2024-01-10T16:15:00Z"
}
```

---

## 11. Delete Platform

Delete platform (soft or hard delete).

**Endpoint:** `DELETE /platforms/{platform_id}`

**Path Parameters:**
- `platform_id` (int): Platform ID

**Query Parameters:**
- `hard_delete` (bool, optional): If true, permanently delete. If false (default), deactivate.

**Soft Delete (Default):**
```bash
curl -X DELETE "http://localhost:8000/api/v1/platforms/1?hard_delete=false" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Hard Delete:**
```bash
curl -X DELETE "http://localhost:8000/api/v1/platforms/1?hard_delete=true" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Example Response:**
```json
{
  "success": true,
  "message": "Platform deactivated successfully",
  "platform_id": 1,
  "hard_delete": false
}
```

**Error Response (Hard Delete with Data):**
```json
{
  "detail": "Cannot delete platform with existing dashboards. Use soft delete instead."
}
```

---

## 12. Test Platform Connection

Test database connection for a platform.

**Endpoint:** `POST /platforms/{platform_id}/test-connection`

**Path Parameters:**
- `platform_id` (int): Platform ID

**Example Request:**
```bash
curl -X POST "http://localhost:8000/api/v1/platforms/1/test-connection" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Success Response:**
```json
{
  "success": true,
  "message": "Successfully connected to clickhouse database",
  "connection_time_ms": 45.23,
  "error": null
}
```

**Failure Response:**
```json
{
  "success": false,
  "message": "Failed to connect to clickhouse database",
  "connection_time_ms": null,
  "error": "Connection refused: localhost:9000"
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "detail": "Platform with code 'deriniz' already exists"
}
```

### 401 Unauthorized
```json
{
  "detail": "Not authenticated"
}
```

### 404 Not Found
```json
{
  "detail": "Platform not found"
}
```

### 422 Validation Error
```json
{
  "detail": [
    {
      "loc": ["body", "db_type"],
      "msg": "Database type must be one of: clickhouse, mssql, postgresql",
      "type": "value_error"
    }
  ]
}
```

---

## Database Configuration Examples

### ClickHouse
```json
{
  "host": "localhost",
  "port": 9000,
  "database": "dt_report",
  "user": "default",
  "password": "ClickHouse@2024"
}
```

### MSSQL
```json
{
  "host": "localhost",
  "port": 1433,
  "database": "app2_data",
  "user": "sa",
  "password": "password",
  "driver": "ODBC Driver 17 for SQL Server"
}
```

### PostgreSQL
```json
{
  "host": "localhost",
  "port": 5432,
  "database": "app3_data",
  "user": "postgres",
  "password": "password"
}
```

---

## Usage in Frontend

```typescript
import { api } from '@/lib/api'

// Get all platforms
const platforms = await api.get('/platforms')

// Get specific platform
const platform = await api.get('/platforms/1')

// Get platform by code
const platform = await api.get('/platforms/code/deriniz')

// Create platform
const newPlatform = await api.post('/platforms', {
  code: 'app5',
  name: 'Application 5',
  display_name: 'Fifth Platform',
  db_type: 'postgresql',
  db_config: {...}
})

// Update platform
const updated = await api.put('/platforms/1', {
  description: 'Updated description'
})

// Delete platform (soft delete)
await api.delete('/platforms/1?hard_delete=false')

// Test connection
const result = await api.post('/platforms/1/test-connection')
```

---

## Swagger/OpenAPI Documentation

Interactive API documentation available at:
```
http://localhost:8000/api/v1/docs
```

---

## Files Created

- ✅ `app/schemas/platform.py` - Pydantic schemas
- ✅ `app/services/platform_service.py` - Business logic
- ✅ `app/api/v1/endpoints/platforms.py` - API endpoints
- ✅ `app/api/v1/api.py` - Router registration (updated)

---

## Testing

```bash
# Run FastAPI server
cd dtbackend
python main.py

# Visit Swagger docs
open http://localhost:8000/api/v1/docs

# Test endpoints
curl http://localhost:8000/api/v1/platforms
```

---

## Next Steps

1. **Create Database Migration** for Platform table (if not done)
2. **Seed Initial Platforms** with sample data
3. **Add Frontend UI** for platform management
4. **Implement User-Platform Access Control** with UserPlatform table
5. **Add Platform Theme Loading** in frontend
6. **Create Platform Admin Dashboard** for management

The Platform API is now complete and ready to use! 🎉

