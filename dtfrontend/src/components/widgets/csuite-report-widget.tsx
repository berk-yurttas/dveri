"use client"

import { useState, useEffect, useRef } from "react"
import { api } from "@/lib/api"

// Widget configuration
CSuiteReportWidget.config = {
    id: "csuite_report-widget",
    name: "C-Suite Rapor",
    type: "csuite_report",
    color: "bg-indigo-600",
    description: "C-Suite yönetici raporu — Dijital Skor, Kapsam, CNC/CMM sayıları, Tedarikçi Kapasite Analizi ve Aselsan Kaynaklı Durma",
    size: { width: 6, height: 6 }
}

// ── Schema prefix — update this once the csuite tables are migrated ──
const S = 'csuite.'

// ── SQL Queries ──
const SQL = {
    getCompanies: `SELECT name FROM ${S}companies ORDER BY id`,
    getCompanyId: (name: string) => `SELECT id FROM ${S}companies WHERE name = '${name}'`,
    getDijitalSkor: `SELECT ROUND(AVG(score)) AS value FROM ${S}dijital_skor`,
    getCncAll: `SELECT eksen_sayisi, SUM(amount) AS amount FROM ${S}cnc_sayisi GROUP BY eksen_sayisi ORDER BY eksen_sayisi`,
    getCncByFirma: (firma: string) => `SELECT eksen_sayisi, SUM(amount) AS amount FROM ${S}cnc_sayisi WHERE firma = '${firma}' GROUP BY eksen_sayisi ORDER BY eksen_sayisi`,
    getCmmAll: `SELECT eksen_sayisi, SUM(amount) AS amount FROM ${S}cmm_sayisi GROUP BY eksen_sayisi ORDER BY eksen_sayisi`,
    getCmmByFirma: (firma: string) => `SELECT eksen_sayisi, SUM(amount) AS amount FROM ${S}cmm_sayisi WHERE firma = '${firma}' GROUP BY eksen_sayisi ORDER BY eksen_sayisi`,
    getDizgiHattiAll: `SELECT eksen_sayisi, SUM(amount) AS amount FROM ${S}dizgi_hatti GROUP BY eksen_sayisi ORDER BY eksen_sayisi`,
    getDizgiHattiByFirma: (firma: string) => `SELECT eksen_sayisi, SUM(amount) AS amount FROM ${S}dizgi_hatti WHERE firma = '${firma}' GROUP BY eksen_sayisi ORDER BY eksen_sayisi`,
    getKapsamFirst: `SELECT value FROM ${S}kapsam_first LIMIT 1`,
    getKapsamSecond: `SELECT value FROM ${S}kapsam_second LIMIT 1`,
    getAltYapiAll: `SELECT SUM(amount) AS amount FROM ${S}alt_yapi_kapsami`,
    getAltYapiByFirma: (firma: string) => `SELECT SUM(amount) AS amount FROM ${S}alt_yapi_kapsami WHERE firma = '${firma}'`,
    getTedarikciKapasite: (companyId: number) => `SELECT name, value, unit, trend FROM ${S}tedarikci_kapasite WHERE company_id = ${companyId} ORDER BY id`,
    getAselsanDurma: (companyId: number) => `SELECT name, value, unit, trend FROM ${S}aselsan_kaynakli_durma WHERE company_id = ${companyId} ORDER BY id`,
    getTalasliCount: (companyId: number) => `SELECT COUNT(DISTINCT kalem_adi) AS count FROM ${S}uretim_kalemleri WHERE company_id = ${companyId} AND kategori = 'Talaşlı İmalat'`,
    getKablajCount: (companyId: number) => `SELECT COUNT(DISTINCT kalem_adi) AS count FROM ${S}uretim_kalemleri WHERE company_id = ${companyId} AND kategori = 'Kablaj/EMM'`,
}

// TypeScript interfaces
interface PreviewResponse {
    columns: string[]
    data: any[][] | null
    total_rows: number
    execution_time_ms: number
    success: boolean
    message?: string
}

interface MetricItem {
    name: string
    value: number | string
    unit: string
    trend: string
}

interface CncItem {
    eksenSayisi: number
    amount: number
}

interface ReportData {
    dijitalSkor: { value: number }
    kapsam: { first: number; second: number }
    altYapiKapsami: { value: number }
    cncSayisi: CncItem[]
    cmmSayisi: CncItem[]
    dizgiHatti: CncItem[]
    tepirikciKapasiteAnalizi: MetricItem[]
    bizdenKaynakliDurma: MetricItem[]
}

interface CSuiteReportWidgetProps {
    widgetId?: string
}

const tedarikciLabels = [
    'Talaşlı İmalat',
    'Kablaj/EMM',
    'Kart Dizgi',
]

const aselsanDurmaLabels = [
    'Talaşlı İmalat',
    'Kablaj/EMM',
    'Kart Dizgi',
]

// ── Helper: run a SQL query via the main backend ──
async function runQuery(sql: string): Promise<any[][]> {
    const res = await api.post<PreviewResponse>('/reports/preview', {
        sql_query: sql,
        limit: 1000000,
    })
    if (res.success && res.data && res.data.length > 0) {
        return res.data
    }
    return []
}

// ── Trend arrow helper ──
function TrendArrow({ trend }: { trend: string }) {
    if (trend === 'up') {
        return <span style={{ color: '#00e676', filter: 'drop-shadow(0 0 4px rgba(0,230,118,0.4))', fontSize: '0.85rem' }}>▲</span>
    }
    if (trend === 'down') {
        return <span style={{ color: '#ff5252', filter: 'drop-shadow(0 0 4px rgba(255,82,82,0.4))', fontSize: '0.85rem' }}>▼</span>
    }
    return null
}

// ── Small metric card ──
function MetricCard({ name, value, unit, trend }: MetricItem) {
    return (
        <div style={{
            background: '#0c1e3a',
            border: '1px solid #163060',
            borderRadius: '8px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            transition: 'background 0.2s, border-color 0.2s, transform 0.15s',
            cursor: 'default',
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = '#102748'
                e.currentTarget.style.borderColor = '#2979ff'
                e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = '#0c1e3a'
                e.currentTarget.style.borderColor = '#163060'
                e.currentTarget.style.transform = 'translateY(0)'
            }}
        >
            <span style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: '#6e8fad',
            }}>{name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                    fontSize: '1.3rem',
                    fontWeight: 800,
                    color: '#ffffff',
                }}>
                    {unit === '%' ? `%${value}` : value}
                </span>
                <TrendArrow trend={trend} />
            </div>
        </div>
    )
}

export function CSuiteReportWidget({ widgetId }: CSuiteReportWidgetProps) {
    const instanceRef = useRef(widgetId || `csuite-report-${Math.random().toString(36).substr(2, 9)}`)

    const [companies, setCompanies] = useState<string[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('Tüm Şirketler')
    const [data, setData] = useState<ReportData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Load company list on mount
    useEffect(() => {
        const loadCompanies = async () => {
            try {
                const rows = await runQuery(SQL.getCompanies)
                const names = rows.map(r => r[0] as string)
                setCompanies(['Tüm Şirketler', ...names])
            } catch (err) {
                console.error('Error loading companies:', err)
                // Fallback to a default list
                setCompanies(['Tüm Şirketler'])
            }
        }
        loadCompanies()
    }, [])

    // Fetch report data when selected company changes
    useEffect(() => {
        if (!selectedCompany) return

        let cancelled = false
        setLoading(true)
        setError(null)

        const fetchReport = async () => {
            try {
                const isAll = selectedCompany === 'Tüm Şirketler'

                // 1. Resolve company id
                let companyId = 0
                if (!isAll) {
                    const idRows = await runQuery(SQL.getCompanyId(selectedCompany))
                    if (idRows.length === 0) {
                        setError('Şirket bulunamadı')
                        setLoading(false)
                        return
                    }
                    companyId = parseInt(idRows[0][0], 10)
                } else {
                    // For "Tüm Şirketler", we still need a companyId for the tedarikci etc. queries
                    // Use company_id = 1 as default (or first company)
                    const idRows = await runQuery(`SELECT id FROM ${S}companies ORDER BY id LIMIT 1`)
                    companyId = idRows.length > 0 ? parseInt(idRows[0][0], 10) : 1
                }

                // 2–10: Run all queries in parallel for performance
                const [
                    dijitalRows,
                    cncRows,
                    cmmRows,
                    dizgiRows,
                    kapsamFirstRows,
                    kapsamSecondRows,
                    altYapiRows,
                    tedarikciRows,
                    aselsanRows,
                    talasliRows,
                    kablajRows,
                ] = await Promise.all([
                    runQuery(SQL.getDijitalSkor),
                    runQuery(isAll ? SQL.getCncAll : SQL.getCncByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getCmmAll : SQL.getCmmByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getDizgiHattiAll : SQL.getDizgiHattiByFirma(selectedCompany)),
                    runQuery(SQL.getKapsamFirst),
                    runQuery(SQL.getKapsamSecond),
                    runQuery(isAll ? SQL.getAltYapiAll : SQL.getAltYapiByFirma(selectedCompany)),
                    runQuery(SQL.getTedarikciKapasite(companyId)),
                    runQuery(SQL.getAselsanDurma(companyId)),
                    runQuery(SQL.getTalasliCount(companyId)),
                    runQuery(SQL.getKablajCount(companyId)),
                ])

                if (cancelled) return

                // Parse results
                const dijitalValue = dijitalRows.length > 0 ? parseInt(dijitalRows[0][0] ?? 0, 10) : 0
                const kFirst = kapsamFirstRows.length > 0 ? parseInt(kapsamFirstRows[0][0] ?? 0, 10) : 0
                const kSecond = kapsamSecondRows.length > 0 ? parseInt(kapsamSecondRows[0][0] ?? 1, 10) : 1
                const altYapiAmount = altYapiRows.length > 0 ? parseInt(altYapiRows[0][0] ?? 0, 10) : 0
                const countA = talasliRows.length > 0 ? parseInt(talasliRows[0][0] ?? 0, 10) : 0
                const countB = kablajRows.length > 0 ? parseInt(kablajRows[0][0] ?? 0, 10) : 0
                const totalAB = countA + countB
                const talasliPct = totalAB > 0 ? Math.round((countA / totalAB) * 100) : 0
                const kablajPct = totalAB > 0 ? Math.round((countB / totalAB) * 100) : 0

                const reportData: ReportData = {
                    dijitalSkor: { value: dijitalValue },
                    kapsam: { first: kFirst, second: kSecond },
                    altYapiKapsami: { value: altYapiAmount },
                    cncSayisi: cncRows.map(r => ({
                        eksenSayisi: parseInt(r[0], 10),
                        amount: parseInt(r[1], 10),
                    })),
                    cmmSayisi: cmmRows.map(r => ({
                        eksenSayisi: parseInt(r[0], 10),
                        amount: parseInt(r[1], 10),
                    })),
                    dizgiHatti: dizgiRows.map(r => ({
                        eksenSayisi: parseInt(r[0], 10),
                        amount: parseInt(r[1], 10),
                    })),
                    tepirikciKapasiteAnalizi: tedarikciRows.map(r => ({
                        name: r[0] as string,
                        value: parseInt(r[1], 10),
                        unit: r[2] as string,
                        trend: r[3] as string,
                    })),
                    bizdenKaynakliDurma: aselsanRows.map(r => {
                        const name = r[0] as string
                        let computedValue = parseInt(r[1], 10)
                        if (name === 'Talaşlı İmalat') computedValue = talasliPct
                        if (name === 'Kablaj/EMM') computedValue = kablajPct
                        return {
                            name,
                            value: computedValue,
                            unit: r[2] as string,
                            trend: r[3] as string,
                        }
                    }),
                }

                setData(reportData)
            } catch (err: any) {
                if (!cancelled) {
                    console.error('Error loading CSuite report:', err)
                    setError(err?.message || 'Rapor verisi alınamadı')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        fetchReport()
        return () => { cancelled = true }
    }, [selectedCompany])

    // ── Loading state ──
    if (loading) {
        return (
            <div style={{
                width: '100%', height: '100%',
                background: '#060e1a',
                borderRadius: '12px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}>
                <div style={{
                    width: '32px', height: '32px',
                    border: '3px solid #163060',
                    borderTop: '3px solid #2979ff',
                    borderRadius: '50%',
                    animation: 'csuite-spin 1s linear infinite',
                }} />
                <style>{`@keyframes csuite-spin { to { transform: rotate(360deg) } }`}</style>
                <p style={{ color: '#94adc7', fontSize: '0.85rem', marginTop: '10px' }}>Yükleniyor...</p>
            </div>
        )
    }

    // ── Error state ──
    if (error) {
        return (
            <div style={{
                width: '100%', height: '100%',
                background: '#060e1a',
                borderRadius: '12px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}>
                <p style={{ color: '#ff5252', fontSize: '0.85rem', textAlign: 'center', padding: '0 20px' }}>
                    Hata: {error}
                </p>
                <button
                    onClick={() => { setError(null); setLoading(true); setSelectedCompany(selectedCompany) }}
                    style={{
                        marginTop: '10px', padding: '6px 16px',
                        background: '#2979ff', color: '#fff',
                        border: 'none', borderRadius: '6px',
                        fontSize: '0.8rem', cursor: 'pointer',
                    }}
                >
                    Tekrar Dene
                </button>
            </div>
        )
    }

    if (!data) return null

    const {
        dijitalSkor,
        kapsam,
        altYapiKapsami,
        cncSayisi,
        cmmSayisi,
        dizgiHatti,
        tepirikciKapasiteAnalizi,
        bizdenKaynakliDurma,
    } = data

    // Computed values
    const cmmTotal = cmmSayisi.reduce((sum, item) => sum + item.amount, 0)
    const dizgiTotal = dizgiHatti.reduce((sum, item) => sum + item.amount, 0)
    const kapsamPct = kapsam.second !== 0
        ? ((kapsam.first / kapsam.second) * 100).toFixed(1)
        : '0'

    return (
        <div style={{
            width: '100%',
            height: '100%',
            background: '#060e1a',
            borderRadius: '12px',
            padding: '20px 18px 24px',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            color: '#e0e6ed',
            overflow: 'auto',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* ─── Header ─── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '18px', flexWrap: 'wrap', gap: '10px',
            }}>
                <h1 style={{
                    fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.5px',
                    color: '#ffffff', position: 'relative', paddingLeft: '14px', margin: 0,
                }}>
                    <span style={{
                        position: 'absolute', left: 0, top: '3px', bottom: '3px',
                        width: '4px', borderRadius: '4px', background: '#2979ff',
                    }} />
                    C-Suite Rapor
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{
                        fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.8px', color: '#6e8fad', whiteSpace: 'nowrap',
                    }}>Şirket</label>
                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                        <select
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                            style={{
                                appearance: 'none', WebkitAppearance: 'none',
                                background: '#0c1e3a', color: '#ffffff',
                                border: '1px solid #163060', borderRadius: '8px',
                                padding: '7px 32px 7px 12px',
                                fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 500,
                                cursor: 'pointer', outline: 'none', minWidth: '160px',
                            }}
                        >
                            {companies.map((company) => (
                                <option key={company} value={company} style={{ background: '#0c1e3a', color: '#ffffff' }}>
                                    {company}
                                </option>
                            ))}
                        </select>
                        <span style={{
                            position: 'absolute', right: '10px',
                            color: '#6e8fad', fontSize: '0.8rem', pointerEvents: 'none',
                        }}>▾</span>
                    </div>
                </div>
            </div>

            {/* ─── Top KPI Row ─── */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1.8fr 1fr',
                gap: '14px', marginBottom: '16px',
            }}>
                {/* Dijital Skor */}
                <KpiCard label="Dijital Skor" value={String(dijitalSkor.value)} />

                {/* Kapsam */}
                <KpiCard
                    label="Kapsam"
                    value={`${kapsam.first.toLocaleString('tr-TR')}/${kapsam.second.toLocaleString('tr-TR')} = %${kapsamPct}`}
                    wide
                />

                {/* Alt Yapı Kapsamı */}
                <KpiCard label="Alt Yapı Kapsamı" value={String(altYapiKapsami.value)} />
            </div>

            {/* ─── Main Content Grid (sidebar + content) ─── */}
            <div style={{
                display: 'grid', gridTemplateColumns: '180px 1fr',
                gap: '16px', flex: 1, minHeight: 0,
            }}>
                {/* Left Sidebar Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* CNC Sayısı */}
                    <SidebarCard label="CNC Sayısı">
                        <ul style={{
                            listStyle: 'none', padding: 0, margin: 0,
                            display: 'flex', flexDirection: 'column', gap: '4px',
                            fontSize: '0.8rem', color: '#94adc7',
                        }}>
                            {cncSayisi.map((item) => (
                                <li key={item.eksenSayisi}>
                                    <span style={{ fontWeight: 700, color: '#2979ff', marginRight: '2px' }}>
                                        {item.eksenSayisi} Eksen:
                                    </span>{' '}
                                    {item.amount} adet
                                </li>
                            ))}
                        </ul>
                    </SidebarCard>

                    {/* CMM Sayısı */}
                    <SidebarCard label="CMM Sayısı">
                        <span style={{
                            fontSize: '2rem', fontWeight: 800, color: '#ffffff',
                            textAlign: 'center', display: 'block', padding: '4px 0',
                        }}>{cmmTotal}</span>
                    </SidebarCard>

                    {/* Dizgi Hattı */}
                    <SidebarCard label="Dizgi Hattı">
                        <span style={{
                            fontSize: '2rem', fontWeight: 800, color: '#ffffff',
                            textAlign: 'center', display: 'block', padding: '4px 0',
                        }}>{dizgiTotal}</span>
                    </SidebarCard>
                </div>

                {/* Right Content Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Tedarikçi Kapasite Analizi */}
                    <ContentSection title="Tedarikçi Kapasite Analizi">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
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
                    </ContentSection>

                    {/* Aselsan Kaynaklı Durma */}
                    <ContentSection title="Aselsan Kaynaklı Durma">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
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
                    </ContentSection>
                </div>
            </div>
        </div>
    )
}

// ── KPI Card Component ──
function KpiCard({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
    return (
        <div
            style={{
                background: '#0c1e3a',
                border: '1px solid #163060',
                borderRadius: '12px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
                transition: 'background 0.2s, border-color 0.2s',
                cursor: 'default',
                ...(wide ? { textAlign: 'center' as const, alignItems: 'center' as const } : {}),
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = '#102748'
                e.currentTarget.style.borderColor = '#2979ff'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = '#0c1e3a'
                e.currentTarget.style.borderColor = '#163060'
            }}
        >
            <span style={{
                fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.8px', color: '#6e8fad',
            }}>{label}</span>
            <span style={{
                fontSize: wide ? '1.6rem' : '1.7rem',
                fontWeight: 800, color: '#ffffff', lineHeight: 1.1,
            }}>{value}</span>
        </div>
    )
}

// ── Sidebar Card Component ──
function SidebarCard({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div
            style={{
                background: '#0c1e3a',
                border: '1px solid #163060',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
                transition: 'background 0.2s, border-color 0.2s',
                cursor: 'default',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = '#102748'
                e.currentTarget.style.borderColor = '#2979ff'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = '#0c1e3a'
                e.currentTarget.style.borderColor = '#163060'
            }}
        >
            <span style={{
                fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.8px', color: '#6e8fad',
                borderBottom: '1px solid #163060', paddingBottom: '6px',
            }}>{label}</span>
            {children}
        </div>
    )
}

// ── Content Section Component ──
function ContentSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: '#091729',
            border: '1px solid #1a3a6b',
            borderRadius: '16px',
            padding: '18px 18px 16px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        }}>
            <h2 style={{
                fontSize: '0.95rem', fontWeight: 700, color: '#ffffff',
                marginBottom: '14px', paddingBottom: '10px',
                borderBottom: '1px solid #163060',
                letterSpacing: '-0.2px', margin: '0 0 14px 0',
            }}>{title}</h2>
            {children}
        </div>
    )
}
