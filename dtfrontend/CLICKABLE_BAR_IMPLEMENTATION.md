# Clickable Bar Chart Implementation

## Overview
This implementation adds clickable functionality to bar charts, allowing users to click on a bar and execute a nested query with parameters from the clicked bar data. This works similarly to the expandable table feature.

## Changes Made

### 1. Type Definitions (`src/types/reports.ts`)
Added two new properties to `VisualizationConfig.chartOptions`:
- `clickable?: boolean` - Enables clickable bars
- `clickableNestedQuery?: NestedQueryConfig` - Configuration for the nested query to execute

```typescript
chartOptions?: {
  // ... existing options
  
  // Clickable chart specific (for bar, line, pie, etc.)
  clickable?: boolean
  clickableNestedQuery?: NestedQueryConfig
}
```

### 2. Bar Visualization Component (`src/components/visualizations/BarVisualization.tsx`)
Enhanced the component with:
- **State Management**: Added states for selected bar, nested data, loading, and dialog
- **Click Handler**: `handleBarClick` function that:
  - Replaces placeholders in the nested SQL query with values from the clicked bar
  - Executes the query using `reportsService.previewQuery`
  - Displays results in a modal dialog
- **Visual Feedback**: 
  - Bars are colored differently when clickable
  - Cursor changes to pointer on hover
  - Opacity changes on hover for better UX
- **Modal Dialog**: Shows nested query results in a table format

### 3. Add Report Page (`src/app/[platform]/reports/add/page.tsx`)
Added a new configuration section for clickable bars:
- **Checkbox**: Toggle clickable functionality on/off
- **Nested Query Configuration**:
  - SQL query editor with placeholder support (`{{field_name}}`)
  - Field selection checkboxes to specify which fields to inject
  - Visual indicators showing placeholder syntax
- **UI Features**:
  - Purple-themed to match the expandable table styling
  - Add/Remove nested query buttons
  - Auto-cleanup when disabling clickable feature

### 4. Edit Report Page (`src/app/[platform]/reports/[id]/edit/page.tsx`)
Same configuration UI as the add page, ensuring consistency.

## Usage Example

### Step 1: Create a Report with Clickable Bars
1. Go to "Add Report" page
2. Create a query that returns aggregated data:
```sql
SELECT 
  machine_name,
  COUNT(*) as total_events
FROM events
GROUP BY machine_name
```

3. Select "Bar Chart" as visualization type
4. Set X-axis to `machine_name` and Y-axis to `total_events`
5. Enable "Tıklanabilir Barlar (Detay Sorgusu)" checkbox
6. Add a detail query:
```sql
SELECT 
  event_id,
  event_time,
  event_type,
  description
FROM events
WHERE machine_name = {{machine_name}}
ORDER BY event_time DESC
LIMIT 100
```

7. Check the `machine_name` field to inject it into the nested query
8. Save the report

### Step 2: View and Interact
1. Open the report
2. Click on any bar in the chart
3. A modal will appear showing detailed records for that specific machine
4. The modal displays the query results in a table format

## Technical Details

### Placeholder Replacement
The implementation uses a simple string replacement:
```typescript
nestedQuery.expandableFields?.forEach(field => {
  const value = data[field]
  if (value !== undefined && value !== null) {
    const placeholder = `{{${field}}}`
    sql = sql.replace(new RegExp(placeholder, 'g'), `'${value}'`)
  }
})
```

### Query Execution
Uses the existing `reportsService.previewQuery` method:
```typescript
const result = await reportsService.previewQuery({
  sql_query: sql,
  limit: 100
})
```

## Benefits

1. **Enhanced Data Exploration**: Users can drill down from aggregated views to detailed records
2. **Consistent UX**: Similar to expandable tables, providing a familiar interaction pattern
3. **Flexible Configuration**: Any field from the parent query can be injected into the nested query
4. **Visual Feedback**: Clear indication of clickable elements with hover effects
5. **Error Handling**: Graceful error display if nested query fails

## Future Enhancements

Potential improvements:
1. **Support for Other Chart Types**: Extend to line, pie, and scatter plots
2. **Multiple Nested Levels**: Allow nested queries within nested queries
3. **Custom Filters in Modal**: Add filter controls in the detail view
4. **Export Functionality**: Allow exporting nested query results
5. **Visualization in Modal**: Display nested data as charts instead of just tables
6. **Caching**: Cache nested query results to improve performance

## Example Use Cases

1. **Production Monitoring**: Click on a machine bar to see all its events
2. **Sales Analysis**: Click on a region to see individual transactions
3. **Error Tracking**: Click on an error count bar to see error details
4. **User Analytics**: Click on a user segment to see individual users
5. **Inventory Management**: Click on a product category to see SKU-level details

