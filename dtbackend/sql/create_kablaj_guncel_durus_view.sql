-- Create view for Kablaj current stop/error records
-- This view is used to track work orders with current stops/errors (durus)
-- Used by the scheduler to count errors per company (Firma)

-- First, create the base table that stores work order stop/error records
CREATE TABLE IF NOT EXISTS mes_production.kablaj_durus_kayitlari (
    id SERIAL PRIMARY KEY,
    "WORKORDERNO" TEXT NOT NULL,  -- Work order number
    "Firma" TEXT NOT NULL,  -- Company name
    "PRODUCTCODE" TEXT,  -- Product code
    "PRODUCTDESCRIPTION" TEXT,  -- Product description
    "DURUS_TIPI" TEXT,  -- Stop type (e.g., 'MALZEME_EKSIK', 'KALITE_PROBLEMI', etc.)
    "DURUS_ACIKLAMA" TEXT,  -- Stop description
    "DURUS_BASLANGIC" TIMESTAMP WITH TIME ZONE,  -- Stop start time
    "DURUS_BITIS" TIMESTAMP WITH TIME ZONE,  -- Stop end time (NULL if still active)
    "SURE_DAKIKA" INTEGER,  -- Duration in minutes
    "SORUMLU" TEXT,  -- Responsible party (e.g., 'ASELSAN', 'TEDARIKCI')
    "DURUM" TEXT NOT NULL DEFAULT 'ACIK',  -- Status: 'ACIK' (open) or 'KAPALI' (closed)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Ensure unique work order + stop record combination
    CONSTRAINT unique_kablaj_durus_record UNIQUE ("WORKORDERNO", "DURUS_BASLANGIC")
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_kablaj_durus_workorderno 
    ON mes_production.kablaj_durus_kayitlari("WORKORDERNO");

CREATE INDEX IF NOT EXISTS idx_kablaj_durus_firma 
    ON mes_production.kablaj_durus_kayitlari("Firma");

CREATE INDEX IF NOT EXISTS idx_kablaj_durus_durum 
    ON mes_production.kablaj_durus_kayitlari("DURUM");

CREATE INDEX IF NOT EXISTS idx_kablaj_durus_sorumlu 
    ON mes_production.kablaj_durus_kayitlari("SORUMLU");

CREATE INDEX IF NOT EXISTS idx_kablaj_durus_baslangic 
    ON mes_production.kablaj_durus_kayitlari("DURUS_BASLANGIC" DESC);

-- Add comments
COMMENT ON TABLE mes_production.kablaj_durus_kayitlari IS 
    'Work order stop/error records for Kablaj production - tracks all production stops';

COMMENT ON COLUMN mes_production.kablaj_durus_kayitlari."WORKORDERNO" IS 
    'Work order number (İş Emri No)';

COMMENT ON COLUMN mes_production.kablaj_durus_kayitlari."Firma" IS 
    'Company name (Firma Adı)';

COMMENT ON COLUMN mes_production.kablaj_durus_kayitlari."DURUM" IS 
    'Status: ACIK (open/active) or KAPALI (closed/resolved)';

COMMENT ON COLUMN mes_production.kablaj_durus_kayitlari."SORUMLU" IS 
    'Responsible party for the stop (e.g., ASELSAN, TEDARIKCI)';

-- Insert dummy data for testing
INSERT INTO mes_production.kablaj_durus_kayitlari 
    ("WORKORDERNO", "Firma", "PRODUCTCODE", "PRODUCTDESCRIPTION", "DURUS_TIPI", "DURUS_ACIKLAMA", 
     "DURUS_BASLANGIC", "DURUS_BITIS", "SURE_DAKIKA", "SORUMLU", "DURUM") 
VALUES
-- KabloTek A.Ş. - Active stops
('WO-KBL-2024-001', 'KabloTek A.Ş.', 'KB-001', 'Kablo Demeti A', 'MALZEME_EKSIK', 'Terminal eksik', NOW() - INTERVAL '2 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-002', 'KabloTek A.Ş.', 'KB-002', 'Kablo Demeti B', 'TEKNIK_SORUN', 'Pres makinası arızası', NOW() - INTERVAL '4 hours', NULL, NULL, 'TEDARIKCI', 'ACIK'),
('WO-KBL-2024-003', 'KabloTek A.Ş.', 'KB-003', 'Kablo Demeti C', 'KALITE_PROBLEMI', 'Ölçü toleransı dışında', NOW() - INTERVAL '1 hour', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-004', 'KabloTek A.Ş.', 'KB-004', 'Kablo Demeti D', 'ONAY_BEKLENIYOR', 'Mühendislik onayı bekleniyor', NOW() - INTERVAL '6 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-005', 'KabloTek A.Ş.', 'KB-005', 'Kablo Demeti E', 'DOKUMAN_EKSIK', 'Teknik resim eksik', NOW() - INTERVAL '3 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-006', 'KabloTek A.Ş.', 'KB-006', 'Kablo Demeti F', 'MALZEME_GECIKME', 'Konnektör tedarik gecikmesi', NOW() - INTERVAL '5 hours', NULL, NULL, 'ASELSAN', 'ACIK'),

-- ElektroKablo Ltd. - Active stops
('WO-KBL-2024-101', 'ElektroKablo Ltd.', 'KB-101', 'Güç Kablosu X', 'MALZEME_EKSIK', 'İzolasyon malzemesi yok', NOW() - INTERVAL '3 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-102', 'ElektroKablo Ltd.', 'KB-102', 'Güç Kablosu Y', 'KALITE_PROBLEMI', 'Test sonucu başarısız', NOW() - INTERVAL '1 hour', NULL, NULL, 'TEDARIKCI', 'ACIK'),
('WO-KBL-2024-103', 'ElektroKablo Ltd.', 'KB-103', 'Güç Kablosu Z', 'TEKNIK_SORUN', 'Kaynakçı eksik', NOW() - INTERVAL '4 hours', NULL, NULL, 'TEDARIKCI', 'ACIK'),
('WO-KBL-2024-104', 'ElektroKablo Ltd.', 'KB-104', 'Data Kablosu A', 'ONAY_BEKLENIYOR', 'First article inspection', NOW() - INTERVAL '2 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-105', 'ElektroKablo Ltd.', 'KB-105', 'Data Kablosu B', 'MALZEME_GECIKME', 'Fiber optik gecikti', NOW() - INTERVAL '7 hours', NULL, NULL, 'ASELSAN', 'ACIK'),

-- TürkKablo San. - Active stops
('WO-KBL-2024-201', 'TürkKablo San.', 'KB-201', 'Sinyal Kablosu 1', 'MALZEME_EKSIK', 'Bakır tel eksik', NOW() - INTERVAL '2 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-202', 'TürkKablo San.', 'KB-202', 'Sinyal Kablosu 2', 'KALITE_PROBLEMI', 'EMI test başarısız', NOW() - INTERVAL '5 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-203', 'TürkKablo San.', 'KB-203', 'Sinyal Kablosu 3', 'TEKNIK_SORUN', 'Otomasyon arızası', NOW() - INTERVAL '1 hour', NULL, NULL, 'TEDARIKCI', 'ACIK'),
('WO-KBL-2024-204', 'TürkKablo San.', 'KB-204', 'Kontrol Kablosu 1', 'DOKUMAN_EKSIK', 'Test prosedürü yok', NOW() - INTERVAL '8 hours', NULL, NULL, 'ASELSAN', 'ACIK'),

-- SavunmaKablo A.Ş. - Active stops
('WO-KBL-2024-301', 'SavunmaKablo A.Ş.', 'KB-301', 'Radar Kablosu A', 'ONAY_BEKLENIYOR', 'Müşteri onayı bekleniyor', NOW() - INTERVAL '10 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-302', 'SavunmaKablo A.Ş.', 'KB-302', 'Radar Kablosu B', 'MALZEME_GECIKME', 'Özel konnektör ithalat', NOW() - INTERVAL '4 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-303', 'SavunmaKablo A.Ş.', 'KB-303', 'Anten Kablosu X', 'KALITE_PROBLEMI', 'İmpedans değeri hatalı', NOW() - INTERVAL '2 hours', NULL, NULL, 'ASELSAN', 'ACIK'),

-- HavacilikKablo Ltd. - Active stops
('WO-KBL-2024-401', 'HavacilikKablo Ltd.', 'KB-401', 'Aviyonik Kablo 1', 'MALZEME_EKSIK', 'AS-spek kablo yokluğu', NOW() - INTERVAL '6 hours', NULL, NULL, 'ASELSAN', 'ACIK'),
('WO-KBL-2024-402', 'HavacilikKablo Ltd.', 'KB-402', 'Aviyonik Kablo 2', 'TEKNIK_SORUN', 'Crimping tool kalibrasyon', NOW() - INTERVAL '3 hours', NULL, NULL, 'TEDARIKCI', 'ACIK'),

-- Closed stops (historical data - should not be counted in the view)
('WO-KBL-2024-007', 'KabloTek A.Ş.', 'KB-007', 'Kablo Demeti Z', 'MALZEME_EKSIK', 'Çözüldü', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 1440, 'ASELSAN', 'KAPALI'),
('WO-KBL-2024-106', 'ElektroKablo Ltd.', 'KB-106', 'Data Kablosu C', 'KALITE_PROBLEMI', 'Çözüldü', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', 1440, 'TEDARIKCI', 'KAPALI')
ON CONFLICT DO NOTHING;

-- Create the view for current stop records (only open/active stops)
CREATE OR REPLACE VIEW mes_production.kablaj_guncel_durus_view AS
SELECT 
    "WORKORDERNO",
    "Firma",
    "PRODUCTCODE",
    "PRODUCTDESCRIPTION",
    "DURUS_TIPI",
    "DURUS_ACIKLAMA",
    "DURUS_BASLANGIC",
    "SORUMLU",
    "DURUM",
    created_at,
    updated_at
FROM mes_production.kablaj_durus_kayitlari
WHERE "DURUM" = 'ACIK';  -- Only include open/active stops

COMMENT ON VIEW mes_production.kablaj_guncel_durus_view IS 
    'Current (active/open) stop records for Kablaj production - used to count errors per company';

-- Verify base table data
SELECT 
    "Firma",
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE "DURUM" = 'ACIK') as open_stops,
    COUNT(*) FILTER (WHERE "DURUM" = 'KAPALI') as closed_stops,
    COUNT(*) FILTER (WHERE "SORUMLU" = 'ASELSAN') as aselsan_responsible
FROM mes_production.kablaj_durus_kayitlari
GROUP BY "Firma"
ORDER BY "Firma";

-- Test the view
SELECT * FROM mes_production.kablaj_guncel_durus_view
ORDER BY "Firma", "WORKORDERNO";

-- Test the query used by the scheduler (count of distinct work orders per company)
SELECT DISTINCT 
    "Firma", 
    COUNT("WORKORDERNO") OVER (PARTITION BY "Firma") AS "Sistemdeki Güncel Hata Sayısı" 
FROM (
    SELECT DISTINCT "WORKORDERNO", "Firma" 
    FROM mes_production.kablaj_guncel_durus_view
) subquery
ORDER BY "Firma";

-- Detailed breakdown by company
SELECT 
    "Firma",
    COUNT(DISTINCT "WORKORDERNO") as "Sistemdeki Güncel Hata Sayısı",
    COUNT(*) as total_stop_records,
    COUNT(DISTINCT "PRODUCTCODE") as affected_products,
    COUNT(*) FILTER (WHERE "SORUMLU" = 'ASELSAN') as aselsan_caused,
    COUNT(*) FILTER (WHERE "SORUMLU" = 'TEDARIKCI') as tedarikci_caused
FROM mes_production.kablaj_guncel_durus_view
GROUP BY "Firma"
ORDER BY "Sistemdeki Güncel Hata Sayısı" DESC;

-- Overall statistics
SELECT 
    COUNT(DISTINCT "Firma") as total_companies,
    COUNT(DISTINCT "WORKORDERNO") as total_work_orders_with_stops,
    COUNT(*) as total_stop_records,
    COUNT(*) FILTER (WHERE "SORUMLU" = 'ASELSAN') as aselsan_caused_stops,
    COUNT(*) FILTER (WHERE "SORUMLU" = 'TEDARIKCI') as tedarikci_caused_stops
FROM mes_production.kablaj_guncel_durus_view;

-- Example: Close a stop
-- UPDATE mes_production.kablaj_durus_kayitlari
-- SET "DURUM" = 'KAPALI', 
--     "DURUS_BITIS" = NOW(),
--     "SURE_DAKIKA" = EXTRACT(EPOCH FROM (NOW() - "DURUS_BASLANGIC")) / 60,
--     updated_at = NOW()
-- WHERE "WORKORDERNO" = 'WO-KBL-2024-001';

-- Example: Add a new stop
-- INSERT INTO mes_production.kablaj_durus_kayitlari 
--     ("WORKORDERNO", "Firma", "PRODUCTCODE", "DURUS_TIPI", "SORUMLU", "DURUM")
-- VALUES 
--     ('WO-KBL-2024-999', 'New Company Ltd.', 'KB-999', 'MALZEME_EKSIK', 'ASELSAN', 'ACIK');
