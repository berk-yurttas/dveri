-- Create view for Talaşlı İmalat Duruşlar (Stops/Downtimes)
-- This view provides stop records from the mekanik system
-- Used by the scheduler to track production stops

-- Create the base table that stores stop records
CREATE TABLE IF NOT EXISTS mes_production.mekanik_duruslar_kayitlari (
    id SERIAL PRIMARY KEY,
    "NAME" TEXT NOT NULL,  -- Company/Machine name
    "Reason" TEXT,  -- Stop reason/description
    "StartTime" TEXT  -- Stop start time (stored as text)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mekanik_duruslar_name 
    ON mes_production.mekanik_duruslar_kayitlari("NAME");

CREATE INDEX IF NOT EXISTS idx_mekanik_duruslar_starttime 
    ON mes_production.mekanik_duruslar_kayitlari("StartTime" DESC);

CREATE INDEX IF NOT EXISTS idx_mekanik_duruslar_reason 
    ON mes_production.mekanik_duruslar_kayitlari("Reason");

-- Add comments
COMMENT ON TABLE mes_production.mekanik_duruslar_kayitlari IS 
    'Stop/downtime records for Talaşlı İmalat (Mechanical) production';

COMMENT ON COLUMN mes_production.mekanik_duruslar_kayitlari."NAME" IS 
    'Company or machine name';

COMMENT ON COLUMN mes_production.mekanik_duruslar_kayitlari."Reason" IS 
    'Stop reason/description';

COMMENT ON COLUMN mes_production.mekanik_duruslar_kayitlari."StartTime" IS 
    'Stop start time (stored as text)';

-- Insert dummy data for testing
INSERT INTO mes_production.mekanik_duruslar_kayitlari 
    ("NAME", "Reason", "StartTime") 
VALUES
-- Mikronmak Oto
('Mikronmak Oto', 'Malzeme Eksikliği - Terminal', TO_CHAR(NOW() - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS')),
('Mikronmak Oto', 'Kalite Kontrol Bekleniyor', TO_CHAR(NOW() - INTERVAL '4 hours', 'YYYY-MM-DD HH24:MI:SS')),
('Mikronmak Oto', 'Takım Değişimi', TO_CHAR(NOW() - INTERVAL '30 minutes', 'YYYY-MM-DD HH24:MI:SS')),

-- 3EN Savunma Havacılık
('3EN Savunma Havacılık', 'Makine Arızası - Torna', TO_CHAR(NOW() - INTERVAL '5 hours', 'YYYY-MM-DD HH24:MI:SS')),
('3EN Savunma Havacılık', 'Hammadde Bekleniyor', TO_CHAR(NOW() - INTERVAL '1 hour', 'YYYY-MM-DD HH24:MI:SS')),

-- Delta Savunma
('Delta Savunma', 'Elektrik Kesintisi', TO_CHAR(NOW() - INTERVAL '3 hours', 'YYYY-MM-DD HH24:MI:SS')),
('Delta Savunma', 'Operatör Eğitimi', TO_CHAR(NOW() - INTERVAL '6 hours', 'YYYY-MM-DD HH24:MI:SS')),
('Delta Savunma', 'Teknik Resim Revizyonu Bekleniyor', TO_CHAR(NOW() - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS')),

-- Nova Mekanik
('Nova Mekanik', 'Bakım - Önleyici', TO_CHAR(NOW() - INTERVAL '4 hours', 'YYYY-MM-DD HH24:MI:SS')),
('Nova Mekanik', 'Ölçü Aleti Kalibrasyon', TO_CHAR(NOW() - INTERVAL '1 hour', 'YYYY-MM-DD HH24:MI:SS')),

-- Aselsan Konya
('Aselsan Konya', 'Malzeme Kalite Uygunsuzluğu', TO_CHAR(NOW() - INTERVAL '8 hours', 'YYYY-MM-DD HH24:MI:SS')),
('Aselsan Konya', 'Mühendislik Onayı Bekleniyor', TO_CHAR(NOW() - INTERVAL '10 hours', 'YYYY-MM-DD HH24:MI:SS')),

-- Havelsan
('Havelsan', 'CNC Program Hatası', TO_CHAR(NOW() - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS')),

-- Roketsan Yan Sanayi
('Roketsan Yan Sanayi', 'Ürün Spesifikasyonu Güncellemesi', TO_CHAR(NOW() - INTERVAL '12 hours', 'YYYY-MM-DD HH24:MI:SS')),
('Roketsan Yan Sanayi', 'Kesici Takım Tedarik Gecikmesi', TO_CHAR(NOW() - INTERVAL '1 day', 'YYYY-MM-DD HH24:MI:SS'))
ON CONFLICT DO NOTHING;

-- Create the view (returns all stop records)
CREATE OR REPLACE VIEW mes_production.mekanik_duruslar_v3 AS
SELECT 
    "NAME",
    "Reason",
    "StartTime"
FROM mes_production.mekanik_duruslar_kayitlari;

COMMENT ON VIEW mes_production.mekanik_duruslar_v3 IS 
    'Stop records for Talaşlı İmalat production';

-- Verify base table data
SELECT 
    "NAME",
    COUNT(*) as total_stops,
    MIN("StartTime") as oldest_stop,
    MAX("StartTime") as newest_stop
FROM mes_production.mekanik_duruslar_kayitlari
GROUP BY "NAME"
ORDER BY "NAME";

-- Test the view
SELECT * FROM mes_production.mekanik_duruslar_v3
ORDER BY "NAME", "StartTime" DESC;

-- Test the query used by the scheduler
SELECT "NAME", "Reason", "StartTime" 
FROM mes_production.mekanik_duruslar_v3
ORDER BY "NAME", "StartTime" DESC;

-- Statistics
SELECT 
    COUNT(DISTINCT "NAME") as total_companies,
    COUNT(*) as total_stops,
    COUNT(DISTINCT "Reason") as unique_reasons,
    MIN("StartTime") as oldest_stop,
    MAX("StartTime") as newest_stop
FROM mes_production.mekanik_duruslar_v3;

-- Stops by reason
SELECT 
    "Reason",
    COUNT(*) as stop_count,
    COUNT(DISTINCT "NAME") as affected_companies
FROM mes_production.mekanik_duruslar_v3
GROUP BY "Reason"
ORDER BY stop_count DESC
LIMIT 10;

-- Example: Add a new stop
-- INSERT INTO mes_production.mekanik_duruslar_kayitlari 
--     ("NAME", "Reason", "StartTime")
-- VALUES 
--     ('New Company Ltd.', 'Test Stop Reason', NOW());
