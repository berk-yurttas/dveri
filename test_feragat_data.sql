-- Test data for Feragat Formu sections E, F, G
-- Database: aflow_db (seyir database)

-- Step Definitions Table (if not exists)
CREATE TABLE IF NOT EXISTS step_definitions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job Step Instances Table (if not exists)
-- NOTE: assignee is in THIS table, not in step_definitions
CREATE TABLE IF NOT EXISTS job_step_instances (
    id SERIAL PRIMARY KEY,
    job_instance_id VARCHAR(100) NOT NULL,
    step_definition_id INTEGER REFERENCES step_definitions(id),
    assignee VARCHAR(100),
    status VARCHAR(50) NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Step Definitions for Section E (HAZIRLAYAN)
INSERT INTO step_definitions (id, name) VALUES
(1, 'Feragat Talebi Onayı'),
(2, 'Feragat Sorumlusu Onayı'),
(3, 'Sorumlu Bölge Müdürü Onayı');

-- Insert Step Definitions for Section F (KONTROL) - Radar
INSERT INTO step_definitions (id, name) VALUES
(4, 'Radar Program Dir. Onayı'),
(5, 'Radar Sistem Müh. Dir. Onayı'),
(6, 'Radom Düşük Gör. ve İleri Malz. Tsr. Dir. Onayı'),
(7, 'Yazılım Mühendisliği Dir. Onayı'),
(8, 'Platform Ent. Müh. ve Çevre Brm. Tsr. Dir Onayı'),
(9, 'Süreç Tasarım ve Ürün Yön. Dir. Onayı'),
(10, 'Test ve Doğrulama Dir. Onayı'),
(11, 'Üretim Dir. Onayı'),
(12, 'Entegre Lojistik Destek Dir. Onayı'),
(13, 'Kalite Yönetim Dir. Onayı');

-- Insert Step Definitions for Section F (KONTROL) - Elektronik Harp
INSERT INTO step_definitions (id, name) VALUES
(14, 'Elektronik Harp Prog. Dir Onayı'),
(15, 'Hab. EH ve Kendini Kor. Sis. Müh. Dir. Onayı'),
(16, 'Radar Elektronik Harp Sis. Müh. Dir. Onayı'),
(17, 'Donanım Tasarım Dir. Onayı');

-- Insert Step Definition for Section G (ONAY)
INSERT INTO step_definitions (id, name) VALUES
(18, 'REHİS Sektör Başkanı Onayı');

-- Insert Job Step Instances for job_instance_id = 'test'
-- NOTE: assignee is in job_step_instances table
-- Section E
INSERT INTO job_step_instances (job_instance_id, step_definition_id, assignee, status, completed_at) VALUES
('test', 1, 'yarenkaymak', 'done', '2026-04-08 11:01:50.966+0300'),
('test', 2, 'yarenkaymak', 'done', '2026-04-08 11:02:07.218+0300'),
('test', 3, 'yarenkaymak', 'done', '2026-04-08 11:02:21.471+0300');

-- Section F - Radar (for Feragat Türü = "Radar")
INSERT INTO job_step_instances (job_instance_id, step_definition_id, assignee, status, completed_at) VALUES
('test', 4, 'yarenkaymak', 'done', '2026-04-08 11:04:00.690+0300'),
('test', 5, 'yarenkaymak', 'done', '2026-04-08 11:04:09.065+0300'),
('test', 6, 'yarenkaymak', 'done', '2026-04-08 11:04:15.675+0300'),
('test', 7, 'yarenkaymak', 'done', '2026-04-08 11:04:23.193+0300'),
('test', 8, 'yarenkaymak', 'done', '2026-04-08 11:04:29.951+0300'),
('test', 9, 'yarenkaymak', 'done', '2026-04-08 11:04:35.484+0300'),
('test', 10, 'yarenkaymak', 'done', '2026-04-08 11:05:23.482+0300'),
('test', 11, 'yarenkaymak', 'done', '2026-04-08 11:05:41.388+0300'),
('test', 12, 'yarenkaymak', 'done', '2026-04-08 11:05:52.495+0300'),
('test', 13, 'yarenkaymak', 'done', '2026-04-08 11:05:54.290+0300');

-- Section G
INSERT INTO job_step_instances (job_instance_id, step_definition_id, assignee, status, completed_at) VALUES
('test', 18, 'yarenkaymak', 'done', '2026-04-08 11:10:50.235+0300');


-- Alternative: If you want to test Elektronik Harp type, use a different job_instance_id
INSERT INTO job_step_instances (job_instance_id, step_definition_id, assignee, status, completed_at) VALUES
('test_eh', 1, 'yarenkaymak', 'done', '2026-04-08 11:01:50.966+0300'),
('test_eh', 2, 'yarenkaymak', 'done', '2026-04-08 11:02:07.218+0300'),
('test_eh', 3, 'yarenkaymak', 'done', '2026-04-08 11:02:21.471+0300'),
('test_eh', 14, 'yarenkaymak', 'done', '2026-04-08 11:04:00.690+0300'),
('test_eh', 15, 'yarenkaymak', 'done', '2026-04-08 11:04:09.065+0300'),
('test_eh', 16, 'yarenkaymak', 'done', '2026-04-08 11:04:15.675+0300'),
('test_eh', 17, 'yarenkaymak', 'done', '2026-04-08 11:04:23.193+0300'),
('test_eh', 6, 'yarenkaymak', 'done', '2026-04-08 11:04:29.951+0300'),
('test_eh', 7, 'yarenkaymak', 'done', '2026-04-08 11:04:35.484+0300'),
('test_eh', 8, 'yarenkaymak', 'done', '2026-04-08 11:04:40.123+0300'),
('test_eh', 9, 'yarenkaymak', 'done', '2026-04-08 11:04:45.456+0300'),
('test_eh', 10, 'yarenkaymak', 'done', '2026-04-08 11:05:23.482+0300'),
('test_eh', 11, 'yarenkaymak', 'done', '2026-04-08 11:05:41.388+0300'),
('test_eh', 12, 'yarenkaymak', 'done', '2026-04-08 11:05:52.495+0300'),
('test_eh', 13, 'yarenkaymak', 'done', '2026-04-08 11:05:54.290+0300'),
('test_eh', 18, 'yarenkaymak', 'done', '2026-04-08 11:10:50.235+0300');


-- Verify data with CORRECT query (assignee from si, not sd)
SELECT 
    sd.name,
    si.assignee,
    si.completed_at
FROM 
    job_step_instances si
LEFT JOIN step_definitions sd ON si.step_definition_id = sd.id
WHERE si.job_instance_id = 'test'
AND sd.name LIKE '%Onayı'
AND si.status = 'done'
ORDER BY sd.id;

-- Check what data is returned (should remove " Onayı" suffix)
-- Expected output:
-- name                                          | assignee      | completed_at
-- Feragat Talebi Onayı                         | yarenkaymak   | 2026-04-08 11:01:50.966+0300
-- Feragat Sorumlusu Onayı                      | yarenkaymak   | 2026-04-08 11:02:07.218+0300
-- Sorumlu Bölge Müdürü Onayı                   | yarenkaymak   | 2026-04-08 11:02:21.471+0300
-- Radar Program Dir. Onayı                     | yarenkaymak   | 2026-04-08 11:04:00.690+0300
-- ... (and so on)

-- Check what data is returned (should remove " Onayı" suffix)
-- Expected output:
-- name                                          | assignee      | completed_at
-- Feragat Talebi Onayı                         | yarenkaymak   | 2026-04-08 11:01:50.966+0300
-- Feragat Sorumlusu Onayı                      | yarenkaymak   | 2026-04-08 11:02:07.218+0300
-- Sorumlu Bölge Müdürü Onayı                   | yarenkaymak   | 2026-04-08 11:02:21.471+0300
-- Radar Program Dir. Onayı                     | yarenkaymak   | 2026-04-08 11:04:00.690+0300
-- ... (and so on)
