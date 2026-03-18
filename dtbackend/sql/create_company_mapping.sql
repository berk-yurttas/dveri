-- Create company_mapping table
-- This table maps various company name formats to standardized company names
-- Used to link data from different sources (e.g., seyir_alt_yuklenici to firma_makina_planlanan_doluluk)

CREATE TABLE IF NOT EXISTS mes_production.company_mapping (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL,  -- Source company name (from external systems)
    value TEXT NOT NULL,  -- Standardized company name (used in internal systems)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Ensure unique key mappings
    CONSTRAINT unique_company_key UNIQUE (key)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_company_mapping_key 
    ON mes_production.company_mapping(key);

CREATE INDEX IF NOT EXISTS idx_company_mapping_value 
    ON mes_production.company_mapping(value);

-- Add comments
COMMENT ON TABLE mes_production.company_mapping IS 
    'Company name mapping table - maps various company name formats to standardized names';

COMMENT ON COLUMN mes_production.company_mapping.key IS 
    'Source company name from external systems (e.g., Seyir system)';

COMMENT ON COLUMN mes_production.company_mapping.value IS 
    'Standardized company name used in internal systems';

-- Insert mapping data
INSERT INTO mes_production.company_mapping (key, value) VALUES
-- Core companies
('Mikronmak Oto', 'Mikronmak Oto'),
('3EN Savunma Havacılık', '3EN Savunma Havacılık'),
('Delta Savunma', 'Delta Savunma'),
('Nova Mekanik', 'Nova Mekanik'),

-- Kablaj companies
('KabloTek A.Ş.', 'KabloTek A.Ş.'),
('ElektroKablo Ltd.', 'ElektroKablo Ltd.'),
('TürkKablo San.', 'TürkKablo San.'),
('SavunmaKablo A.Ş.', 'SavunmaKablo A.Ş.'),
('HavacilikKablo Ltd.', 'HavacilikKablo Ltd.'),
('DefKablo Savunma', 'DefKablo Savunma'),
('TeknoKablo A.Ş.', 'TeknoKablo A.Ş.'),

-- Alternative name mappings (examples)
('Mikronmak', 'Mikronmak Oto'),
('3EN Savunma', '3EN Savunma Havacılık'),
('3EN', '3EN Savunma Havacılık'),
('Delta', 'Delta Savunma'),
('Nova', 'Nova Mekanik'),
('KabloTek', 'KabloTek A.Ş.'),
('ElektroKablo', 'ElektroKablo Ltd.'),
('TürkKablo', 'TürkKablo San.'),
('SavunmaKablo', 'SavunmaKablo A.Ş.'),
('HavacilikKablo', 'HavacilikKablo Ltd.'),
('DefKablo', 'DefKablo Savunma'),
('TeknoKablo', 'TeknoKablo A.Ş.')
ON CONFLICT (key) DO NOTHING;

-- Verify the mappings
SELECT 
    key as "Kaynak İsim",
    value as "Standart İsim",
    created_at as "Oluşturulma"
FROM mes_production.company_mapping
ORDER BY value, key;

-- Count mappings per standardized company
SELECT 
    value as "Standart Firma Adı",
    COUNT(*) as "Eşleşme Sayısı",
    array_agg(key ORDER BY key) as "Kaynak İsimler"
FROM mes_production.company_mapping
GROUP BY value
ORDER BY value;

-- Example usage: Test the mapping with a join
SELECT 
    cm.key as "Seyir Sistem Adı",
    cm.value as "Standart Firma Adı",
    'Mapped' as "Durum"
FROM mes_production.company_mapping cm
LIMIT 10;
