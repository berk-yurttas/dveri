# Clickable Bar Chart - Usage Guide

## Quick Start Guide

### Creating a Clickable Bar Chart Report

#### Step 1: Create Your Main Query
Navigate to **Reports > Add Report** and create a query that aggregates data:

```sql
-- Example: Count events by machine
SELECT 
  machine_name,
  COUNT(*) as event_count,
  AVG(duration) as avg_duration
FROM production_events
WHERE event_date >= '2024-01-01'
GROUP BY machine_name
ORDER BY event_count DESC
```

#### Step 2: Configure Visualization
1. Select **"Sütun Grafik"** (Bar Chart) as visualization type
2. Set **X Ekseni** to `machine_name`
3. Set **Y Ekseni** to `event_count`

#### Step 3: Enable Clickable Bars
1. Scroll down to find **"Tıklanabilir Barlar (Detay Sorgusu)"** section
2. Check the checkbox to enable
3. Click **"Detay Sorgusu Ekle"** button

#### Step 4: Configure Nested Query
1. Write your detail query with placeholders:
```sql
-- This query will run when a bar is clicked
SELECT 
  event_id,
  event_time,
  event_type,
  machine_name,
  duration,
  status,
  description
FROM production_events
WHERE machine_name = {{machine_name}}
  AND event_date >= '2024-01-01'
ORDER BY event_time DESC
LIMIT 100
```

2. Select which fields to inject:
   - ✅ Check `machine_name` in the field list
   - The placeholder `{{machine_name}}` will be replaced with the actual value

#### Step 5: Save and Test
1. Click **"Sorguyu Çalıştır"** to preview
2. Click **"Raporu Kaydet"** to save
3. Open the saved report
4. Click on any bar to see the details!

## Common Use Cases

### 1. Production Line Monitoring
**Main Query:** Errors per production line
```sql
SELECT production_line, COUNT(*) as error_count
FROM errors
GROUP BY production_line
```

**Detail Query:** Show all errors for clicked line
```sql
SELECT error_id, timestamp, error_type, severity, message
FROM errors
WHERE production_line = {{production_line}}
ORDER BY timestamp DESC
```

### 2. Sales Analysis by Region
**Main Query:** Sales by region
```sql
SELECT region, SUM(amount) as total_sales, COUNT(*) as order_count
FROM orders
GROUP BY region
```

**Detail Query:** Individual orders for clicked region
```sql
SELECT order_id, customer_name, amount, order_date, product_name
FROM orders
WHERE region = {{region}}
ORDER BY order_date DESC
```

### 3. User Activity Tracking
**Main Query:** Active users by department
```sql
SELECT department, COUNT(DISTINCT user_id) as active_users
FROM user_activities
WHERE date >= today() - 7
GROUP BY department
```

**Detail Query:** User details for clicked department
```sql
SELECT user_id, user_name, last_login, action_count
FROM user_activities
WHERE department = {{department}}
  AND date >= today() - 7
GROUP BY user_id, user_name, last_login, action_count
ORDER BY action_count DESC
```

### 4. Error Rate by Service
**Main Query:** Error counts per service
```sql
SELECT service_name, COUNT(*) as error_count
FROM service_logs
WHERE log_level = 'ERROR'
  AND timestamp >= now() - interval 24 hour
GROUP BY service_name
```

**Detail Query:** Error details for clicked service
```sql
SELECT timestamp, error_message, stack_trace, request_id
FROM service_logs
WHERE service_name = {{service_name}}
  AND log_level = 'ERROR'
  AND timestamp >= now() - interval 24 hour
ORDER BY timestamp DESC
LIMIT 50
```

## Tips and Best Practices

### 1. **Use Multiple Parameters**
You can inject multiple fields:
```sql
-- Main query returns: machine_name, shift, event_count
-- Detail query uses both parameters:
SELECT * FROM events
WHERE machine_name = {{machine_name}}
  AND shift = {{shift}}
```

### 2. **Add Filters to Detail Queries**
Include date ranges or other filters:
```sql
SELECT * FROM details
WHERE category = {{category}}
  AND date >= today() - 30  -- Last 30 days only
  AND status != 'archived'   -- Exclude archived
```

### 3. **Limit Results**
Always use LIMIT to prevent overwhelming the modal:
```sql
SELECT * FROM large_table
WHERE id = {{id}}
ORDER BY timestamp DESC
LIMIT 100  -- Show only last 100 records
```

### 4. **Order Results Meaningfully**
Order by the most important field:
```sql
-- For errors: most recent first
ORDER BY timestamp DESC

-- For amounts: highest first
ORDER BY amount DESC

-- For priority: highest priority first
ORDER BY priority DESC, timestamp DESC
```

### 5. **Use Descriptive Field Names**
Make your main query return clear field names:
```sql
-- Good
SELECT 
  department as "Departman",
  COUNT(*) as "Toplam İşlem"
FROM transactions
GROUP BY department

-- Field names will be clear in the UI
```

## Placeholder Syntax

### Basic Usage
```sql
{{field_name}}
```

### With String Values
```sql
WHERE machine_name = {{machine_name}}
-- Becomes: WHERE machine_name = 'Machine A'
```

### With Numeric Values
```sql
WHERE machine_id = {{machine_id}}
-- Becomes: WHERE machine_id = '123'
-- Note: Still quoted for safety
```

### Multiple Placeholders
```sql
WHERE machine_name = {{machine_name}}
  AND shift = {{shift}}
  AND department = {{department}}
```

## Troubleshooting

### Bar clicks don't do anything
- ✅ Check that "Tıklanabilir Barlar" checkbox is enabled
- ✅ Verify you've added a nested query
- ✅ Make sure you've selected at least one field to inject

### Modal shows error
- ✅ Check your SQL syntax in the detail query
- ✅ Verify placeholders match field names exactly
- ✅ Test the SQL separately with hardcoded values first

### Wrong data appears
- ✅ Verify placeholder names match field names from main query
- ✅ Check field selection checkboxes are correct
- ✅ Review the WHERE clause in your detail query

### Modal is empty
- ✅ Verify the detail query returns data for test values
- ✅ Check if filters are too restrictive
- ✅ Test with a simpler query first

## Advanced Patterns

### Pattern 1: Hierarchical Drill-down
```sql
-- Level 1: By Region
SELECT region, SUM(sales) as total_sales FROM orders GROUP BY region

-- Level 2: By City (on region click)
SELECT city, SUM(sales) as total_sales 
FROM orders 
WHERE region = {{region}} 
GROUP BY city
```

### Pattern 2: Time-based Details
```sql
-- Main: Daily aggregates
SELECT date, COUNT(*) as events FROM logs GROUP BY date

-- Detail: Hourly breakdown for clicked day
SELECT hour, COUNT(*) as events
FROM logs
WHERE date = {{date}}
GROUP BY hour
ORDER BY hour
```

### Pattern 3: Status Breakdown
```sql
-- Main: By status
SELECT status, COUNT(*) as count FROM tasks GROUP BY status

-- Detail: Individual tasks
SELECT task_id, title, assigned_to, created_at
FROM tasks
WHERE status = {{status}}
ORDER BY created_at DESC
```

## Feature Comparison

| Feature | Expandable Table | Clickable Bar Chart |
|---------|------------------|---------------------|
| Visual Type | Table rows | Chart bars |
| Interaction | Expand icon click | Bar click |
| Detail View | Inline expansion | Modal dialog |
| Multiple Levels | ✅ Yes (recursive) | ❌ No (single level) |
| Best For | Detailed data exploration | High-level → detailed drill-down |

## What's Next?

After mastering clickable bar charts, explore:
1. **Expandable Tables** - For multi-level hierarchical data
2. **Custom Filters** - Add dynamic filtering to your reports
3. **Chart Combinations** - Mix different visualization types
4. **Scheduled Reports** - Automate report generation

---

For more information, see:
- `CLICKABLE_BAR_IMPLEMENTATION.md` - Technical implementation details
- `IMPLEMENTATION_SUMMARY.md` - Complete change summary

