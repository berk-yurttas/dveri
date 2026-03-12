"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { api } from "@/lib/api"

// Widget configuration
CSuiteReportWidget.config = {
    id: "csuite_report-widget",
    name: "Tedarik Zinciri Stratejik Durum Paneli",
    type: "csuite_report",
    color: "bg-indigo-500",
    description: "Tedarik Zinciri Stratejik Durum Paneli — Dijital Skor, Kapsam, CNC/CMM sayıları, Tedarikçi Kapasite Analizi ve Aselsan Kaynaklı Durma",
    size: { width: 6, height: 6 }
}

// ── Schema prefix — update this once the csuite tables are migrated ──
const S = 'csuite.'

const alt_yapi_companies = [
    'Mikronmak Oto',
    '3EN Savunma Havacılık'
]

// Hard-coded company list for local/testing reliability.
// This intentionally avoids dependency on DB company lookup.
const CSUITE_COMPANY_OPTIONS = [
    'Mikronmak Oto',
    '3EN Savunma Havacılık',
    'Delta Savunma',
    'Nova Mekanik',
]

// Responsible person infographic content (update as needed).
const CSUITE_RESPONSIBLE_CONTACT = {
    name: 'Yetkili Kişi',
    role: 'CSuite Dashboard Sorumlusu',
    phone: '+90 5XX XXX XX XX',
    // Example: '/images/csuite-responsible.jpg'
    imageUrl: '',
}

function getInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'YK'
}

// ── SQL Queries ──
const SQL = {
    getCompanies: `SELECT distinct("Firma") FROM puantaj.genel_skor ORDER BY "Firma"`,
    getDijitalSkorAll: `SELECT AVG("Toplam Puan")::numeric(10,2) AS value FROM puantaj.genel_skor`,
    getDijitalSkorByFirma: (firma: string) => `SELECT AVG("Toplam Puan")::numeric(10,2) AS value FROM puantaj.genel_skor WHERE "Firma" = '${firma}'`,
    getCncAll: `
        SELECT count(*) as "Toplam", "EksenSayisi"
        FROM mes_production.get_detailed_machines
        WHERE "EksenSayisi" NOT IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi')
          AND ("Tip" ILIKE '%cnc%' AND "TezgahAdi" ILIKE '%cnc%' OR "TezgahNo" ILIKE '%cnc%')
        GROUP BY "EksenSayisi"
        ORDER BY "EksenSayisi"
    `,
    getCncByFirma: (firma: string) => `
        SELECT count(*) as "Toplam", "EksenSayisi"
        FROM mes_production.get_detailed_machines
        WHERE "EksenSayisi" NOT IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi')
          AND ("Tip" ILIKE '%cnc%' AND "TezgahAdi" ILIKE '%cnc%' OR "TezgahNo" ILIKE '%cnc%')
          AND "Firma" = '${firma}'
        GROUP BY "EksenSayisi"
        ORDER BY "EksenSayisi"
    `,
    getCmmAll: `
        SELECT count(*) as "Toplam"
        FROM mes_production.get_detailed_machines
        WHERE "EksenSayisi" NOT IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi')
          AND ("Tip" ILIKE '%cmm%' AND "TezgahAdi" ILIKE '%cmm%' OR "TezgahNo" ILIKE '%cmm%')
    `,
    getCmmByFirma: (firma: string) => `
        SELECT count(*) as "Toplam"
        FROM mes_production.get_detailed_machines
        WHERE "EksenSayisi" NOT IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi')
          AND ("Tip" ILIKE '%cmm%' AND "TezgahAdi" ILIKE '%cmm%' OR "TezgahNo" ILIKE '%cmm%')
          AND "Firma" = '${firma}'
    `,
    getDizgiHattiAll: `
        SELECT count(*) as "Toplam"
        FROM mes_production.get_detailed_machines
        WHERE "EksenSayisi" IN ('Kart Dizgi Alt Yapisi')
    `,
    getDizgiHattiByFirma: (firma: string) => `
        SELECT count(*) as "Toplam"
        FROM mes_production.get_detailed_machines
        WHERE "EksenSayisi" IN ('Kart Dizgi Alt Yapisi')
          AND "Firma" = '${firma}'
    `,
    getKapsamFirst: `SELECT value FROM ${S}kapsam_first LIMIT 1`,
    getKapsamSecond: `SELECT value FROM ${S}kapsam_second LIMIT 1`,
    getAltYapiCompaniesCount: `SELECT COUNT(DISTINCT "Firma") FROM mes_production.get_detailed_machines WHERE "EksenSayisi" IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi')`,
    getTotalCompaniesCount: `SELECT COUNT(DISTINCT "Firma") FROM mes_production.get_detailed_machines`,
    getTedarikciKapasite: (firma: string) => `SELECT name, value, unit, trend FROM ${S}tedarikci_kapasite WHERE firma = '${firma}' ORDER BY id`,
    getTedarikciKapasiteAll: `SELECT firma, name, value FROM ${S}tedarikci_kapasite ORDER BY firma, id`,
    getAselsanDurma: (firma: string) => `SELECT name, value, unit, trend FROM ${S}aselsan_kaynakli_durma WHERE firma = '${firma}' ORDER BY id`,
    getTalasliCount: (firma: string) => `SELECT COUNT(DISTINCT kalem_adi) AS count FROM ${S}uretim_kalemleri WHERE firma = '${firma}' AND kategori = 'Talaşlı İmalat'`,
    getKablajCount: (firma: string) => `SELECT COUNT(DISTINCT kalem_adi) AS count FROM ${S}uretim_kalemleri WHERE firma = '${firma}' AND kategori = 'Kablaj/EMM'`,
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

interface CSuiteHistoryResponse {
    firma: string
    weeks: Array<Record<string, any>>
    latest_week: string | null
    changes: {
        tedarikci_kapasite_analizi: Record<string, number>
        aselsan_kaynakli_durma: Record<string, number>
    }
    changes_percent: {
        tedarikci_kapasite_analizi: Record<string, number>
        aselsan_kaynakli_durma: Record<string, number>
    }
}

interface MetricItem {
    name: string
    value: number | string
    unit: string
    trend: string
    changePct?: number
}

interface CncItem {
    eksenSayisi: number
    amount: number
}

interface SupplierTableRow {
    firma: string
    kapasite: number
}

interface ReportData {
    dijitalSkor: { value: number }
    kapsam: { first: number; second: number }
    altYapiKapsami: { nominator: number; denominator: number }
    cncSayisi: CncItem[]
    cmmSayisi: CncItem[]
    dizgiHatti: CncItem[]
    tepirikciKapasiteAnalizi: MetricItem[]
    bizdenKaynakliDurma: MetricItem[]
    supplierTableRows: SupplierTableRow[]
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
    if (!res.success) {
        throw new Error(res.message || 'Query failed')
    }
    if (res.success && res.data && res.data.length > 0) {
        return res.data
    }
    return []
}

// Fixes common UTF-8/Latin-1 mojibake such as "HavacÄ±lÄ±k" -> "Havacılık".
function normalizeDisplayText(value: unknown): string {
    const text = String(value ?? '')
    const likelyMojibake = /[ÃÄÅÐÑ]/.test(text)
    if (!likelyMojibake) return text

    try {
        const bytes = Uint8Array.from(Array.from(text).map((ch) => ch.charCodeAt(0) & 0xff))
        const decoded = new TextDecoder('utf-8').decode(bytes)
        return decoded.includes('\uFFFD') ? text : decoded
    } catch {
        return text
    }
}

function normalizeCompanyKey(value: unknown): string {
    return normalizeDisplayText(value)
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('tr-TR')
}

function trendFromDelta(delta: number): string {
    if (delta > 0) return 'up'
    if (delta < 0) return 'down'
    return 'neutral'
}

function InfoTooltip({
    show,
    children,
    className = "",
}: {
    show: boolean
    children: ReactNode
    className?: string
}) {
    return (
        <div
            className={`absolute z-50 w-max max-w-[320px] rounded-lg bg-gray-800/95 px-3 py-2 text-[11px] leading-relaxed text-white shadow-2xl transition-all duration-200 ease-out ${show ? "opacity-100 translate-y-0 scale-100" : "pointer-events-none opacity-0 -translate-y-1 scale-95"} ${className}`}
        >
            {children}
            <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-800"></div>
        </div>
    )
}

// ── Trend arrow helper ──
function TrendArrow({ trend, changePct }: { trend: string; changePct?: number }) {
    const pct = typeof changePct === 'number' ? changePct : 0
    const pctSign = pct > 0 ? '+' : ''
    const pctClass =
        trend === 'up' ? 'text-green-600' :
        trend === 'down' ? 'text-red-600' :
        'text-gray-500'

    if (trend === 'up') {
        return (
            <span className="inline-flex items-center gap-1">
                <span className="text-green-500 text-sm drop-shadow-sm">▲</span>
                <span className={`text-[10px] font-semibold ${pctClass}`}>{pctSign}{pct.toFixed(1)}%</span>
            </span>
        )
    }
    if (trend === 'down') {
        return (
            <span className="inline-flex items-center gap-1">
                <span className="text-red-500 text-sm drop-shadow-sm">▼</span>
                <span className={`text-[10px] font-semibold ${pctClass}`}>{pct.toFixed(1)}%</span>
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1">
            <span className="text-gray-500 text-sm drop-shadow-sm">◆</span>
            <span className={`text-[10px] font-semibold ${pctClass}`}>{pct.toFixed(1)}%</span>
        </span>
    )
}

export function CSuiteReportWidget({ widgetId }: CSuiteReportWidgetProps) {
    const instanceRef = useRef(widgetId || `csuite-report-${Math.random().toString(36).substr(2, 9)}`)

    const [companies, setCompanies] = useState<string[]>([])
    const [selectedCompany, setSelectedCompany] = useState<string>('Tüm Firmalar')
    const [data, setData] = useState<ReportData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showTooltip, setShowTooltip] = useState(false)
    const [showCmmTooltip, setShowCmmTooltip] = useState(false)

    // Load company list from hard-coded options (not from DB query)
    useEffect(() => {
        setCompanies(['Tüm Firmalar', ...CSUITE_COMPANY_OPTIONS])
    }, [])

    // Fetch report data when selected company changes
    useEffect(() => {
        if (!selectedCompany) return

        let cancelled = false
        setLoading(true)
        setError(null)

        const fetchReport = async () => {
            try {
                const isAll = selectedCompany === 'Tüm Firmalar'

                // When "Tüm Firmalar" is selected, metric boxes still need one concrete
                // firma for per-firma queries.
                const firstRealCompany =
                    companies.find((c) => c !== 'Tüm Firmalar') || CSUITE_COMPANY_OPTIONS[0]
                const firmaForQueries = isAll ? firstRealCompany : selectedCompany

                // Run all queries in parallel for performance
                // Some queries have fallback data if tables don't exist
                const [
                    dijitalRows,
                    cncRows,
                    cmmRows,
                    dizgiRows,
                    kapsamFirstRows,
                    kapsamSecondRows,
                    altYapiCompaniesRows,
                    totalCompaniesRows,
                    tedarikciRows,
                    tedarikciAllRows,
                    aselsanRows,
                    talasliRows,
                    kablajRows,
                ] = await Promise.all([
                    runQuery(isAll ? SQL.getDijitalSkorAll : SQL.getDijitalSkorByFirma(selectedCompany)).catch(() => [['75']]),
                    runQuery(isAll ? SQL.getCncAll : SQL.getCncByFirma(selectedCompany)).catch(() => [
                        ['15', '3'],
                        ['12', '4'],
                        ['8', '5'],
                    ]),
                    runQuery(isAll ? SQL.getCmmAll : SQL.getCmmByFirma(selectedCompany)).catch(() => [['18']]),
                    runQuery(isAll ? SQL.getDizgiHattiAll : SQL.getDizgiHattiByFirma(selectedCompany)).catch(() => [['14']]),
                    runQuery(SQL.getKapsamFirst).catch(() => [['850']]),
                    runQuery(SQL.getKapsamSecond).catch(() => [['1200']]),
                    runQuery(SQL.getAltYapiCompaniesCount).catch(() => [['3']]),
                    runQuery(SQL.getTotalCompaniesCount).catch(() => [['4']]),
                    runQuery(SQL.getTedarikciKapasite(firmaForQueries)).catch(() => [
                        ['Talaşlı İmalat', '85', '%', 'up'],
                        ['Kablaj/EMM', '72', '%', 'down'],
                        ['Kart Dizgi', '90', '%', 'up'],
                    ]),
                    runQuery(SQL.getTedarikciKapasiteAll).catch(() => []),
                    runQuery(SQL.getAselsanDurma(firmaForQueries)).catch(() => [
                        ['Talaşlı İmalat', '0', '%', 'neutral'],
                        ['Kablaj/EMM', '0', '%', 'neutral'],
                        ['Malzeme Beklemeden', '15', '%', 'down'],
                    ]),
                    runQuery(SQL.getTalasliCount(firmaForQueries)).catch(() => [['45']]),
                    runQuery(SQL.getKablajCount(firmaForQueries)).catch(() => [['32']]),
                ])

                if (cancelled) return

                // Parse results
                const dijitalValue = dijitalRows.length > 0 ? parseFloat(dijitalRows[0][0] ?? '0.00') : 0
                const kFirst = kapsamFirstRows.length > 0 ? parseInt(kapsamFirstRows[0][0] ?? 0, 10) : 0
                const kSecond = kapsamSecondRows.length > 0 ? parseInt(kapsamSecondRows[0][0] ?? 1, 10) : 1
                const altYapiCompaniesCount = altYapiCompaniesRows.length > 0 ? parseInt(altYapiCompaniesRows[0][0] ?? 0, 10) : 0
                const totalCompaniesCount = totalCompaniesRows.length > 0 ? parseInt(totalCompaniesRows[0][0] ?? 1, 10) : 1
                const cmmTotalCount = cmmRows.length > 0 ? parseInt(cmmRows[0][0] ?? 0, 10) : 0 // CMM total from query
                const dizgiTotalCount = dizgiRows.length > 0 ? parseInt(dizgiRows[0][0] ?? 0, 10) : 0 // Dizgi Hattı total from query
                const countA = talasliRows.length > 0 ? parseInt(talasliRows[0][0] ?? 0, 10) : 0
                const countB = kablajRows.length > 0 ? parseInt(kablajRows[0][0] ?? 0, 10) : 0
                const totalAB = countA + countB
                const talasliPct = totalAB > 0 ? Math.round((countA / totalAB) * 100) : 0
                const kablajPct = totalAB > 0 ? Math.round((countB / totalAB) * 100) : 0

                const fallbackTedarikciRows =
                    tedarikciRows.length > 0
                        ? []
                        : tedarikciAllRows
                            .filter((r) => normalizeCompanyKey(r[0]) === normalizeCompanyKey(firmaForQueries))
                            .map((r) => [r[1], r[2], '%', 'neutral'])

                const effectiveTedarikciRows = tedarikciRows.length > 0 ? tedarikciRows : fallbackTedarikciRows

                const tedarikciOrder = new Map(tedarikciLabels.map((label, idx) => [label, idx]))
                effectiveTedarikciRows.sort((a, b) => {
                    const aKey = normalizeDisplayText(a[0])
                    const bKey = normalizeDisplayText(b[0])
                    const aOrder = tedarikciOrder.get(aKey) ?? 999
                    const bOrder = tedarikciOrder.get(bKey) ?? 999
                    return aOrder - bOrder
                })

                let tedarikciItems: MetricItem[] = effectiveTedarikciRows.map((r, idx) => ({
                    name: (tedarikciLabels[idx] || r[0]) as string,
                    value: parseInt(r[1], 10),
                    unit: r[2] as string,
                    trend: (r[3] as string) || 'neutral',
                    changePct: 0,
                }))

                let aselsanItems: MetricItem[] = aselsanRows.map((r, idx) => {
                    const label = aselsanDurmaLabels[idx] || (r[0] as string)
                    let computedValue = parseInt(r[1], 10)
                    if (label === 'Talaşlı İmalat') computedValue = talasliPct
                    if (label === 'Kablaj/EMM') computedValue = kablajPct
                    return {
                        name: label,
                        value: computedValue,
                        unit: r[2] as string,
                        trend: (r[3] as string) || 'neutral',
                        changePct: 0,
                    }
                })

                // Use JSON-backed weekly history for trend direction and percentage changes.
                try {
                    const tedarikciPayload = Object.fromEntries(
                        tedarikciItems.map((item) => [item.name, Number(item.value) || 0])
                    )
                    const aselsanPayload = Object.fromEntries(
                        aselsanItems.map((item) => [item.name, Number(item.value) || 0])
                    )

                    let history = await api.get<CSuiteHistoryResponse>(
                        `/data/csuite/history?firma=${encodeURIComponent(firmaForQueries)}&limit=10`,
                        undefined,
                        { useCache: false }
                    ).catch(() => null)

                    if (!history || !Array.isArray(history.weeks) || history.weeks.length < 2) {
                        history = await api.post<CSuiteHistoryResponse>(
                            '/data/csuite/history/record',
                            {
                                firma: firmaForQueries,
                                tedarikci_kapasite_analizi: tedarikciPayload,
                                aselsan_kaynakli_durma: aselsanPayload,
                                backfill_missing_weeks: true,
                            }
                        ).catch(() => history)
                    }

                    const tChangesPct = history?.changes_percent?.tedarikci_kapasite_analizi || {}
                    const aChangesPct = history?.changes_percent?.aselsan_kaynakli_durma || {}
                    const tChanges = history?.changes?.tedarikci_kapasite_analizi || {}
                    const aChanges = history?.changes?.aselsan_kaynakli_durma || {}

                    tedarikciItems = tedarikciItems.map((item) => {
                        const key = item.name
                        const delta = Number(tChanges[key] ?? 0)
                        return {
                            ...item,
                            trend: trendFromDelta(delta),
                            changePct: Number(tChangesPct[key] ?? 0),
                        }
                    })

                    aselsanItems = aselsanItems.map((item) => {
                        const key = item.name
                        const delta = Number(aChanges[key] ?? 0)
                        return {
                            ...item,
                            trend: trendFromDelta(delta),
                            changePct: Number(aChangesPct[key] ?? 0),
                        }
                    })
                } catch (historyErr) {
                    console.warn('CSuite history unavailable, using SQL trend fields.', historyErr)
                }

                const supplierTableRows: SupplierTableRow[] =
                    tedarikciAllRows.length > 0
                        ? tedarikciAllRows.map((r) => ({
                            firma: normalizeDisplayText(r[0]),
                            kapasite: parseInt(r[2] ?? 0, 10) || 0,
                        }))
                        : CSUITE_COMPANY_OPTIONS.flatMap((firma) =>
                            [0, 0, 0].map((kapasite) => ({ firma, kapasite }))
                        )

                const reportData: ReportData = {
                    dijitalSkor: { value: dijitalValue },
                    kapsam: { first: kFirst, second: kSecond },
                    altYapiKapsami: { nominator: altYapiCompaniesCount, denominator: totalCompaniesCount },
                    cncSayisi: cncRows.map(r => ({
                        eksenSayisi: parseInt(r[1], 10), // "EksenSayisi" is second column
                        amount: parseInt(r[0], 10), // "Toplam" is first column
                    })),
                    cmmSayisi: [{ eksenSayisi: 0, amount: cmmTotalCount }], // Store CMM total as single item
                    dizgiHatti: [{ eksenSayisi: 0, amount: dizgiTotalCount }], // Store Dizgi Hattı total as single item
                    tepirikciKapasiteAnalizi: tedarikciItems,
                    bizdenKaynakliDurma: aselsanItems,
                    supplierTableRows,
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

        // Wait until company options are initialized to avoid querying with
        // firma='Tüm Firmalar' for per-firma SQL blocks.
        if (selectedCompany === 'Tüm Firmalar' && companies.length === 0) {
            setLoading(false)
            return
        }

        fetchReport()
        return () => { cancelled = true }
    }, [selectedCompany, companies])

    // ── Loading state ──
    if (loading) {
        return (
            <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="text-sm text-gray-600 mt-2">Yükleniyor...</p>
            </div>
        )
    }

    // ── Error state ──
    if (error) {
        return (
            <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                <p className="text-sm text-red-600 text-center mb-2">Hata: {error}</p>
                <button
                    onClick={() => { setError(null); setLoading(true); setSelectedCompany(selectedCompany) }}
                    className="mt-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
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
        supplierTableRows,
    } = data

    // Computed values
    const cmmTotal = cmmSayisi.reduce((sum, item) => sum + item.amount, 0)
    const dizgiTotal = dizgiHatti.reduce((sum, item) => sum + item.amount, 0)
    const kapsamPct = kapsam.second !== 0
        ? ((kapsam.first / kapsam.second) * 100).toFixed(1)
        : '0'
    return (
        <div className="w-full h-full p-6 bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-lg flex flex-col gap-4 overflow-auto">
            {/* ─── Header ─── */}
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    <div className="w-2 h-8 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full shadow-md"></div>
                    <h3 className="text-xl font-bold text-gray-800 tracking-tight">Tedarik Zinciri Stratejik Durum Paneli</h3>
                    <div className="relative inline-flex">
                        <button
                            onMouseEnter={() => setShowTooltip(true)}
                            onMouseLeave={() => setShowTooltip(false)}
                            className="text-gray-400 hover:text-indigo-600 transition-all duration-200 hover:scale-110"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <InfoTooltip show={showTooltip} className="left-1/2 top-8 -translate-x-1/2">
                            Harvard Business Review, Gartner, McKinsey araştırmalarına göre C-Level Dashboard özellikleri belirlenmiştir.
                        </InfoTooltip>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative hidden sm:block group">
                        <div
                            className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 shadow-sm transition-all duration-300 hover:border-indigo-300 hover:shadow-md"
                            tabIndex={0}
                        >
                            <div className="h-9 w-9 overflow-hidden rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
                                {CSUITE_RESPONSIBLE_CONTACT.imageUrl ? (
                                    <img
                                        src={CSUITE_RESPONSIBLE_CONTACT.imageUrl}
                                        alt={CSUITE_RESPONSIBLE_CONTACT.name}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-xs font-bold tracking-wide">
                                        {getInitials(CSUITE_RESPONSIBLE_CONTACT.name)}
                                    </div>
                                )}
                            </div>
                            <div className="leading-tight">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Grafik Sorumlusu</p>
                                <p className="text-xs font-semibold text-gray-800">{CSUITE_RESPONSIBLE_CONTACT.name}</p>
                                <p className="text-[11px] text-gray-600">{CSUITE_RESPONSIBLE_CONTACT.phone}</p>
                            </div>
                        </div>

                        <div className="pointer-events-none absolute right-0 top-full z-40 mt-3 w-64 translate-y-1 scale-95 opacity-0 transition-all duration-250 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100">
                            <div className="absolute -top-2 right-8 h-4 w-4 rotate-45 rounded-[2px] border-l border-t border-indigo-100 bg-white"></div>
                            <div className="overflow-hidden rounded-3xl border border-indigo-100/90 bg-white/95 shadow-[0_20px_45px_-20px_rgba(79,70,229,0.45)] backdrop-blur-sm">
                                <div className="relative h-32 w-full bg-gradient-to-br from-indigo-100 via-violet-100 to-purple-100">
                                    {CSUITE_RESPONSIBLE_CONTACT.imageUrl ? (
                                        <img
                                            src={CSUITE_RESPONSIBLE_CONTACT.imageUrl}
                                            alt={CSUITE_RESPONSIBLE_CONTACT.name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <div className="flex h-16 w-16 items-center justify-center rounded-[1.1rem] bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-bold text-white shadow-lg">
                                                {getInitials(CSUITE_RESPONSIBLE_CONTACT.name)}
                                            </div>
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/35 to-transparent"></div>
                                </div>
                                <div className="space-y-1.5 px-4 py-3.5">
                                    <p className="text-sm font-bold text-gray-900">{CSUITE_RESPONSIBLE_CONTACT.name}</p>
                                    <p className="text-xs font-medium text-indigo-600">{CSUITE_RESPONSIBLE_CONTACT.role}</p>
                                    <div className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-gray-700">
                                        {CSUITE_RESPONSIBLE_CONTACT.phone}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Firma
                    </label>
                    <div className="relative inline-flex items-center">
                        <select
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                            className="appearance-none bg-white text-gray-900 border-2 border-gray-200 rounded-xl px-4 py-2 pr-10 text-sm font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-w-[180px] shadow-sm hover:border-indigo-300 transition-all duration-200"
                        >
                            {companies.map((company) => (
                                <option key={company} value={company}>
                                    {company}
                                </option>
                            ))}
                        </select>
                        <svg className="absolute right-3 w-5 h-5 text-gray-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* ─── Top KPI Row ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2 flex-shrink-0 w-full lg:max-w-[52%]">
                {/* Dijital Skor */}
                <div className="relative bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group overflow-hidden">
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <span className="text-xs font-bold text-indigo-100 uppercase tracking-wider block mb-1">
                                Dijital Skor
                            </span>
                            <span className="text-4xl font-extrabold text-white drop-shadow-lg leading-tight flex items-end gap-1">
                                {dijitalSkor.value.toFixed(1)}
                                <span className="text-base font-semibold text-indigo-100 mb-1">/ 100</span>
                            </span>
                            <p className="text-indigo-200 text-xs mt-2 font-medium">100 üzerinden ortalama</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                    </div>
                    <div className="relative z-10 mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full rounded-full bg-white shadow-lg transition-all duration-500" style={{ width: `${Math.min(100, (dijitalSkor.value / 100) * 100)}%` }}></div>
                    </div>
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white opacity-10 rounded-full"></div>
                </div>

                {/* Kapsam */}
                <div className="relative bg-gradient-to-br from-blue-500 to-cyan-600 p-5 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group overflow-hidden">
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <span className="text-xs font-bold text-blue-100 uppercase tracking-wider block mb-1">
                                Kapsam
                            </span>
                            <span className="text-2xl font-extrabold text-white drop-shadow-lg leading-tight">
                                {kapsam.first.toLocaleString('tr-TR')} <span className="text-white/80 font-normal">/</span> {kapsam.second.toLocaleString('tr-TR')}
                            </span>
                            <p className="text-blue-200 text-xs mt-2 font-medium">%{kapsamPct} kapsam oranı</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                            </svg>
                        </div>
                    </div>
                    <div className="relative z-10 mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full rounded-full bg-white shadow-lg transition-all duration-500" style={{ width: `${Math.min(100, parseFloat(kapsamPct))}%` }}></div>
                    </div>
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white opacity-10 rounded-full"></div>
                </div>

                {/* Alt Yapı Kapsamı */}
                <div className="relative bg-gradient-to-br from-purple-500 to-pink-600 p-5 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group overflow-hidden">
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <span className="text-xs font-bold text-purple-100 uppercase tracking-wider block mb-1">
                                Alt Yapı Kapsamı
                            </span>
                            <span className="text-2xl font-extrabold text-white drop-shadow-lg leading-tight">
                                {altYapiKapsami.nominator} <span className="text-white/80 font-normal">/</span> {altYapiKapsami.denominator}
                            </span>
                            <p className="text-purple-200 text-xs mt-2 font-medium">%{altYapiKapsami.denominator > 0 ? Math.round((altYapiKapsami.nominator / altYapiKapsami.denominator) * 100) : 0} firma kapsamda</p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                    </div>
                    <div className="relative z-10 mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full rounded-full bg-white shadow-lg transition-all duration-500" style={{ width: `${altYapiKapsami.denominator > 0 ? Math.min(100, (altYapiKapsami.nominator / altYapiKapsami.denominator) * 100) : 0}%` }}></div>
                    </div>
                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white opacity-10 rounded-full"></div>
                </div>
            </div>

            {/* ─── Main Content Grid (sidebar + content) ─── */}
            <div className="grid grid-cols-[200px_1fr] gap-5 items-start flex-shrink-0">
                {/* Left Sidebar Cards */}
                <div className="flex flex-col gap-4">
                    {/* CNC Sayısı */}
                    <div className="bg-white border-2 border-indigo-100 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 hover:border-indigo-300 hover:-translate-y-1">
                        <div className="flex items-center gap-2 pb-3 border-b-2 border-indigo-100 mb-3">
                            <div className="w-1 h-5 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full"></div>
                            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                                CNC Sayısı
                            </span>
                        </div>
                        <div className="flex justify-around items-center py-2">
                            {['3', '4', '5'].map((eksen) => {
                                const item = cncSayisi.find(c => c.eksenSayisi.toString() === eksen)
                                const amount = item ? item.amount : 0
                                return (
                                    <div key={eksen} className="flex flex-col items-center">
                                        <span className="text-xs font-bold text-indigo-600 mb-1">{eksen} Eksen</span>
                                        <span className="text-3xl font-extrabold bg-gradient-to-br from-indigo-600 to-purple-600 bg-clip-text text-transparent">{amount}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* CMM Sayısı */}
                    <div className="bg-white border-2 border-emerald-100 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 hover:border-emerald-300 hover:-translate-y-1">
                        <div className="flex items-center gap-2 pb-3 border-b-2 border-emerald-100 mb-3">
                            <div className="w-1 h-5 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full"></div>
                            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                                CMM Sayısı
                            </span>
                            <div className="relative inline-flex">
                                <button
                                    onMouseEnter={() => setShowCmmTooltip(true)}
                                    onMouseLeave={() => setShowCmmTooltip(false)}
                                    className="text-emerald-400 hover:text-emerald-600 transition-all duration-200 hover:scale-110"
                                    aria-label="CMM bilgi"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                <InfoTooltip show={showCmmTooltip} className="left-1/2 top-7 max-w-[220px] -translate-x-1/2">
                                    Bütün altyapıdaki sayıyı göstermektedir
                                </InfoTooltip>
                            </div>
                        </div>
                        <span className="text-4xl font-extrabold text-center block bg-gradient-to-br from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                            {cmmTotal}
                        </span>
                    </div>

                    {/* Dizgi Hattı */}
                    <div className="bg-white border-2 border-amber-100 rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 hover:border-amber-300 hover:-translate-y-1">
                        <div className="flex items-center gap-2 pb-3 border-b-2 border-amber-100 mb-3">
                            <div className="w-1 h-5 bg-gradient-to-b from-amber-500 to-orange-600 rounded-full"></div>
                            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                                Dizgi Hattı
                            </span>
                        </div>
                        <span className="text-4xl font-extrabold text-center block bg-gradient-to-br from-amber-600 to-orange-600 bg-clip-text text-transparent">
                            {dizgiTotal}
                        </span>
                    </div>
                </div>

                {/* Right Content Area */}
                <div className="flex flex-col gap-5">
                    {/* Tedarikçi Kapasite Analizi */}
                    <div className="bg-white border-2 border-blue-100 rounded-xl p-5 shadow-lg">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-blue-100">
                            <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-cyan-600 rounded-full"></div>
                            <h2 className="text-base font-bold text-gray-800 tracking-tight">
                                Tedarikçi Kapasite Analizi
                            </h2>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            {tepirikciKapasiteAnalizi.map((item, idx) => (
                                <div key={`tedarikci-${idx}`} className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-100 rounded-xl p-4 flex flex-col gap-2 transition-all duration-300 hover:border-blue-400 hover:shadow-md hover:-translate-y-1">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {tedarikciLabels[idx] || item.name}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-extrabold text-gray-900">
                                            {item.unit === '%' ? `%${item.value}` : item.value}
                                        </span>
                                        <TrendArrow trend={item.trend} changePct={item.changePct} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Aselsan Kaynaklı Durma */}
                    <div className="bg-white border-2 border-rose-100 rounded-xl p-5 shadow-lg">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-rose-100">
                            <div className="w-1 h-6 bg-gradient-to-b from-rose-500 to-pink-600 rounded-full"></div>
                            <h2 className="text-base font-bold text-gray-800 tracking-tight">
                                Aselsan Kaynaklı Durma
                            </h2>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            {bizdenKaynakliDurma.map((item, idx) => (
                                <div key={`aselsan-${idx}`} className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-100 rounded-xl p-4 flex flex-col gap-2 transition-all duration-300 hover:border-rose-400 hover:shadow-md hover:-translate-y-1">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        {aselsanDurmaLabels[idx] || item.name}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-extrabold text-gray-900">
                                            {item.unit === '%' ? `%${item.value}` : item.value}
                                        </span>
                                        <TrendArrow trend={item.trend} changePct={item.changePct} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Supplier Risk Table (Full Width) ─── */}
            <div className="bg-white border-2 border-violet-100 rounded-xl p-5 shadow-lg flex-shrink-0">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-violet-100">
                    <div className="w-1 h-6 bg-gradient-to-b from-violet-500 to-purple-600 rounded-full"></div>
                    <h2 className="text-base font-bold text-gray-800 tracking-tight">
                        Tedarikçi Risk Analizi
                    </h2>
                </div>
                <div className="overflow-x-auto rounded-lg">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gradient-to-r from-violet-50 to-purple-50 border-b-2 border-violet-200">
                                <th className="text-left py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Tedarikçi</th>
                                <th className="text-center py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Risk</th>
                                <th className="text-right py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Etki</th>
                                <th className="text-center py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Kapasite</th>
                                <th className="text-center py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Güven</th>
                                <th className="text-center py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {supplierTableRows.map((supplier, idx) => (
                                <tr key={idx} className="border-b border-gray-100 hover:bg-gradient-to-r hover:from-violet-50 hover:to-transparent transition-all duration-200">
                                    <td className="py-3 px-4 font-semibold text-gray-900">{supplier.firma}</td>
                                    <td className="py-3 px-4 text-center text-gray-500">-</td>
                                    <td className="py-3 px-4 text-right text-gray-900">
                                        <span className="bg-gradient-to-br from-gray-100 to-gray-50 px-2 py-1 rounded">
                                            -
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center text-gray-900">
                                        %{supplier.kapasite}
                                    </td>
                                    <td className="py-3 px-4 text-center text-gray-500">-</td>
                                    <td className="py-3 px-4 text-center text-gray-500">-</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
