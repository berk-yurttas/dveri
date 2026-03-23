-- Create table for storing Talaşlı İmalat historical data
-- This table is in the IVME database (mes_production schema)

CREATE TABLE IF NOT EXISTS mes_production.firma_makina_planlanan_doluluk_history (
    id SERIAL PRIMARY KEY,
    "Firma Adı" TEXT NOT NULL,
    week TEXT NOT NULL,  -- Format: YYYY-WNN (e.g., "2026-W11")
    "Aylık Planlanan Doluluk Oranı" NUMERIC NOT NULL CHECK ("Aylık Planlanan Doluluk Oranı" >= 0 AND "Aylık Planlanan Doluluk Oranı" <= 100),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Ensure one record per company per week
    CONSTRAINT unique_firma_week UNIQUE ("Firma Adı", week)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_firma_makina_doluluk_history_firma 
    ON mes_production.firma_makina_planlanan_doluluk_history("Firma Adı");

CREATE INDEX IF NOT EXISTS idx_firma_makina_doluluk_history_week 
    ON mes_production.firma_makina_planlanan_doluluk_history(week DESC);

CREATE INDEX IF NOT EXISTS idx_firma_makina_doluluk_history_recorded_at 
    ON mes_production.firma_makina_planlanan_doluluk_history(recorded_at DESC);

-- Add comment to table
COMMENT ON TABLE mes_production.firma_makina_planlanan_doluluk_history IS 
    'Historical weekly snapshots of Talaşlı İmalat capacity analysis (doluluk oranı) per company';

COMMENT ON COLUMN mes_production.firma_makina_planlanan_doluluk_history."Firma Adı" IS 
    'Company name (Firma Adı)';

COMMENT ON COLUMN mes_production.firma_makina_planlanan_doluluk_history.week IS 
    'ISO week in format YYYY-WNN (e.g., 2026-W11)';

COMMENT ON COLUMN mes_production.firma_makina_planlanan_doluluk_history."Aylık Planlanan Doluluk Oranı" IS 
    'Monthly planned machine occupancy rate (Aylık Planlanan Doluluk Oranı) - value between 0 and 100';

COMMENT ON COLUMN mes_production.firma_makina_planlanan_doluluk_history.recorded_at IS 
    'Timestamp when this snapshot was recorded';

-- Insert dummy data for testing (recent weeks)
INSERT INTO mes_production.firma_makina_planlanan_doluluk_history ("Firma Adı", week, "Aylık Planlanan Doluluk Oranı") VALUES
-- Mikronmak Oto
('Mikronmak Oto', '2026-W09', 82.5),
('Mikronmak Oto', '2026-W10', 85.0),
('Mikronmak Oto', '2026-W11', 87.3),

-- 3EN Savunma Havacılık
('3EN Savunma Havacılık', '2026-W09', 88.0),
('3EN Savunma Havacılık', '2026-W10', 90.5),
('3EN Savunma Havacılık', '2026-W11', 92.8),

-- Delta Savunma
('Delta Savunma', '2026-W09', 75.5),
('Delta Savunma', '2026-W10', 78.2),
('Delta Savunma', '2026-W11', 80.4),

-- Nova Mekanik
('Nova Mekanik', '2026-W09', 83.0),
('Nova Mekanik', '2026-W10', 85.5),
('Nova Mekanik', '2026-W11', 88.2);

-- Verify data
SELECT 
    "Firma Adı",
    week,
    "Aylık Planlanan Doluluk Oranı",
    recorded_at
FROM mes_production.firma_makina_planlanan_doluluk_history
ORDER BY "Firma Adı", week DESC;

-- Test the query used by the frontend (latest per firma)
SELECT 
    "Firma Adı",
    "Aylık Planlanan Doluluk Oranı"
FROM (
    SELECT DISTINCT ON ("Firma Adı") 
        "Firma Adı",
        "Aylık Planlanan Doluluk Oranı",
        week
    FROM mes_production.firma_makina_planlanan_doluluk_history
    ORDER BY "Firma Adı", week DESC
) latest_per_firma;

-- Test the average query for "Tüm Firmalar"
SELECT 
    AVG("Aylık Planlanan Doluluk Oranı")::numeric(10,2) as avg_doluluk
FROM (
    SELECT DISTINCT ON ("Firma Adı") 
        "Firma Adı",
        "Aylık Planlanan Doluluk Oranı"
    FROM mes_production.firma_makina_planlanan_doluluk_history
    ORDER BY "Firma Adı", week DESC
) latest_per_firma;
