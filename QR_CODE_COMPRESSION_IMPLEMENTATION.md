# QR Code Compression Implementation

## Overview
This implementation compresses QR code data from ~150 characters (JSON) to just **12 characters** (alphanumeric code), making QR codes:
- **92% smaller** - Faster to scan
- **More reliable** - Less prone to scanning errors
- **Future-proof** - JSON structure can be changed without affecting QR codes

## How It Works

### 1. QR Code Generation (Musteri Role)
When a customer generates a QR code:

1. **Frontend** (`dtfrontend/src/app/[platform]/atolye/page.tsx`):
   ```typescript
   // Sends data wrapped in flexible JSON structure
   POST /romiot/station/qr-code/generate
   {
     "data": {
       "AselsanSiparisNo": "ORD-12345",
       "SiparisKalemi": "ITEM-001",
       "AselsanIsEmriNo": "ASEL-2024-001",
       "IsEmriAdedi": 10,
       "UreticiFirmaNo": "TEST-MFG-001"
     }
   }
   ```

2. **Backend** (`dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py`):
   - Generates a unique 12-character code (e.g., `A7K9M2P4Q8R1`)
   - Stores the full JSON in database
   - Returns the short code

3. **QR Code Display**:
   - QR code contains only: `A7K9M2P4Q8R1` (12 characters)
   - Instead of: `{"AselsanSiparisNo":"ORD-12345",...}` (~150 characters)

### 2. QR Code Scanning (Operator Role)
When an operator scans a QR code:

1. **Scanner reads**: `A7K9M2P4Q8R1`

2. **Frontend** detects short code format and retrieves data:
   ```typescript
   GET /romiot/station/qr-code/retrieve/A7K9M2P4Q8R1
   ```

3. **Backend** returns the original JSON structure:
   ```json
   {
     "data": {
       "AselsanSiparisNo": "ORD-12345",
       "SiparisKalemi": "ITEM-001",
       "AselsanIsEmriNo": "ASEL-2024-001",
       "IsEmriAdedi": 10,
       "UreticiFirmaNo": "TEST-MFG-001"
     }
   }
   ```

4. **Processing continues** with the full data as before

## Database Schema

### New Table: `qr_code_data`
```sql
CREATE TABLE qr_code_data (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,      -- Short 12-char code
    data TEXT NOT NULL,                     -- Full JSON as text
    company VARCHAR(255) NOT NULL,          -- Company for filtering
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE     -- Optional expiry (1 year default)
);

CREATE INDEX idx_qr_code_code ON qr_code_data(code);
CREATE INDEX idx_qr_code_company ON qr_code_data(company);
```

## API Endpoints

### POST `/romiot/station/qr-code/generate`
**Role Required**: `atolye:<company>:musteri`

**Request**:
```json
{
  "data": {
    // Any JSON structure - flexible for future changes
  }
}
```

**Response**:
```json
{
  "code": "A7K9M2P4Q8R1",
  "expires_at": "2026-01-07T10:30:00Z"
}
```

### GET `/romiot/station/qr-code/retrieve/{code}`
**Role Required**: `atolye:<company>:operator`

**Response**:
```json
{
  "data": {
    // Original JSON structure returned as-is
  }
}
```

## Benefits

### 1. Size Reduction
- **Before**: ~150 characters (JSON string)
- **After**: 12 characters (short code)
- **Reduction**: 92%

### 2. Scanning Speed
- Smaller QR codes scan faster
- More reliable in poor lighting
- Less affected by damage/dirt

### 3. Flexibility
- JSON structure stored in database can be changed
- Old QR codes remain compatible
- Easy to add new fields without regenerating QR codes

### 4. Security
- QR codes don't expose sensitive data
- Can add expiry dates
- Easy to revoke/disable codes

### 5. Backward Compatibility
The system still supports:
- Legacy numeric encoding format
- Direct JSON format (for testing)
- Automatic detection of format type

## Code Format Detection

The scanner automatically detects three formats:

1. **New Compressed Format**: `[A-Z0-9]{10,20}` → Retrieves from database
2. **Legacy Numeric**: `\d+` (length % 5 === 0) → Decodes to JSON
3. **Direct JSON**: `{...}` → Parses directly

## Migration Path

### For Existing QR Codes
Old QR codes continue to work without changes. The system automatically detects and handles them.

### For New QR Codes
All new QR codes generated through the UI use the compressed format automatically.

## Files Modified

### Backend
- `dtbackend/app/models/romiot_models.py` - Added `QRCodeData` model
- `dtbackend/app/schemas/qr_code.py` - New schemas for QR code API
- `dtbackend/app/api/v1/endpoints/romiot/station/qr_code.py` - New endpoints
- `dtbackend/app/api/v1/api.py` - Registered QR code router

### Frontend
- `dtfrontend/src/app/[platform]/atolye/page.tsx`:
  - Updated `handleGenerateBarcode` to use compression API
  - Updated `handleQRCodeScan` to retrieve data from short codes
  - Maintained backward compatibility with legacy formats

## Testing

### Generate QR Code (Console)
```javascript
// In browser console on Musteri page
const qrData = {
  AselsanSiparisNo: "TEST-001",
  SiparisKalemi: "ITEM-001",
  AselsanIsEmriNo: "WORK-001",
  IsEmriAdedi: 10,
  UreticiFirmaNo: "MFG-001"
};

// Submit the form or call the API directly
```

### Scan QR Code (Console)
```javascript
// In browser console on Operator page after selecting mode
window.testQRCodeScan("A7K9M2P4Q8R1");
```

## Next Steps

1. **Run Database Migration**: Create the `qr_code_data` table
2. **Test QR Generation**: Verify short codes are generated
3. **Test Scanning**: Verify operators can scan and retrieve data
4. **Optional**: Add cleanup job for expired QR codes
5. **Optional**: Add analytics tracking for QR code usage

## Configuration

### QR Code Expiry
Default: 1 year (365 days)
Location: `qr_code.py` line 54
```python
expires_at = datetime.now(timezone.utc) + timedelta(days=365)
```

### Code Length
Default: 12 characters
Location: `qr_code.py` line 18
```python
def generate_short_code(length: int = 12) -> str:
```

### Character Set
Default: Uppercase A-Z + Digits 0-9 (36 characters)
- Provides 36^12 = ~4.7 quadrillion unique codes
- Optimized for QR code encoding efficiency

