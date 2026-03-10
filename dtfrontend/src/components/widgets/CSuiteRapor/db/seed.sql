-- ============================================================
--  C-Suite Rapor — Seed Data
-- ============================================================

-- ── Companies (used by tedarikci & aselsan tables) ──────────
INSERT INTO companies (name) VALUES
  ('Tüm Şirketler'),
  ('Anadolu Holding'),
  ('Türk Telekom'),
  ('Arçelik A.Ş.'),
  ('Vestel Elektronik'),
  ('Ford Otosan')
ON CONFLICT (name) DO NOTHING;

-- ── Dijital Skor ────────────────────────────────────────────
-- Per-company scores. Query returns ROUND(AVG(score)).
INSERT INTO dijital_skor (firma, score) VALUES
  ('Anadolu Holding',   45),
  ('Türk Telekom',      52),
  ('Arçelik A.Ş.',      29),
  ('Vestel Elektronik', 41),
  ('Ford Otosan',       61);

-- ── CNC Sayısı (firma, eksen_sayisi, amount) ────────────────
INSERT INTO cnc_sayisi (firma, eksen_sayisi, amount) VALUES
  ('Anadolu Holding', 3, 3),
  ('Anadolu Holding', 4, 9),
  ('Anadolu Holding', 5, 1),
  ('Türk Telekom', 3, 2),
  ('Türk Telekom', 4, 4),
  ('Türk Telekom', 5, 6),
  ('Arçelik A.Ş.', 3, 8),
  ('Arçelik A.Ş.', 4, 3),
  ('Arçelik A.Ş.', 5, 1),
  ('Vestel Elektronik', 3, 4),
  ('Vestel Elektronik', 4, 6),
  ('Vestel Elektronik', 5, 3),
  ('Ford Otosan', 3, 1),
  ('Ford Otosan', 4, 2),
  ('Ford Otosan', 5, 8);

-- ── CMM Sayısı (firma, eksen_sayisi, amount) ────────────────
INSERT INTO cmm_sayisi (firma, eksen_sayisi, amount) VALUES
  ('Anadolu Holding', 3, 2),
  ('Anadolu Holding', 4, 4),
  ('Anadolu Holding', 5, 2),
  ('Türk Telekom', 3, 5),
  ('Türk Telekom', 4, 8),
  ('Türk Telekom', 5, 8),
  ('Arçelik A.Ş.', 3, 1),
  ('Arçelik A.Ş.', 4, 3),
  ('Arçelik A.Ş.', 5, 1),
  ('Vestel Elektronik', 3, 3),
  ('Vestel Elektronik', 4, 5),
  ('Vestel Elektronik', 5, 3),
  ('Ford Otosan', 3, 6),
  ('Ford Otosan', 4, 10),
  ('Ford Otosan', 5, 11);

-- ── Dizgi Hattı (firma, eksen_sayisi, amount) ───────────────
INSERT INTO dizgi_hatti (firma, eksen_sayisi, amount) VALUES
  ('Anadolu Holding', 3, 2),
  ('Anadolu Holding', 4, 3),
  ('Anadolu Holding', 5, 1),
  ('Türk Telekom', 3, 5),
  ('Türk Telekom', 4, 7),
  ('Türk Telekom', 5, 6),
  ('Arçelik A.Ş.', 3, 1),
  ('Arçelik A.Ş.', 4, 2),
  ('Arçelik A.Ş.', 5, 1),
  ('Vestel Elektronik', 3, 3),
  ('Vestel Elektronik', 4, 4),
  ('Vestel Elektronik', 5, 2),
  ('Ford Otosan', 3, 6),
  ('Ford Otosan', 4, 8),
  ('Ford Otosan', 5, 8);

-- ── Kapsam ──────────────────────────────────────────────────
-- First query value
INSERT INTO kapsam_first (value) VALUES (850);
-- Second query value
INSERT INTO kapsam_second (value) VALUES (1500);

-- ── Alt Yapı Kapsamı (firma, amount) ────────────────────────
INSERT INTO alt_yapi_kapsami (firma, amount) VALUES
  ('Anadolu Holding',   22),
  ('Türk Telekom',      30),
  ('Arçelik A.Ş.',       9),
  ('Vestel Elektronik', 19),
  ('Ford Otosan',       42);

-- ── Tedarikçi Kapasite Analizi ──────────────────────────────
INSERT INTO tedarikci_kapasite (company_id, name, value, unit, trend) VALUES
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'),    'Talaşlı İmalat', 15, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'),    'Kablaj/EMM',     15, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'),    'Kart Dizgi',     15, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'),   'Talaşlı İmalat', 20, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'),   'Kablaj/EMM',     18, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'),   'Kart Dizgi',     25, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'),      'Talaşlı İmalat', 35, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'),      'Kablaj/EMM',     28, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'),      'Kart Dizgi',     32, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'),     'Talaşlı İmalat',  8, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'),     'Kablaj/EMM',     11, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'),     'Kart Dizgi',      7, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Talaşlı İmalat', 17, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Kablaj/EMM',     21, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Kart Dizgi',     14, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'),       'Talaşlı İmalat', 45, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'),       'Kablaj/EMM',     40, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'),       'Kart Dizgi',     38, '%', 'up');

-- ── Aselsan Kaynaklı Durma ──────────────────────────────────
INSERT INTO aselsan_kaynakli_durma (company_id, name, value, unit, trend) VALUES
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'),    'Talaşlı İmalat', 12, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'),    'Kablaj/EMM',     18, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'),    'Kart Dizgi',     10, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'),   'Talaşlı İmalat', 10, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'),   'Kablaj/EMM',     12, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'),   'Kart Dizgi',      8, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'),      'Talaşlı İmalat',  5, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'),      'Kablaj/EMM',      7, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'),      'Kart Dizgi',      4, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'),     'Talaşlı İmalat', 22, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'),     'Kablaj/EMM',     18, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'),     'Kart Dizgi',     25, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Talaşlı İmalat', 13, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Kablaj/EMM',      9, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Kart Dizgi',     16, '%', 'down'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'),       'Talaşlı İmalat',  3, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'),       'Kablaj/EMM',      2, '%', 'up'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'),       'Kart Dizgi',      5, '%', 'down');

-- ── Üretim Kalemleri (placeholder items) ─────────────────────
-- Different item counts per company so percentages vary.
-- A = COUNT(DISTINCT kalem_adi) WHERE kategori = 'Talaşlı İmalat'
-- B = COUNT(DISTINCT kalem_adi) WHERE kategori = 'Kablaj/EMM'
-- Talaşlı İmalat displays A/(A+B)%, Kablaj/EMM displays B/(A+B)%

-- Tüm Şirketler  (A=7, B=5 → 58% / 42%)
INSERT INTO uretim_kalemleri (company_id, kategori, kalem_adi) VALUES
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Talaşlı İmalat', 'Mil'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Talaşlı İmalat', 'Flanş'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Talaşlı İmalat', 'Gövde'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Talaşlı İmalat', 'Kapak'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Talaşlı İmalat', 'Burç'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Talaşlı İmalat', 'Pim'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Talaşlı İmalat', 'Kasnak'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Kablaj/EMM', 'Ana Kablo'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Kablaj/EMM', 'Sinyal Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Kablaj/EMM', 'Güç Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Kablaj/EMM', 'Kontrol Kartı'),
  ((SELECT id FROM companies WHERE name = 'Tüm Şirketler'), 'Kablaj/EMM', 'Sensör Modülü');

-- Anadolu Holding  (A=5, B=3 → 63% / 38%)
INSERT INTO uretim_kalemleri (company_id, kategori, kalem_adi) VALUES
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'), 'Talaşlı İmalat', 'Mil'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'), 'Talaşlı İmalat', 'Flanş'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'), 'Talaşlı İmalat', 'Gövde'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'), 'Talaşlı İmalat', 'Kapak'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'), 'Talaşlı İmalat', 'Burç'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'), 'Kablaj/EMM', 'Ana Kablo'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'), 'Kablaj/EMM', 'Sinyal Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Anadolu Holding'), 'Kablaj/EMM', 'Güç Kablosu');

-- Türk Telekom  (A=4, B=6 → 40% / 60%)
INSERT INTO uretim_kalemleri (company_id, kategori, kalem_adi) VALUES
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Talaşlı İmalat', 'Mil'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Talaşlı İmalat', 'Flanş'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Talaşlı İmalat', 'Gövde'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Talaşlı İmalat', 'Pim'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Kablaj/EMM', 'Ana Kablo'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Kablaj/EMM', 'Sinyal Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Kablaj/EMM', 'Güç Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Kablaj/EMM', 'Kontrol Kartı'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Kablaj/EMM', 'Sensör Modülü'),
  ((SELECT id FROM companies WHERE name = 'Türk Telekom'), 'Kablaj/EMM', 'Motor Sürücü');

-- Arçelik A.Ş.  (A=3, B=7 → 30% / 70%)
INSERT INTO uretim_kalemleri (company_id, kategori, kalem_adi) VALUES
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Talaşlı İmalat', 'Mil'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Talaşlı İmalat', 'Gövde'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Talaşlı İmalat', 'Kasnak'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Kablaj/EMM', 'Ana Kablo'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Kablaj/EMM', 'Sinyal Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Kablaj/EMM', 'Güç Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Kablaj/EMM', 'Kontrol Kartı'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Kablaj/EMM', 'Sensör Modülü'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Kablaj/EMM', 'Motor Sürücü'),
  ((SELECT id FROM companies WHERE name = 'Arçelik A.Ş.'), 'Kablaj/EMM', 'Konnektör Seti');

-- Vestel Elektronik  (A=6, B=4 → 60% / 40%)
INSERT INTO uretim_kalemleri (company_id, kategori, kalem_adi) VALUES
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Talaşlı İmalat', 'Mil'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Talaşlı İmalat', 'Flanş'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Talaşlı İmalat', 'Gövde'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Talaşlı İmalat', 'Kapak'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Talaşlı İmalat', 'Pim'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Talaşlı İmalat', 'Bilezik'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Kablaj/EMM', 'Ana Kablo'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Kablaj/EMM', 'Sinyal Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Kablaj/EMM', 'Güç Kablosu'),
  ((SELECT id FROM companies WHERE name = 'Vestel Elektronik'), 'Kablaj/EMM', 'Kontrol Kartı');

-- Ford Otosan  (A=8, B=2 → 80% / 20%)
INSERT INTO uretim_kalemleri (company_id, kategori, kalem_adi) VALUES
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Talaşlı İmalat', 'Mil'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Talaşlı İmalat', 'Flanş'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Talaşlı İmalat', 'Gövde'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Talaşlı İmalat', 'Kapak'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Talaşlı İmalat', 'Burç'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Talaşlı İmalat', 'Pim'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Talaşlı İmalat', 'Kasnak'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Talaşlı İmalat', 'Bilezik'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Kablaj/EMM', 'Ana Kablo'),
  ((SELECT id FROM companies WHERE name = 'Ford Otosan'), 'Kablaj/EMM', 'Sinyal Kablosu');
