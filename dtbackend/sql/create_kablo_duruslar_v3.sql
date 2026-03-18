-- Create view for Kablaj Duruşlar (Stops/Downtimes)
-- This view provides stop records from the kablaj system
-- Used by the scheduler to track production stops

-- Create the base table that stores stop records
CREATE TABLE IF NOT EXISTS mes_production.kablo_duruslar_kayitlari (
    id SERIAL PRIMARY KEY,
    "Firma" TEXT NOT NULL,  -- Company name
    "STOP_START_DATE" TEXT,  -- Stop start date/time (stored as text)
    "FAULT_DESCRIPTION" TEXT  -- Fault/stop description
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_kablo_duruslar_firma 
    ON mes_production.kablo_duruslar_kayitlari("Firma");

CREATE INDEX IF NOT EXISTS idx_kablo_duruslar_stop_start_date 
    ON mes_production.kablo_duruslar_kayitlari("STOP_START_DATE" DESC);

CREATE INDEX IF NOT EXISTS idx_kablo_duruslar_fault_desc 
    ON mes_production.kablo_duruslar_kayitlari("FAULT_DESCRIPTION");

-- Add comments
COMMENT ON TABLE mes_production.kablo_duruslar_kayitlari IS 
    'Stop/downtime records for Kablaj (Cable) production';

COMMENT ON COLUMN mes_production.kablo_duruslar_kayitlari."Firma" IS 
    'Company name';

COMMENT ON COLUMN mes_production.kablo_duruslar_kayitlari."STOP_START_DATE" IS 
    'Stop start date/time (stored as text)';

COMMENT ON COLUMN mes_production.kablo_duruslar_kayitlari."FAULT_DESCRIPTION" IS 
    'Description of the fault/stop reason';

-- Insert dummy data for testing
INSERT INTO mes_production.kablo_duruslar_kayitlari 
    ("Firma", "STOP_START_DATE", "FAULT_DESCRIPTION") 
VALUES
-- KabloTek A.Ş.
('KabloTek A.Ş.', TO_CHAR(NOW() - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Terminal Eksikliği'),
('KabloTek A.Ş.', TO_CHAR(NOW() - INTERVAL '4 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Pres Makinası Arızası'),
('KabloTek A.Ş.', TO_CHAR(NOW() - INTERVAL '1 hour', 'YYYY-MM-DD HH24:MI:SS'), 'Ölçü Toleransı Dışında'),
('KabloTek A.Ş.', TO_CHAR(NOW() - INTERVAL '6 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Mühendislik Onayı Bekleniyor'),
('KabloTek A.Ş.', TO_CHAR(NOW() - INTERVAL '3 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Teknik Resim Eksik'),
('KabloTek A.Ş.', TO_CHAR(NOW() - INTERVAL '5 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Konnektör Tedarik Gecikmesi'),

-- ElektroKablo Ltd.
('ElektroKablo Ltd.', TO_CHAR(NOW() - INTERVAL '3 hours', 'YYYY-MM-DD HH24:MI:SS'), 'İzolasyon Malzemesi Yok'),
('ElektroKablo Ltd.', TO_CHAR(NOW() - INTERVAL '1 hour', 'YYYY-MM-DD HH24:MI:SS'), 'Test Sonucu Başarısız'),
('ElektroKablo Ltd.', TO_CHAR(NOW() - INTERVAL '4 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Kaynakçı Eksik'),
('ElektroKablo Ltd.', TO_CHAR(NOW() - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS'), 'First Article Inspection'),
('ElektroKablo Ltd.', TO_CHAR(NOW() - INTERVAL '7 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Fiber Optik Gecikti'),

-- TürkKablo San.
('TürkKablo San.', TO_CHAR(NOW() - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Bakır Tel Eksik'),
('TürkKablo San.', TO_CHAR(NOW() - INTERVAL '5 hours', 'YYYY-MM-DD HH24:MI:SS'), 'EMI Test Başarısız'),
('TürkKablo San.', TO_CHAR(NOW() - INTERVAL '1 hour', 'YYYY-MM-DD HH24:MI:SS'), 'Otomasyon Arızası'),
('TürkKablo San.', TO_CHAR(NOW() - INTERVAL '8 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Test Prosedürü Yok'),

-- SavunmaKablo A.Ş.
('SavunmaKablo A.Ş.', TO_CHAR(NOW() - INTERVAL '10 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Müşteri Onayı Bekleniyor'),
('SavunmaKablo A.Ş.', TO_CHAR(NOW() - INTERVAL '4 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Özel Konnektör İthalat'),
('SavunmaKablo A.Ş.', TO_CHAR(NOW() - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS'), 'İmpedans Değeri Hatalı'),

-- HavacilikKablo Ltd.
('HavacilikKablo Ltd.', TO_CHAR(NOW() - INTERVAL '6 hours', 'YYYY-MM-DD HH24:MI:SS'), 'AS-Spec Kablo Yokluğu'),
('HavacilikKablo Ltd.', TO_CHAR(NOW() - INTERVAL '3 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Crimping Tool Kalibrasyon'),

-- DefKablo Savunma
('DefKablo Savunma', TO_CHAR(NOW() - INTERVAL '12 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Malzeme Kalite Reddi'),
('DefKablo Savunma', TO_CHAR(NOW() - INTERVAL '5 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Üretim Planlama Değişikliği'),
('DefKablo Savunma', TO_CHAR(NOW() - INTERVAL '1 hour', 'YYYY-MM-DD HH24:MI:SS'), 'Operatör Değişimi'),

-- TeknoKablo A.Ş.
('TeknoKablo A.Ş.', TO_CHAR(NOW() - INTERVAL '9 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Bakım - Planlı'),
('TeknoKablo A.Ş.', TO_CHAR(NOW() - INTERVAL '2 hours', 'YYYY-MM-DD HH24:MI:SS'), 'Numune Onay Bekleniyor')
ON CONFLICT DO NOTHING;

-- Create the view (returns all stop records)
CREATE OR REPLACE VIEW mes_production.kablo_duruslar_v3 AS
SELECT 
    "Firma",
    "STOP_START_DATE",
    "FAULT_DESCRIPTION"
FROM mes_production.kablo_duruslar_kayitlari;

COMMENT ON VIEW mes_production.kablo_duruslar_v3 IS 
    'Stop records for Kablaj (Cable) production';

-- Verify base table data
SELECT 
    "Firma",
    COUNT(*) as total_stops,
    MIN("STOP_START_DATE") as oldest_stop,
    MAX("STOP_START_DATE") as newest_stop
FROM mes_production.kablo_duruslar_kayitlari
GROUP BY "Firma"
ORDER BY "Firma";

-- Test the view
SELECT * FROM mes_production.kablo_duruslar_v3
ORDER BY "Firma", "STOP_START_DATE" DESC;

-- Test the query used by the scheduler
SELECT "Firma", "STOP_START_DATE", "FAULT_DESCRIPTION"
FROM mes_production.kablo_duruslar_v3
ORDER BY "Firma", "STOP_START_DATE" DESC;

-- Statistics
SELECT 
    COUNT(DISTINCT "Firma") as total_companies,
    COUNT(*) as total_stops,
    COUNT(DISTINCT "FAULT_DESCRIPTION") as unique_faults,
    MIN("STOP_START_DATE") as oldest_stop,
    MAX("STOP_START_DATE") as newest_stop
FROM mes_production.kablo_duruslar_v3;

-- Stops by fault description
SELECT 
    "FAULT_DESCRIPTION",
    COUNT(*) as stop_count,
    COUNT(DISTINCT "Firma") as affected_companies
FROM mes_production.kablo_duruslar_v3
GROUP BY "FAULT_DESCRIPTION"
ORDER BY stop_count DESC
LIMIT 10;

-- Stops by company
SELECT 
    "Firma",
    COUNT(*) as total_stops,
    COUNT(DISTINCT "FAULT_DESCRIPTION") as unique_faults
FROM mes_production.kablo_duruslar_v3
GROUP BY "Firma"
ORDER BY total_stops DESC;

-- Example: Add a new stop
-- INSERT INTO mes_production.kablo_duruslar_kayitlari 
--     ("Firma", "STOP_START_DATE", "FAULT_DESCRIPTION")
-- VALUES 
--     ('New Kablo Ltd.', NOW(), 'Test Stop Reason');
