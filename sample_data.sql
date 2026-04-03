-- Create attribute_definitions table
CREATE TABLE attribute_definitions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- Create job_instance_attributes table
CREATE TABLE job_instance_attributes (
    id SERIAL PRIMARY KEY,
    job_instance_id VARCHAR(255) NOT NULL,
    attribute_definition_id INTEGER REFERENCES attribute_definitions(id),
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert data into attribute_definitions
INSERT INTO attribute_definitions (id, name) VALUES
(1, 'Proje No (Proje dörtlü kodu ve U-P''li kodu)'),
(2, 'Proje Tanımı ( Proje Adı )'),
(3, 'Müşteri (Proje Ana Sözleşmesi''nin imza makamı)'),
(4, 'Proje Tipi'),
(5, 'Proje Aşaması'),
(6, 'Proje Süresi (ay)'),
(7, 'İlgili Süreçler ( Hangi Süreçler Etkileniyor? )'),
(8, 'Feragat Sorumlusu'),
(9, 'Feragat Bildirim Numarası (Feragatin koordinasyonu için başlatılan bildirim numarası)');

-- Insert data into job_instance_attributes
INSERT INTO job_instance_attributes (job_instance_id, attribute_definition_id, value, updated_at) VALUES
('test', 1, '"P63"'::jsonb, NOW() - INTERVAL '10 days'),
('test', 2, '"MURAD AESA"'::jsonb, NOW() - INTERVAL '10 days'),
('test', 3, '"SSI"'::jsonb, NOW() - INTERVAL '9 days'),
('test', 4, '"Geliştirme, Üretim, Öz Kaynaklı"'::jsonb, NOW() - INTERVAL '9 days'),
('test', 5, '"Seri Üretim"'::jsonb, NOW() - INTERVAL '8 days'),
('test', 6, '24'::jsonb, NOW() - INTERVAL '8 days'),
('test', 7, '"Tasarım, Üretim, Test"'::jsonb, NOW() - INTERVAL '7 days'),
('test', 8, '{"name": "ALI HAYDAR DEĞDAŞ", "email": "alihaydar@aselsan.com.tr", "username": "alihaydar", "department": "Genel Sistem Mühendisliği"}'::jsonb, NOW() - INTERVAL '7 days'),
('test', 9, '"12345"'::jsonb, NOW() - INTERVAL '6 days');

-- Verify the data
SELECT 
    ad."name",
    ia.value,
    ia.updated_at
FROM 
    job_instance_attributes ia
LEFT JOIN attribute_definitions ad ON ia.attribute_definition_id = ad.id
WHERE ia.job_instance_id = 'test'
ORDER BY ad.id;
