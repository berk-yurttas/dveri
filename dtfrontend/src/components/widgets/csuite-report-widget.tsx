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
    name: 'Kemal Onur Özkan',
    role: 'Rapor Sorumlusu',
    phone: '22805',
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
    getCompanies: `SELECT DISTINCT key as company FROM mes_production.company_mapping`,
    getDijitalSkorAll: `SELECT AVG("Toplam Puan")::numeric AS value FROM puantaj.genel_skor`,
    getDijitalSkorByFirma: (firma: string) => `SELECT AVG("Toplam Puan")::numeric AS value FROM puantaj.genel_skor LEFT JOIN mes_production.company_mapping ON puantaj.genel_skor."Firma" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'puantaj.genel_skor' WHERE mes_production.company_mapping."key" = '${firma}'`,
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
        LEFT JOIN mes_production.company_mapping ON mes_production.get_detailed_machines."Firma" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.get_detailed_machines' 
        WHERE mes_production.company_mapping."key" = '${firma}' AND "EksenSayisi" NOT IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi')
          AND ("Tip" ILIKE '%cnc%' AND "TezgahAdi" ILIKE '%cnc%' OR "TezgahNo" ILIKE '%cnc%')
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
        LEFT JOIN mes_production.company_mapping ON mes_production.get_detailed_machines."Firma" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.get_detailed_machines' 
        WHERE mes_production.company_mapping."key" = '${firma}' AND "EksenSayisi" NOT IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi')
          AND ("Tip" ILIKE '%cmm%' AND "TezgahAdi" ILIKE '%cmm%' OR "TezgahNo" ILIKE '%cmm%')
    `,
    getDizgiHattiAll: `
        SELECT count(*) as "Toplam"
        FROM mes_production.get_detailed_machines
        WHERE "EksenSayisi" IN ('Kart Dizgi Alt Yapisi')
    `,
    getDizgiHattiByFirma: (firma: string) => `
        SELECT count(*) as "Toplam"
        FROM mes_production.get_detailed_machines
        LEFT JOIN mes_production.company_mapping ON mes_production.get_detailed_machines."Firma" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.get_detailed_machines' 
        WHERE "EksenSayisi" IN ('Kart Dizgi Alt Yapisi')
          AND mes_production.company_mapping."key" = '${firma}'
    `,
    getKapsamFirst: `
        SELECT COALESCE(SUM(
            CAST(
                REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC
            )
        ), 0)::numeric AS value 
        FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari
        INNER JOIN mes_production.company_mapping ON mes_production.seyir_alt_yuklenici_mesuretim_kayitlari."Satıcı Tanım" = mes_production.company_mapping."key"
        WHERE "İş Emri Durumu" != 'MES Kaydı Yoktur'
    `,
    getKapsamSecond: `
        SELECT COALESCE(SUM(
            CAST(
                REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC
            )
        ), 0)::numeric AS value 
        FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari
        INNER JOIN mes_production.company_mapping ON mes_production.seyir_alt_yuklenici_mesuretim_kayitlari."Satıcı Tanım" = mes_production.company_mapping."key"
    `,
    getKapsamByFirma: (firma: string) => `
        SELECT 
            COALESCE(SUM(
                CASE WHEN "İş Emri Durumu" != 'MES Kaydı Yoktur' 
                THEN CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)
                ELSE 0 END
            ), 0)::numeric AS first,
            COALESCE(SUM(
                CAST(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.') AS NUMERIC)
            ), 0)::numeric AS second
        FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari
        LEFT JOIN mes_production.company_mapping ON mes_production.seyir_alt_yuklenici_mesuretim_kayitlari."Satıcı Tanım" = mes_production.company_mapping."key" and mes_production.company_mapping.table = 'mes_production.seyir_alt_yuklenici_mesuretim_kayitlari' 
        WHERE mes_production.company_mapping."value" = '${firma}'
    `,
    getAltYapiCompaniesCount: `SELECT COUNT(DISTINCT "TezgahAdi") FROM mes_production.get_detailed_machines WHERE "EksenSayisi" IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi')`,
    getTotalCompaniesCount: `SELECT COUNT(DISTINCT "TezgahAdi") FROM mes_production.get_detailed_machines`,
    getAltYapiCompaniesCountByFirma: (firma: string) => `SELECT COUNT(DISTINCT "TezgahAdi") FROM mes_production.get_detailed_machines LEFT JOIN mes_production.company_mapping ON mes_production.get_detailed_machines."Firma" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.get_detailed_machines' WHERE "EksenSayisi" IN ('Kart Dizgi Alt Yapisi', 'Kablo Üretim Alt Yapisi') AND mes_production.company_mapping."key" = '${firma}'`,
    getTotalCompaniesCountByFirma: (firma: string) => `SELECT COUNT(DISTINCT "TezgahAdi") FROM mes_production.get_detailed_machines LEFT JOIN mes_production.company_mapping ON mes_production.get_detailed_machines."Firma" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.get_detailed_machines' WHERE mes_production.company_mapping."key" = '${firma}'`,
    getTedarikciKapasite: (firma: string) => `SELECT name, value, unit, trend FROM ${S}tedarikci_kapasite WHERE firma = '${firma}' ORDER BY id`,
    getTedarikciKapasiteAll: `SELECT firma, name, value FROM ${S}tedarikci_kapasite ORDER BY firma, id`,
    getTalasliImalatDoluluk: (firma: string) => `
        SELECT 
            "Aylık Planlanan Doluluk Oranı"::numeric as value
        FROM mes_production.firma_makina_planlanan_doluluk_history
        LEFT JOIN mes_production.company_mapping ON mes_production.firma_makina_planlanan_doluluk_history."Firma Adı" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.firma_makina_planlanan_doluluk_history' 
        WHERE mes_production.company_mapping."key" = '${firma}'
        ORDER BY week DESC
        LIMIT 1
    `,
    getTalasliImalatDolulukAll: `
        SELECT 
            AVG("Aylık Planlanan Doluluk Oranı")::numeric as value
        FROM (
            SELECT DISTINCT ON ("Firma Adı") 
                "Firma Adı",
                "Aylık Planlanan Doluluk Oranı"
            FROM mes_production.firma_makina_planlanan_doluluk_history
            ORDER BY "Firma Adı", week DESC
        ) latest_per_firma
    `,
    getTalasliImalatDolulukTrend: (firma: string) => `
        WITH latest_5_weeks AS (
            SELECT 
                week,
                "Aylık Planlanan Doluluk Oranı",
                ROW_NUMBER() OVER (ORDER BY week DESC) as row_num
            FROM mes_production.firma_makina_planlanan_doluluk_history
            LEFT JOIN mes_production.company_mapping ON mes_production.firma_makina_planlanan_doluluk_history."Firma Adı" = mes_production.company_mapping."key" and mes_production.company_mapping.table = 'mes_production.firma_makina_planlanan_doluluk_history' 
            WHERE mes_production.company_mapping."value" = '${firma}'
            ORDER BY week DESC
            LIMIT 5
        )
        SELECT 
            (SELECT "Aylık Planlanan Doluluk Oranı" FROM latest_5_weeks WHERE row_num = 1) as current_value,
            (SELECT "Aylık Planlanan Doluluk Oranı" FROM latest_5_weeks WHERE row_num = 5) as comparison_value,
            COUNT(*) as total_weeks
        FROM latest_5_weeks
    `,
    getTalasliImalatDolulukTrendAll: `
        WITH latest_per_firma AS (
            SELECT DISTINCT ON ("Firma Adı")
                "Firma Adı",
                week,
                "Aylık Planlanan Doluluk Oranı"
            FROM mes_production.firma_makina_planlanan_doluluk_history
            ORDER BY "Firma Adı", week DESC
        ),
        comparison_per_firma AS (
            SELECT DISTINCT ON (h."Firma Adı")
                h."Firma Adı",
                h."Aylık Planlanan Doluluk Oranı" as comparison_value
            FROM mes_production.firma_makina_planlanan_doluluk_history h
            INNER JOIN latest_per_firma l ON h."Firma Adı" = l."Firma Adı"
            WHERE h.week < l.week
            ORDER BY h."Firma Adı", h.week DESC
            OFFSET 3
            LIMIT 1
        )
        SELECT 
            AVG(l."Aylık Planlanan Doluluk Oranı")::numeric as current_value,
            AVG(c.comparison_value)::numeric as comparison_value,
            COUNT(DISTINCT l."Firma Adı") as total_firmas
        FROM latest_per_firma l
        LEFT JOIN comparison_per_firma c ON l."Firma Adı" = c."Firma Adı"
    `,
    getAselsanDurma: (firma: string) => `SELECT name, value, unit, trend FROM ${S}aselsan_kaynakli_durma WHERE firma = '${firma}' ORDER BY id`,
    getTalasliCount: (firma: string) => `SELECT COUNT(DISTINCT kalem_adi) AS count FROM ${S}uretim_kalemleri WHERE firma = '${firma}' AND kategori = 'Talaşlı İmalat'`,
    getKablajCount: (firma: string) => `SELECT COUNT(DISTINCT kalem_adi) AS count FROM ${S}uretim_kalemleri WHERE firma = '${firma}' AND kategori = 'Kablaj/EMM'`,
    getTalasliDuruslarCurrentMonth: `
        SELECT COUNT(DISTINCT "Aselsan İş Emri Numarası") as count
        FROM mes_production.mekanik_duran_is_listesi
        WHERE TO_DATE("İşlem Başlangıç Tarihi", 'YYYY-MM-DD HH24:MI:SS') >= DATE_TRUNC('month', CURRENT_DATE)
    `,
    getTalasliDuruslarPreviousMonth: `
        SELECT COUNT(DISTINCT "Aselsan İş Emri Numarası") as count
        FROM mes_production.mekanik_duran_is_listesi
        WHERE TO_DATE("İşlem Başlangıç Tarihi", 'YYYY-MM-DD HH24:MI:SS') >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND TO_DATE("İşlem Başlangıç Tarihi", 'YYYY-MM-DD HH24:MI:SS') < DATE_TRUNC('month', CURRENT_DATE)
    `,
    getKablajDuruslarCurrentMonth: `
        SELECT COUNT(DISTINCT "WORKORDERNO") as count
        FROM mes_production.kablaj_tum_duruslar
        WHERE TO_DATE("STOP_START_DATE", 'YYYY-MM-DD HH24:MI:SS') >= DATE_TRUNC('month', CURRENT_DATE)
    `,
    getKablajDuruslarPreviousMonth: `
        SELECT COUNT(DISTINCT "WORKORDERNO") as count
        FROM mes_production.kablaj_tum_duruslar
        WHERE TO_DATE("STOP_START_DATE", 'YYYY-MM-DD HH24:MI:SS') >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND TO_DATE("STOP_START_DATE", 'YYYY-MM-DD HH24:MI:SS') < DATE_TRUNC('month', CURRENT_DATE)
    `,
    getTalasliDuruslarCurrentMonthByFirma: (firma: string) => `
        SELECT COUNT(DISTINCT "Aselsan İş Emri Numarası") as count
        FROM mes_production.mekanik_duran_is_listesi
        LEFT JOIN mes_production.company_mapping ON mes_production.mekanik_duran_is_listesi."NAME" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.mekanik_duran_is_listesi' 
        WHERE mes_production.company_mapping."key" = '${firma}'
          AND TO_DATE("İşlem Başlangıç Tarihi", 'YYYY-MM-DD HH24:MI:SS') >= DATE_TRUNC('month', CURRENT_DATE)
    `,
    getTalasliDuruslarPreviousMonthByFirma: (firma: string) => `
        SELECT COUNT(DISTINCT "Aselsan İş Emri Numarası") as count
        FROM mes_production.mekanik_duran_is_listesi
        LEFT JOIN mes_production.company_mapping ON mes_production.mekanik_duran_is_listesi."NAME" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.mekanik_duran_is_listesi' 
        WHERE mes_production.company_mapping."key" = '${firma}'
          AND TO_DATE("İşlem Başlangıç Tarihi", 'YYYY-MM-DD HH24:MI:SS') >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND TO_DATE("İşlem Başlangıç Tarihi", 'YYYY-MM-DD HH24:MI:SS') < DATE_TRUNC('month', CURRENT_DATE)
    `,
    getKablajDuruslarCurrentMonthByFirma: (firma: string) => `
        SELECT COUNT(DISTINCT "WORKORDERNO") as count
        FROM mes_production.kablaj_tum_duruslar
        LEFT JOIN mes_production.company_mapping ON mes_production.kablaj_tum_duruslar."Firma" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.kablaj_tum_duruslar' 
        WHERE mes_production.company_mapping."key" = '${firma}'
          AND TO_DATE("STOP_START_DATE", 'YYYY-MM-DD HH24:MI:SS') >= DATE_TRUNC('month', CURRENT_DATE)
    `,
    getKablajDuruslarPreviousMonthByFirma: (firma: string) => `
        SELECT COUNT(DISTINCT "WORKORDERNO") as count
        FROM mes_production.kablaj_tum_duruslar
        LEFT JOIN mes_production.company_mapping ON mes_production.kablaj_tum_duruslar."Firma" = mes_production.company_mapping."value" and mes_production.company_mapping.table = 'mes_production.kablaj_tum_duruslar' 
        WHERE mes_production.company_mapping."key" = '${firma}'
          AND TO_DATE("STOP_START_DATE", 'YYYY-MM-DD HH24:MI:SS') >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND TO_DATE("STOP_START_DATE", 'YYYY-MM-DD HH24:MI:SS') < DATE_TRUNC('month', CURRENT_DATE)
    `,
    getOpenOrdersAll: `
        SELECT COALESCE(SUM(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.')::numeric), 0)::numeric AS total 
        FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari
        INNER JOIN mes_production.company_mapping ON mes_production.seyir_alt_yuklenici_mesuretim_kayitlari."Satıcı Tanım" = mes_production.company_mapping."key"
    `,
    getOpenOrdersByFirma: (firma: string) => `
        SELECT COALESCE(SUM(REPLACE(REPLACE("Açık MG de", '.', ''), ',', '.')::numeric), 0)::numeric AS total 
        FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari
        LEFT JOIN mes_production.company_mapping ON mes_production.seyir_alt_yuklenici_mesuretim_kayitlari."Satıcı Tanım" = mes_production.company_mapping."key"
        WHERE mes_production.company_mapping."key" = '${firma}'
    `,
    getSupplierRiskAnalysis: `
        WITH CompanyTrend AS (
            SELECT 
                array_agg("Aylık Planlanan Doluluk Oranı" ORDER BY week) as "Trend", 
                "Firma Adı" 
            FROM mes_production.firma_makina_planlanan_doluluk_history 
            GROUP BY "Firma Adı"
        ),
        CompanyStats AS (
            SELECT
                mk."Satıcı Tanım" as "Tedarikçi",
                SUM(REPLACE(REPLACE(mk."Açık MG de", '.', ''), ',', '.')::numeric) as "Etki",
                AVG(pd."Aylık Planlanan Doluluk Oranı") as "Kapasite",
                ROUND((SUM(REPLACE(REPLACE(mk."Açık MG de", '.', ''), ',', '.')::numeric) * 100.0 / 
                    NULLIF(SUM(SUM(REPLACE(REPLACE(mk."Açık MG de", '.', ''), ',', '.')::numeric)) OVER(), 0)), 5) as "Oran",
                cd."Trend" as "Trend"
            FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari mk
            LEFT JOIN mes_production.company_mapping cm ON cm.key = mk."Satıcı Tanım"
            LEFT JOIN mes_production.get_firma_makina_planlanan_doluluk pd ON pd."Firma Adı" = cm.value
            LEFT JOIN CompanyTrend cd ON cd."Firma Adı" = cm.value
            GROUP BY mk."Satıcı Tanım", cd."Trend"
        )
        SELECT
            "Tedarikçi",
            "Etki",
            "Kapasite",
            "Trend",
            NTILE(10) OVER(ORDER BY "Oran" ASC) as order_points,
            "Kapasite" / 10.0 as kapasite_points,
            NTILE(10) OVER(ORDER BY "Oran" ASC) * ("Kapasite" / 10.0) as "Risk"
        FROM CompanyStats
        INNER JOIN mes_production.company_mapping ON CompanyStats."Tedarikçi" = mes_production.company_mapping."key"
        ORDER BY "Kapasite" ASC, order_points DESC, "Oran" DESC
    `,
    getSupplierRiskAnalysisByFirma: (firma: string) => `
        WITH CompanyTrend AS (
            SELECT 
                array_agg("Aylık Planlanan Doluluk Oranı" ORDER BY week) as "Trend", 
                "Firma Adı" 
            FROM mes_production.firma_makina_planlanan_doluluk_history 
            GROUP BY "Firma Adı"
        ),
        CompanyStats AS (
            SELECT
                mk."Satıcı Tanım" as "Tedarikçi",
                SUM(REPLACE(REPLACE(mk."Açık MG de", '.', ''), ',', '.')::numeric) as "Etki",
                AVG(pd."Aylık Planlanan Doluluk Oranı") as "Kapasite",
                ROUND((SUM(REPLACE(REPLACE(mk."Açık MG de", '.', ''), ',', '.')::numeric) * 100.0 / 
                    NULLIF(SUM(SUM(REPLACE(REPLACE(mk."Açık MG de", '.', ''), ',', '.')::numeric)) OVER(), 0)), 5) as "Oran",
                cd."Trend" as "Trend"
            FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari mk
            LEFT JOIN mes_production.company_mapping cm ON cm.key = mk."Satıcı Tanım"
            LEFT JOIN mes_production.get_firma_makina_planlanan_doluluk pd ON pd."Firma Adı" = cm.value
            LEFT JOIN CompanyTrend cd ON cd."Firma Adı" = cm.value
            WHERE mk."Satıcı Tanım" = '${firma}'
            GROUP BY mk."Satıcı Tanım", cd."Trend"
        )
        SELECT
            "Tedarikçi",
            "Etki",
            "Kapasite",
            "Trend",
            NTILE(10) OVER(ORDER BY "Oran" ASC) as order_points,
            "Kapasite" / 10.0 as kapasite_points,
            NTILE(10) OVER(ORDER BY "Oran" ASC) * ("Kapasite" / 10.0) as "Risk"
        FROM CompanyStats
        INNER JOIN mes_production.company_mapping ON CompanyStats."Tedarikçi" = mes_production.company_mapping."key"
        ORDER BY "Kapasite" ASC, order_points DESC, "Oran" DESC
    `,
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
    value: number | string | null
    unit: string
    trend: string
    changePct?: number
}

interface CncItem {
    eksenSayisi: number
    amount: number
}

interface SupplierTableRow {
    tedarikci: string
    etki: number
    kapasite: number
    risk: number
    trend: number[]
}

interface ReportData {
    dijitalSkor: { value: number }
    kapsam: { first: number; second: number }
    altYapiKapsami: { nominator: number; denominator: number }
    acikSiparisler: { total: number }
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
    const [showResponsibleTooltip, setShowResponsibleTooltip] = useState(false)
    const [showRiskTooltip, setShowRiskTooltip] = useState(false)
    
    // Pagination state for supplier risk table
    const [currentPage, setCurrentPage] = useState(1)
    const [itemsPerPage] = useState(20)

    // Load company list from database
    useEffect(() => {
        const fetchCompanies = async () => {
            try {
                const rows = await runQuery(SQL.getCompanies)
                if (rows && rows.length > 0) {
                    const companyList = rows.map(r => normalizeDisplayText(r[0]))
                    setCompanies(['Tüm Firmalar', ...companyList])
                } else {
                    // Fallback to hard-coded options if query fails
                    setCompanies(['Tüm Firmalar', ...CSUITE_COMPANY_OPTIONS])
                }
            } catch (err) {
                console.warn('Failed to fetch companies from database, using fallback:', err)
                setCompanies(['Tüm Firmalar', ...CSUITE_COMPANY_OPTIONS])
            }
        }
        
        fetchCompanies()
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
                // Track which queries fail to show "Yapım Aşamasında"
                const queryResults = await Promise.allSettled([
                    runQuery(isAll ? SQL.getDijitalSkorAll : SQL.getDijitalSkorByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getCncAll : SQL.getCncByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getCmmAll : SQL.getCmmByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getDizgiHattiAll : SQL.getDizgiHattiByFirma(selectedCompany)),
                    isAll 
                        ? Promise.all([
                            runQuery(SQL.getKapsamFirst),
                            runQuery(SQL.getKapsamSecond)
                        ]).then(([first, second]) => [[first[0]?.[0] ?? '0', second[0]?.[0] ?? '1']])
                        : runQuery(SQL.getKapsamByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getAltYapiCompaniesCount : SQL.getAltYapiCompaniesCountByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getTotalCompaniesCount : SQL.getTotalCompaniesCountByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getOpenOrdersAll : SQL.getOpenOrdersByFirma(selectedCompany)),
                    runQuery(SQL.getTedarikciKapasite(firmaForQueries)),
                    runQuery(SQL.getTedarikciKapasiteAll),
                    runQuery(isAll ? SQL.getTalasliImalatDolulukAll : SQL.getTalasliImalatDoluluk(firmaForQueries)),
                    runQuery(isAll ? SQL.getTalasliImalatDolulukTrendAll : SQL.getTalasliImalatDolulukTrend(firmaForQueries)),
                    runQuery(SQL.getAselsanDurma(firmaForQueries)),
                    runQuery(SQL.getTalasliCount(firmaForQueries)),
                    runQuery(SQL.getKablajCount(firmaForQueries)),
                    runQuery(isAll ? SQL.getTalasliDuruslarCurrentMonth : SQL.getTalasliDuruslarCurrentMonthByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getTalasliDuruslarPreviousMonth : SQL.getTalasliDuruslarPreviousMonthByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getKablajDuruslarCurrentMonth : SQL.getKablajDuruslarCurrentMonthByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getKablajDuruslarPreviousMonth : SQL.getKablajDuruslarPreviousMonthByFirma(selectedCompany)),
                    runQuery(isAll ? SQL.getSupplierRiskAnalysis : SQL.getSupplierRiskAnalysisByFirma(firmaForQueries)),
                ])

                const dijitalRows = queryResults[0].status === 'fulfilled' ? queryResults[0].value : null
                const cncRows = queryResults[1].status === 'fulfilled' ? queryResults[1].value : null
                const cmmRows = queryResults[2].status === 'fulfilled' ? queryResults[2].value : null
                const dizgiRows = queryResults[3].status === 'fulfilled' ? queryResults[3].value : null
                const kapsamRows = queryResults[4].status === 'fulfilled' ? queryResults[4].value : null
                const altYapiCompaniesRows = queryResults[5].status === 'fulfilled' ? queryResults[5].value : null
                const totalCompaniesRows = queryResults[6].status === 'fulfilled' ? queryResults[6].value : null
                const openOrdersRows = queryResults[7].status === 'fulfilled' ? queryResults[7].value : null
                const tedarikciRows = queryResults[8].status === 'fulfilled' ? queryResults[8].value : null
                const tedarikciAllRows = queryResults[9].status === 'fulfilled' ? queryResults[9].value : null
                const talasliDolulukRows = queryResults[10].status === 'fulfilled' ? queryResults[10].value : null
                const talasliDolulukTrendRows = queryResults[11].status === 'fulfilled' ? queryResults[11].value : null
                const aselsanRows = queryResults[12].status === 'fulfilled' ? queryResults[12].value : null
                const talasliRows = queryResults[13].status === 'fulfilled' ? queryResults[13].value : null
                const kablajRows = queryResults[14].status === 'fulfilled' ? queryResults[14].value : null
                const talasliDurusCurrentRows = queryResults[15].status === 'fulfilled' ? queryResults[15].value : null
                const talasliDurusPreviousRows = queryResults[16].status === 'fulfilled' ? queryResults[16].value : null
                const kablajDurusCurrentRows = queryResults[17].status === 'fulfilled' ? queryResults[17].value : null
                const kablajDurusPreviousRows = queryResults[18].status === 'fulfilled' ? queryResults[18].value : null
                const supplierRiskRows = queryResults[19].status === 'fulfilled' ? queryResults[19].value : null

                if (cancelled) return

                // Parse results and check which queries failed
                const dijitalValue = dijitalRows && dijitalRows.length > 0 ? parseFloat(dijitalRows[0][0] ?? '0.00') : null
                const kFirst = kapsamRows && kapsamRows.length > 0 ? parseFloat(kapsamRows[0][0] ?? 0) : null
                const kSecond = kapsamRows && kapsamRows.length > 0 ? parseFloat(kapsamRows[0][1] ?? 1) : null
                const altYapiCompaniesCount = altYapiCompaniesRows && altYapiCompaniesRows.length > 0 ? parseInt(altYapiCompaniesRows[0][0] ?? 0, 10) : null
                const totalCompaniesCount = totalCompaniesRows && totalCompaniesRows.length > 0 ? parseInt(totalCompaniesRows[0][0] ?? 1, 10) : null
                const openOrdersTotal = openOrdersRows && openOrdersRows.length > 0 ? parseFloat(openOrdersRows[0][0] ?? 0) : null
                const cmmTotalCount = cmmRows && cmmRows.length > 0 ? parseInt(cmmRows[0][0] ?? 0, 10) : null
                const dizgiTotalCount = dizgiRows && dizgiRows.length > 0 ? parseInt(dizgiRows[0][0] ?? 0, 10) : null
                const countA = talasliRows && talasliRows.length > 0 ? parseInt(talasliRows[0][0] ?? 0, 10) : null
                const countB = kablajRows && kablajRows.length > 0 ? parseInt(kablajRows[0][0] ?? 0, 10) : null
                const totalAB = (countA !== null && countB !== null) ? countA + countB : null
                const talasliPct = totalAB && totalAB > 0 ? Math.round((countA! / totalAB) * 100) : null
                const kablajPct = totalAB && totalAB > 0 ? Math.round((countB! / totalAB) * 100) : null
                const talasliDoluluk = talasliDolulukRows && talasliDolulukRows.length > 0 ? parseFloat(talasliDolulukRows[0][0] ?? 0) : null
                
                // Parse duruslar counts
                const talasliDurusCurrent = talasliDurusCurrentRows && talasliDurusCurrentRows.length > 0 ? parseInt(talasliDurusCurrentRows[0][0] ?? 0, 10) : 0
                const talasliDurusPrevious = talasliDurusPreviousRows && talasliDurusPreviousRows.length > 0 ? parseInt(talasliDurusPreviousRows[0][0] ?? 0, 10) : 0
                const kablajDurusCurrent = kablajDurusCurrentRows && kablajDurusCurrentRows.length > 0 ? parseInt(kablajDurusCurrentRows[0][0] ?? 0, 10) : 0
                const kablajDurusPrevious = kablajDurusPreviousRows && kablajDurusPreviousRows.length > 0 ? parseInt(kablajDurusPreviousRows[0][0] ?? 0, 10) : 0
                
                // Calculate total stops for percentages
                const totalDurusCurrent = talasliDurusCurrent + kablajDurusCurrent
                const totalDurusPrevious = talasliDurusPrevious + kablajDurusPrevious
                
                // Calculate percentages of total stops (ensure they sum to 100%)
                const talasliDurusPct = totalDurusCurrent > 0 ? Math.round((talasliDurusCurrent / totalDurusCurrent) * 100) : 0
                const kablajDurusPct = totalDurusCurrent > 0 ? 100 - talasliDurusPct : 0
                
                // Calculate month-over-month change percentages
                const talasliDurusChange = talasliDurusPrevious > 0 
                    ? ((talasliDurusCurrent - talasliDurusPrevious) / talasliDurusPrevious) * 100 
                    : 0
                const kablajDurusChange = kablajDurusPrevious > 0 
                    ? ((kablajDurusCurrent - kablajDurusPrevious) / kablajDurusPrevious) * 100 
                    : 0
                
                // Determine trends
                const talasliDurusTrend = talasliDurusChange > 0 ? 'up' : talasliDurusChange < 0 ? 'down' : 'neutral'
                const kablajDurusTrend = kablajDurusChange > 0 ? 'up' : kablajDurusChange < 0 ? 'down' : 'neutral'
                
                // Parse Talaşlı İmalat trend from database
                const talasliTrendCurrent = talasliDolulukTrendRows && talasliDolulukTrendRows.length > 0 ? parseFloat(talasliDolulukTrendRows[0][0] ?? 0) : null
                const talasliTrendComparison = talasliDolulukTrendRows && talasliDolulukTrendRows.length > 0 ? parseFloat(talasliDolulukTrendRows[0][1] ?? 0) : null
                const talasliTrendWeeks = talasliDolulukTrendRows && talasliDolulukTrendRows.length > 0 ? parseInt(talasliDolulukTrendRows[0][2] ?? 0, 10) : 0
                
                // Calculate trend for Talaşlı İmalat (only if we have 5+ weeks)
                let talasliTrend = 'neutral'
                let talasliChangePct = 0.0
                if (talasliTrendWeeks >= 5 && talasliTrendComparison && talasliTrendComparison > 0 && talasliTrendCurrent !== null) {
                    const delta = talasliTrendCurrent - talasliTrendComparison
                    talasliChangePct = (delta / talasliTrendComparison) * 100
                    talasliTrend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral'
                }

                const fallbackTedarikciRows =
                    tedarikciRows && tedarikciRows.length > 0
                        ? []
                        : tedarikciAllRows && tedarikciAllRows.length > 0
                            ? tedarikciAllRows
                                .filter((r) => normalizeCompanyKey(r[0]) === normalizeCompanyKey(firmaForQueries))
                                .map((r) => [r[1], r[2], '%', 'neutral'])
                            : []

                const effectiveTedarikciRows = tedarikciRows && tedarikciRows.length > 0 ? tedarikciRows : fallbackTedarikciRows

                const tedarikciOrder = new Map(tedarikciLabels.map((label, idx) => [label, idx]))
                effectiveTedarikciRows.sort((a, b) => {
                    const aKey = normalizeDisplayText(a[0])
                    const bKey = normalizeDisplayText(b[0])
                    const aOrder = tedarikciOrder.get(aKey) ?? 999
                    const bOrder = tedarikciOrder.get(bKey) ?? 999
                    return aOrder - bOrder
                })

                // Always create all 3 tedarikci categories
                let tedarikciItems: MetricItem[] = tedarikciLabels.map((label) => {
                    // Find matching row from query
                    const matchingRow = effectiveTedarikciRows.find((r) => {
                        const rowLabel = normalizeDisplayText(r[0])
                        return rowLabel === label
                    })
                    
                    let computedValue: number | null = null
                    let trend = 'neutral'
                    let changePct = 0
                    let unit = '%'
                    
                    if (matchingRow) {
                        computedValue = parseInt(matchingRow[1], 10)
                        unit = matchingRow[2] as string
                        trend = (matchingRow[3] as string) || 'neutral'
                    }
                    
                    // Override with database values for Talaşlı İmalat
                    if (label === 'Talaşlı İmalat' && talasliDoluluk !== null) {
                        computedValue = Math.round(talasliDoluluk)
                        trend = talasliTrend
                        changePct = talasliChangePct
                    }
                    
                    return {
                        name: label,
                        value: computedValue,
                        unit: unit,
                        trend: trend,
                        changePct: changePct,
                    }
                })

                // Always create all 3 aselsan categories
                let aselsanItems: MetricItem[] = aselsanDurmaLabels.map((label) => {
                    // Find matching row from query
                    const matchingRow = aselsanRows && aselsanRows.length > 0 
                        ? aselsanRows.find((r) => {
                            const rowLabel = normalizeDisplayText(r[0])
                            return rowLabel === label
                        })
                        : null
                    
                    let computedValue: number | null = null
                    let trend = 'neutral'
                    let changePct = 0
                    let unit = '%'
                    
                    if (matchingRow) {
                        computedValue = parseInt(matchingRow[1], 10)
                        unit = matchingRow[2] as string
                        trend = (matchingRow[3] as string) || 'neutral'
                    }
                    
                    // Override with actual counts from duruslar views
                    if (label === 'Talaşlı İmalat') {
                        computedValue = talasliDurusCurrent
                        unit = ''
                        trend = talasliDurusTrend
                        changePct = talasliDurusChange
                    }
                    if (label === 'Kablaj/EMM') {
                        computedValue = kablajDurusCurrent
                        unit = ''
                        trend = kablajDurusTrend
                        changePct = kablajDurusChange
                    }
                    
                    return {
                        name: label,
                        value: computedValue,
                        unit: unit,
                        trend: trend,
                        changePct: changePct,
                    }
                })

                // Use JSON-backed weekly history for trend direction and percentage changes.
                // Skip Talaşlı İmalat as it uses database history
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
                                backfill_missing_weeks: false,
                            }
                        ).catch(() => history)
                    }

                    const tChangesPct = history?.changes_percent?.tedarikci_kapasite_analizi || {}
                    const aChangesPct = history?.changes_percent?.aselsan_kaynakli_durma || {}
                    const tChanges = history?.changes?.tedarikci_kapasite_analizi || {}
                    const aChanges = history?.changes?.aselsan_kaynakli_durma || {}

                    tedarikciItems = tedarikciItems.map((item) => {
                        const key = item.name
                        // Skip Talaşlı İmalat - already has database trend
                        if (key === 'Talaşlı İmalat') {
                            return item
                        }
                        const delta = Number(tChanges[key] ?? 0)
                        return {
                            ...item,
                            trend: trendFromDelta(delta),
                            changePct: Number(tChangesPct[key] ?? 0),
                        }
                    })

                    aselsanItems = aselsanItems.map((item) => {
                        const key = item.name
                        // Skip Talaşlı İmalat and Kablaj/EMM - already have database trends
                        if (key === 'Talaşlı İmalat' || key === 'Kablaj/EMM') {
                            return item
                        }
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
                    supplierRiskRows && supplierRiskRows.length > 0
                        ? supplierRiskRows.map((r) => {
                            // Parse trend data - it might come as a PostgreSQL array string
                            let trendValues: number[] = []
                            if (r[3]) {
                                console.log('Raw trend data:', r[3], 'Type:', typeof r[3])
                                
                                if (Array.isArray(r[3])) {
                                    // Already an array
                                    trendValues = r[3].map((v: any) => parseFloat(v) || 0)
                                } else if (typeof r[3] === 'string') {
                                    // Parse PostgreSQL array string format: "{82.5,85.0,87.3}" or "[Decimal('82.5'), ...]"
                                    let cleaned = r[3]
                                    
                                    // Remove array brackets and braces
                                    cleaned = cleaned.replace(/^[\[{]|[\]}]$/g, '').trim()
                                    
                                    // Extract numbers from Decimal('X.X') format or plain numbers
                                    const matches = cleaned.match(/(\d+\.?\d*)/g)
                                    if (matches && matches.length > 0) {
                                        trendValues = matches.map((m: string) => parseFloat(m)).filter(n => !isNaN(n) && n > 0)
                                        console.log('Parsed trend values:', trendValues)
                                    } else {
                                        // Fallback: split by comma and parse
                                        trendValues = cleaned.split(',').map((v: string) => {
                                            const numStr = v.replace(/[^0-9.]/g, '').trim()
                                            return parseFloat(numStr) || 0
                                        }).filter(n => n > 0)
                                    }
                                }
                            }
                            
                            return {
                                tedarikci: normalizeDisplayText(r[0]) || '',
                                etki: parseFloat(r[1]) || 0,
                                kapasite: parseFloat(r[2]) || 0,
                                risk: parseFloat(r[6]) || 0,
                                trend: trendValues,
                            }
                        })
                        : []

                const reportData: ReportData = {
                    dijitalSkor: { value: dijitalValue ?? 0 },
                    kapsam: { first: kFirst ?? 0, second: kSecond ?? 0 },
                    altYapiKapsami: { nominator: altYapiCompaniesCount ?? 0, denominator: totalCompaniesCount ?? 0 },
                    acikSiparisler: { total: openOrdersTotal !== null ? openOrdersTotal : 0 },
                    cncSayisi: cncRows ? cncRows.map(r => ({
                        eksenSayisi: parseInt(r[1], 10),
                        amount: parseInt(r[0], 10),
                    })) : [],
                    cmmSayisi: cmmTotalCount !== null ? [{ eksenSayisi: 0, amount: cmmTotalCount }] : [],
                    dizgiHatti: dizgiTotalCount !== null ? [{ eksenSayisi: 0, amount: dizgiTotalCount }] : [],
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
        acikSiparisler,
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
                    <div className="relative inline-flex group">
                        <button
                            onMouseEnter={() => setShowResponsibleTooltip(true)}
                            onMouseLeave={() => setShowResponsibleTooltip(false)}
                            className="text-gray-400 hover:text-indigo-600 transition-all duration-200 hover:scale-110"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <div className={`absolute left-1/2 -translate-x-1/2 top-8 z-50 w-64 transition-all duration-200 ease-out ${showResponsibleTooltip ? "opacity-100 translate-y-0 scale-100" : "pointer-events-none opacity-0 -translate-y-1 scale-95"}`}>
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-4 rotate-45 rounded-[2px] border-l border-t border-indigo-100 bg-white"></div>
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
                </div>

                <div className="flex items-center gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2 flex-shrink-0">
                {/* Dijital Skor */}
                <div 
                    onClick={() => window.open('/ivme/reports/16', '_blank')}
                    className="relative bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group overflow-hidden cursor-pointer"
                >
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <span className="text-xs font-bold text-indigo-100 uppercase tracking-wider block mb-1">
                                Dijital Skor
                            </span>
                            {dijitalSkor.value !== null ? (
                                <>
                                    <span className="text-4xl font-extrabold text-white drop-shadow-lg leading-tight flex items-end gap-1">
                                        {dijitalSkor.value.toFixed(1)}
                                        <span className="text-base font-semibold text-indigo-100 mb-1">/ 100</span>
                                    </span>
                                    <p className="text-indigo-200 text-xs mt-2 font-medium">100 üzerinden ortalama</p>
                                </>
                            ) : (
                                <span className="text-lg font-bold text-white/90 drop-shadow-lg">Yapım Aşamasında</span>
                            )}
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
                            {kapsam.first !== null && kapsam.second !== null ? (
                                <>
                                    <span className="text-2xl font-extrabold text-white drop-shadow-lg leading-tight">
                                        {kapsam.first >= 1000000 
                                            ? `$${(kapsam.first / 1000000).toFixed(1)}M` 
                                            : `$${(kapsam.first / 1000).toFixed(1)}K`
                                        } <span className="text-white/80 font-normal">/</span> {kapsam.second >= 1000000 
                                            ? `$${(kapsam.second / 1000000).toFixed(1)}M` 
                                            : `$${(kapsam.second / 1000).toFixed(1)}K`
                                        }
                                    </span>
                                    <p className="text-blue-200 text-xs mt-2 font-medium">%{kapsamPct} kapsam oranı</p>
                                </>
                            ) : (
                                <span className="text-lg font-bold text-white/90 drop-shadow-lg">Yapım Aşamasında</span>
                            )}
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                            {altYapiKapsami.nominator !== null && altYapiKapsami.denominator !== null ? (
                                <>
                                    <span className="text-2xl font-extrabold text-white drop-shadow-lg leading-tight">
                                        {altYapiKapsami.nominator} <span className="text-white/80 font-normal">/</span> {altYapiKapsami.denominator}
                                    </span>
                                    <p className="text-purple-200 text-xs mt-2 font-medium">%{altYapiKapsami.denominator > 0 ? Math.round((altYapiKapsami.nominator / altYapiKapsami.denominator) * 100) : 0} tezgah kapsamda</p>
                                </>
                            ) : (
                                <span className="text-lg font-bold text-white/90 drop-shadow-lg">Yapım Aşamasında</span>
                            )}
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

                {/* Açık Siparişler */}
                <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group overflow-hidden">
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                    <div className="relative z-10 flex items-start justify-between">
                        <div>
                            <span className="text-xs font-bold text-emerald-100 uppercase tracking-wider block mb-1">
                                Açık Siparişler
                            </span>
                            {acikSiparisler.total !== null ? (
                                <>
                                    <span className="text-2xl font-extrabold text-white drop-shadow-lg leading-tight">
                                        ${(acikSiparisler.total / 1000000).toFixed(2)}M
                                    </span>
                                    <p className="text-emerald-200 text-xs mt-2 font-medium">Toplam açık sipariş tutarı</p>
                                </>
                            ) : (
                                <span className="text-lg font-bold text-white/90 drop-shadow-lg">Yapım Aşamasında</span>
                            )}
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                    </div>
                    <div className="relative z-10 mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full rounded-full bg-white shadow-lg transition-all duration-500" style={{ width: `${Math.min(100, (acikSiparisler.total / 5000000) * 100)}%` }}></div>
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
                        {tepirikciKapasiteAnalizi.length > 0 ? (
                            <div className="grid grid-cols-3 gap-4">
                                {tepirikciKapasiteAnalizi.map((item, idx) => (
                                    <div key={`tedarikci-${idx}`} className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-100 rounded-xl p-4 flex flex-col gap-2 transition-all duration-300 hover:border-blue-400 hover:shadow-md hover:-translate-y-1">
                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            {tedarikciLabels[idx] || item.name}
                                        </span>
                                        {item.value !== null ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-extrabold text-gray-900">
                                                    {item.unit === '%' ? `%${item.value}` : item.value}
                                                </span>
                                                <TrendArrow trend={item.trend} changePct={item.changePct} />
                                            </div>
                                        ) : (
                                            <span className="text-sm font-bold text-gray-400">Yapım Aşamasında</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center py-12">
                                <span className="text-xl font-bold text-gray-400">Yapım Aşamasında</span>
                            </div>
                        )}
                    </div>

                    {/* Aselsan Kaynaklı Durma */}
                    <div className="bg-white border-2 border-rose-100 rounded-xl p-5 shadow-lg">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-rose-100">
                            <div className="w-1 h-6 bg-gradient-to-b from-rose-500 to-pink-600 rounded-full"></div>
                            <h2 className="text-base font-bold text-gray-800 tracking-tight">
                                Duruşlar (İş Emri Bazında)
                            </h2>
                        </div>
                        {bizdenKaynakliDurma.length > 0 ? (
                            <div className="grid grid-cols-3 gap-4">
                                {bizdenKaynakliDurma.map((item, idx) => {
                                    const isTalasliOrKablaj = idx === 0 || idx === 1
                                    return (
                                        <div key={`aselsan-${idx}`} className="bg-gradient-to-br from-gray-50 to-white border-2 border-gray-100 rounded-xl p-4 flex flex-col gap-2 transition-all duration-300 hover:border-rose-400 hover:shadow-md hover:-translate-y-1">
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                {aselsanDurmaLabels[idx] || item.name}
                                            </span>
                                            {item.value !== null ? (
                                                <>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl font-extrabold text-gray-900">
                                                            {item.unit === '%' ? `%${item.value}` : item.value}
                                                        </span>
                                                        <TrendArrow trend={item.trend} changePct={item.changePct} />
                                                    </div>
                                                    {isTalasliOrKablaj && (
                                                        <span className="text-xs text-gray-500 font-medium">Son 30 Gün</span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-sm font-bold text-gray-400">Yapım Aşamasında</span>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center py-12">
                                <span className="text-xl font-bold text-gray-400">Yapım Aşamasında</span>
                            </div>
                        )}
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
                    <span className="text-xs text-gray-500 font-medium">
                        ({supplierTableRows.filter(row => row.etki >= 1000000).length} kayıt)
                    </span>
                </div>
                {(() => {
                    const filteredRows = supplierTableRows.filter(row => row.etki >= 1000000)
                    return filteredRows.length > 0 ? (
                    <>
                        <div className="overflow-x-auto rounded-lg">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gradient-to-r from-violet-50 to-purple-50 border-b-2 border-violet-200">
                                        <th className="text-left py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Tedarikçi</th>
                                        <th className="text-right py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Etki</th>
                                        <th className="text-center py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">
                                            <div className="inline-flex items-center gap-1">
                                                <span>Risk</span>
                                                <div className="relative inline-flex">
                                                    <button
                                                        onMouseEnter={() => setShowRiskTooltip(true)}
                                                        onMouseLeave={() => setShowRiskTooltip(false)}
                                                        className="text-gray-400 hover:text-violet-600 transition-all duration-200 hover:scale-110"
                                                        aria-label="Risk hesaplama bilgisi"
                                                    >
                                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                        </svg>
                                                    </button>
                                                    <InfoTooltip show={showRiskTooltip} className="left-1/2 top-7 max-w-[320px] -translate-x-1/2">
                                                        <div className="space-y-2">
                                                            <p className="font-semibold">Risk Hesaplama:</p>
                                                            <p>Risk = Sipariş Puanı × (Kapasite / 10)</p>
                                                            <p className="text-xs">• Sipariş Puanı: Sipariş miktarına göre 1-10 arası (yüksek sipariş = yüksek puan)</p>
                                                            <p className="text-xs">• Kapasite Puanı: Makine kapasitesinin 10'a bölümü</p>
                                                            <p className="text-xs mt-1 italic">Yüksek sipariş ve yüksek kapasite yüksek risk anlamına gelir.</p>
                                                        </div>
                                                    </InfoTooltip>
                                                </div>
                                            </div>
                                        </th>
                                        <th className="text-center py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Kapasite</th>
                                        <th className="text-center py-3 px-4 font-bold text-gray-700 uppercase tracking-wider text-xs">Trend</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        // Filter out rows with etki < 1M and sort by Etki (impact) in descending order
                                        const filtered = supplierTableRows.filter(row => row.etki >= 1000000)
                                        const sorted = [...filtered].sort((a, b) => b.etki - a.etki)
                                        
                                        // Paginate
                                        const startIdx = (currentPage - 1) * itemsPerPage
                                        const endIdx = startIdx + itemsPerPage
                                        const paginated = sorted.slice(startIdx, endIdx)
                                        
                                        return paginated.map((supplier, idx) => (
                                            <tr key={idx} className="border-b border-gray-100 hover:bg-gradient-to-r hover:from-violet-50 hover:to-transparent transition-all duration-200">
                                                <td className="py-3 px-4 font-semibold text-gray-900">{supplier.tedarikci}</td>
                                                <td className="py-3 px-4 text-right text-gray-900">
                                                    <span className="bg-gradient-to-br from-blue-100 to-blue-50 px-3 py-1 rounded font-semibold text-blue-800">
                                                        ${(supplier.etki / 1000000).toFixed(2)}M
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    {supplier.risk > 0 ? (
                                                        <span className={`px-3 py-1 rounded font-bold ${
                                                            supplier.risk >= 70 ? 'bg-red-100 text-red-700' :
                                                            supplier.risk >= 30 ? 'bg-amber-100 text-amber-700' :
                                                            'bg-green-100 text-green-700'
                                                        }`}>
                                                            {supplier.risk.toFixed(2)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 text-sm">-</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-center text-gray-900 font-medium">
                                                    {supplier.kapasite > 0 ? (
                                                        `%${supplier.kapasite.toFixed(1)}`
                                                    ) : (
                                                        <span className="text-gray-400 text-sm">-</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    {supplier.trend && supplier.trend.length > 0 ? (
                                                        <div className="inline-flex items-center justify-center">
                                                            <svg width="60" height="30" className="overflow-visible">
                                                                {(() => {
                                                                    const data = supplier.trend.slice(-5)
                                                                    if (data.length === 0) return null
                                                                    
                                                                    const maxVal = Math.max(...data, 1)
                                                                    const minVal = Math.min(...data, 0)
                                                                    const range = maxVal - minVal || 1
                                                                    
                                                                    const points = data.map((val, i) => {
                                                                        const x = (i / Math.max(data.length - 1, 1)) * 50 + 5
                                                                        const y = 25 - ((val - minVal) / range) * 20
                                                                        return `${x},${y}`
                                                                    }).join(' ')
                                                                    
                                                                    const firstVal = data[0]
                                                                    const lastVal = data[data.length - 1]
                                                                    const trendColor = lastVal > firstVal ? '#10b981' : lastVal < firstVal ? '#ef4444' : '#6b7280'
                                                                    
                                                                    return (
                                                                        <>
                                                                            <polyline
                                                                                points={points}
                                                                                fill="none"
                                                                                stroke={trendColor}
                                                                                strokeWidth="2"
                                                                                strokeLinecap="round"
                                                                                strokeLinejoin="round"
                                                                            />
                                                                            {data.map((val, i) => {
                                                                                const x = (i / Math.max(data.length - 1, 1)) * 50 + 5
                                                                                const y = 25 - ((val - minVal) / range) * 20
                                                                                return (
                                                                                    <circle
                                                                                        key={i}
                                                                                        cx={x}
                                                                                        cy={y}
                                                                                        r="2"
                                                                                        fill={trendColor}
                                                                                    >
                                                                                        <title>{val.toFixed(1)}%</title>
                                                                                    </circle>
                                                                                )
                                                                            })}
                                                                        </>
                                                                    )
                                                                })()}
                                                            </svg>
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    })()}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Pagination Controls */}
                        {(() => {
                            const filteredRows = supplierTableRows.filter(row => row.etki >= 1000000)
                            const totalPages = Math.ceil(filteredRows.length / itemsPerPage)
                            
                            if (totalPages <= 1) return null
                            
                            return (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                                    <div className="text-sm text-gray-600">
                                        Sayfa {currentPage} / {totalPages} ({filteredRows.length} kayıt)
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage(1)}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            İlk
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Önceki
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Sonraki
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(totalPages)}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Son
                                        </button>
                                    </div>
                                </div>
                            )
                        })()}
                    </>
                ) : (
                    <div className="flex items-center justify-center py-12">
                        <span className="text-xl font-bold text-gray-400">Veri Yok</span>
                    </div>
                )
                })()}
            </div>
        </div>
    )
}
