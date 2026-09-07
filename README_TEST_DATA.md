# C-Suite Dashboard Test Data Setup

Complete test data setup for the C-Suite Executive Dashboard with realistic dummy data.

## 📁 Files Included

1. **00_master_setup.sql** - Master script with schema creation and verification queries
2. **csuite_test_data.sql** - CSuite schema tables and data
3. **mes_production_test_data.sql** - MES Production schema tables and data
4. **README.md** - This file with setup instructions

## 🚀 Quick Start

### Step 1: Run Scripts in Order

Execute the SQL scripts in your PostgreSQL database in this exact order:

```bash
# Method 1: Using psql command line
psql -U your_username -d your_database -f 00_master_setup.sql
psql -U your_username -d your_database -f csuite_test_data.sql
psql -U your_username -d your_database -f mes_production_test_data.sql

# Method 2: Using PostgreSQL GUI (pgAdmin, DBeaver, etc.)
# Open each file and execute them in order
```

### Step 2: Verify Installation

Run this query to check if all data is loaded:

```sql
SELECT 
    'CSUITE SCHEMA' as category,
    'tedarikci_kapasite' as table_name,
    COUNT(*) as records
FROM csuite.tedarikci_kapasite
UNION ALL
SELECT 'CSUITE SCHEMA', 'aselsan_kaynakli_durma', COUNT(*) FROM csuite.aselsan_kaynakli_durma
UNION ALL
SELECT 'CSUITE SCHEMA', 'uretim_kalemleri', COUNT(*) FROM csuite.uretim_kalemleri
UNION ALL
SELECT 'MES_PRODUCTION SCHEMA', 'dijital_puantaj_genel_skor', COUNT(*) FROM mes_production.dijital_puantaj_genel_skor
UNION ALL
SELECT 'MES_PRODUCTION SCHEMA', 'altyapi2', COUNT(*) FROM mes_production.altyapi2
UNION ALL
SELECT 'MES_PRODUCTION SCHEMA', 'makine_doluluk_raw', COUNT(*) FROM mes_production.makine_doluluk_raw;
```

**Expected Output:**
- csuite.tedarikci_kapasite: 15 records
- csuite.aselsan_kaynakli_durma: 15 records
- csuite.uretim_kalemleri: 33 records
- mes_production.dijital_puantaj_genel_skor: 8 records
- mes_production.altyapi2: 26 records
- mes_production.makine_doluluk_raw: 30 records

## 📊 Test Data Overview

### Companies Included
- **Mikronmak Oto** - Automotive manufacturing
- **3EN Savunma Havacılık** - Defense & Aviation
- **Delta Savunma** - Defense systems
- **Nova Mekanik** - Mechanical engineering
- **Tüm Firmalar** - All companies aggregate

### Metrics & KPIs

#### Digital Scores (Dijital Skor)
- Mikronmak Oto: 78.5
- 3EN Savunma Havacılık: 85.3
- Delta Savunma: 72.6
- Nova Mekanik: 92.4

#### Capacity Utilization (Kapasite Doluluk)
- Range: 65% - 93%
- Includes trends over 30 days
- Machine-level granularity

#### Infrastructure (Altyapı)
- **CNC Machines**: 3-axis, 4-axis, 5-axis variants
- **CMM Machines**: 1-2 per company
- **Dizgi Hattı**: PCB assembly lines

#### Production Items (Üretim Kalemleri)
- **Talaşlı İmalat**: 4-6 items per company
- **Kablaj/EMM**: 3-4 items per company
- Total: 33 unique items

#### Order Values
- Range: $650K - $4.5M USD per company
- Multiple order types (S400, Y110, Y210, etc.)

## 🧪 Test Queries

### Test Dashboard KPIs
```sql
-- Get all metrics for a specific company
SELECT 
    d."Firma" as company,
    AVG(d."Toplam Puan")::numeric(5,2) as dijital_skor,
    COUNT(DISTINCT a.id) as cnc_count,
    SUM(t."TTPRICE_USD")::numeric(15,2) as total_orders_usd
FROM mes_production.dijital_puantaj_genel_skor d
LEFT JOIN mes_production.altyapi2 a ON d."Firma" = a."Firma"
LEFT JOIN mes_production.tokadb_acik_sas t ON d."Firma" = t."NAME1"
WHERE d."Firma" = 'Nova Mekanik'
GROUP BY d."Firma";
```

### Test Supplier Capacity
```sql
SELECT firma, name, value, unit, trend
FROM csuite.tedarikci_kapasite
WHERE firma = 'Mikronmak Oto'
ORDER BY id;
```

### Test Risk Analysis
```sql
SELECT 
    s."Satıcı Tanım" as supplier,
    SUM(CAST(REPLACE(REPLACE(s."Açık MG de", '.', ''), ',', '.') AS NUMERIC))::numeric(15,2) as impact,
    CASE WHEN s."İş Emri Durumu" != 'MES Kaydı Yoktur' 
         THEN 'MES Entegrasyonu Var' 
         ELSE 'MES Entegrasyonu Yok' 
    END as mes_status
FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari s
GROUP BY s."Satıcı Tanım", s."İş Emri Durumu"
ORDER BY impact DESC;
```

## 🎯 Testing the Dashboard

### Step 1: Start Your Backend
```bash
cd dtbackend
python main.py
```

### Step 2: Start Your Frontend
```bash
cd dtfrontend
npm run dev
```

### Step 3: Test Each Company
Navigate to your dashboard and use the company dropdown to test:

1. **Tüm Firmalar** - Should show aggregate data
2. **Mikronmak Oto** - Moderate performance metrics
3. **3EN Savunma Havacılık** - Good performance, more machines
4. **Delta Savunma** - Lower scores, needs improvement
5. **Nova Mekanik** - Best performance, highest scores

### Expected Behavior

#### Top KPI Cards
✅ Dijital Skor should display values between 70-92
✅ Kapsam should show dollar amounts in millions
✅ Alt Yapı Kapsamı should show machine ratios

#### Sidebar Cards
✅ CNC Sayısı: Shows distribution across 3, 4, 5 axis
✅ CMM Sayısı: Shows measurement machine count
✅ Dizgi Hattı: Shows PCB assembly line count

#### Main Panels
✅ Tedarikçi Kapasite Analizi: 3 categories with percentages and trends
✅ Duruşlar: Production stop counts with month-over-month changes

#### Tables
✅ Tedarikçi Risk Analizi: Sorted by impact/risk, shows all suppliers
✅ MES Entegrasyonu: Shows only MES-integrated suppliers

## 🔧 Troubleshooting

### Issue: Tables don't exist
**Solution**: Run scripts in order (00_master → csuite → mes_production)

### Issue: No data in tables
**Solution**: Check if INSERT statements executed successfully

```sql
-- Verify record counts
SELECT COUNT(*) FROM csuite.tedarikci_kapasite;
SELECT COUNT(*) FROM mes_production.dijital_puantaj_genel_skor;
```

### Issue: Dashboard shows "Yapım Aşamasında"
**Solution**: Check if company name mapping is correct

```sql
-- Verify company mapping
SELECT * FROM mes_production.company_mapping 
WHERE "key" = 'Your Company Name';
```

### Issue: Trend arrows not showing
**Solution**: Verify trend field values are 'up', 'down', or 'neutral'

```sql
-- Check trend values
SELECT DISTINCT trend FROM csuite.tedarikci_kapasite;
```

## 🔄 Reset Database

To start fresh and re-run all scripts:

```sql
-- WARNING: This deletes all test data!
DROP SCHEMA IF EXISTS csuite CASCADE;
DROP SCHEMA IF EXISTS mes_production CASCADE;

-- Then re-run all setup scripts in order
```

## 📝 Data Customization

### Adding More Companies

Edit the INSERT statements in both files:

```sql
-- In csuite_test_data.sql
INSERT INTO csuite.tedarikci_kapasite (firma, name, value, unit, trend) VALUES
('Your New Company', 'Talaşlı İmalat', 85.0, '%', 'up'),
-- ... more rows

-- In mes_production_test_data.sql
INSERT INTO mes_production.dijital_puantaj_genel_skor ("Firma", "Toplam Puan") VALUES
('Your New Company', 88.5);
```

### Adjusting Metrics

Modify the values in INSERT statements to simulate different scenarios:
- **High performance**: Scores 85-95, capacity 80-95%
- **Medium performance**: Scores 70-85, capacity 65-80%
- **Low performance**: Scores 60-70, capacity 50-65%

### Adding Time-Series Data

For more realistic trends, add more date-based records:

```sql
-- Add weekly data points
INSERT INTO mes_production.makine_doluluk_raw 
    ("Firma Adı", "Makina Kodu", "Aylık Planlanan Doluluk Oranı", "Date") 
VALUES
    ('Company', 'CNC-001', 75.5, CURRENT_DATE - INTERVAL '7 days'),
    ('Company', 'CNC-001', 77.2, CURRENT_DATE - INTERVAL '14 days'),
    -- ... more dates
```

## 📞 Support

If you encounter issues:

1. Check PostgreSQL logs for errors
2. Verify all scripts ran without errors
3. Confirm database connection in your backend config
4. Check browser console for frontend errors
5. Verify API endpoints are accessible

## 🎉 Success Checklist

- [ ] All 3 SQL scripts executed without errors
- [ ] Verification query shows correct record counts
- [ ] Dashboard loads without errors
- [ ] Company dropdown shows all 4 test companies
- [ ] Switching companies updates all metrics
- [ ] Tables populate with supplier data
- [ ] Trends and sparklines display correctly
- [ ] Hover effects work on table rows
- [ ] All badges and colors render properly

---

**Ready to test!** Your C-Suite dashboard should now display professional, realistic test data for all companies. 🚀
