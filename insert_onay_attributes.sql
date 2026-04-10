-- Insert attribute definitions for approval signatures
-- These attributes will store "Onaylanmıştır" values
-- Table structure: attribute_definitions (id, name)

-- First, check the next available ID in attribute_definitions
-- SELECT MAX(id) FROM attribute_definitions;

-- Insert new attribute definitions (only id and name columns exist)
INSERT INTO attribute_definitions (name) VALUES
('Radar Program Dir. Onayı'),
('Radar Sistem Müh. Dir. Onayı'),
('Radom Düşük Gör. ve İleri Malz. Tsr. Dir. Onayı'),
('Yazılım Mühendisliği Dir. Onayı'),
('Süreç Tasarım ve Ürün Yön. Dir. Onayı'),
('Test ve Doğrulama Dir. Onayı'),
('Üretim Dir. Onayı'),
('Entegre Lojistik Destek Dir. Onayı'),
('Kalite Yönetim Dir. Onayı'),
('Elektronik Harp Prog. Dir Onayı'),
('Hab. EH ve Kendini Kor. Sis. Müh. Dir. Onayı'),
('Radar Elektronik Harp Sis. Müh. Dir. Onayı'),
('Donanım Tasarım Dir. Onayı'),
('REHİS Sektör Başkanı Onayı'),
('Mekanik Sis. Ve Platform Ent. Tsr. Dir. Onayı');

-- Now insert the attribute values for job_instance_id = 'test'
-- Table structure: job_instance_attributes (id, attribute_definition_id, value, updated_at, job_instance_id)

INSERT INTO job_instance_attributes (job_instance_id, attribute_definition_id, value, updated_at)
SELECT 
    'test',
    id,
    '"Onaylanmıştır"'::jsonb,
    CURRENT_TIMESTAMP
FROM attribute_definitions
WHERE name IN (
    'Radar Program Dir. Onayı',
    'Radar Sistem Müh. Dir. Onayı',
    'Radom Düşük Gör. ve İleri Malz. Tsr. Dir. Onayı',
    'Yazılım Mühendisliği Dir. Onayı',
    'Süreç Tasarım ve Ürün Yön. Dir. Onayı',
    'Test ve Doğrulama Dir. Onayı',
    'Üretim Dir. Onayı',
    'Entegre Lojistik Destek Dir. Onayı',
    'Kalite Yönetim Dir. Onayı',
    'Elektronik Harp Prog. Dir Onayı',
    'Hab. EH ve Kendini Kor. Sis. Müh. Dir. Onayı',
    'Radar Elektronik Harp Sis. Müh. Dir. Onayı',
    'Donanım Tasarım Dir. Onayı',
    'REHİS Sektör Başkanı Onayı',
    'Mekanik Sis. Ve Platform Ent. Tsr. Dir. Onayı'
);

-- Verify the insertion
SELECT 
    ad.name,
    ia.value,
    ia.updated_at,
    ia.job_instance_id
FROM 
    job_instance_attributes ia
LEFT JOIN attribute_definitions ad ON ia.attribute_definition_id = ad.id
WHERE ia.job_instance_id = 'test'
AND ad.name LIKE '%Onayı'
ORDER BY ad.name;

-- Update the sequences (primary key counters) to avoid conflicts
-- This ensures the next INSERT will use the correct ID

-- Update attribute_definitions sequence
SELECT setval('attribute_definitions_id_seq', (SELECT MAX(id) FROM attribute_definitions));

-- Update job_instance_attributes sequence
SELECT setval('job_instance_attributes_id_seq', (SELECT MAX(id) FROM job_instance_attributes));
