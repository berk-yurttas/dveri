"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  CheckCircle,
  ChevronRight,
  FlaskConical,
  Loader2,
  Play,
  Search,
  Square,
  XCircle,
} from "lucide-react"
import AdminSidebar from "@/components/AdminSidebar"
import { platformService } from "@/services/platform"
import { reportTestService } from "@/services/report-tests"
import type { Platform } from "@/types/platform"
import type { ReportTestRun, ReportTestSummary } from "@/types/report-tests"

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("tr-TR")
}

function formatDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return "—"
  const from = new Date(start).getTime()
  const to = end ? new Date(end).getTime() : Date.now()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return "—"
  const total = Math.round((to - from) / 1000)
  if (total < 60) return `${total} sn`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds ? `${minutes} dk ${seconds} sn` : `${minutes} dk`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining ? `${hours} sa ${remaining} dk` : `${hours} sa`
}

function runStatusBadge(status: string | null | undefined) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="h-3 w-3" />
        Tamamlandı
      </span>
    )
  }
  if (status === "running" || status === "queued") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status === "queued" ? "Kuyrukta" : "Çalışıyor"}
      </span>
    )
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
        İptal
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <XCircle className="h-3 w-3" />
      Hatalı
    </span>
  )
}

export default function AdminReportTestsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-gray-500">Yükleniyor...</div>}>
      <AdminReportTestsPageInner />
    </Suspense>
  )
}

function AdminReportTestsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const platformFromUrl = searchParams.get("platformId")
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [runs, setRuns] = useState<ReportTestRun[]>([])
  const [summary, setSummary] = useState<ReportTestSummary | null>(null)
  const [platformId, setPlatformId] = useState<number | "all">(
    platformFromUrl ? Number(platformFromUrl) : "all"
  )
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const running = summary?.running_run || runs.find((run) => run.status === "running" || run.status === "queued")

  const loadData = async () => {
    try {
      setError(null)
      const [runData, summaryData, platformData] = await Promise.all([
        reportTestService.listRuns(platformId === "all" ? null : platformId),
        reportTestService.getSummary(),
        platforms.length ? Promise.resolve(platforms) : platformService.getPlatforms(0, 200, true),
      ])
      setRuns(runData.items || [])
      setSummary(summaryData)
      if (!platforms.length) setPlatforms(platformData)
    } catch (err) {
      console.error(err)
      setError("Rapor test geçmişi yüklenemedi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [platformId])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(loadData, 2500)
    return () => clearInterval(timer)
  }, [running?.id, platformId])

  const filteredRuns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return runs
    return runs.filter((run) =>
      [run.triggered_by, run.trigger, run.current_report_name, String(run.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    )
  }, [runs, searchTerm])

  const handleStart = async () => {
    setStarting(true)
    setError(null)
    try {
      const run = await reportTestService.startRun({
        platform_id: platformId === "all" ? null : platformId,
      })
      router.push(`/admin/report-tests/${run.id}`)
    } catch (err) {
      console.error(err)
      setError("Test başlatılamadı. Zaten çalışan bir test olabilir.")
    } finally {
      setStarting(false)
    }
  }

  const handleCancel = async () => {
    if (!running) return
    setCancelling(true)
    try {
      await reportTestService.cancelRun(running.id)
      await loadData()
    } catch (err) {
      console.error(err)
      setError("Test iptal edilemedi")
    } finally {
      setCancelling(false)
    }
  }

  const latest = summary?.latest_run

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Rapor Testleri</h1>
            <p className="text-gray-600">
              Her koşu gerçek bir tarayıcıda sizin gibi rapor sayfalarını açar: sekmeler, filtreler, Uygula, tablolar, grafikler, satır sayıları ve hatalar. Sonuçlar burada tarihsel olarak saklanır.
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">Son koşu</div>
              <div className="text-lg font-semibold text-gray-900">{formatDate(latest?.finished_at || latest?.started_at)}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">Başarılı rapor</div>
              <div className="text-lg font-semibold text-green-700">{latest?.passed_reports ?? 0}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">Hatalı rapor</div>
              <div className="text-lg font-semibold text-red-700">{latest?.failed_reports ?? 0}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">Uyarı</div>
              <div className="text-lg font-semibold text-amber-700">{latest?.warning_reports ?? 0}</div>
            </div>
          </div>

          {running && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-amber-900">Test çalışıyor</div>
                <div className="text-sm text-amber-800">
                  {running.processed_reports}/{running.total_reports || "?"} rapor
                  {running.current_report_name ? ` — ${running.current_report_name}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push(`/admin/report-tests/${running.id}`)}
                  className="px-3 py-2 text-sm bg-white border border-amber-300 rounded-lg hover:bg-amber-100"
                >
                  Detayı aç
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  <Square className="h-4 w-4" />
                  Durdur
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Koşu ara..."
                    className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg w-full sm:w-64"
                  />
                </div>
                <select
                  value={platformId}
                  onChange={(e) => setPlatformId(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="all">Tüm platformlar</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleStart}
                disabled={starting || Boolean(running)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {platformId === "all" ? "Tüm raporları test et" : "Bu platformu test et"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {loading && runs.length === 0 ? (
              <div className="py-16 text-center text-gray-500">Yükleniyor...</div>
            ) : filteredRuns.length === 0 ? (
              <div className="py-16 text-center">
                <FlaskConical className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <div className="font-medium text-gray-900">Henüz test koşusu yok</div>
                <p className="text-sm text-gray-500 mt-1">İlk otomatik raporu testini başlatın.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Koşu</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Raporlar</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Süre</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRuns.map((run) => (
                    <tr
                      key={run.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/admin/report-tests/${run.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">#{run.id}</div>
                        <div className="text-sm text-gray-500">
                          {run.trigger === "scheduled" ? "Zamanlanmış" : "Manuel"} · {run.triggered_by || "—"}
                        </div>
                        <div className="text-xs text-gray-400">{formatDate(run.started_at || run.created_at)}</div>
                      </td>
                      <td className="px-6 py-4">{runStatusBadge(run.status)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="text-green-700">{run.passed_reports} geçti</span>
                        {" · "}
                        <span className="text-red-700">{run.failed_reports} hata</span>
                        {" · "}
                        <span className="text-amber-700">{run.warning_reports} uyarı</span>
                        <div className="text-xs text-gray-400">{run.total_cases} kontrol</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDuration(run.started_at, run.finished_at)}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-400">
                        <ChevronRight className="h-4 w-4 inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
