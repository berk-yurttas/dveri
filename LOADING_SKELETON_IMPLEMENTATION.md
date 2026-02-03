# Loading Skeleton Implementation for Report Queries

## Overview
Added comprehensive loading skeleton animations for each visualization type in the report detail page, replacing the previous simple spinner with type-specific animated skeletons.

## Date: 2026-01-30

## Changes Made

### 1. Custom CSS Animations (`dtfrontend/src/app/globals.css`)

Added three new animation keyframes:

#### Shimmer Animation
```css
@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}
```
- Creates a smooth left-to-right shimmer effect
- Used for table rows, cards, and legend items
- 2-second infinite loop for continuous animation

#### Pulse Wave Animation
```css
@keyframes pulse-wave {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```
- Smooth opacity transition for breathing effect
- Used for bar charts, pie chart segments, and other chart elements
- 1.5-second ease-in-out infinite loop

### 2. Visualization-Specific Skeletons (`dtfrontend/src/app/[platform]/reports/[id]/page.tsx`)

Replaced the generic loading overlay with type-specific skeletons:

#### Table & Expandable Table Skeleton
- **Header row**: 5 shimmer-animated columns (height: 32px)
- **Data rows**: 8 rows × 5 columns with shimmer animation
- **Staggered animation**: Each element has progressive delay (100ms per column, 50ms per row)
- **Visual**: Mimics actual table structure with gray gradient shimmer

#### Bar Chart Skeleton
- **8 vertical bars** with varying heights (40%, 70%, 50%, 85%, 60%, 75%, 55%, 90%)
- **Gradient**: Blue gradient from bottom to top (from-blue-300 via-blue-200 to-blue-100)
- **Animation**: Pulse wave effect with staggered delay (150ms per bar)
- **Layout**: Evenly spaced, max-width 60px per bar

#### Line Chart Skeleton
- **Grid lines**: 5 horizontal reference lines in light gray
- **Animated path**: Smooth curved line with stroke-dasharray animation
- **Data points**: 5 circles with pulse-wave animation
- **X-axis labels**: 5 shimmer-animated label placeholders at bottom
- **SVG animation**: Continuous dash-offset animation for flowing effect

#### Pie Chart Skeleton
- **4 segments** with different sizes and colors (blue, green, yellow, gray)
- **Spinning animation**: Gentle 3-second rotation
- **Pulse effect**: Each segment pulses with staggered delays (0ms, 300ms, 600ms)
- **Legend skeleton**: 4 color indicators with shimmer-animated labels below chart
- **Layout**: Centered with 200×200px dimensions

#### Card Skeleton
- **Top label**: Small shimmer bar (24px width)
- **Main value**: Large shimmer rectangle (80px height) with shadow
- **Bottom description**: Medium shimmer bar (32px width)
- **Layout**: Centered vertically, maximum width 320px

#### Area/Scatter/Other Charts Skeleton
- **8 gradient columns** with varying heights (indigo gradient)
- **Animation**: Pulse wave with staggered delays (150ms per column)
- **Legend**: 4 items with shimmer-animated circles and labels
- **Visual**: Similar to bar chart but with indigo color scheme

## Technical Implementation

### Animation Timing Strategy
- **Shimmer**: 2s infinite linear - continuous smooth shimmer
- **Pulse Wave**: 1.5s infinite ease-in-out - breathing effect
- **Staggered delays**: Progressive delays for sequential appearance
  - Table cells: 20-50ms increments
  - Chart elements: 100-150ms increments

### CSS Classes Used
- `animate-shimmer`: Shimmer effect for static placeholder elements
- `animate-pulse-wave`: Breathing effect for chart elements
- Inline `style={{ animationDelay }}`: Staggered animation timing

### Color Scheme
- **Gray tones**: `#f3f4f6` (gray-100), `#e5e7eb` (gray-200) for neutral elements
- **Blue**: `blue-100` to `blue-300` for bar charts and line charts
- **Indigo**: `indigo-200` to `indigo-300` for area/scatter charts
- **Multi-color**: Blue, green, yellow for pie chart segments

## Benefits

### User Experience
1. **Type-specific feedback**: Users immediately understand what type of visualization is loading
2. **Perceived performance**: Animated skeletons make wait time feel shorter
3. **Progressive rendering**: Staggered animations create smooth, professional appearance
4. **Visual consistency**: Skeleton matches final visualization layout

### Performance
1. **Pure CSS animations**: No JavaScript overhead, GPU-accelerated
2. **Lightweight**: SVG-based for pie/line charts, minimal DOM elements
3. **Parallel loading**: Shows skeleton immediately while data loads in background

### Maintainability
1. **Reusable animations**: Shimmer and pulse-wave classes can be used elsewhere
2. **Type-safe**: Leverages existing visualization type checking
3. **Responsive**: Works with grid layout and different screen sizes

## Browser Compatibility
- **CSS animations**: Supported in all modern browsers (Chrome, Firefox, Safari, Edge)
- **SVG animations**: Native SVG `<animate>` elements for cross-browser compatibility
- **Fallback**: If animations not supported, still shows static skeleton

## Future Improvements
- Add dark mode skeleton variants
- Create skeleton components for reusability
- Add accessibility improvements (aria-busy, aria-live)
- Optimize animation performance for mobile devices

## Testing Recommendations
1. Test each visualization type loads with correct skeleton
2. Verify animations run smoothly on different devices
3. Check skeleton-to-content transition is smooth
4. Test with slow network to verify skeleton visibility
5. Verify no layout shift when skeleton is replaced with actual content

