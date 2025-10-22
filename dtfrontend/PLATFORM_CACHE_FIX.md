# Platform Cache Fix Documentation

## Problem

When navigating from root page (`/`) to a platform page (`/{platform}`), the `X-Platform-Code` header was not being sent on the first API calls. This was caused by two issues:

1. **Timing Issue**: localStorage was set in `useEffect` after API calls started
2. **Cache Issue**: API cache was returning cached responses from a different platform context

## Root Cause

### Issue 1: Race Condition
```typescript
// BEFORE (Wrong)
useEffect(() => {
  localStorage.setItem('platform_code', platform); // Async, runs after render
  
  fetchData(); // Might execute before localStorage is set!
}, [platform]);
```

### Issue 2: Platform-Agnostic Cache Keys
```typescript
// BEFORE (Wrong)
const cacheKey = createCacheKey(endpoint)
// Result: "/dashboards" - same key for all platforms!

// When you fetch /dashboards from root (no platform)
// Then navigate to /deriniz and fetch /dashboards
// Cache returns root page data instead of platform-filtered data
```

---

## Solution

### 1. Use `useLayoutEffect` for Platform Setting

**File:** `dtfrontend/src/app/[platform]/page.tsx`

```typescript
// Use useLayoutEffect to set platform BEFORE any effects run
useLayoutEffect(() => {
  if (platform) {
    console.log('[Platform Page] Setting platform in localStorage:', platform);
    localStorage.setItem('platform_code', platform);
    
    // Clear cache to force fresh data fetch
    api.clearCache();
  }
}, [platform]);

useEffect(() => {
  // This runs AFTER useLayoutEffect
  const fetchData = async () => {
    // Now localStorage is guaranteed to be set
    const [dashboardData, reportData] = await Promise.all([...]);
  };
  fetchData();
}, [platform]);
```

**Why `useLayoutEffect`?**
- Runs **synchronously** after render but **before** browser paint
- Runs **before** `useEffect` hooks
- Guarantees localStorage is set before API calls

### 2. Include Platform in Cache Keys

**File:** `dtfrontend/src/lib/cache.ts`

```typescript
export function createCacheKey(url: string, params?: any, platformCode?: string | null): string {
  const baseKey = params ? `${url}:${JSON.stringify(params)}` : url
  
  // Include platform code in cache key to isolate cache per platform
  if (platformCode) {
    return `platform:${platformCode}:${baseKey}`
  }
  
  // No platform = different cache entry
  return `platform:none:${baseKey}`
}
```

**Result:**
- Root page: `platform:none:/dashboards`
- DerinIZ: `platform:deriniz:/dashboards`
- App2: `platform:app2:/dashboards`

Each platform has separate cache entries! ✅

### 3. Update API Client to Use Platform-Aware Cache

**File:** `dtfrontend/src/lib/api.ts`

```typescript
async function apiRequest<T>(endpoint: string, options: RequestInit = {}, cacheOptions?: CacheOptions): Promise<T> {
  // Get platform code once (used for both cache key and headers)
  const platformCode = typeof window !== 'undefined' 
    ? localStorage.getItem('platform_code')
    : null
  
  // Create cache key with platform code
  const cacheKey = createCacheKey(endpoint, undefined, platformCode)
  
  // Check cache
  if (isGetRequest && useCache) {
    const cached = apiCache.get<T>(cacheKey)
    if (cached !== null) {
      console.log(`[API Cache] Hit: ${endpoint} (platform: ${platformCode || 'none'})`)
      return cached
    }
  }
  
  // ... make request ...
  
  // Cache with platform-specific key
  if (isGetRequest && useCache && data !== null) {
    apiCache.set(cacheKey, data, cacheDuration)
    console.log(`[API Cache] Set: ${endpoint} (platform: ${platformCode || 'none'})`)
  }
  
  return data
}
```

### 4. Clear Cache on Platform Changes

**Both pages now clear cache when mounted:**

**Root Page:**
```typescript
useEffect(() => {
  localStorage.removeItem('platform_code');
  api.clearCache(); // Clear all cache
  fetchData();
}, []);
```

**Platform Page:**
```typescript
useLayoutEffect(() => {
  localStorage.setItem('platform_code', platform);
  api.clearCache(); // Clear all cache
}, [platform]);
```

---

## Execution Order

### Navigation: `/` → `/deriniz`

```
1. Root page mounts
   ├─ useEffect: Clear localStorage
   ├─ useEffect: Clear cache
   └─ useEffect: Fetch data (no platform header)
        └─ Cache: platform:none:/dashboards

2. User clicks DerinIZ card
   └─ localStorage.setItem('platform_code', 'deriniz')
   
3. Navigate to /deriniz
   
4. Platform page mounts
   ├─ useLayoutEffect (runs first, synchronously):
   │   ├─ localStorage.setItem('platform_code', 'deriniz')
   │   └─ api.clearCache()
   │
   └─ useEffect (runs after):
       └─ Fetch data (WITH platform header)
            ├─ Platform code: 'deriniz' ✅
            ├─ Header: X-Platform-Code: deriniz ✅
            └─ Cache: platform:deriniz:/dashboards ✅
```

---

## Console Output

When navigating from `/` to `/deriniz`, you should see:

```
[Root Page] Clearing platform code from localStorage
[Root Page] Clearing API cache
[API] /platforms - Platform code from localStorage: null
[API] /platforms - No platform code, header not added
[API] /dashboards - Platform code from localStorage: null
[API] /dashboards - No platform code, header not added
[API Cache] Set: /platforms (platform: none, expires in 120000ms)
[API Cache] Set: /dashboards (platform: none, expires in 120000ms)

--- User clicks DerinIZ ---

[Platform Page] Setting platform in localStorage: deriniz
[Platform Page] Clearing API cache for platform switch
[Platform Page] Fetching data for platform: deriniz
[Platform Page] localStorage platform_code: deriniz
[API] /dashboards - Platform code from localStorage: deriniz
[API] /dashboards - Adding X-Platform-Code header: deriniz
[API] /reports - Platform code from localStorage: deriniz
[API] /reports - Adding X-Platform-Code header: deriniz
[API Cache] Set: /dashboards (platform: deriniz, expires in 120000ms)
[API Cache] Set: /reports (platform: deriniz, expires in 120000ms)
```

---

## Cache Key Examples

| Context | Endpoint | Cache Key |
|---------|----------|-----------|
| Root (no platform) | `/dashboards` | `platform:none:/dashboards` |
| DerinIZ | `/dashboards` | `platform:deriniz:/dashboards` |
| App2 | `/dashboards` | `platform:app2:/dashboards` |
| DerinIZ | `/reports` | `platform:deriniz:/reports` |

Each combination has its own cache entry! ✅

---

## Testing

### Test 1: Navigation Flow
```bash
1. Visit http://localhost:3000/
   - Check console: localStorage cleared
   - Check console: Cache cleared
   - Check network: /dashboards has NO X-Platform-Code header

2. Click DerinIZ card
   - Check console: localStorage set to 'deriniz'
   - Check console: Cache cleared
   - Check network: /dashboards has X-Platform-Code: deriniz header

3. Navigate back to /
   - Check console: localStorage cleared
   - Check console: Cache cleared
   - Check network: /dashboards has NO X-Platform-Code header
```

### Test 2: Platform Switching
```bash
1. Visit /deriniz
   - See DerinIZ dashboards only

2. Navigate to /
   - See dashboards from all platforms

3. Click App2 card
   - See App2 dashboards only (different from step 1)
```

### Test 3: Cache Isolation
```bash
1. Visit /deriniz
   - Fetch dashboards (cache: platform:deriniz:/dashboards)

2. Visit /app2 (in new tab or after navigation)
   - Fetch dashboards (cache: platform:app2:/dashboards)
   - Should NOT use DerinIZ cache

3. Go back to /deriniz
   - Should use cache (cache: platform:deriniz:/dashboards)
   - Fast response
```

---

## Files Modified

### Frontend
- ✅ `dtfrontend/src/lib/cache.ts` - Platform-aware cache keys
- ✅ `dtfrontend/src/lib/api.ts` - Pass platform to cache key, add logging
- ✅ `dtfrontend/src/app/page.tsx` - Clear cache on mount
- ✅ `dtfrontend/src/app/[platform]/page.tsx` - useLayoutEffect + clear cache

### Changes Summary
- ✅ Cache keys now include platform code
- ✅ Platform set synchronously before effects
- ✅ Cache cleared on platform changes
- ✅ Comprehensive debug logging
- ✅ No more stale cache from different platforms

---

## Benefits

✅ **Cache Isolation** - Each platform has separate cache  
✅ **No Stale Data** - Cache cleared on platform changes  
✅ **Correct Headers** - X-Platform-Code sent on first load  
✅ **Performance** - Platform-specific caching still works  
✅ **Debugging** - Extensive console logging  

The platform header and caching issues are now completely resolved! 🎉

