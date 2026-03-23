-- Create table for Seyir Alt Yüklenici Mesüretim Kayıtları
CREATE TABLE IF NOT EXISTS mes_production.seyir_alt_yuklenici_mesuretim_kayitları (
    id SERIAL PRIMARY KEY,
    "Satıcı Tanım" VARCHAR(255),
    "İş Emri Durumu" VARCHAR(100),
    "Açık MG de" TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_satici_tanim ON mes_production.seyir_alt_yuklenici_mesuretim_kayitları("Satıcı Tanım");
CREATE INDEX IF NOT EXISTS idx_is_emri_durumu ON mes_production.seyir_alt_yuklenici_mesuretim_kayitları("İş Emri Durumu");

-- Add comment to table
COMMENT ON TABLE mes_production.seyir_alt_yuklenici_mesuretim_kayitları IS 'Seyir alt yüklenici ölçüm kayıtları - açık iş emirleri ve tutarlar';

-- Add comments to columns
COMMENT ON COLUMN mes_production.seyir_alt_yuklenici_mesuretim_kayitları."Satıcı Tanım" IS 'Tedarikçi/Satıcı firma adı';
COMMENT ON COLUMN mes_production.seyir_alt_yuklenici_mesuretim_kayitları."İş Emri Durumu" IS 'İş emrinin mevcut durumu (null olabilir)';
COMMENT ON COLUMN mes_production.seyir_alt_yuklenici_mesuretim_kayitları."Açık MG de" IS 'Açık iş emri tutarı (USD) - European format text (e.g., 1.234,56)';

-- Dummy insert queries for testing (using European number format: dot for thousands, comma for decimal)
INSERT INTO mes_production.seyir_alt_yuklenici_mesuretim_kayitları ("Satıcı Tanım", "İş Emri Durumu", "Açık MG de") VALUES
-- Mikronmak Oto records
('Mikronmak Oto', 'Açık', '125.000,00'),
('Mikronmak Oto', 'Devam Ediyor', '85.000,00'),
('Mikronmak Oto', 'Beklemede', '45.000,00'),
('Mikronmak Oto', NULL, '30.000,00'),
('Mikronmak Oto', 'Açık', '95.000,00'),
('Mikronmak Oto', NULL, '15.000,00'),

-- 3EN Savunma Havacılık records
('3EN Savunma Havacılık', 'Açık', '215.000,00'),
('3EN Savunma Havacılık', 'Devam Ediyor', '180.000,00'),
('3EN Savunma Havacılık', 'Beklemede', '95.000,00'),
('3EN Savunma Havacılık', NULL, '55.000,00'),
('3EN Savunma Havacılık', 'Açık', '140.000,00'),
('3EN Savunma Havacılık', 'İmalat', '75.000,00'),
('3EN Savunma Havacılık', NULL, '25.000,00'),

-- Delta Savunma records
('Delta Savunma', 'Açık', '165.000,00'),
('Delta Savunma', 'Devam Ediyor', '125.000,00'),
('Delta Savunma', 'Beklemede', '88.000,00'),
('Delta Savunma', NULL, '42.000,00'),
('Delta Savunma', 'Açık', '110.000,00'),
('Delta Savunma', 'İmalat', '65.000,00'),
('Delta Savunma', NULL, '18.000,00'),

-- Nova Mekanik records
('Nova Mekanik', 'Açık', '195.000,00'),
('Nova Mekanik', 'Devam Ediyor', '145.000,00'),
('Nova Mekanik', 'Beklemede', '92.000,00'),
('Nova Mekanik', NULL, '38.000,00'),
('Nova Mekanik', 'Açık', '128.000,00'),
('Nova Mekanik', 'İmalat', '85.000,00'),
('Nova Mekanik', NULL, '22.000,00');

-- Verify data (converting text to numeric for aggregation)
SELECT 
    "Satıcı Tanım",
    COUNT(*) as "Toplam Kayıt",
    SUM(
        CASE WHEN "İş Emri Durumu" IS NOT NULL 
        THEN CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)
        ELSE 0 END
    )::numeric(10,2) as "Durumlu Tutar",
    SUM(
        CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)
    )::numeric(10,2) as "Toplam Tutar",
    ROUND((
        SUM(CASE WHEN "İş Emri Durumu" IS NOT NULL 
            THEN CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)
            ELSE 0 END) / 
        NULLIF(SUM(CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)), 0) * 100
    ), 2) as "Oran %"
FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitları
GROUP BY "Satıcı Tanım"
ORDER BY "Satıcı Tanım";

-- Overall totals
SELECT 
    'TOPLAM' as "Kategori",
    COUNT(*) as "Toplam Kayıt",
    SUM(
        CASE WHEN "İş Emri Durumu" IS NOT NULL 
        THEN CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)
        ELSE 0 END
    )::numeric(10,2) as "Durumlu Tutar",
    SUM(
        CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)
    )::numeric(10,2) as "Toplam Tutar",
    ROUND((
        SUM(CASE WHEN "İş Emri Durumu" IS NOT NULL 
            THEN CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)
            ELSE 0 END) / 
        NULLIF(SUM(CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)), 0) * 100
    ), 2) as "Oran %"
FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitları;
