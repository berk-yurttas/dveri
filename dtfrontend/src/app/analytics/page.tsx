"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { analyticsService, AnalyticsStats, AnalyticsUserVisit } from '@/services/analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const REPORTS_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'
const REPORT_TIME_COLORS = [
    '#2563eb',
    '#16a34a',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#14b8a6',
    '#f97316',
    '#84cc16',
    '#06b6d4',
    '#ec4899',
    '#0ea5e9',
    '#22c55e',
    '#eab308',
    '#f43f5e',
    '#7c3aed',
    '#10b981',
    '#f97316',
    '#a3e635',
    '#38bdf8',
    '#fb7185',
    '#94a3b8'
]

export default function AnalyticsPage() {
    const router = useRouter()
    const userVisitPageSize = 10
    const [stats, setStats] = useState<AnalyticsStats[]>([])
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState('24h')
    const [selectedPlatform, setSelectedPlatform] = useState<string>('')
    const [userVisits, setUserVisits] = useState<AnalyticsUserVisit[]>([])
    const [userVisitSort, setUserVisitSort] = useState<'views-desc' | 'views-asc' | 'username-asc' | 'username-desc' | 'path-asc' | 'path-desc' | 'last-seen-desc' | 'last-seen-asc' | 'total-time-desc' | 'total-time-asc'>('views-desc')
    const [userVisitFilter, setUserVisitFilter] = useState('')
    const [userVisitPathFilter, setUserVisitPathFilter] = useState('')
    const [userVisitPage, setUserVisitPage] = useState(1)
    const [reportNameMap, setReportNameMap] = useState<Record<string, string>>({})
    const loadedReportPlatformsRef = useRef<Set<string>>(new Set())

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true)
            try {
                const [statsResult, visitsResult] = await Promise.allSettled([
                    analyticsService.getStats(period),
                    analyticsService.getUserVisits(period)
                ])

                if (statsResult.status === 'fulfilled') {
                    setStats(statsResult.value)
                } else {
                    console.error("Failed to fetch analytics stats:", statsResult.reason)
                }

                if (visitsResult.status === 'fulfilled') {
                    setUserVisits(visitsResult.value)
                } else {
                    console.error("Failed to fetch analytics user visits:", visitsResult.reason)
                }
            } catch (error) {
                console.error("Failed to fetch analytics:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [period])

    // Filter stats for report pages if platform is selected
    // Or just show top pages. 
    // The backend returns standard paths like /platforms/1/reports/5

    function extractReportInfo(path: string) {
        const cleanedPath = path.split('?')[0].replace(/\/+$/, '')
        const segments = cleanedPath.split('/').filter(Boolean)
        if (segments.length !== 3 || segments[1] !== 'reports') return null
        if (segments[2] === 'add') return null
        return {
            platformCode: segments[0],
            reportId: segments[2]
        }
    }

    function buildReportHref(info: { platformCode: string; reportId: string }) {
        return `/${info.platformCode}/reports/${info.reportId}`
    }

    function getReportNameFromInfo(info: { platformCode: string; reportId: string }) {
        const reportName = reportNameMap[`${info.reportId}`] || reportNameMap[`${info.platformCode}:${info.reportId}`]
        return reportName || `Rapor ${info.reportId}`
    }

    function getReportDisplayName(path: string, reportName?: string | null) {
        if (reportName) return reportName
        const info = extractReportInfo(path)
        if (!info) return null
        return getReportNameFromInfo(info)
    }

    function getReportHrefFromPath(path: string) {
        const info = extractReportInfo(path)
        if (!info) return null
        return buildReportHref(info)
    }

    const wrapTickLabel = (label: string, maxChars = 12, maxLines = 3) => {
        if (!label) return ['']
        const words = label.split(/\s+/).filter(Boolean)
        const lines: string[] = []
        let current = ''

        const pushCurrent = () => {
            if (current) {
                lines.push(current)
                current = ''
            }
        }

        const pushWordChunks = (word: string) => {
            let remaining = word
            while (remaining.length > maxChars) {
                lines.push(remaining.slice(0, maxChars))
                remaining = remaining.slice(maxChars)
            }
            if (remaining) {
                current = remaining
            }
        }

        words.forEach(word => {
            if (word.length > maxChars) {
                pushCurrent()
                pushWordChunks(word)
                return
            }
            if (!current) {
                current = word
                return
            }
            if ((current.length + 1 + word.length) <= maxChars) {
                current = `${current} ${word}`
            } else {
                lines.push(current)
                current = word
            }
        })

        if (current) lines.push(current)

        if (lines.length > maxLines) {
            const limited = lines.slice(0, maxLines)
            const last = limited[maxLines - 1]
            limited[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`
            return limited
        }

        return lines
    }

    const renderWrappedTick = (label: string, onClick?: () => void, cursor = 'default') => {
        const lines = wrapTickLabel(label, 10, 2)
        return (
            <text
                x={0}
                y={0}
                textAnchor="end"
                fill="#666"
                fontSize={14}
                style={{ cursor }}
                onClick={onClick}
                transform="rotate(-35)"
            >
                {lines.map((line, index) => (
                    <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 0 : 14}>
                        {line}
                    </tspan>
                ))}
            </text>
        )
    }

    const renderReportTick = (data: Array<{ name: string; path?: string }>) => (props: any) => {
        const { x = 0, y = 0, payload } = props
        const index = payload?.index
        const entry = typeof index === 'number' ? data[index] : null
        const href = entry?.path ? getReportHrefFromPath(entry.path) : null
        const label = payload?.value ?? ''
        return (
            <g transform={`translate(${x},${y})`}>
                {renderWrappedTick(
                    label,
                    href ? () => router.push(href) : undefined,
                    href ? 'pointer' : 'default'
                )}
            </g>
        )
    }

    const renderReportComparisonTick = (data: Array<{ name: string; platformCode: string; reportId: string }>) => (props: any) => {
        const { x = 0, y = 0, payload } = props
        const index = payload?.index
        const entry = typeof index === 'number' ? data[index] : null
        const href = entry ? buildReportHref(entry) : null
        const label = payload?.value ?? ''
        return (
            <g transform={`translate(${x},${y})`}>
                {renderWrappedTick(
                    label,
                    href ? () => router.push(href) : undefined,
                    href ? 'pointer' : 'default'
                )}
            </g>
        )
    }

    const renderSimpleTick = () => (props: any) => {
        const { x = 0, y = 0, payload } = props
        const label = payload?.value ?? ''
        return (
            <g transform={`translate(${x},${y})`}>
                {renderWrappedTick(label)}
            </g>
        )
    }

    const normalizePath = (path: string) => {
        const cleaned = path.split('?')[0].replace(/\/+$/, '')
        return cleaned || '/'
    }

    const formatPathLabel = (path: string, reportName?: string | null) => {
        const cleanedPath = path.split('?')[0].replace(/\/+$/, '')
        if (!cleanedPath || cleanedPath === '/') return 'Anasayfa'
        const segments = cleanedPath.split('/').filter(Boolean)
        const [first, second, third] = segments

        let label = cleanedPath
        if (second === 'reports' && third) {
            label = getReportDisplayName(path, reportName) || `Rapor ${third}`
        } else if (second === 'dashboard') {
            label = 'Gösterge Paneli'
        } else if (first === 'analytics') {
            label = 'Analizler'
        } else if (first === 'reports') {
            label = 'Raporlar'
        } else if (first === 'dashboard') {
            label = 'Ekranlarım'
        }

        if (second === 'reports' || second === 'dashboard') {
            return `${first.toUpperCase()} • ${label}`
        }

        return label
    }

    const aggregatedStats = useMemo(() => {
        const entries = new Map<string, {
            name: string
            path: string
            views: number
            unique_visitors: number
            avg_time_total: number
            reportId?: string
            platformCode?: string
            representativeViews: number
        }>()

        stats.forEach(item => {
            const info = extractReportInfo(item.path)
            const reportName = info ? getReportDisplayName(item.path, item.report_name) : null
            let key: string
            let name: string
            let path = item.path
            let reportId = info?.reportId
            let platformCode = info?.platformCode

            if (info && reportName) {
                key = `report:${reportName}`
                name = reportName
            } else {
                const cleanedPath = normalizePath(item.path)
                key = `path:${cleanedPath}`
                name = formatPathLabel(cleanedPath, item.report_name)
                path = cleanedPath
            }

            const existing = entries.get(key)
            if (existing) {
                existing.views += item.views
                existing.unique_visitors += item.unique_visitors
                existing.avg_time_total += item.avg_time * item.views
                if (item.views > existing.representativeViews) {
                    existing.path = path
                    existing.reportId = reportId
                    existing.platformCode = platformCode
                    existing.representativeViews = item.views
                }
            } else {
                entries.set(key, {
                    name,
                    path,
                    views: item.views,
                    unique_visitors: item.unique_visitors,
                    avg_time_total: item.avg_time * item.views,
                    reportId,
                    platformCode,
                    representativeViews: item.views
                })
            }
        })

        return Array.from(entries.values()).map(entry => ({
            ...entry,
            avg_time: entry.views ? entry.avg_time_total / entry.views : 0
        }))
    }, [stats, reportNameMap])

    // We can parse the path to make it more readable
    const readableStats = aggregatedStats.map(item => ({
        ...item,
        name: item.name
    }))

    useEffect(() => {
        const platformCodes = new Set<string>()
        stats.forEach(item => {
            const info = extractReportInfo(item.path)
            if (info) {
                platformCodes.add(info.platformCode)
            }
        })

        const platformsToFetch = Array.from(platformCodes).filter(
            platformCode => !loadedReportPlatformsRef.current.has(platformCode)
        )
        if (platformsToFetch.length === 0) return

        let cancelled = false
        const fetchReportNames = async () => {
            const updates: Record<string, string> = {}
            await Promise.all(platformsToFetch.map(async platformCode => {
                try {
                    const response = await fetch(
                        `${REPORTS_API_BASE_URL}/reports?skip=0&limit=1000`,
                        {
                            method: 'GET',
                            credentials: 'include',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Platform-Code': platformCode
                            }
                        }
                    )
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`)
                    }
                    const reports: Array<{ id: number; name: string }> = await response.json()
                    reports.forEach(report => {
                        updates[`${platformCode}:${report.id}`] = report.name
                        updates[`${report.id}`] = report.name
                    })
                    loadedReportPlatformsRef.current.add(platformCode)
                } catch (error) {
                    console.error(`Failed to fetch reports for ${platformCode}:`, error)
                }
            }))

            if (!cancelled && Object.keys(updates).length > 0) {
                setReportNameMap(prev => ({ ...prev, ...updates }))
            }
        }

        fetchReportNames()
        return () => {
            cancelled = true
        }
    }, [stats])

    useEffect(() => {
        const missingIds = new Set<string>()
        stats.forEach(item => {
            const info = extractReportInfo(item.path)
            if (info && !reportNameMap[`${info.reportId}`] && !reportNameMap[`${info.platformCode}:${info.reportId}`]) {
                missingIds.add(info.reportId)
            }
        })
        userVisits.forEach(visit => {
            const info = extractReportInfo(visit.path)
            if (info && !reportNameMap[`${info.reportId}`] && !reportNameMap[`${info.platformCode}:${info.reportId}`]) {
                missingIds.add(info.reportId)
            }
        })
        if (missingIds.size === 0) return

        let cancelled = false
        const fetchMissingReports = async () => {
            const updates: Record<string, string> = {}
            const ids = Array.from(missingIds).slice(0, 200)
            await Promise.allSettled(ids.map(async id => {
                try {
                    const response = await fetch(`${REPORTS_API_BASE_URL}/reports/${id}`, {
                        method: 'GET',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    })
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`)
                    }
                    const report: { id: number; name: string } = await response.json()
                    updates[`${report.id}`] = report.name
                } catch (error) {
                    console.error(`Failed to fetch report ${id}:`, error)
                }
            }))

            if (!cancelled && Object.keys(updates).length > 0) {
                setReportNameMap(prev => ({ ...prev, ...updates }))
            }
        }

        fetchMissingReports()
        return () => {
            cancelled = true
        }
    }, [stats, userVisits, reportNameMap])

    const formatTimestamp = (value?: string | null) => {
        if (!value) return '-'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return '-'
        return date.toLocaleString('tr-TR')
    }

    const formatDuration = (value?: number) => {
        if (!value || value <= 0) return '-'
        const totalSeconds = Math.round(value)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60
        if (hours > 0) {
            return `${hours}sa ${minutes}dk ${seconds}sn`
        }
        if (minutes > 0) {
            return `${minutes}dk ${seconds}sn`
        }
        return `${seconds}sn`
    }

    const formatDurationDetailed = (value?: number) => {
        const totalSeconds = Math.max(0, Math.round(value || 0))
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60
        return `${hours}sa ${minutes}dk ${seconds}sn`
    }

    const reportTimeChartData = useMemo(() => {
        const totals = new Map<string, number>()
        userVisits.forEach(visit => {
            if (!extractReportInfo(visit.path)) return
            const userId = (visit.user_id || 'Bilinmeyen').trim() || 'Bilinmeyen'
            const duration = visit.total_duration_seconds || 0
            if (duration <= 0) return
            totals.set(userId, (totals.get(userId) || 0) + duration)
        })

        const entries = Array.from(totals.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)

        const top = entries.slice(0, 20)
        const otherTotal = entries.slice(20).reduce((acc, item) => acc + item.value, 0)
        const data = [...top]
        if (otherTotal > 0) {
            data.push({ name: 'Diğer', value: otherTotal })
        }
        return data
    }, [userVisits])

    const renderReportTimeTooltip = ({ active, payload }: any) => {
        if (!active || !payload || payload.length === 0) return null
        const data = payload[0]?.payload
        if (!data) return null
        return (
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow-sm">
                <div className="font-medium">{data.name}</div>
                <div>{formatDurationDetailed(data.value)}</div>
            </div>
        )
    }

    const parsedReportStats = useMemo(() => {
        const reportEntries = stats.flatMap(item => {
            const info = extractReportInfo(item.path)
            if (!info) return []
            return [{
                platformCode: info.platformCode,
                reportId: info.reportId,
                reportName: item.report_name || getReportDisplayName(item.path, item.report_name),
                views: item.views,
                unique_visitors: item.unique_visitors,
                avg_time: item.avg_time
            }]
        })

        const reportTotals = new Map<string, {
            platformCode: string
            reportId: string
            reportName?: string | null
            views: number
            unique_visitors: number
            avg_time_total: number
            representativeViews: number
        }>()

        reportEntries.forEach(item => {
            const reportKey = (item.reportName || `Rapor ${item.reportId}`).toLowerCase()
            const key = `${item.platformCode}:${reportKey}`
            const existing = reportTotals.get(key)
            if (existing) {
                existing.views += item.views
                existing.unique_visitors += item.unique_visitors
                existing.avg_time_total += item.avg_time * item.views
                if (item.views > existing.representativeViews) {
                    existing.reportId = item.reportId
                    existing.reportName = item.reportName || existing.reportName
                    existing.representativeViews = item.views
                }
            } else {
                reportTotals.set(key, {
                    platformCode: item.platformCode,
                    reportId: item.reportId,
                    reportName: item.reportName,
                    views: item.views,
                    unique_visitors: item.unique_visitors,
                    avg_time_total: item.avg_time * item.views,
                    representativeViews: item.views
                })
            }
        })

        const reports = Array.from(reportTotals.values()).map(item => ({
            platformCode: item.platformCode,
            reportId: item.reportId,
            name: item.reportName || getReportNameFromInfo({ platformCode: item.platformCode, reportId: item.reportId }),
            views: item.views,
            unique_visitors: item.unique_visitors,
            avg_time: item.views ? item.avg_time_total / item.views : 0
        }))

        const platformTotals = new Map<string, { platformCode: string; platformLabel: string; views: number; unique_visitors: number }>()
        reports.forEach(item => {
            const existing = platformTotals.get(item.platformCode)
            if (existing) {
                existing.views += item.views
                existing.unique_visitors += item.unique_visitors
            } else {
                platformTotals.set(item.platformCode, {
                    platformCode: item.platformCode,
                    platformLabel: item.platformCode.toUpperCase(),
                    views: item.views,
                    unique_visitors: item.unique_visitors
                })
            }
        })

        return {
            reports,
            platformTotals: Array.from(platformTotals.values()).sort((a, b) => b.views - a.views)
        }
    }, [stats, reportNameMap])

    useEffect(() => {
        if (!selectedPlatform && parsedReportStats.platformTotals.length > 0) {
            setSelectedPlatform(parsedReportStats.platformTotals[0].platformCode)
        }
    }, [parsedReportStats.platformTotals, selectedPlatform])

    const platformTabs = parsedReportStats.platformTotals.map(item => item.platformCode)
    const reportsForSelectedPlatform = parsedReportStats.reports
        .filter(item => item.platformCode === selectedPlatform)
        .sort((a, b) => b.views - a.views)
        .slice(0, 10)

    const sortedUserVisits = useMemo(() => {
        const visits = userVisits.map(visit => ({
            ...visit,
            readablePath: formatPathLabel(visit.path, visit.report_name)
        }))
        const normalizedFilter = userVisitFilter.trim().toLowerCase()
        const normalizedPathFilter = userVisitPathFilter.trim().toLowerCase()

        let filteredVisits = visits
        if (normalizedFilter) {
            filteredVisits = filteredVisits.filter(visit => (visit.user_id || '').toLowerCase().includes(normalizedFilter))
        }
        if (normalizedPathFilter) {
            filteredVisits = filteredVisits.filter(visit => {
                if (!extractReportInfo(visit.path)) return false
                return (visit.readablePath || '').toLowerCase().includes(normalizedPathFilter)
            })
        }

        const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
        const compareDate = (a?: string | null, b?: string | null) => {
            const aTime = a ? new Date(a).getTime() : 0
            const bTime = b ? new Date(b).getTime() : 0
            return aTime - bTime
        }

        return filteredVisits.sort((a, b) => {
            switch (userVisitSort) {
                case 'username-asc':
                    return compareText(a.user_id, b.user_id)
                case 'username-desc':
                    return compareText(b.user_id, a.user_id)
                case 'views-asc':
                    return a.views - b.views
                case 'views-desc':
                    return b.views - a.views
                case 'path-asc':
                    return compareText(a.readablePath, b.readablePath)
                case 'path-desc':
                    return compareText(b.readablePath, a.readablePath)
                case 'last-seen-asc':
                    return compareDate(a.last_seen, b.last_seen)
                case 'last-seen-desc':
                    return compareDate(b.last_seen, a.last_seen)
                case 'total-time-asc':
                    return (a.total_duration_seconds || 0) - (b.total_duration_seconds || 0)
                case 'total-time-desc':
                    return (b.total_duration_seconds || 0) - (a.total_duration_seconds || 0)
                default:
                    return 0
            }
        })
    }, [userVisits, userVisitSort, userVisitFilter, userVisitPathFilter])

    useEffect(() => {
        setUserVisitPage(1)
    }, [userVisitFilter, userVisitPathFilter, userVisitSort])

    const userVisitPageCount = Math.max(1, Math.ceil(sortedUserVisits.length / userVisitPageSize))
    const userVisitPageStart = (userVisitPage - 1) * userVisitPageSize
    const pagedUserVisits = sortedUserVisits.slice(userVisitPageStart, userVisitPageStart + userVisitPageSize)

    const availableUsernames = useMemo(() => {
        const unique = new Set<string>()
        userVisits.forEach(visit => {
            if (visit.user_id) {
                unique.add(visit.user_id)
            }
        })
        return Array.from(unique).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }, [userVisits])

    const availableReportNames = useMemo(() => {
        const unique = new Set<string>()
        userVisits.forEach(visit => {
            if (!extractReportInfo(visit.path)) return
            const reportName = getReportDisplayName(visit.path, visit.report_name)
            if (reportName) {
                unique.add(reportName)
            }
        })
        return Array.from(unique).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }, [userVisits, reportNameMap])

    const toggleUserVisitSort = (field: 'username' | 'path' | 'views' | 'last-seen' | 'total-time') => {
        setUserVisitSort(prev => {
            switch (field) {
                case 'username':
                    return prev === 'username-asc' ? 'username-desc' : 'username-asc'
                case 'path':
                    return prev === 'path-asc' ? 'path-desc' : 'path-asc'
                case 'views':
                    return prev === 'views-asc' ? 'views-desc' : 'views-asc'
                case 'last-seen':
                    return prev === 'last-seen-asc' ? 'last-seen-desc' : 'last-seen-asc'
                case 'total-time':
                    return prev === 'total-time-asc' ? 'total-time-desc' : 'total-time-asc'
                default:
                    return prev
            }
        })
    }

    const getSortIndicator = (asc: typeof userVisitSort, desc: typeof userVisitSort) => {
        if (userVisitSort === asc) return '▲'
        if (userVisitSort === desc) return '▼'
        return ''
    }

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Analizler</h2>
                    <p className="text-muted-foreground">Kullanıcı aktiviteleri ve sayfa görüntüleme istatistikleri.</p>
                </div>
                <Tabs value={period} onValueChange={setPeriod} className="w-[400px]">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="24h">24 Saat</TabsTrigger>
                        <TabsTrigger value="7d">7 Gün</TabsTrigger>
                        <TabsTrigger value="30d">30 Gün</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Toplam Görüntüleme</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.reduce((acc, curr) => acc + curr.views, 0)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Benzersiz Ziyaret Sayısı</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.reduce((acc, curr) => acc + curr.unique_visitors, 0)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Bir Sayfada Geçirilen Ortalama Süre (sn)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {Math.round(stats.reduce((acc, curr) => acc + curr.avg_time, 0) / (stats.length || 1))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Platform Karşılaştırması</CardTitle>
                        <CardDescription>Rapor görüntüleme toplamları (platform bazlı)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {parsedReportStats.platformTotals.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                                Henüz rapor görüntüleme verisi yok. Birkaç rapor görüntüledikten sonra burada görünecek.
                            </div>
                        ) : (
                            <div className="h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={parsedReportStats.platformTotals} margin={{ bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="platformLabel"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={renderSimpleTick()}
                                        interval={0}
                                        height={70}
                                    />
                                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                            itemStyle={{ color: 'var(--foreground)' }}
                                        />
                                        <Bar dataKey="views" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Görüntüleme" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Rapor Karşılaştırması</CardTitle>
                        <CardDescription>Seçili platformun raporları arasında görüntüleme karşılaştırması</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {platformTabs.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                                Henüz rapor görüntüleme verisi yok.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Tabs value={selectedPlatform} onValueChange={setSelectedPlatform}>
                                    <TabsList className="flex flex-wrap gap-2">
                                        {platformTabs.map(code => (
                                            <TabsTrigger key={code} value={code}>
                                                {code.toUpperCase()}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                </Tabs>
                                {reportsForSelectedPlatform.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">
                                        Seçili platform için rapor görüntüleme verisi yok.
                                    </div>
                                ) : (
                                    <div className="h-[350px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={reportsForSelectedPlatform} margin={{ bottom: 10 }}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="name"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={renderReportComparisonTick(reportsForSelectedPlatform)}
                                        interval={0}
                                        height={80}
                                    />
                                                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                                    itemStyle={{ color: 'var(--foreground)' }}
                                                />
                                                <Bar
                                                    dataKey="views"
                                                    fill="#2563eb"
                                                    radius={[4, 4, 0, 0]}
                                                    name="Görüntüleme"
                                                    cursor="pointer"
                                                    onClick={(data: any) => {
                                                        const payload = data?.payload
                                                        if (payload?.platformCode && payload?.reportId) {
                                                            router.push(buildReportHref(payload))
                                                        }
                                                    }}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle>Kullanıcı Ziyaretleri</CardTitle>
                        <CardDescription>Kullanıcıların hangi sayfa/raporları ziyaret ettiğini görüntüleyin</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Sırala:</span>
                        <select
                            value={userVisitSort}
                            onChange={(event) => setUserVisitSort(event.target.value as typeof userVisitSort)}
                            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                            <option value="views-desc">Görüntüleme (çoktan aza)</option>
                            <option value="views-asc">Görüntüleme (azdan çoğa)</option>
                            <option value="username-asc">Kullanıcı (A-Z)</option>
                            <option value="username-desc">Kullanıcı (Z-A)</option>
                            <option value="path-asc">Sayfa (A-Z)</option>
                            <option value="path-desc">Sayfa (Z-A)</option>
                            <option value="last-seen-desc">Son Görülme (yeni)</option>
                            <option value="last-seen-asc">Son Görülme (eski)</option>
                            <option value="total-time-desc">Toplam Süre (çoktan aza)</option>
                            <option value="total-time-asc">Toplam Süre (azdan çoğa)</option>
                        </select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        <div className="flex flex-col gap-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleUserVisitSort('username')}
                                                className="flex items-center gap-1 hover:text-gray-700"
                                            >
                                                Kullanıcı
                                                <span className="text-[10px]">{getSortIndicator('username-asc', 'username-desc')}</span>
                                            </button>
                                            <input
                                                type="text"
                                                value={userVisitFilter}
                                                onChange={(event) => setUserVisitFilter(event.target.value)}
                                                placeholder="Kullanıcı filtrele..."
                                                list="analytics-usernames"
                                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                            />
                                            <datalist id="analytics-usernames">
                                                {availableUsernames.map(username => (
                                                    <option key={username} value={username} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        <div className="flex flex-col gap-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleUserVisitSort('path')}
                                                className="flex items-center gap-1 hover:text-gray-700"
                                            >
                                                Sayfa / Rapor
                                                <span className="text-[10px]">{getSortIndicator('path-asc', 'path-desc')}</span>
                                            </button>
                                            <input
                                                type="text"
                                                value={userVisitPathFilter}
                                                onChange={(event) => setUserVisitPathFilter(event.target.value)}
                                                placeholder="Rapor filtrele..."
                                                list="analytics-reportnames"
                                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                            />
                                            <datalist id="analytics-reportnames">
                                                {availableReportNames.map(name => (
                                                    <option key={name} value={name} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        <button
                                            type="button"
                                            onClick={() => toggleUserVisitSort('views')}
                                            className="ml-auto flex items-center gap-1 hover:text-gray-700"
                                        >
                                            Görüntüleme
                                            <span className="text-[10px]">{getSortIndicator('views-asc', 'views-desc')}</span>
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        <button
                                            type="button"
                                            onClick={() => toggleUserVisitSort('total-time')}
                                            className="ml-auto flex items-center gap-1 hover:text-gray-700"
                                        >
                                            Toplam Süre
                                            <span className="text-[10px]">{getSortIndicator('total-time-asc', 'total-time-desc')}</span>
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        <button
                                            type="button"
                                            onClick={() => toggleUserVisitSort('last-seen')}
                                            className="ml-auto flex items-center gap-1 hover:text-gray-700"
                                        >
                                            Son Görülme
                                            <span className="text-[10px]">{getSortIndicator('last-seen-asc', 'last-seen-desc')}</span>
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {userVisits.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                                            Henüz kullanıcı bazlı ziyaret verisi yok.
                                        </td>
                                    </tr>
                                ) : sortedUserVisits.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                                            Filtreye uygun kayıt bulunamadı.
                                        </td>
                                    </tr>
                                ) : (
                                    pagedUserVisits.map((visit, index) => (
                                        <tr key={`${visit.user_id}-${visit.path}-${index}`} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {visit.user_id}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {getReportHrefFromPath(visit.path) ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const href = getReportHrefFromPath(visit.path)
                                                            if (href) router.push(href)
                                                        }}
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {visit.readablePath}
                                                    </button>
                                                ) : (
                                                    visit.readablePath
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-gray-700">
                                                {visit.views}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-gray-700">
                                                {formatDuration(visit.total_duration_seconds)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-gray-500">
                                                {formatTimestamp(visit.last_seen)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {sortedUserVisits.length > 0 && (
                        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                            <div>
                                {userVisitPageStart + 1}-{Math.min(userVisitPageStart + userVisitPageSize, sortedUserVisits.length)} / {sortedUserVisits.length}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setUserVisitPage(prev => Math.max(1, prev - 1))}
                                    disabled={userVisitPage === 1}
                                    className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Önceki
                                </button>
                                <span>
                                    {userVisitPage} / {userVisitPageCount}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setUserVisitPage(prev => Math.min(userVisitPageCount, prev + 1))}
                                    disabled={userVisitPage === userVisitPageCount}
                                    className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Sonraki
                                </button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Sayfa Görüntülemeleri</CardTitle>
                        <CardDescription>En çok ziyaret edilen sayfalar</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={readableStats} margin={{ bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="name"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={renderReportTick(readableStats)}
                                        interval={0}
                                        height={80}
                                    />
                                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                        itemStyle={{ color: 'var(--foreground)' }}
                                    />
                                    <Bar
                                        dataKey="views"
                                        fill="#2563eb"
                                        radius={[4, 4, 0, 0]}
                                        name="Görüntüleme"
                                        cursor="pointer"
                                        onClick={(data: any) => {
                                            const path = data?.payload?.path
                                            const href = path ? getReportHrefFromPath(path) : null
                                            if (href) router.push(href)
                                        }}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Ortalama Süre (Saniye)</CardTitle>
                        <CardDescription>Sayfalarda geçirilen ortalama süre</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={readableStats} margin={{ bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="name"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tick={renderReportTick(readableStats)}
                                        interval={0}
                                        height={80}
                                    />
                                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                        itemStyle={{ color: 'var(--foreground)' }}
                                        formatter={(value: number) => [typeof value === 'number' ? value.toFixed(2) : value, 'Süre (sn)']}
                                    />
                                    <Bar
                                        dataKey="avg_time"
                                        fill="#16a34a"
                                        radius={[4, 4, 0, 0]}
                                        name="Süre (sn)"
                                        cursor="pointer"
                                        onClick={(data: any) => {
                                            const path = data?.payload?.path
                                            const href = path ? getReportHrefFromPath(path) : null
                                            if (href) router.push(href)
                                        }}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Rapor Süresi (Kullanıcı)</CardTitle>
                    <CardDescription>Raporlarda geçirilen toplam süreye göre ilk 20 kullanıcı</CardDescription>
                </CardHeader>
                <CardContent>
                    {reportTimeChartData.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                            Henüz rapor görüntüleme süresi verisi yok.
                        </div>
                    ) : (
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={reportTimeChartData}
                                        dataKey="value"
                                        nameKey="name"
                                        outerRadius={130}
                                        innerRadius={55}
                                        paddingAngle={2}
                                    >
                                        {reportTimeChartData.map((entry, index) => (
                                            <Cell
                                                key={`report-time-cell-${entry.name}`}
                                                fill={REPORT_TIME_COLORS[index % REPORT_TIME_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip content={renderReportTimeTooltip} />
                                    <Legend
                                        formatter={(value: any, entry: any) =>
                                            `${value} (${formatDurationDetailed(entry?.payload?.value)})`
                                        }
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
