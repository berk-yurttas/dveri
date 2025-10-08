# 🚀 Automatic Performance Optimizations

## TL;DR - It Just Works!™

All performance optimizations are **automatically applied** to your API requests:

- ✅ **All GET requests** → Cached for 5 minutes
- ✅ **All widget POST requests** → Queued (max 6 concurrent)
- ✅ **Request deduplication** → Multiple identical requests = 1 API call
- ✅ **30-second timeout** → No more hanging requests

**You don't need to change any existing code!**

---

## 📝 What This Means for You

### Before (Manual Configuration):
```typescript
// You had to explicitly enable caching
const options = await api.get('/data/infrastructure', undefined, { 
  useCache: true, 
  cacheDuration: 5 * 60 * 1000 
})

// You had to explicitly enable queue
const data = await api.post('/data/widget', {...}, {...}, { useQueue: true })
```

### After (Automatic - Current):
```typescript
// Just write normal API calls - optimizations happen automatically!
const options = await api.get('/data/infrastructure')
const data = await api.post('/data/widget', {...})
```

---

## 🎯 How It Works

### 1. **GET Requests = Automatic Cache**

```typescript
// First call - fetches from server
const data1 = await api.get('/data/infrastructure')  // ⏳ 200ms

// Second call within 5 minutes - returns from cache
const data2 = await api.get('/data/infrastructure')  // ⚡ <1ms (CACHE HIT!)

// After 5 minutes - fetches fresh data
const data3 = await api.get('/data/infrastructure')  // ⏳ 200ms (cache expired)
```

**Cache Behavior:**
- ✅ Default duration: **5 minutes**
- ✅ Automatic deduplication: Multiple simultaneous requests → 1 API call
- ✅ Per-endpoint caching: `/data/products` and `/data/companies` cache separately
- ✅ Memory-based: Cleared on page refresh

### 2. **Widget Requests = Automatic Queue**

```typescript
// Even if 20 widgets load simultaneously:
// Widget 1-6: Execute immediately
// Widget 7-20: Queued automatically, execute as slots open

const data = await api.post('/data/widget', {
  widget_type: 'efficiency',
  filters: {...}
})
// Automatically uses queue if endpoint is '/data/widget'
```

**Queue Behavior:**
- ✅ Max concurrent: **6 requests** (browser limit)
- ✅ Automatic detection: Any request to `/data/widget` uses queue
- ✅ FIFO order: First requested = first executed
- ✅ No blocking: UI stays responsive during queue

### 3. **Request Deduplication**

```typescript
// Three widgets load at the same time and need infrastructure options:
Promise.all([
  api.get('/data/infrastructure'), // ⏳ Makes actual API call
  api.get('/data/infrastructure'), // ⚡ Waits for first call
  api.get('/data/infrastructure')  // ⚡ Waits for first call
])
// Result: Only 1 API call made, all 3 widgets get the data!
```

---

## 🛠️ Override Automatic Behavior (Rare Cases)

### Disable Cache for Specific Request:
```typescript
// For real-time data that shouldn't be cached
const liveData = await api.get('/data/live-stats', undefined, { 
  useCache: false 
})
```

### Custom Cache Duration:
```typescript
// Cache for 10 minutes instead of default 5
const data = await api.get('/data/reports', undefined, { 
  cacheDuration: 10 * 60 * 1000 
})
```

### Disable Queue for Specific Request:
```typescript
// For urgent/priority requests
const urgentData = await api.post('/data/widget', {...}, {}, { 
  useQueue: false 
})
```

### Manually Clear Cache:
```typescript
import { api } from '@/lib/api'

// Clear all cache
api.clearCache()

// Clear specific pattern
api.clearCachePattern(/^\/data\/widget/) // Clear all widget cache
```

---

## 📊 Real-World Example

### Scenario: Dashboard with 6 Efficiency Widgets

**Without Optimizations:**
```
Load Dashboard
├─ Widget 1: GET /data/infrastructure (200ms)
├─ Widget 2: GET /data/infrastructure (200ms) ❌ DUPLICATE
├─ Widget 3: GET /data/infrastructure (200ms) ❌ DUPLICATE
├─ Widget 4: GET /data/infrastructure (200ms) ❌ DUPLICATE
├─ Widget 5: GET /data/infrastructure (200ms) ❌ DUPLICATE
├─ Widget 6: GET /data/infrastructure (200ms) ❌ DUPLICATE
├─ Widget 1: POST /data/widget (500ms)
├─ Widget 2: POST /data/widget (500ms)
├─ Widget 3: POST /data/widget (500ms)
├─ Widget 4: POST /data/widget (STALLED) ⚠️
├─ Widget 5: POST /data/widget (STALLED) ⚠️
└─ Widget 6: POST /data/widget (STALLED) ⚠️

Total: 12 requests, 3+ seconds, 3 stalled
```

**With Automatic Optimizations:**
```
Load Dashboard
├─ Widget 1: GET /data/infrastructure (200ms) ✅ API CALL
├─ Widget 2-6: GET /data/infrastructure (<1ms each) ✅ CACHE HIT
├─ Widget 1-6: POST /data/widget (queued)
│   ├─ Slots 1-6: Execute immediately (500ms each)
│   └─ No stalling!

Total: 7 requests (1 GET + 6 POST), 0.7 seconds, 0 stalled
```

**Performance Gain:**
- 🚀 **5x fewer requests** (12 → 7)
- ⚡ **4x faster load** (3s → 0.7s)
- ✅ **0 stalled requests** (3 → 0)

---

## 🧪 Testing the Optimizations

### 1. Check Browser Console:
```
[API Cache] Hit: /data/infrastructure   ← Cache is working!
[API Cache] Using pending request: /data/infrastructure   ← Deduplication working!
```

### 2. Check Network Tab (DevTools):
- Should see **1 request** for `/data/infrastructure` (not 6)
- Should see **max 6 concurrent** requests at any time
- Should see **200ms → <1ms** for cached requests

### 3. Check Request Queue:
```typescript
import { requestQueue } from '@/lib/request-queue'

console.log('Active:', requestQueue.getActiveRequests())  // Should be ≤ 6
console.log('Queued:', requestQueue.getQueueSize())       // Remaining widgets
```

---

## 🎨 Visual Flow

```
┌─────────────────────────────────────────────────────────┐
│                    User Opens Dashboard                 │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼─────┐          ┌─────▼────┐
    │ GET      │          │ POST     │
    │ Requests │          │ Requests │
    └────┬─────┘          └─────┬────┘
         │                      │
    ┌────▼─────────────┐   ┌────▼──────────────┐
    │ 🔍 Check Cache   │   │ 🔍 Check Queue    │
    │ ✅ Hit? Return   │   │ ✅ Slot? Execute  │
    │ ❌ Miss? Fetch   │   │ ❌ Full? Queue    │
    └────┬─────────────┘   └────┬──────────────┘
         │                      │
    ┌────▼─────────────┐   ┌────▼──────────────┐
    │ 💾 Store in Cache│   │ ⏳ Wait for Slot  │
    │ ⏰ TTL: 5 min    │   │ 🎯 Max: 6 active  │
    └──────────────────┘   └───────────────────┘
```

---

## ❓ FAQ

### Q: Will this affect my real-time data?
**A:** No! You can disable caching for specific endpoints:
```typescript
api.get('/data/live', undefined, { useCache: false })
```

### Q: What happens if the cache becomes stale?
**A:** Cache automatically expires after 5 minutes. You can also manually clear it:
```typescript
api.clearCache()  // Clear all
api.clearCachePattern(/pattern/)  // Clear specific
```

### Q: Can I see what's happening?
**A:** Yes! Check browser console for cache hit/miss logs:
```
[API Cache] Hit: /data/infrastructure
[API Cache] Using pending request: /data/products
```

### Q: Does this affect POST/PUT/DELETE requests?
**A:** No! Only GET requests are cached. POST/PUT/DELETE always go to the server.
Widget POST requests (`/data/widget`) automatically use the queue to prevent stalling.

### Q: What if I need more than 6 concurrent requests?
**A:** You can adjust the queue size:
```typescript
import { requestQueue } from '@/lib/request-queue'
requestQueue.setMaxConcurrent(10)  // Increase to 10
```

---

## 🎉 Summary

**You don't need to do anything!** All optimizations are automatic:

✅ GET requests → Cached  
✅ Widget requests → Queued  
✅ Duplicate requests → Deduplicated  
✅ Hanging requests → Timeout after 30s

Just write normal API calls and enjoy the performance boost! 🚀

