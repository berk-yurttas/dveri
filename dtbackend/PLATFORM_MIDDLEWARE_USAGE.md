# Platform Middleware Usage Guide

The Platform Middleware automatically extracts and validates platform context for every request in your multi-tenant application.

## How It Works

The middleware extracts the platform code from multiple sources (in order of priority):

1. **HTTP Header**: `X-Platform-Code: deriniz`
2. **Query Parameter**: `?platform=deriniz`
3. **Subdomain**: `deriniz.yourdomain.com`
4. **Default**: From `DEFAULT_PLATFORM` environment variable

The platform object is then fetched from the database and stored in `request.state` for use in your endpoints.

---

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# Default platform when none is specified
DEFAULT_PLATFORM=deriniz
```

### Middleware Registration

Already configured in `main.py`:

```python
from app.core.platform_middleware import PlatformMiddleware

# Add platform middleware (before auth to set platform context)
app.add_middleware(PlatformMiddleware)
```

---

## Using Platform in Endpoints

### Method 1: Using the Dependency (Recommended)

```python
from fastapi import APIRouter, Depends
from app.core.platform_middleware import get_current_platform
from app.models.postgres_models import Platform

router = APIRouter()

@router.get("/dashboards")
async def get_dashboards(
    platform: Platform = Depends(get_current_platform),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get dashboards for the current platform"""
    
    # Platform is automatically injected
    print(f"Platform: {platform.name}")
    print(f"Database Type: {platform.db_type}")
    
    # Query dashboards filtered by platform
    result = await db.execute(
        select(Dashboard).where(Dashboard.platform_id == platform.id)
    )
    dashboards = result.scalars().all()
    
    return dashboards
```

### Method 2: Optional Platform

For endpoints that can work with or without a platform:

```python
from app.core.platform_middleware import get_optional_platform

@router.get("/data")
async def get_data(
    platform: Platform | None = Depends(get_optional_platform)
):
    if platform:
        # Use platform-specific logic
        data = fetch_from_platform_db(platform)
    else:
        # Use default/fallback logic
        data = fetch_default_data()
    
    return data
```

### Method 3: Get Platform Code Only

For simple cases where you just need the code string:

```python
from app.core.platform_middleware import get_platform_code

@router.get("/info")
async def get_info(
    platform_code: str = Depends(get_platform_code)
):
    return {"platform": platform_code}
```

### Method 4: Direct Access from Request

You can also access platform directly from request state:

```python
from fastapi import Request

@router.get("/direct")
async def direct_access(request: Request):
    platform_code = request.state.platform_code  # Always available
    platform = request.state.platform            # May be None
    platform_id = request.state.platform_id      # May be None
    
    return {
        "code": platform_code,
        "name": platform.name if platform else None
    }
```

---

## Request Examples

### Using HTTP Header

```bash
curl -H "X-Platform-Code: deriniz" http://localhost:8000/api/v1/dashboards
```

### Using Query Parameter

```bash
curl http://localhost:8000/api/v1/dashboards?platform=app2
```

### Using Subdomain

```bash
curl http://deriniz.yourdomain.com/api/v1/dashboards
```

### Using Default (no specification)

```bash
curl http://localhost:8000/api/v1/dashboards
# Uses DEFAULT_PLATFORM from .env
```

---

## Frontend Integration

### Setting Platform in API Requests

Update your frontend API client to include the platform header:

```typescript
// In dtfrontend/src/lib/api.ts

const platformCode = localStorage.getItem('platform_code') || 'deriniz'

fetch(url, {
  headers: {
    'Content-Type': 'application/json',
    'X-Platform-Code': platformCode,  // Add this header
  },
  credentials: 'include',
  ...options
})
```

### React Example

```typescript
import { useState, useEffect } from 'react'

export function usePlatform() {
  const [platform, setPlatform] = useState('deriniz')
  
  useEffect(() => {
    // Get from localStorage or URL
    const saved = localStorage.getItem('platform_code')
    if (saved) {
      setPlatform(saved)
    }
  }, [])
  
  return platform
}

// In your components
function Dashboard() {
  const platform = usePlatform()
  
  // Fetch data with platform
  const { data } = useSWR(`/dashboards?platform=${platform}`)
  
  return <div>...</div>
}
```

---

## Error Handling

### Platform Not Found

When using `get_current_platform`, if the platform doesn't exist or is inactive, a 404 error is raised:

```python
@router.get("/data")
async def get_data(
    platform: Platform = Depends(get_current_platform)
):
    # If we reach here, platform is guaranteed to exist
    return {"platform": platform.name}
```

Response if platform not found:
```json
{
  "detail": "Platform not found: invalid_code"
}
```

### Handling Missing Platform

Use `get_optional_platform` for endpoints that should work without a platform:

```python
@router.get("/health")
async def health_check(
    platform: Platform | None = Depends(get_optional_platform)
):
    return {
        "status": "healthy",
        "platform": platform.name if platform else "none"
    }
```

---

## Response Headers

The middleware automatically adds platform information to response headers:

```
X-Platform-Code: deriniz
X-Platform-Name: DerinIZ
```

This can be useful for debugging and frontend platform detection.

---

## Logging

The middleware logs platform detection at DEBUG level:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

Example logs:
```
DEBUG:app.core.platform_middleware:Platform code from header: deriniz
DEBUG:app.core.platform_middleware:Platform found: DerinIZ (ID: 1)
```

---

## Security Considerations

1. **Platform Validation**: The middleware validates that the platform exists and is active
2. **Database Query**: Platform is fetched from database on every request (consider caching for production)
3. **Default Platform**: Always configure a valid DEFAULT_PLATFORM to prevent errors
4. **Access Control**: Implement additional checks in endpoints to ensure users have access to the requested platform

---

## Example: Complete Endpoint with Platform

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.platform_middleware import get_current_platform
from app.core.database import get_postgres_db
from app.core.platform_db import DatabaseConnectionFactory
from app.models.postgres_models import Platform, Dashboard

router = APIRouter()

@router.get("/dashboards/{dashboard_id}")
async def get_dashboard(
    dashboard_id: int,
    platform: Platform = Depends(get_current_platform),
    db: AsyncSession = Depends(get_postgres_db)
):
    """
    Get a specific dashboard from the current platform
    """
    # Query dashboard with platform filter
    result = await db.execute(
        select(Dashboard).where(
            Dashboard.id == dashboard_id,
            Dashboard.platform_id == platform.id
        )
    )
    dashboard = result.scalar_one_or_none()
    
    if not dashboard:
        raise HTTPException(
            status_code=404, 
            detail=f"Dashboard {dashboard_id} not found in platform {platform.name}"
        )
    
    # Fetch data from platform-specific database
    try:
        query_result = DatabaseConnectionFactory.execute_query(
            platform=platform,
            query="SELECT * FROM widget_data WHERE dashboard_id = %(id)s",
            params={"id": dashboard_id}
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching data from {platform.db_type}: {str(e)}"
        )
    
    return {
        "dashboard": dashboard,
        "data": query_result,
        "platform": {
            "code": platform.code,
            "name": platform.name,
            "db_type": platform.db_type
        }
    }
```

---

## Testing

### Unit Testing

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_with_platform_header():
    response = client.get(
        "/api/v1/dashboards",
        headers={"X-Platform-Code": "deriniz"}
    )
    assert response.status_code == 200

def test_with_query_param():
    response = client.get("/api/v1/dashboards?platform=app2")
    assert response.status_code == 200

def test_invalid_platform():
    response = client.get(
        "/api/v1/dashboards",
        headers={"X-Platform-Code": "invalid"}
    )
    assert response.status_code == 404
```

---

## Performance Optimization

For production, consider caching platforms to avoid database queries on every request:

```python
from functools import lru_cache
from cachetools import TTLCache

# Cache platforms for 5 minutes
platform_cache = TTLCache(maxsize=100, ttl=300)

async def get_cached_platform(platform_code: str) -> Platform:
    if platform_code in platform_cache:
        return platform_cache[platform_code]
    
    # Fetch from database
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Platform).where(Platform.code == platform_code)
        )
        platform = result.scalar_one_or_none()
        
        if platform:
            platform_cache[platform_code] = platform
        
        return platform
```

This optimization can be added to the middleware for high-traffic applications.

