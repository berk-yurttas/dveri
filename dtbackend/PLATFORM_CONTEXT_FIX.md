# Platform Context Management Fix

## Problem

When users visited the root home page (`/`) after being on a platform-specific page (`/{platform}`), the `X-Platform-Code` header was still being sent, causing the root page to show filtered data instead of all platforms' data.

## Solution

### 1. Frontend Changes

#### `dtfrontend/src/app/page.tsx`
- ✅ Clear platform code from localStorage on mount
- ✅ API requests from root page don't include platform header

```typescript
useEffect(() => {
  // Clear platform code when visiting root home page
  localStorage.removeItem('platform_code');
  
  const fetchData = async () => {
    // Fetch data without platform filter
    const [platformData, dashboardData] = await Promise.all([
      platformService.getPlatforms(0, 100, false),
      dashboardService.getDashboards(),
    ]);
    // ...
  };
  
  fetchData();
}, []);
```

#### `dtfrontend/src/lib/api.ts`
- ✅ Only add `X-Platform-Code` header if platform code exists in localStorage
- ✅ No default fallback to 'deriniz'

```typescript
// Get platform code from localStorage (don't use default if not set)
const platformCode = typeof window !== 'undefined' 
  ? localStorage.getItem('platform_code')
  : null

// Build headers
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  ...options.headers as Record<string, string>,
}

// Only add platform header if platform code is set
if (platformCode) {
  headers['X-Platform-Code'] = platformCode
}
```

### 2. Backend Changes

#### `dtbackend/app/core/platform_middleware.py`
- ✅ Handle case when no platform header is sent
- ✅ Set platform to None and continue processing
- ✅ Fixed `get_current_platform` to use `hasattr` instead of `in` operator

```python
# If no platform code found, continue without platform context
if not platform_code:
    logger.debug("No platform code found, continuing without platform context")
    request.state.platform_code = None
    request.state.platform = None
    request.state.platform_id = None
    response = await call_next(request)
    return response
```

```python
async def get_current_platform(request: Request) -> Platform:
    """Raises 404 if platform not found"""
    from fastapi import HTTPException
    
    if not hasattr(request.state, 'platform') or request.state.platform is None:
        raise HTTPException(
            status_code=404,
            detail=f"Platform not found: {getattr(request.state, 'platform_code', 'unknown')}"
        )
    
    return request.state.platform
```

#### `dtbackend/app/api/v1/endpoints/dashboards.py`
- ✅ Changed from `get_current_platform` to `get_optional_platform`
- ✅ Platform parameter is now `Optional[Platform]`

```python
@router.get("/", response_model=List[DashboardList])
async def get_dashboards(
    skip: int = 0,
    limit: int = 100,
    platform: Optional[Platform] = Depends(get_optional_platform),  # Now optional
    current_user: User = Depends(check_authenticated),
    db: AsyncSession = Depends(get_postgres_db)
):
    """Get dashboards - optionally filtered by platform"""
    dashboards = await DashboardService.get_dashboards(
        db=db,
        username=current_user.username,
        skip=skip,
        limit=limit,
        platform=platform  # Can be None
    )
    return dashboards
```

#### `dtbackend/app/services/dashboard_service.py`
- ✅ Already handles optional platform parameter
- ✅ Only filters by `platform_id` when platform is provided

```python
@staticmethod
async def get_dashboards(
    db: AsyncSession,
    username: str,
    skip: int = 0,
    limit: int = 100,
    platform: Platform = None  # Optional
) -> List[Dashboard]:
    """Get all dashboards by username"""
    # ...
    
    # Main query: dashboards where user is added OR dashboard is public
    if platform:
        # Filter by platform
        query = select(Dashboard).where(
            ...,
            Dashboard.platform_id == platform.id  # Platform filter
        )
    else:
        # No platform filter - show all
        query = select(Dashboard).where(...)
    
    # ...
```

---

## Behavior After Fix

### Root Page (`/`)
- ✅ `localStorage.platform_code` = **None** (cleared)
- ✅ `X-Platform-Code` header = **Not sent**
- ✅ Backend platform filter = **None**
- ✅ Shows dashboards from **all platforms**

### Platform Page (`/{platform}`)
- ✅ `localStorage.platform_code` = **'deriniz'**
- ✅ `X-Platform-Code` header = **'deriniz'**
- ✅ Backend platform filter = **Platform(code='deriniz')**
- ✅ Shows dashboards from **DerinIZ only**

### Navigation Flow
```
User on /deriniz
  ↓
localStorage: 'deriniz'
Header: X-Platform-Code: deriniz
Shows: DerinIZ data only
  ↓
User clicks logo/home to go to /
  ↓
localStorage cleared
Header: No X-Platform-Code
Shows: All platforms' data
  ↓
User selects App2
  ↓
localStorage: 'app2'
Header: X-Platform-Code: app2
Shows: App2 data only
```

---

## Testing

### Test 1: Root Page Shows All Data
```bash
# 1. Clear localStorage
localStorage.clear()

# 2. Visit root page
open http://localhost:3000/

# 3. Check network tab - dashboards request should NOT have X-Platform-Code header
# 4. Should see dashboards from all platforms
```

### Test 2: Platform Page Filters Data
```bash
# 1. Click on DerinIZ platform card
# 2. Visit http://localhost:3000/deriniz
# 3. Check network tab - dashboards request SHOULD have X-Platform-Code: deriniz
# 4. Should see only DerinIZ dashboards
```

### Test 3: Switching Platforms
```bash
# 1. On /deriniz page
# 2. Navigate back to /
# 3. Platform code should be cleared
# 4. Select App2
# 5. Should see App2 data only
```

---

## Files Modified

- ✅ `dtfrontend/src/app/page.tsx` - Clear platform on mount
- ✅ `dtfrontend/src/lib/api.ts` - Conditional platform header
- ✅ `dtbackend/app/core/platform_middleware.py` - Handle no platform
- ✅ `dtbackend/app/api/v1/endpoints/dashboards.py` - Optional platform dependency
- ✅ `dtbackend/app/services/dashboard_service.py` - Already supports optional platform

---

## Summary

✅ **Root page** - Shows all platforms' data (no filter)  
✅ **Platform pages** - Show only selected platform's data  
✅ **Platform switching** - Works correctly with localStorage  
✅ **API headers** - Only sent when platform is selected  
✅ **Backend filtering** - Conditional based on platform presence  

The platform context is now properly managed! 🎉

