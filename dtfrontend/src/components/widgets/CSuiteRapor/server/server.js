import express from 'express';
import pool from './db.js';
import { loadQuery } from './queryLoader.js';

const app = express();
const PORT = process.env.PORT || 3001;

/* ── Load all SQL queries from .sql files at startup ─────── */
const SQL_GET_COMPANIES = loadQuery('get_companies.sql');
const SQL_GET_COMPANY_ID = loadQuery('get_company_id.sql');
const SQL_GET_DIJITAL_SKOR = loadQuery('get_dijital_skor.sql');
const SQL_GET_CNC_ALL = loadQuery('get_cnc_all.sql');
const SQL_GET_CNC_BY_FIRMA = loadQuery('get_cnc_by_firma.sql');
const SQL_GET_CMM_ALL = loadQuery('get_cmm_all.sql');
const SQL_GET_CMM_BY_FIRMA = loadQuery('get_cmm_by_firma.sql');
const SQL_GET_DIZGI_HATTI_ALL = loadQuery('get_dizgi_hatti_all.sql');
const SQL_GET_DIZGI_HATTI_BY_FIRMA = loadQuery('get_dizgi_hatti_by_firma.sql');
const SQL_GET_KAPSAM_FIRST = loadQuery('get_kapsam_first.sql');
const SQL_GET_KAPSAM_SECOND = loadQuery('get_kapsam_second.sql');
const SQL_GET_ALT_YAPI_ALL = loadQuery('get_alt_yapi_all.sql');
const SQL_GET_ALT_YAPI_BY_FIRMA = loadQuery('get_alt_yapi_by_firma.sql');
const SQL_GET_TEDARIKCI_KAPASITE = loadQuery('get_tedarikci_kapasite.sql');
const SQL_GET_ASELSAN_DURMA = loadQuery('get_aselsan_kaynakli_durma.sql');
const SQL_GET_TALASLI_IMALAT_COUNT = loadQuery('get_talasli_imalat_count.sql');
const SQL_GET_KABLAJ_EMM_COUNT = loadQuery('get_kablaj_emm_count.sql');

/* ── GET /api/companies ──────────────────────────────────────── */
app.get('/api/companies', async (_req, res) => {
  try {
    const { rows } = await pool.query(SQL_GET_COMPANIES);
    res.json(rows.map((r) => r.name));
  } catch (err) {
    console.error('GET /api/companies error:', err);
    res.status(500).json({ error: 'Veritabanı hatası' });
  }
});

/* ── GET /api/report?company=<name> ──────────────────────────── */
app.get('/api/report', async (req, res) => {
  const companyName = req.query.company;

  if (!companyName) {
    return res.status(400).json({ error: 'company parametresi gerekli' });
  }

  try {
    const isAll = companyName === 'Tüm Şirketler';

    // ── 1. Resolve company id (needed for tedarikci & aselsan) ──
    const companyResult = await pool.query(SQL_GET_COMPANY_ID, [companyName]);
    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Şirket bulunamadı' });
    }
    const companyId = companyResult.rows[0].id;

    // ── 2. Dijital Skor — always global average ─────────────────
    const dijitalResult = await pool.query(SQL_GET_DIJITAL_SKOR);
    const dijitalValue = dijitalResult.rows[0]?.value ?? 0;

    // ── 3. CNC Sayısı ───────────────────────────────────────────
    const cncResult = isAll
      ? await pool.query(SQL_GET_CNC_ALL)
      : await pool.query(SQL_GET_CNC_BY_FIRMA, [companyName]);

    // ── 4. CMM Sayısı ───────────────────────────────────────────
    const cmmResult = isAll
      ? await pool.query(SQL_GET_CMM_ALL)
      : await pool.query(SQL_GET_CMM_BY_FIRMA, [companyName]);

    // ── 5. Dizgi Hattı ─────────────────────────────────────────
    const dizgiResult = isAll
      ? await pool.query(SQL_GET_DIZGI_HATTI_ALL)
      : await pool.query(SQL_GET_DIZGI_HATTI_BY_FIRMA, [companyName]);

    // ── 6. Kapsam — two queries, each returns a single number ──
    const kapsamFirstResult = await pool.query(SQL_GET_KAPSAM_FIRST);
    const kapsamSecondResult = await pool.query(SQL_GET_KAPSAM_SECOND);
    const kFirst = kapsamFirstResult.rows[0]?.value ?? 0;
    const kSecond = kapsamSecondResult.rows[0]?.value ?? 1; // avoid /0

    // ── 7. Alt Yapı Kapsamı ─────────────────────────────────────
    const altYapiResult = isAll
      ? await pool.query(SQL_GET_ALT_YAPI_ALL)
      : await pool.query(SQL_GET_ALT_YAPI_BY_FIRMA, [companyName]);
    const altYapiAmount = parseInt(altYapiResult.rows[0]?.amount ?? 0, 10);

    // ── 8. Tedarikçi Kapasite Analizi ───────────────────────────
    const tedarikciResult = await pool.query(SQL_GET_TEDARIKCI_KAPASITE, [companyId]);

    // ── 9. Üretim Kalemleri counts (A & B) ──────────────────────
    const talasliCountResult = await pool.query(SQL_GET_TALASLI_IMALAT_COUNT, [companyId]);
    const kablajCountResult = await pool.query(SQL_GET_KABLAJ_EMM_COUNT, [companyId]);
    const countA = parseInt(talasliCountResult.rows[0]?.count ?? 0, 10);
    const countB = parseInt(kablajCountResult.rows[0]?.count ?? 0, 10);
    const totalAB = countA + countB;
    const talasliPct = totalAB > 0 ? Math.round((countA / totalAB) * 100) : 0;
    const kablajPct = totalAB > 0 ? Math.round((countB / totalAB) * 100) : 0;

    // ── 10. Aselsan Kaynaklı Durma ──────────────────────────────
    const aselsanResult = await pool.query(SQL_GET_ASELSAN_DURMA, [companyId]);

    // ── Build response ──────────────────────────────────────────
    const data = {
      dijitalSkor: {
        value: parseInt(dijitalValue, 10),
      },
      kapsam: {
        first: parseInt(kFirst, 10),
        second: parseInt(kSecond, 10),
      },
      altYapiKapsami: {
        value: altYapiAmount,
      },
      cncSayisi: cncResult.rows.map((r) => ({
        eksenSayisi: r.eksen_sayisi,
        amount: parseInt(r.amount, 10),
      })),
      cmmSayisi: cmmResult.rows.map((r) => ({
        eksenSayisi: r.eksen_sayisi,
        amount: parseInt(r.amount, 10),
      })),
      dizgiHatti: dizgiResult.rows.map((r) => ({
        eksenSayisi: r.eksen_sayisi,
        amount: parseInt(r.amount, 10),
      })),
      tepirikciKapasiteAnalizi: tedarikciResult.rows.map((r) => ({
        name: r.name,
        value: r.value,
        unit: r.unit,
        trend: r.trend,
      })),
      bizdenKaynakliDurma: aselsanResult.rows.map((r) => {
        let computedValue = r.value;
        if (r.name === 'Talaşlı İmalat') computedValue = talasliPct;
        if (r.name === 'Kablaj/EMM') computedValue = kablajPct;
        return {
          name: r.name,
          value: computedValue,
          unit: r.unit,
          trend: r.trend,
        };
      }),
    };

    res.json(data);
  } catch (err) {
    console.error('GET /api/report error:', err);
    res.status(500).json({ error: 'Veritabanı hatası' });
  }
});

app.listen(PORT, () => {
  console.log(`API server çalışıyor → http://localhost:${PORT}`);
});
