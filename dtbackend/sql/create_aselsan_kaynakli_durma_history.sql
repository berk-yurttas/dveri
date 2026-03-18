-- Create table for storing Aselsan Kaynaklı Durma historical data
-- This table is in the IVME database (mes_production schema)
-- Stores weekly snapshots of system errors/work order stops by company

CREATE TABLE IF NOT EXISTS mes_production.aselsan_kaynakli_durma_history (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,  -- 'talasli_imalat' or 'kablaj'
    firma TEXT NOT NULL,  -- Company name (NAME for talasli, Firma for kablaj)
    week TEXT NOT NULL,  -- Format: YYYY-WNN (e.g., "2026-W11")
    hata_sayisi INTEGER NOT NULL CHECK (hata_sayisi >= 0),  -- Sistemdeki Güncel Hata Sayısı
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Ensure one record per platform per company per week
    CONSTRAINT unique_platform_firma_week UNIQUE (platform, firma, week)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_aselsan_durma_history_platform 
    ON mes_production.aselsan_kaynakli_durma_history(platform);

CREATE INDEX IF NOT EXISTS idx_aselsan_durma_history_firma 
    ON mes_production.aselsan_kaynakli_durma_history(firma);

CREATE INDEX IF NOT EXISTS idx_aselsan_durma_history_week 
    ON mes_production.aselsan_kaynakli_durma_history(week DESC);

CREATE INDEX IF NOT EXISTS idx_aselsan_durma_history_recorded_at 
    ON mes_production.aselsan_kaynakli_durma_history(recorded_at DESC);

-- Add comments to table
COMMENT ON TABLE mes_production.aselsan_kaynakli_durma_history IS 
    'Historical weekly snapshots of Aselsan-caused stops (system errors) per company for Talaşlı İmalat and Kablaj platforms';

COMMENT ON COLUMN mes_production.aselsan_kaynakli_durma_history.platform IS 
    'Platform identifier: talasli_imalat or kablaj';

COMMENT ON COLUMN mes_production.aselsan_kaynakli_durma_history.firma IS 
    'Company name (NAME from MES for Talaşlı İmalat, Firma from Kablaj)';

COMMENT ON COLUMN mes_production.aselsan_kaynakli_durma_history.week IS 
    'ISO week in format YYYY-WNN (e.g., 2026-W11)';

COMMENT ON COLUMN mes_production.aselsan_kaynakli_durma_history.hata_sayisi IS 
    'Number of current system errors (Sistemdeki Güncel Hata Sayısı)';

COMMENT ON COLUMN mes_production.aselsan_kaynakli_durma_history.recorded_at IS 
    'Timestamp when this snapshot was recorded';

-- Insert dummy data for testing (recent weeks)
INSERT INTO mes_production.aselsan_kaynakli_durma_history (platform, firma, week, hata_sayisi) VALUES
-- Talaşlı İmalat - Mikronmak Oto
('talasli_imalat', 'Mikronmak Oto', '2026-W09', 12),
('talasli_imalat', 'Mikronmak Oto', '2026-W10', 10),
('talasli_imalat', 'Mikronmak Oto', '2026-W11', 8),

-- Talaşlı İmalat - 3EN Savunma Havacılık
('talasli_imalat', '3EN Savunma Havacılık', '2026-W09', 5),
('talasli_imalat', '3EN Savunma Havacılık', '2026-W10', 6),
('talasli_imalat', '3EN Savunma Havacılık', '2026-W11', 4),

-- Talaşlı İmalat - Delta Savunma
('talasli_imalat', 'Delta Savunma', '2026-W09', 15),
('talasli_imalat', 'Delta Savunma', '2026-W10', 14),
('talasli_imalat', 'Delta Savunma', '2026-W11', 12),

-- Kablaj - Sample Companies
('kablaj', 'KabloTek A.Ş.', '2026-W09', 8),
('kablaj', 'KabloTek A.Ş.', '2026-W10', 7),
('kablaj', 'KabloTek A.Ş.', '2026-W11', 6),

('kablaj', 'ElektroKablo Ltd.', '2026-W09', 10),
('kablaj', 'ElektroKablo Ltd.', '2026-W10', 9),
('kablaj', 'ElektroKablo Ltd.', '2026-W11', 11);

-- Verify data
SELECT 
    platform,
    firma,
    week,
    hata_sayisi,
    recorded_at
FROM mes_production.aselsan_kaynakli_durma_history
ORDER BY platform, firma, week DESC;

-- Test query for Talaşlı İmalat (latest per firma)
SELECT 
    firma,
    hata_sayisi as "Sistemdeki Güncel Hata Sayısı"
FROM (
    SELECT DISTINCT ON (firma) 
        firma,
        hata_sayisi,
        week
    FROM mes_production.aselsan_kaynakli_durma_history
    WHERE platform = 'talasli_imalat'
    ORDER BY firma, week DESC
) latest_per_firma;

-- Test query for Kablaj (latest per firma)
SELECT 
    firma,
    hata_sayisi as "Sistemdeki Güncel Hata Sayısı"
FROM (
    SELECT DISTINCT ON (firma) 
        firma,
        hata_sayisi,
        week
    FROM mes_production.aselsan_kaynakli_durma_history
    WHERE platform = 'kablaj'
    ORDER BY firma, week DESC
) latest_per_firma;
