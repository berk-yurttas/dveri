-- Create table for storing Duruş (Stop/Downtime) historical data
-- This table stores weekly snapshots of actual stop records per company
-- Replaces the previous aselsan_kaynakli_durma_history which only stored counts

-- Drop the old table if you want to replace it
-- DROP TABLE IF EXISTS mes_production.aselsan_kaynakli_durma_history CASCADE;

CREATE TABLE IF NOT EXISTS mes_production.durus_history (
    id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,  -- 'talasli_imalat' or 'kablaj'
    firma TEXT NOT NULL,  -- Company name
    week TEXT NOT NULL,  -- Format: YYYY-WNN (e.g., "2026-W11")
    durus_reason TEXT NOT NULL,  -- Stop reason/fault description
    durus_start_time TIMESTAMP WITH TIME ZONE NOT NULL,  -- When the stop started
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Composite unique constraint: one record per platform/company/week/stop_start_time
    CONSTRAINT unique_platform_firma_week_stop UNIQUE (platform, firma, week, durus_start_time)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_durus_history_platform 
    ON mes_production.durus_history(platform);

CREATE INDEX IF NOT EXISTS idx_durus_history_firma 
    ON mes_production.durus_history(firma);

CREATE INDEX IF NOT EXISTS idx_durus_history_week 
    ON mes_production.durus_history(week DESC);

CREATE INDEX IF NOT EXISTS idx_durus_history_platform_firma_week
    ON mes_production.durus_history(platform, firma, week);

CREATE INDEX IF NOT EXISTS idx_durus_history_reason 
    ON mes_production.durus_history(durus_reason);

CREATE INDEX IF NOT EXISTS idx_durus_history_recorded_at 
    ON mes_production.durus_history(recorded_at DESC);

-- Add comments
COMMENT ON TABLE mes_production.durus_history IS 
    'Historical weekly snapshots of stop/downtime records per company for Talaşlı İmalat and Kablaj platforms';

COMMENT ON COLUMN mes_production.durus_history.platform IS 
    'Platform identifier: talasli_imalat or kablaj';

COMMENT ON COLUMN mes_production.durus_history.firma IS 
    'Company name';

COMMENT ON COLUMN mes_production.durus_history.week IS 
    'ISO week in format YYYY-WNN (e.g., 2026-W11)';

COMMENT ON COLUMN mes_production.durus_history.durus_reason IS 
    'Stop reason or fault description (from Reason or FAULT_DESCRIPTION)';

COMMENT ON COLUMN mes_production.durus_history.durus_start_time IS 
    'Timestamp when the stop started (from StartTime or STOP_START_DATE)';

COMMENT ON COLUMN mes_production.durus_history.recorded_at IS 
    'Timestamp when this snapshot was recorded';

-- Insert dummy data for testing (recent weeks)
INSERT INTO mes_production.durus_history (platform, firma, week, durus_reason, durus_start_time) VALUES
-- Talaşlı İmalat - Week 09
('talasli_imalat', 'Mikronmak Oto', '2026-W09', 'Malzeme Eksikliği', '2026-02-24 08:30:00+00'),
('talasli_imalat', 'Mikronmak Oto', '2026-W09', 'Takım Değişimi', '2026-02-25 14:15:00+00'),
('talasli_imalat', '3EN Savunma Havacılık', '2026-W09', 'Makine Arızası', '2026-02-24 10:00:00+00'),
('talasli_imalat', 'Delta Savunma', '2026-W09', 'Elektrik Kesintisi', '2026-02-26 12:30:00+00'),

-- Talaşlı İmalat - Week 10
('talasli_imalat', 'Mikronmak Oto', '2026-W10', 'Kalite Kontrol Bekleniyor', '2026-03-02 09:00:00+00'),
('talasli_imalat', 'Mikronmak Oto', '2026-W10', 'Hammadde Gecikmesi', '2026-03-04 11:30:00+00'),
('talasli_imalat', '3EN Savunma Havacılık', '2026-W10', 'Ölçü Aleti Kalibrasyon', '2026-03-03 13:00:00+00'),
('talasli_imalat', 'Nova Mekanik', '2026-W10', 'Bakım - Önleyici', '2026-03-05 08:00:00+00'),

-- Talaşlı İmalat - Week 11  
('talasli_imalat', 'Mikronmak Oto', '2026-W11', 'Malzeme Eksikliği - Terminal', '2026-03-16 10:30:00+00'),
('talasli_imalat', '3EN Savunma Havacılık', '2026-W11', 'Makine Arızası - Torna', '2026-03-16 09:00:00+00'),
('talasli_imalat', 'Delta Savunma', '2026-W11', 'Teknik Resim Revizyonu', '2026-03-16 14:00:00+00'),

-- Kablaj - Week 09
('kablaj', 'KabloTek A.Ş.', '2026-W09', 'Terminal Eksikliği', '2026-02-24 09:00:00+00'),
('kablaj', 'KabloTek A.Ş.', '2026-W09', 'Pres Makinası Arızası', '2026-02-25 10:30:00+00'),
('kablaj', 'ElektroKablo Ltd.', '2026-W09', 'İzolasyon Malzemesi Yok', '2026-02-26 11:00:00+00'),
('kablaj', 'TürkKablo San.', '2026-W09', 'Bakır Tel Eksik', '2026-02-27 13:00:00+00'),

-- Kablaj - Week 10
('kablaj', 'KabloTek A.Ş.', '2026-W10', 'Ölçü Toleransı Dışında', '2026-03-02 08:30:00+00'),
('kablaj', 'ElektroKablo Ltd.', '2026-W10', 'Test Sonucu Başarısız', '2026-03-03 09:00:00+00'),
('kablaj', 'ElektroKablo Ltd.', '2026-W10', 'First Article Inspection', '2026-03-04 10:00:00+00'),
('kablaj', 'SavunmaKablo A.Ş.', '2026-W10', 'Müşteri Onayı Bekleniyor', '2026-03-05 14:00:00+00'),

-- Kablaj - Week 11
('kablaj', 'KabloTek A.Ş.', '2026-W11', 'Mühendislik Onayı Bekleniyor', '2026-03-16 08:00:00+00'),
('kablaj', 'KabloTek A.Ş.', '2026-W11', 'Teknik Resim Eksik', '2026-03-16 11:00:00+00'),
('kablaj', 'ElektroKablo Ltd.', '2026-W11', 'Kaynakçı Eksik', '2026-03-16 09:30:00+00'),
('kablaj', 'TürkKablo San.', '2026-W11', 'EMI Test Başarısız', '2026-03-16 10:00:00+00')
ON CONFLICT DO NOTHING;

-- Verify data
SELECT 
    platform,
    firma,
    week,
    durus_reason,
    durus_start_time,
    recorded_at
FROM mes_production.durus_history
ORDER BY platform, firma, week DESC, durus_start_time DESC
LIMIT 20;

-- Count stops per platform/week
SELECT 
    platform,
    week,
    COUNT(*) as total_stops,
    COUNT(DISTINCT firma) as companies_with_stops
FROM mes_production.durus_history
GROUP BY platform, week
ORDER BY platform, week DESC;

-- Count stops per company for latest week
SELECT 
    platform,
    firma,
    COUNT(*) as stop_count,
    MIN(durus_start_time) as earliest_stop,
    MAX(durus_start_time) as latest_stop
FROM mes_production.durus_history
WHERE week = '2026-W11'
GROUP BY platform, firma
ORDER BY platform, stop_count DESC;

-- Top stop reasons by platform
SELECT 
    platform,
    durus_reason,
    COUNT(*) as occurrence_count,
    COUNT(DISTINCT firma) as affected_companies
FROM mes_production.durus_history
WHERE week >= '2026-W09'
GROUP BY platform, durus_reason
ORDER BY platform, occurrence_count DESC
LIMIT 20;

-- Query for frontend: Get stop history for a specific company
SELECT 
    week,
    durus_reason,
    durus_start_time,
    recorded_at
FROM mes_production.durus_history
WHERE platform = 'talasli_imalat' 
    AND firma = 'Mikronmak Oto'
ORDER BY week DESC, durus_start_time DESC
LIMIT 50;

-- Query: Compare stop counts week-over-week
SELECT 
    platform,
    firma,
    week,
    COUNT(*) as stop_count
FROM mes_production.durus_history
WHERE week >= '2026-W08'
GROUP BY platform, firma, week
ORDER BY platform, firma, week DESC;

-- Query: All stops for current week
SELECT 
    platform,
    firma,
    durus_reason,
    durus_start_time
FROM mes_production.durus_history
WHERE week = (
    SELECT MAX(week) FROM mes_production.durus_history
)
ORDER BY platform, firma, durus_start_time DESC;
