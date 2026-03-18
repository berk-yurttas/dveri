-- Create table/view for Talaşlı İmalat system errors
-- This stores current system error counts per company (NAME)
-- Used by the scheduler to fetch Aselsan Kaynaklı Durma data

-- Option 1: Create as a table (if it's a materialized/stored view)
CREATE TABLE IF NOT EXISTS mes_production.mekanik_sistemdeki_guncel_hata_sayisi (
    id SERIAL PRIMARY KEY,
    "NAME" TEXT NOT NULL,  -- Company name (Firma Adı)
    "Sistemdeki Güncel Hata Sayısı" INTEGER NOT NULL DEFAULT 0 CHECK ("Sistemdeki Güncel Hata Sayısı" >= 0),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Ensure one record per company
    CONSTRAINT unique_mekanik_hata_name UNIQUE ("NAME")
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_mekanik_hata_name 
    ON mes_production.mekanik_sistemdeki_guncel_hata_sayisi("NAME");

CREATE INDEX IF NOT EXISTS idx_mekanik_hata_updated_at 
    ON mes_production.mekanik_sistemdeki_guncel_hata_sayisi(updated_at DESC);

-- Add comments
COMMENT ON TABLE mes_production.mekanik_sistemdeki_guncel_hata_sayisi IS 
    'Current system error counts for Talaşlı İmalat companies - used for Aselsan Kaynaklı Durma tracking';

COMMENT ON COLUMN mes_production.mekanik_sistemdeki_guncel_hata_sayisi."NAME" IS 
    'Company name (Firma Adı)';

COMMENT ON COLUMN mes_production.mekanik_sistemdeki_guncel_hata_sayisi."Sistemdeki Güncel Hata Sayısı" IS 
    'Current count of system errors/stops';

COMMENT ON COLUMN mes_production.mekanik_sistemdeki_guncel_hata_sayisi.updated_at IS 
    'Timestamp when this record was last updated';

-- Insert dummy data for testing
INSERT INTO mes_production.mekanik_sistemdeki_guncel_hata_sayisi ("NAME", "Sistemdeki Güncel Hata Sayısı", updated_at) VALUES
('Mikronmak Oto', 8, NOW() - INTERVAL '5 minutes'),
('3EN Savunma Havacılık', 4, NOW() - INTERVAL '10 minutes'),
('Delta Savunma', 12, NOW() - INTERVAL '3 minutes'),
('Nova Mekanik', 6, NOW() - INTERVAL '8 minutes'),
('Aselsan Konya', 3, NOW() - INTERVAL '15 minutes'),
('Havelsan', 15, NOW() - INTERVAL '2 minutes'),
('Roketsan Yan Sanayi', 9, NOW() - INTERVAL '7 minutes'),
('TürkHavacılık A.Ş.', 11, NOW() - INTERVAL '12 minutes'),
('DefTek Savunma', 5, NOW() - INTERVAL '6 minutes'),
('Baykar Tedarikçisi', 2, NOW() - INTERVAL '20 minutes')
ON CONFLICT ("NAME") 
DO UPDATE SET 
    "Sistemdeki Güncel Hata Sayısı" = EXCLUDED."Sistemdeki Güncel Hata Sayısı",
    updated_at = EXCLUDED.updated_at;

-- Verify data
SELECT 
    "NAME",
    "Sistemdeki Güncel Hata Sayısı",
    updated_at
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi
ORDER BY "Sistemdeki Güncel Hata Sayısı" DESC;

-- Test the query used by the scheduler
SELECT 
    "NAME", 
    "Sistemdeki Güncel Hata Sayısı" 
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi
ORDER BY "NAME";

-- Example: Update error count for a company
-- UPDATE mes_production.mekanik_sistemdeki_guncel_hata_sayisi
-- SET "Sistemdeki Güncel Hata Sayısı" = 10, updated_at = NOW()
-- WHERE "NAME" = 'Mikronmak Oto';

-- Example: Add a new company
-- INSERT INTO mes_production.mekanik_sistemdeki_guncel_hata_sayisi ("NAME", "Sistemdeki Güncel Hata Sayısı")
-- VALUES ('New Company Ltd.', 7)
-- ON CONFLICT ("NAME") 
-- DO UPDATE SET 
--     "Sistemdeki Güncel Hata Sayısı" = EXCLUDED."Sistemdeki Güncel Hata Sayısı",
--     updated_at = NOW();

-- Statistics query
SELECT 
    COUNT(*) as total_companies,
    SUM("Sistemdeki Güncel Hata Sayısı") as total_errors,
    AVG("Sistemdeki Güncel Hata Sayısı")::numeric(10,2) as avg_errors_per_company,
    MAX("Sistemdeki Güncel Hata Sayısı") as max_errors,
    MIN("Sistemdeki Güncel Hata Sayısı") as min_errors
FROM mes_production.mekanik_sistemdeki_guncel_hata_sayisi;

-- Alternative Option 2: Create as a VIEW (if the data comes from another source table)
-- Uncomment this section if you want to create it as a view instead:

/*
-- Drop table if it was created
-- DROP TABLE IF EXISTS mes_production.mekanik_sistemdeki_guncel_hata_sayisi CASCADE;

-- Create as a view that aggregates from a source table
CREATE OR REPLACE VIEW mes_production.mekanik_sistemdeki_guncel_hata_sayisi AS
SELECT 
    firma_name AS "NAME",
    COUNT(*) AS "Sistemdeki Güncel Hata Sayısı"
FROM mes_production.mekanik_hata_kayitlari  -- Replace with actual source table
WHERE 
    hata_durumu = 'ACIK'  -- Only count open/active errors
    AND hata_tipi = 'SISTEM'  -- Only system errors
GROUP BY firma_name;

COMMENT ON VIEW mes_production.mekanik_sistemdeki_guncel_hata_sayisi IS 
    'View aggregating current system error counts for Talaşlı İmalat companies';
*/
