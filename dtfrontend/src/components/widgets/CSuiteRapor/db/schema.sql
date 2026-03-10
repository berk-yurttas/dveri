-- ============================================================
--  C-Suite Rapor — PostgreSQL Schema
-- ============================================================

-- Companies (used by tedarikci_kapasite & aselsan_kaynakli_durma)
CREATE TABLE IF NOT EXISTS companies (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(100) NOT NULL UNIQUE
);

-- ── Dijital Skor ──────────────────────────────────────────────
-- Stores per-company scores. Query returns AVG(score) across all.
CREATE TABLE IF NOT EXISTS dijital_skor (
    id     SERIAL PRIMARY KEY,
    firma  VARCHAR(100) NOT NULL,
    score  NUMERIC NOT NULL
);

-- ── CNC Sayısı ────────────────────────────────────────────────
-- Grouped by eksen_sayisi and firma.
CREATE TABLE IF NOT EXISTS cnc_sayisi (
    id            SERIAL PRIMARY KEY,
    firma         VARCHAR(100) NOT NULL,
    eksen_sayisi  INT NOT NULL,
    amount        INT NOT NULL
);

-- ── CMM Sayısı ────────────────────────────────────────────────
-- Grouped by eksen_sayisi and firma. Display shows total.
CREATE TABLE IF NOT EXISTS cmm_sayisi (
    id            SERIAL PRIMARY KEY,
    firma         VARCHAR(100) NOT NULL,
    eksen_sayisi  INT NOT NULL,
    amount        INT NOT NULL
);

-- ── Dizgi Hattı ───────────────────────────────────────────────
-- Grouped by eksen_sayisi and firma. Display shows total.
CREATE TABLE IF NOT EXISTS dizgi_hatti (
    id            SERIAL PRIMARY KEY,
    firma         VARCHAR(100) NOT NULL,
    eksen_sayisi  INT NOT NULL,
    amount        INT NOT NULL
);

-- ── Kapsam ────────────────────────────────────────────────────
-- Two queries each returning a single number.
-- Display: "value1 / value2 = percentage"
CREATE TABLE IF NOT EXISTS kapsam_first (
    id     SERIAL PRIMARY KEY,
    value  INT NOT NULL
);

CREATE TABLE IF NOT EXISTS kapsam_second (
    id     SERIAL PRIMARY KEY,
    value  INT NOT NULL
);

-- ── Alt Yapı Kapsamı ──────────────────────────────────────────
-- Amount grouped by firma.
CREATE TABLE IF NOT EXISTS alt_yapi_kapsami (
    id      SERIAL PRIMARY KEY,
    firma   VARCHAR(100) NOT NULL,
    amount  INT NOT NULL
);

-- ── Tedarikçi Kapasite Analizi ────────────────────────────────
CREATE TABLE IF NOT EXISTS tedarikci_kapasite (
    id          SERIAL PRIMARY KEY,
    company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    value       INT NOT NULL,
    unit        VARCHAR(10) NOT NULL DEFAULT '%',
    trend       VARCHAR(10) NOT NULL DEFAULT 'neutral'
);

-- ── Aselsan Kaynaklı Durma ────────────────────────────────────
CREATE TABLE IF NOT EXISTS aselsan_kaynakli_durma (
    id          SERIAL PRIMARY KEY,
    company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    value       INT NOT NULL,
    unit        VARCHAR(10) NOT NULL DEFAULT '%',
    trend       VARCHAR(10) NOT NULL DEFAULT 'neutral'
);

-- ── Üretim Kalemleri (Production Items — placeholder) ────────
-- Items categorised as 'Talaşlı İmalat' or 'Kablaj/EMM'.
-- COUNT(DISTINCT kalem_adi) per category gives A and B.
CREATE TABLE IF NOT EXISTS uretim_kalemleri (
    id          SERIAL PRIMARY KEY,
    company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kategori    VARCHAR(100) NOT NULL,
    kalem_adi   VARCHAR(200) NOT NULL
);
