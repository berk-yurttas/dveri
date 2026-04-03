# Uyarlama Feragat Formu Widget

## Overview

This widget displays and generates PDF reports for "Uyarlama Feragat Formu" (Adaptation Waiver Form) based on data from the "seyir" database.

## Components

### Frontend Widget
- **File**: `dtfrontend/src/components/widgets/feragat-formu-widget.tsx`
- **Widget ID**: `feragat-formu-widget`
- **Platform**: `seyir`, `amom`

### Backend API
- **File**: `dtbackend/app/api/v1/endpoints/feragat_formu.py`
- **Endpoint**: `GET /api/v1/feragat-formu/download-pdf?job_instance_id={id}`

### Database Schema
- **File**: `sample_data.sql`
- **Tables**:
  - `attribute_definitions` - Form field definitions
  - `job_instance_attributes` - Form data values

## Database Setup

Run the SQL script to create tables and insert sample data:

```bash
psql -U postgres -d seyir -f sample_data.sql
```

Or manually execute:

```sql
-- Create attribute_definitions table
CREATE TABLE attribute_definitions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- Create job_instance_attributes table
CREATE TABLE job_instance_attributes (
    id SERIAL PRIMARY KEY,
    job_instance_id INTEGER NOT NULL,
    attribute_definition_id INTEGER REFERENCES attribute_definitions(id),
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert sample data (see sample_data.sql for full data)
```

## Installation

### Backend Dependencies

Add to `requirements.txt`:
```
reportlab==4.0.7
```

Install:
```bash
cd dtbackend
pip install -r requirements.txt
```

### Frontend

The widget is already registered in the widget system.

## Usage

### 1. Add Widget to Dashboard

1. Navigate to Seyir or AMOM platform
2. Go to Dashboard Add page
3. Select "Uyarlama Feragat Formu" widget
4. Place it on the dashboard

### 2. View Form

The widget will automatically extract `job_instance_id` from URL query parameters:

```
https://yourapp.com/seyir/dashboard/123?job_instance_id=1
```

### 3. Download PDF

Click the "Feragat Formunu İndir" button to download the PDF report.

## Widget Features

- ✅ Reads data from `seyir` PostgreSQL database
- ✅ Displays form preview with all fields from section A (GENEL BİLGİLER)
- ✅ Extracts `job_instance_id` from URL parameters
- ✅ Downloads PDF with exact Excel layout
- ✅ Handles JSONB fields (strings, numbers, objects)
- ✅ Responsive design with loading and error states

## Form Fields

### Section A: GENEL BİLGİLER
1. Proje No (Proje dörtlü kodu ve U-P'li kodu)
2. Proje Tanımı (Proje Adı)
3. Müşteri (Proje Ana Sözleşmesi'nin imza makamı)
4. Proje Tipi (Geliştirme, Üretim, Öz Kaynaklı vb.)
5. Proje Aşaması
6. Proje Süresi (ay)
7. İlgili Süreçler (Hangi Süreçler Etkileniyor?)
8. Feragat Sorumlusu
9. Feragat Bildirim Numarası

### Section B: TALEP EDİLEN FERAGAT
- Description field for waiver details

## PDF Layout

The PDF matches the Excel screenshot exactly:
- Landscape A4 orientation
- Aselsan header with logo and title
- Blue color scheme matching corporate branding
- Section headers with blue background
- Grid layout with bordered cells
- Light blue background for data fields

## Database Configuration

The widget uses hard-coded database configuration for the "seyir" database:

```typescript
const seyirDbConfig = {
    db_type: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'seyir',
    user: 'postgres',
    password: 'postgres'
}
```

**Note**: Update these values in production to match your actual database credentials.

## Testing

### Test with Sample Data

1. Run SQL setup script
2. Navigate to: `http://localhost:3000/seyir/dashboard/add`
3. Add the widget
4. Visit with: `?job_instance_id=1`
5. Click download button

### Expected Result

- Form displays with 8 fields populated
- PDF downloads with proper formatting
- PDF layout matches Excel screenshot

## API Endpoints

### GET `/api/v1/feragat-formu/download-pdf`

**Parameters:**
- `job_instance_id` (required): Integer ID of the job instance

**Response:**
- PDF file stream
- Filename: `Uyarlama_Feragat_Formu_{job_instance_id}.pdf`

**Example:**
```bash
curl -X GET "http://localhost:8000/api/v1/feragat-formu/download-pdf?job_instance_id=1" \
  -H "Cookie: session=..." \
  --output form.pdf
```

## Troubleshooting

### Widget Not Loading
- Check if `job_instance_id` is in URL parameters
- Verify database connection settings
- Check browser console for errors

### PDF Download Fails
- Ensure `reportlab` is installed
- Check database contains data for the job_instance_id
- Verify API endpoint is registered in `app/api/v1/api.py`

### No Data Displayed
- Verify SQL tables exist: `attribute_definitions`, `job_instance_attributes`
- Check if data exists for the provided `job_instance_id`
- Confirm database connection credentials

## File Structure

```
dtfrontend/
  src/
    components/
      widgets/
        feragat-formu-widget.tsx       # Widget component
        index.ts                        # Widget registry
    app/
      [platform]/
        dashboard/
          [id]/
            page.tsx                    # Dashboard view page
            edit/
              page.tsx                  # Dashboard edit page
          add/
            page.tsx                    # Dashboard add page
            components/
              widget-adder.tsx          # Widget selector

dtbackend/
  app/
    api/
      v1/
        endpoints/
          feragat_formu.py             # PDF generation API
        api.py                         # Router registration
  requirements.txt                     # Python dependencies

sample_data.sql                        # Database schema & test data
```

## Future Enhancements

- [ ] Add section B form fields (TALEP EDİLEN FERAGAT)
- [ ] Add approval workflow fields
- [ ] Add file attachment support
- [ ] Add form validation
- [ ] Add email notification on PDF generation
- [ ] Add multilingual support
