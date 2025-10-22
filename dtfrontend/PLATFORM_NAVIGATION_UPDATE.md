# Platform-Aware Navigation Update

## Overview

The sidebar navigation now dynamically updates based on the selected platform, routing users to platform-specific dashboard and report pages.

---

## Implementation

### Navigation Items Now Dynamic

**File:** `dtfrontend/src/components/app-layout.tsx`

```typescript
// Create navigation items dynamically based on current platform
const navigationItems = useMemo(() => {
  const platformCode = platform?.code;
  const platformPrefix = platformCode ? `/${platformCode}` : '';
  
  return [
    {
      title: "Anasayfa",
      icon: Home,
      href: "/",  // Always goes to root
    },
    {
      title: "Ekranlarım",
      icon: Layout,
      href: platformCode ? `${platformPrefix}/dashboard` : "/dashboard",
      // If platform selected: /deriniz/dashboard
      // If no platform: /dashboard
    },
    {
      title: "Raporlar",
      icon: BarChart3,
      href: platformCode ? `${platformPrefix}/reports` : "/reports",
      // If platform selected: /deriniz/reports
      // If no platform: /reports
    }
  ];
}, [platform?.code]); // Recalculate when platform changes
```

### Dynamic Title

The header title now shows the platform name:

```typescript
const getTitle = () => {
  if (easterEggActive) return "Biz de DERİNİZ ;)";
  if (platform) return `${platform.display_name}`;
  return "MİRAS";
};
```

---

## Navigation Behavior

### When No Platform Selected (Root Page `/`)

| Menu Item | Icon | Route | Shows |
|-----------|------|-------|-------|
| Anasayfa | Home | `/` | Root landing page |
| Ekranlarım | Layout | `/dashboard` | All dashboards (all platforms) |
| Raporlar | BarChart3 | `/reports` | All reports (all platforms) |

**Header Title:** `MİRAS`

### When Platform Selected (e.g., `/deriniz`)

| Menu Item | Icon | Route | Shows |
|-----------|------|-------|-------|
| Anasayfa | Home | `/` | Root landing page (clears platform) |
| Ekranlarım | Layout | `/deriniz/dashboard` | DerinIZ dashboards only |
| Raporlar | BarChart3 | `/deriniz/reports` | DerinIZ reports only |

**Header Title:** `MİRAS - DerinIZ Platform`

### When Different Platform (e.g., `/app2`)

| Menu Item | Icon | Route | Shows |
|-----------|------|-------|-------|
| Anasayfa | Home | `/` | Root landing page (clears platform) |
| Ekranlarım | Layout | `/app2/dashboard` | App2 dashboards only |
| Raporlar | BarChart3 | `/app2/reports` | App2 reports only |

**Header Title:** `MİRAS - Application 2`

---

## User Experience

### Scenario 1: User on Root Page
```
Current: /
Sidebar shows:
  - Anasayfa → /
  - Ekranlarım → /dashboard (all platforms)
  - Raporlar → /reports (all platforms)

User clicks "DerinIZ" platform card
  ↓
Navigates to /deriniz
  ↓
Sidebar automatically updates:
  - Anasayfa → /
  - Ekranlarım → /deriniz/dashboard (DerinIZ only)
  - Raporlar → /deriniz/reports (DerinIZ only)

Header Title: "MİRAS - DerinIZ Platform"
```

### Scenario 2: User on Platform Page
```
Current: /deriniz
Sidebar shows:
  - Anasayfa → /
  - Ekranlarım → /deriniz/dashboard
  - Raporlar → /deriniz/reports

User clicks "Anasayfa"
  ↓
Navigates to /
  ↓
Platform cleared
  ↓
Sidebar automatically updates:
  - Anasayfa → /
  - Ekranlarım → /dashboard (all platforms)
  - Raporlar → /reports (all platforms)

Header Title: "MİRAS"
```

### Scenario 3: Switching Platforms
```
Current: /deriniz
Sidebar: /deriniz/dashboard, /deriniz/reports

User clicks "Anasayfa" → goes to /
User clicks "App2" card
  ↓
Navigates to /app2
  ↓
Sidebar automatically updates:
  - Anasayfa → /
  - Ekranlarım → /app2/dashboard
  - Raporlar → /app2/reports

Header Title: "MİRAS - Application 2"
```

---

## Navigation Flow Diagram

```
┌─────────────┐
│   Root (/)  │
│  No Platform│
└─────┬───────┘
      │
      ├─ Anasayfa → /
      ├─ Ekranlarım → /dashboard
      └─ Raporlar → /reports
      
      User selects DerinIZ
      ↓
      
┌─────────────────┐
│   /deriniz      │
│ Platform: DerinIZ│
└─────┬───────────┘
      │
      ├─ Anasayfa → / (clears platform)
      ├─ Ekranlarım → /deriniz/dashboard
      └─ Raporlar → /deriniz/reports
```

---

## Code Changes Summary

### Added
- ✅ Dynamic navigation based on `platform?.code`
- ✅ Platform prefix: `/${platform.code}`
- ✅ Conditional routing logic
- ✅ Dynamic header title with platform name
- ✅ `useMemo` dependency on `platform?.code`

### Updated
- ✅ Navigation items now reactive to platform changes
- ✅ Title shows platform name
- ✅ Easter egg still works

---

## Testing

### Test 1: Navigation on Root Page
```bash
1. Visit http://localhost:3000/
2. Sidebar should show:
   - Anasayfa
   - Ekranlarım (goes to /dashboard)
   - Raporlar (goes to /reports)
3. Header title: "MİRAS"
```

### Test 2: Navigation on Platform Page
```bash
1. Visit http://localhost:3000/deriniz
2. Sidebar should show:
   - Anasayfa (goes to /)
   - Ekranlarım (goes to /deriniz/dashboard)
   - Raporlar (goes to /deriniz/reports)
3. Header title: "MİRAS - DerinIZ Platform"
```

### Test 3: Platform Switching
```bash
1. On /deriniz page
2. Click "Anasayfa"
3. Goes to / - navigation reverts to non-platform routes
4. Click "App2" card
5. Goes to /app2 - navigation updates to /app2/* routes
6. Header title: "MİRAS - Application 2"
```

### Test 4: Direct Navigation
```bash
# Click "Ekranlarım" when on /deriniz
→ Goes to /deriniz/dashboard
→ Stays in platform context
→ Data is filtered by platform

# Click "Anasayfa"
→ Goes to /
→ Platform context cleared
→ Navigation reverts to global routes
```

---

## Benefits

✅ **Context-Aware Navigation** - Routes update based on current platform  
✅ **Automatic Updates** - No manual navigation management  
✅ **Consistent UX** - Users stay in platform context  
✅ **Easy Escape** - "Anasayfa" always goes to root  
✅ **Dynamic Title** - Shows current platform name  
✅ **Memoized** - Efficient re-rendering  

The navigation system is now fully platform-aware! 🎉

