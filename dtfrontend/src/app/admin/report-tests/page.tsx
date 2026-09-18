"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  CheckCircle,
  ChevronRight,
  Clock,
  FlaskConical,
  Loader2,
  Play,
  Save,
  Search,
  Square,
  XCircle,
} from "lucide-react"
import AdminSidebar from "@/components/AdminSidebar"
import { platformService } from "@/services/platform"
import { reportTestService } from "@/services/report-tests"
import type { Platform } from "@/types/platform"
import type { ReportTestRun, ReportTestSchedule, ReportTestSummary } from "@/types/report-tests"

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

function timeValue(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function parseTime(value: string) {
  const [hourText, minuteText] = (value || "02:00").split(":")
  const hour = Math.min(23, Math.max(0, Number(hourText) || 0))
  const minute = Math.min(59, Math.max(0, Number(minuteText) || 0))
  return { hour, minute }
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
  const [schedules, setSchedules] = useState<ReportTestSchedule[]>([])
  const [recipientDraft, setRecipientDraft] = useState<Record<number, string>>({})
  const [savingPlatformId, setSavingPlatformId] = useState<number | null>(null)

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
    reportTestService.listSchedules().then((data) => {
      const items = data.items || []
      setSchedules(items)
      setRecipientDraft(
        Object.fromEntries(items.map((item) => [item.platform_id, (item.recipients || []).join(", ")]))
      )
    }).catch((err) => {
      console.error(err)
    })
  }, [])

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

  const updateSchedule = (platformIdToUpdate: number, patch: Partial<ReportTestSchedule>) => {
    setSchedules((current) =>
      current.map((item) => (item.platform_id === platformIdToUpdate ? { ...item, ...patch } : item))
    )
  }

  const handleSaveSchedule = async (schedule: ReportTestSchedule) => {
    setSavingPlatformId(schedule.platform_id)
    setError(null)
    try {
      const saved = await reportTestService.saveSchedule(schedule.platform_id, {
        enabled: schedule.enabled,
        hour: schedule.hour,
        minute: schedule.minute,
        recipients: (recipientDraft[schedule.platform_id] || "").split(/[,;\s]+/).filter(Boolean),
      })
      updateSchedule(schedule.platform_id, saved)
      setRecipientDraft((current) => ({
        ...current,
        [schedule.platform_id]: (saved.recipients || []).join(", "),
      }))
    } catch (err) {
      console.error(err)
      setError("Zamanlama kaydedilemedi")
    } finally {
      setSavingPlatformId(null)
    }
  }

  const latest = summary?.latest_run

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Rapor Kontrolleri</h1>
            <p className="text-gray-600">
              Raporların düzgün açılıp açılmadığına bakar. Sadece hatalar listelenir.
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">Son kontrol</div>
              <div className="text-lg font-semibold text-gray-900">{formatDate(latest?.finished_at || latest?.started_at)}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">Sorunsuz rapor</div>
              <div className="text-lg font-semibold text-green-700">{latest?.passed_reports ?? 0}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">Hatalı rapor</div>
              <div className="text-lg font-semibold text-red-700">{latest?.failed_reports ?? 0}</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-gray-500" />
              <h2 className="font-medium text-gray-900">Platform zamanlamaları</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Her platform için günlük saat seçin ve özet mail alacak kişileri yazın. Test bitince koşu linki mailde olur.
            </p>
            {schedules.length === 0 ? (
              <div className="text-sm text-gray-500">Platform bulunamadı.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="pb-2 pr-3">Platform</th>
                      <th className="pb-2 pr-3">Aktif</th>
                      <th className="pb-2 pr-3">Saat</th>
                      <th className="pb-2 pr-3">Alıcılar</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {schedules.map((schedule) => (
                      <tr key={schedule.platform_id}>
                        <td className="py-3 pr-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {schedule.platform_name || schedule.platform_code}
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            type="checkbox"
                            checked={schedule.enabled}
                            onChange={(event) =>
                              updateSchedule(schedule.platform_id, { enabled: event.target.checked })
                            }
                          />
                        </td>
                        <td className="py-3 pr-3">
                          <input
                            type="time"
                            value={timeValue(schedule.hour, schedule.minute)}
                            onChange={(event) =>
                              updateSchedule(schedule.platform_id, parseTime(event.target.value))
                            }
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="py-3 pr-3 min-w-[240px]">
                          <input
                            value={recipientDraft[schedule.platform_id] ?? schedule.recipients.join(", ")}
                            onChange={(event) =>
                              setRecipientDraft((current) => ({
                                ...current,
                                [schedule.platform_id]: event.target.value,
                              }))
                            }
                            placeholder="ali@aselsan.com, veli@aselsan.com"
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-full"
                          />
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleSaveSchedule(schedule)}
                            disabled={savingPlatformId === schedule.platform_id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                          >
                            {savingPlatformId === schedule.platform_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            Kaydet
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {running && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-amber-900">Kontrol ediliyor</div>
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
                          {run.trigger === "scheduled" ? "Otomatik" : "Elle"} · {run.triggered_by || "—"}
                        </div>
                        <div className="text-xs text-gray-400">{formatDate(run.started_at || run.created_at)}</div>
                      </td>
                      <td className="px-6 py-4">{runStatusBadge(run.status)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="text-green-700">{run.passed_reports} sorunsuz</span>
                        {" · "}
                        <span className="text-red-700">{run.failed_reports} hata</span>
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
