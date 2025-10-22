# Platform Theming Implementation

## Overview

The app header color now dynamically changes based on the selected platform's `theme_config`. Each platform can have custom colors stored in their database configuration.

---

## Implementation

### 1. Platform Context (`contexts/platform-context.tsx`)

Created a global context to manage platform data:

```typescript
interface PlatformContextType {
  platform: Platform | null       // Current platform data
  loading: boolean               // Loading state
  error: string | null          // Error state
  setPlatformByCode: (code: string) => Promise<void>  // Set platform by code
  clearPlatform: () => void     // Clear platform
}
```

**Features:**
- ✅ Loads platform from localStorage on mount
- ✅ Fetches platform data from API
- ✅ Stores platform data globally
- ✅ Provides theme_config to all components

### 2. Updated Layout Chain

```
layout.tsx (Root)
  └─ <PlatformProvider>          ← Provides platform data
      └─ <UserProvider>
          └─ <AppLayout>          ← Uses platform context
              └─ <AppShell>       ← Receives headerColor
                  └─ <AppHeader>  ← Applies headerColor
```

### 3. App Layout (`components/app-layout.tsx`)

```typescript
export function AppLayout({ children }: AppLayoutProps) {
  const { platform } = usePlatform();
  
  // Get header color from platform theme or use default
  const headerColor = platform?.theme_config?.headerColor || "#1e3a8a";
  
  return (
    <AppShell
      // ... other props
      headerColor={headerColor}
    >
      {children}
    </AppShell>
  );
}
```

### 4. App Shell (`components/appShell/app-shell.tsx`)

Added `headerColor` prop:

```typescript
export interface AppShellProps {
  // ... existing props
  headerColor?: string
}

export function AppShell({ ..., headerColor }: AppShellProps) {
  return (
    <AppHeader 
      // ... other props
      headerColor={headerColor}
    />
  );
}
```

### 5. App Header (`components/appShell/app-header.tsx`)

Applies the color:

```typescript
export function AppHeader({ ..., headerColor = "#1e3a8a" }: AppHeaderProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 ..."
      style={{ backgroundColor: headerColor }}
    >
      {/* Header content */}
    </header>
  );
}
```

### 6. Platform Page (`app/[platform]/page.tsx`)

Sets platform in context:

```typescript
export default function PlatformHome() {
  const platform = params.platform as string;
  const { setPlatformByCode } = usePlatform();
  
  useLayoutEffect(() => {
    if (platform) {
      setPlatformByCode(platform);  // Fetches platform data including theme_config
      api.clearCache();
    }
  }, [platform]);
}
```

### 7. Root Page (`app/page.tsx`)

Clears platform:

```typescript
export default function Home() {
  const { clearPlatform } = usePlatform();
  
  useEffect(() => {
    clearPlatform();  // Clears platform data, reverts to default color
    api.clearCache();
  }, []);
}
```

---

## Theme Configuration Format

Platforms store theme configuration in the `theme_config` JSONB field:

```json
{
  "headerColor": "#1e3a8a",
  "primaryColor": "#3B82F6",
  "secondaryColor": "#8B5CF6",
  "accentColor": "#10B981"
}
```

### Example Platform Records

```sql
-- DerinIZ with blue header
INSERT INTO platforms (code, name, display_name, db_type, theme_config, is_active)
VALUES (
  'deriniz',
  'DerinIZ',
  'DerinIZ Platform',
  'clickhouse',
  '{"headerColor": "#1e3a8a", "primaryColor": "#3B82F6", "secondaryColor": "#8B5CF6"}',
  true
);

-- App2 with green header
INSERT INTO platforms (code, name, display_name, db_type, theme_config, is_active)
VALUES (
  'app2',
  'App2',
  'Application 2',
  'mssql',
  '{"headerColor": "#059669", "primaryColor": "#10B981", "secondaryColor": "#059669"}',
  true
);

-- App3 with orange header
INSERT INTO platforms (code, name, display_name, db_type, theme_config, is_active)
VALUES (
  'app3',
  'App3',
  'Application 3',
  'postgresql',
  '{"headerColor": "#DC2626", "primaryColor": "#EF4444", "secondaryColor": "#DC2626"}',
  true
);
```

---

## Data Flow

### When User Visits `/{platform}`

```
1. [platform]/page.tsx mounts
   ↓
2. useLayoutEffect runs
   ├─ setPlatformByCode('deriniz')
   │   ├─ localStorage.setItem('platform_code', 'deriniz')
   │   └─ Fetches platform from API: GET /platforms/code/deriniz
   │       └─ Response includes theme_config: { "headerColor": "#1e3a8a", ... }
   ↓
3. Platform data stored in PlatformContext
   ↓
4. AppLayout reads platform from context
   ├─ Extracts: headerColor = platform.theme_config.headerColor
   └─ Passes to AppShell → AppHeader
   ↓
5. AppHeader applies: style={{ backgroundColor: headerColor }}
   ↓
6. Header color changes to platform-specific color! 🎨
```

### When User Returns to `/` (Root)

```
1. page.tsx mounts
   ↓
2. useEffect runs
   ├─ clearPlatform()
   │   ├─ localStorage.removeItem('platform_code')
   │   └─ Sets platform = null in context
   ↓
3. AppLayout reads platform from context (null)
   ├─ Fallback: headerColor = "#1e3a8a" (default)
   └─ Passes to AppShell → AppHeader
   ↓
4. Header color reverts to default blue
```

---

## Color Examples by Platform

| Platform | Header Color | Primary | Secondary |
|----------|--------------|---------|-----------|
| **DerinIZ** | `#1e3a8a` (Blue) | `#3B82F6` | `#8B5CF6` |
| **App2** | `#059669` (Green) | `#10B981` | `#059669` |
| **App3** | `#DC2626` (Red) | `#EF4444` | `#DC2626` |
| **App4** | `#7C3AED` (Purple) | `#8B5CF6` | `#EC4899` |
| **Default** | `#1e3a8a` (Blue) | - | - |

---

## Testing

### Test 1: Platform Header Color
```bash
1. Visit http://localhost:3000/
   → Header should be default blue (#1e3a8a)

2. Click on App2 (Green platform)
   → Header should change to green (#059669)

3. Navigate back to /
   → Header should revert to default blue (#1e3a8a)

4. Click on App3 (Red platform)
   → Header should change to red (#DC2626)
```

### Test 2: Console Logs
```bash
# When navigating to /deriniz
[Platform Page] Setting platform in context: deriniz
[API] /platforms/code/deriniz - Adding X-Platform-Code header: deriniz
[AppLayout] Platform loaded: DerinIZ
[AppLayout] Header color: #1e3a8a

# When navigating back to /
[Root Page] Clearing platform from context
[AppLayout] Platform cleared
[AppLayout] Header color: #1e3a8a (default)
```

---

## Extending Theme Support

You can extend the theme configuration to include more styling:

```json
{
  "headerColor": "#1e3a8a",
  "primaryColor": "#3B82F6",
  "secondaryColor": "#8B5CF6",
  "accentColor": "#10B981",
  "sidebarColor": "#1f2937",
  "buttonColor": "#3B82F6",
  "linkColor": "#2563eb",
  "successColor": "#10B981",
  "warningColor": "#F59E0B",
  "errorColor": "#EF4444"
}
```

Then use in components:

```typescript
const { platform } = usePlatform();
const theme = platform?.theme_config || {};

// Apply colors
<Button style={{ backgroundColor: theme.buttonColor || '#3B82F6' }}>
  Click Me
</Button>
```

---

## Files Modified

### Created
- ✅ `dtfrontend/src/contexts/platform-context.tsx` - Platform context provider

### Modified
- ✅ `dtfrontend/src/app/layout.tsx` - Added PlatformProvider
- ✅ `dtfrontend/src/components/app-layout.tsx` - Uses platform context for colors
- ✅ `dtfrontend/src/components/appShell/app-shell.tsx` - Passes headerColor
- ✅ `dtfrontend/src/components/appShell/app-header.tsx` - Applies headerColor
- ✅ `dtfrontend/src/app/[platform]/page.tsx` - Sets platform in context
- ✅ `dtfrontend/src/app/page.tsx` - Clears platform from context

---

## Benefits

✅ **Dynamic Theming** - Header color changes per platform  
✅ **Centralized Management** - Theme stored in database  
✅ **Easy Updates** - Change colors via API without code changes  
✅ **Fallback Support** - Default color when no platform selected  
✅ **Global Access** - Theme available in any component via `usePlatform()`  
✅ **Type Safe** - Full TypeScript support  

---

## Usage in Other Components

Any component can now access platform theme:

```typescript
import { usePlatform } from '@/contexts/platform-context'

function MyComponent() {
  const { platform } = usePlatform();
  const primaryColor = platform?.theme_config?.primaryColor || '#3B82F6';
  
  return (
    <div style={{ color: primaryColor }}>
      Themed content
    </div>
  );
}
```

The platform theming system is now fully functional! 🎨

