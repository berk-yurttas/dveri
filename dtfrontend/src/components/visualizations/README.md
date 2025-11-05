# Visualization Components

This directory contains modular visualization components used throughout the application.

## Overview

All visualization types have been extracted into separate, reusable components to improve code maintainability and reusability.

## Available Components

### Chart Visualizations

1. **BarVisualization** - Bar chart visualization
2. **LineVisualization** - Line chart with optional dots
3. **PieVisualization** - Pie/Donut chart (configurable inner radius)
4. **AreaVisualization** - Area chart with gradient fill
5. **ScatterVisualization** - Scatter plot for data points

### Advanced Visualizations

6. **ParetoVisualization** - Combined bar + line chart showing cumulative percentages
7. **BoxPlotVisualization** - Statistical box plot with quartiles
8. **HistogramVisualization** - Frequency distribution histogram

### Table Visualizations

9. **TableVisualization** - Data table with sorting, filtering, and pagination

### Complex Visualizations (In Main Page)

- **ExpandableTableVisualization** - Remains in main page due to complex nested data handling

## Component Interface

### Chart Visualizations Interface

Most chart visualizations follow the same interface:

```typescript
interface VisualizationProps {
  query: QueryData
  result: QueryResult
  colors?: string[]
}
```

### Table Visualization Interface

TableVisualization has an extended interface for handling interactivity:

```typescript
interface TableVisualizationProps {
  query: QueryData
  result: QueryResult
  sorting: { column: string; direction: 'asc' | 'desc' } | null
  onColumnSort: (column: string) => void
  filters: { [key: string]: any }
  openPopovers: { [key: string]: boolean }
  dropdownOptions: { [key: string]: Array<{ value: any; label: string }> }
  onFilterChange: (fieldName: string, value: any) => void
  onDebouncedFilterChange: (fieldName: string, value: any) => void
  setOpenPopovers: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  currentPage: number
  pageSize: number
  totalPages: number
  totalRows: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}
```

## Usage Example

```tsx
import { BarVisualization } from '@/components/visualizations'

<BarVisualization 
  query={query} 
  result={result} 
  colors={['#3B82F6', '#10B981']} 
/>
```

## File Structure

```
visualizations/
├── types.ts                    # Shared TypeScript interfaces
├── BarVisualization.tsx        # Bar chart component
├── LineVisualization.tsx       # Line chart component
├── PieVisualization.tsx        # Pie chart component
├── AreaVisualization.tsx       # Area chart component
├── ScatterVisualization.tsx    # Scatter plot component
├── ParetoVisualization.tsx     # Pareto chart component
├── BoxPlotVisualization.tsx    # Box plot component
├── HistogramVisualization.tsx  # Histogram component
├── TableVisualization.tsx      # Table with sorting/filtering/pagination
├── index.tsx                   # Export barrel file
└── README.md                   # This file
```

## Benefits

- **Modularity**: Each visualization is self-contained
- **Reusability**: Components can be used across different pages
- **Maintainability**: Easier to update individual visualization types
- **Testing**: Each component can be tested in isolation
- **Code Organization**: Cleaner main page with less code duplication

## Additional Refactoring

Beyond visualization components, the report page has been further optimized:

### Custom Hooks

**`useReportData` Hook** (`@/hooks/useReportData.ts`)
- Manages report loading, filtering, and query execution
- Handles dropdown options loading
- Provides centralized state management
- Reduces component complexity

### Utility Functions

**Excel Export** (`@/utils/excelExport.ts`)
- `exportReportToExcel()` - Export report data and charts to Excel
- `captureChartAsImage()` - Convert charts to images for Excel

### UI Components

**`ReportHeader` Component** (`@/components/reports/ReportHeader.tsx`)
- Displays report metadata
- Handles settings dropdown
- Provides refresh and export actions

## Adding New Visualizations

1. Create new component file: `NewVisualization.tsx`
2. Implement the `VisualizationProps` interface
3. Add export to `index.tsx`
4. Add new case in main page's `renderVisualization` function
5. Update this README

## Dependencies

All components use:
- `recharts` for chart rendering
- `lucide-react` for icons (where needed)
- Shared types from `./types.ts`

