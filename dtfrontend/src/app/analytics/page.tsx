"use client"

import { useEffect, useMemo, useState } from 'react'
import { analyticsService, AnalyticsStats, AnalyticsUserVisit } from '@/services/analytics'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from 'lucide-react'

export default function AnalyticsPage() {
    const [stats, setStats] = useState<AnalyticsStats[]>([])
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState('24h')
    const [selectedPlatform, setSelectedPlatform] = useState<string>('')
    const [userVisits, setUserVisits] = useState<AnalyticsUserVisit[]>([])
    const [userVisitSort, setUserVisitSort] = useState<'views-desc' | 'views-asc' | 'username-asc' | 'username-desc' | 'path-asc' | 'path-desc' | 'last-seen-desc' | 'last-seen-asc' | 'total-time-desc' | 'total-time-asc'>('views-desc')
    const [userVisitFilter, setUserVisitFilter] = useState('')

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

    // We can parse the path to make it more readable
    const readableStats = stats.map(item => {
        let name = item.path
        if (item.path === '/') name = 'Anasayfa'
        else if (item.path.includes('/reports/')) {
            const parts = item.path.split('/')
            name = `Rapor ${parts[parts.length - 1]}`
        } else if (item.path.includes('/dashboard')) {
            name = 'Gösterge Paneli'
        }
        return {
            ...item,
            name
        }
    })

    const formatPathLabel = (path: string) => {
        const cleanedPath = path.split('?')[0].replace(/\/+$/, '')
        if (!cleanedPath || cleanedPath === '/') return 'Anasayfa'
        const segments = cleanedPath.split('/').filter(Boolean)
        const [first, second, third] = segments

        let label = cleanedPath
        if (second === 'reports' && third) {
            label = `Rapor ${third}`
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

    const parsedReportStats = useMemo(() => {
        const reportEntries = stats.flatMap(item => {
            const cleanedPath = item.path.split('?')[0].replace(/\/+$/, '')
            const segments = cleanedPath.split('/').filter(Boolean)
            if (segments.length !== 3 || segments[1] !== 'reports') return []
            if (segments[2] === 'add') return []
            return [{
                platformCode: segments[0],
                reportId: segments[2],
                views: item.views,
                unique_visitors: item.unique_visitors,
                avg_time: item.avg_time
            }]
        })

        const reportTotals = new Map<string, {
            platformCode: string
            reportId: string
            views: number
            unique_visitors: number
            avg_time_total: number
        }>()

        reportEntries.forEach(item => {
            const key = `${item.platformCode}:${item.reportId}`
            const existing = reportTotals.get(key)
            if (existing) {
                existing.views += item.views
                existing.unique_visitors += item.unique_visitors
                existing.avg_time_total += item.avg_time * item.views
            } else {
                reportTotals.set(key, {
                    platformCode: item.platformCode,
                    reportId: item.reportId,
                    views: item.views,
                    unique_visitors: item.unique_visitors,
                    avg_time_total: item.avg_time * item.views
                })
            }
        })

        const reports = Array.from(reportTotals.values()).map(item => ({
            platformCode: item.platformCode,
            reportId: item.reportId,
            name: `Rapor ${item.reportId}`,
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
    }, [stats])

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
            readablePath: formatPathLabel(visit.path)
        }))
        const normalizedFilter = userVisitFilter.trim().toLowerCase()
        const filteredVisits = normalizedFilter
            ? visits.filter(visit => (visit.user_id || '').toLowerCase().includes(normalizedFilter))
            : visits

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
    }, [userVisits, userVisitSort, userVisitFilter])

    const availableUsernames = useMemo(() => {
        const unique = new Set<string>()
        userVisits.forEach(visit => {
            if (visit.user_id) {
                unique.add(visit.user_id)
            }
        })
        return Array.from(unique).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }, [userVisits])

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
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={parsedReportStats.platformTotals}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="platformLabel" fontSize={12} tickLine={false} axisLine={false} />
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
                                    <div className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={reportsForSelectedPlatform}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                                    itemStyle={{ color: 'var(--foreground)' }}
                                                />
                                                <Bar dataKey="views" fill="#2563eb" radius={[4, 4, 0, 0]} name="Görüntüleme" />
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
                                        <button
                                            type="button"
                                            onClick={() => toggleUserVisitSort('path')}
                                            className="flex items-center gap-1 hover:text-gray-700"
                                        >
                                            Sayfa / Rapor
                                            <span className="text-[10px]">{getSortIndicator('path-asc', 'path-desc')}</span>
                                        </button>
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
                                    sortedUserVisits.slice(0, 200).map((visit, index) => (
                                        <tr key={`${visit.user_id}-${visit.path}-${index}`} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {visit.user_id}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {visit.readablePath}
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
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Sayfa Görüntülemeleri</CardTitle>
                        <CardDescription>En çok ziyaret edilen sayfalar</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={readableStats}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                        itemStyle={{ color: 'var(--foreground)' }}
                                    />
                                    <Bar dataKey="views" fill="#2563eb" radius={[4, 4, 0, 0]} name="Görüntüleme" />
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
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={readableStats}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                        itemStyle={{ color: 'var(--foreground)' }}
                                    />
                                    <Bar dataKey="avg_time" fill="#16a34a" radius={[4, 4, 0, 0]} name="Süre (sn)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
