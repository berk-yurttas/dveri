import React, { useState, useEffect } from 'react';
import { companies, tedarikciLabels, aselsanDurmaLabels } from '../data/reportData';
import './ReportPage.css';

/* ── Trend arrow helper ─────────────────────────────────── */
function TrendArrow({ trend }) {
  if (trend === 'up') {
    return <span className="trend-arrow trend-up">▲</span>;
  }
  if (trend === 'down') {
    return <span className="trend-arrow trend-down">▼</span>;
  }
  return null;
}

/* ── Small metric card (used in Tedarikçi & Aselsan sections) */
function MetricCard({ name, value, unit, trend }) {
  return (
    <div className="metric-card">
      <span className="metric-card__label">{name}</span>
      <div className="metric-card__value-row">
        <span className="metric-card__value">
          {unit === '%' ? `%${value}` : value}
        </span>
        <TrendArrow trend={trend} />
      </div>
    </div>
  );
}

/* ── Main Report Page ───────────────────────────────────── */
export default function ReportPage() {
  const [selectedCompany, setSelectedCompany] = useState(companies[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Fetch report data when selected company changes ─────
  useEffect(() => {
    if (!selectedCompany) return;

    setLoading(true);
    setError(null);

    fetch(`/api/report?company=${encodeURIComponent(selectedCompany)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Rapor verisi alınamadı');
        return res.json();
      })
      .then((reportData) => {
        setData(reportData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [selectedCompany]);

  // ── Loading / error states ──────────────────────────────
  if (error) {
    return (
      <div className="report">
        <div className="report__status report__status--error">
          Hata: {error}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="report">
        <div className="report__status">Yükleniyor...</div>
      </div>
    );
  }

  const {
    dijitalSkor,
    kapsam,
    altYapiKapsami,
    cncSayisi,
    cmmSayisi,
    dizgiHatti,
    tepirikciKapasiteAnalizi,
    bizdenKaynakliDurma,
  } = data;

  // ── Computed values ───────────────────────────────────────
  const cmmTotal   = cmmSayisi.reduce((sum, item) => sum + item.amount, 0);
  const dizgiTotal = dizgiHatti.reduce((sum, item) => sum + item.amount, 0);

  // Kapsam percentage
  const kapsamPct =
    kapsam.second !== 0
      ? ((kapsam.first / kapsam.second) * 100).toFixed(1)
      : 0;

  return (
    <div className="report">
      {/* ─── Header ─────────────────────────────────── */}
      <header className="report__header">
        <h1 className="report__title">C-Suite Rapor</h1>

        <div className="report__filter">
          <label className="filter__label" htmlFor="company-filter">
            Şirket
          </label>
          <div className="filter__select-wrapper">
            <select
              id="company-filter"
              className="filter__select"
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
            >
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
            <span className="filter__chevron">▾</span>
          </div>
        </div>
      </header>

      {/* ─── Top KPI Row ────────────────────────────── */}
      <section className="top-kpi-row">
        {/* Dijital Skor — single average number */}
        <div className="kpi-card">
          <span className="kpi-card__label">Dijital Skor</span>
          <span className="kpi-card__value">{dijitalSkor.value}</span>
        </div>

        {/* Kapsam — "First / Second = %percentage" */}
        <div className="kpi-card kpi-card--wide">
          <span className="kpi-card__label">Kapsam</span>
          <span className="kpi-card__value">
            {kapsam.first.toLocaleString('tr-TR')}/{kapsam.second.toLocaleString('tr-TR')} = %{kapsamPct}
          </span>
        </div>

        {/* Alt Yapı Kapsamı — single number */}
        <div className="kpi-card">
          <span className="kpi-card__label">Alt Yapı Kapsamı</span>
          <span className="kpi-card__value">{altYapiKapsami.value}</span>
        </div>
      </section>

      {/* ─── Main Content Grid ──────────────────────── */}
      <section className="main-grid">
        {/* Left Sidebar Cards */}
        <aside className="sidebar">
          {/* CNC Sayısı — breakdown by eksen_sayisi */}
          <div className="sidebar-card">
            <span className="sidebar-card__label">CNC Sayısı</span>
            <ul className="sidebar-card__list">
              {cncSayisi.map((item) => (
                <li key={item.eksenSayisi}>
                  <span className="sidebar-card__level">{item.eksenSayisi} Eksen:</span>{' '}
                  {item.amount} adet
                </li>
              ))}
            </ul>
          </div>

          {/* CMM Sayısı — total */}
          <div className="sidebar-card">
            <span className="sidebar-card__label">CMM Sayısı</span>
            <span className="sidebar-card__big-value">{cmmTotal}</span>
          </div>

          {/* Dizgi Hattı — total */}
          <div className="sidebar-card">
            <span className="sidebar-card__label">Dizgi Hattı</span>
            <span className="sidebar-card__big-value">{dizgiTotal}</span>
          </div>
        </aside>

        {/* Right Content Area */}
        <div className="content-area">
          {/* Tedarikçi Kapasite Analizi */}
          <div className="content-section">
            <h2 className="content-section__title">
              Tedarikçi Kapasite Analizi
            </h2>
            <div className="content-section__cards">
              {tepirikciKapasiteAnalizi.map((item, idx) => (
                <MetricCard
                  key={`tedarikci-${idx}`}
                  name={tedarikciLabels[idx] || item.name}
                  value={item.value}
                  unit={item.unit}
                  trend={item.trend}
                />
              ))}
            </div>
          </div>

          {/* Aselsan Kaynaklı Durma */}
          <div className="content-section">
            <h2 className="content-section__title">
              Aselsan Kaynaklı Durma
            </h2>
            <div className="content-section__cards">
              {bizdenKaynakliDurma.map((item, idx) => (
                <MetricCard
                  key={`aselsan-${idx}`}
                  name={aselsanDurmaLabels[idx] || item.name}
                  value={item.value}
                  unit={item.unit}
                  trend={item.trend}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
