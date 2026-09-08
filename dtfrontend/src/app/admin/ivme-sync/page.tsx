"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Search,
  Clock,
  Database,
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  Timer,
} from "lucide-react"
import AdminSidebar from "@/components/AdminSidebar"
import { ReportOdakUpdateModal } from "@/components/reports/ReportOdakUpdateModal"
import {
  reportsService,
  type IvmeSyncBulkScheduleUpdate,
  type IvmeSyncReportItem,
  type IvmeSyncSchedule,
  type IvmeSyncScheduleUpdate,
} from "@/services/reports"

const FREQUENCY_OPTIONS: Array<{
  value: IvmeSyncSchedule["frequency"]
  label: string
}> = [
  { value: "every_30_min", label: "Her 30 dakika" },
  { value: "every_hour", label: "Her saat" },
  { value: "every_night", label: "Her gece" },
]

function padTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hourText, minuteText] = value.split(":")
  const hour = Number(hourText)
  const minute = Number(minuteText)
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 1,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("tr-TR")
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  const total = Math.round(seconds)
  if (total < 60) return `${total} sn`
  const minutes = Math.floor(total / 60)
  const remainingSeconds = total % 60
  if (minutes < 60) {
    return remainingSeconds ? `${minutes} dk ${remainingSeconds} sn` : `${minutes} dk`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours} sa ${remainingMinutes} dk` : `${hours} sa`
}

function statusBadge(status: string | null | undefined) {
  if (!status) return null
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="h-3 w-3" />
        Başarılı
      </span>
    )
  }
  if (status === "started") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        <Loader2 className="h-3 w-3 animate-spin" />
        Çalışıyor
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <XCircle className="h-3 w-3" />
      Hata
    </span>
  )
}

export default function IvmeReportSyncPage() {
  const [reports, setReports] = useState<IvmeSyncReportItem[]>([])
  const [lastUpdaterDate, setLastUpdaterDate] = useState<string | null>(null)
  const [lastUpdaterUser, setLastUpdaterUser] = useState<string | null>(null)
  const [avgRuntimeSeconds, setAvgRuntimeSeconds] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [updateReportIds, setUpdateReportIds] = useState<number[]>([])
  const [bulkFrequency, setBulkFrequency] = useState<IvmeSyncSchedule["frequency"]>("every_hour")
  const [bulkHour, setBulkHour] = useState(1)
  const [bulkMinute, setBulkMinute] = useState(0)
  const [bulkSaving, setBulkSaving] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await reportsService.getIvmeSync()
      setReports(data.reports || [])
      setLastUpdaterDate(data.last_updater_date)
      setLastUpdaterUser(data.last_updater_user)
      setAvgRuntimeSeconds(data.avg_runtime_seconds ?? null)
    } catch (err) {
      console.error("Failed to load IVME sync reports:", err)
      setError("IVME raporları yüklenemedi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return reports
    return reports.filter((report) =>
      `${report.name} ${report.description || ""}`.toLowerCase().includes(term)
    )
  }, [reports, searchTerm])

  const filteredIds = useMemo(() => filteredReports.map((report) => report.id), [filteredReports])
  const selectedVisibleCount = filteredIds.filter((id) => selectedIds.has(id)).length
  const allVisibleSelected = filteredIds.length > 0 && selectedVisibleCount === filteredIds.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected])

  const toggleSelected = (reportId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(reportId)) {
        next.delete(reportId)
      } else {
        next.add(reportId)
      }
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        filteredIds.forEach((id) => next.delete(id))
      } else {
        filteredIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const saveSchedule = async (report: IvmeSyncReportItem, next: IvmeSyncScheduleUpdate) => {
    setSavingIds((current) => new Set(current).add(report.id))
    try {
      const saved = await reportsService.updateOdakSchedule(report.id, next)
      setReports((current) =>
        current.map((item) => (item.id === report.id ? { ...item, schedule: saved } : item))
      )
    } catch (err) {
      console.error("Failed to save schedule:", err)
      setError("Zamanlama kaydedilemedi")
    } finally {
      setSavingIds((current) => {
        const nextSet = new Set(current)
        nextSet.delete(report.id)
        return nextSet
      })
    }
  }

  const applyBulkSchedules = async (payload: Omit<IvmeSyncBulkScheduleUpdate, "report_ids">) => {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    setError(null)
    try {
      const result = await reportsService.updateOdakSchedulesBulk({
        report_ids: Array.from(selectedIds),
        ...payload,
      })
      const byId = new Map(result.items.map((item) => [item.report_id, item.schedule]))
      setReports((current) =>
        current.map((item) => (byId.has(item.id) ? { ...item, schedule: byId.get(item.id)! } : item))
      )
    } catch (err) {
      console.error("Failed to save bulk schedules:", err)
      setError("Seçilen raporların zamanlaması kaydedilemedi")
    } finally {
      setBulkSaving(false)
    }
  }

  const scheduleFor = (report: IvmeSyncReportItem): IvmeSyncSchedule =>
    report.schedule || {
      enabled: false,
      frequency: "every_night",
      hour: 1,
      minute: 0,
      next_run_at: null,
      last_run_at: null,
      last_run_status: null,
      last_run_message: null,
      last_run_duration_seconds: null,
      run_count: 0,
      avg_runtime_seconds: null,
    }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">İvme Rapor Senkronizasyon</h1>
            <p className="text-gray-600">
              IVME raporlarındaki tabloları Odak güncelleme servisi ile zamanlayın ve son güncelleme tarihini görün.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Database className="h-5 w-5" />
                <span className="text-sm font-medium">IVME rapor sayısı</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{reports.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Clock className="h-5 w-5" />
                <span className="text-sm font-medium">Odak son güncelleme</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{lastUpdaterDate || "—"}</p>
              {lastUpdaterUser && (
                <p className="text-sm text-gray-500 mt-1">Kullanıcı: {lastUpdaterUser}</p>
              )}
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Timer className="h-5 w-5" />
                <span className="text-sm font-medium">Toplam ortalama süre</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatDuration(avgRuntimeSeconds)}</p>
              <p className="text-sm text-gray-500 mt-1">Tüm raporların ortalama çalışma süresi</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rapor ara..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedIds.size > 0 && (
                  <span className="text-sm text-gray-600 mr-1">{selectedIds.size} rapor seçildi</span>
                )}
                {selectedIds.size > 0 && (
                  <>
                    <select
                      value={bulkFrequency}
                      disabled={bulkSaving}
                      onChange={(e) => setBulkFrequency(e.target.value as IvmeSyncSchedule["frequency"])}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      aria-label="Toplu zamanlama sıklığı"
                    >
                      {FREQUENCY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {bulkFrequency === "every_night" && (
                      <input
                        type="time"
                        value={padTime(bulkHour, bulkMinute)}
                        disabled={bulkSaving}
                        onChange={(e) => {
                          const next = parseTime(e.target.value)
                          setBulkHour(next.hour)
                          setBulkMinute(next.minute)
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        aria-label="Toplu gece saati"
                      />
                    )}
                    <button
                      onClick={() =>
                        void applyBulkSchedules({
                          frequency: bulkFrequency,
                          hour: bulkFrequency === "every_night" ? bulkHour : 1,
                          minute: bulkFrequency === "every_night" ? bulkMinute : 0,
                        })
                      }
                      disabled={bulkSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                      Zamanlamayı Uygula
                    </button>
                    <button
                      onClick={() => void applyBulkSchedules({ enabled: true })}
                      disabled={bulkSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Aktif Yap
                    </button>
                    <button
                      onClick={() => void applyBulkSchedules({ enabled: false })}
                      disabled={bulkSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-4 w-4" />
                      Kapat
                    </button>
                  </>
                )}
                <button
                  onClick={() => setUpdateReportIds(Array.from(selectedIds))}
                  disabled={selectedIds.size === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <Play className="h-4 w-4" />
                  Seçilenleri Güncelle
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="text-center py-16 text-gray-500">IVME raporu bulunamadı</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        title="Tümünü seç"
                        aria-label="Tümünü seç"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rapor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Son güncelleme
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ort. süre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Zamanlama
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Aktif
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredReports.map((report) => {
                    const schedule = scheduleFor(report)
                    const saving = savingIds.has(report.id)
                    return (
                      <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(report.id)}
                            onChange={() => toggleSelected(report.id)}
                            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            aria-label={`${report.name} seç`}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            href={`/ivme/reports/${report.id}`}
                            className="font-medium text-gray-900 hover:text-blue-700"
                          >
                            {report.name}
                          </Link>
                          {report.description && (
                            <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{report.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatDate(schedule.last_run_at)}</div>
                          <div className="mt-1">{statusBadge(schedule.last_run_status)}</div>
                          {schedule.last_run_message && (
                            <p className="text-xs text-gray-500 mt-1 max-w-xs truncate" title={schedule.last_run_message}>
                              {schedule.last_run_message}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {formatDuration(schedule.avg_runtime_seconds)}
                          </div>
                          {schedule.last_run_duration_seconds != null && (
                            <p className="text-xs text-gray-500 mt-1">
                              Son: {formatDuration(schedule.last_run_duration_seconds)}
                            </p>
                          )}
                          {(schedule.run_count || 0) > 0 && (
                            <p className="text-xs text-gray-400 mt-0.5">{schedule.run_count} çalışma</p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <select
                              value={schedule.frequency}
                              disabled={saving}
                              onChange={(e) => {
                                const frequency = e.target.value as IvmeSyncSchedule["frequency"]
                                void saveSchedule(report, {
                                  enabled: schedule.enabled,
                                  frequency,
                                  hour: frequency === "every_night" ? schedule.hour : 1,
                                  minute: frequency === "every_night" ? schedule.minute : 0,
                                })
                              }}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              {FREQUENCY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {schedule.frequency === "every_night" && (
                              <input
                                type="time"
                                value={padTime(schedule.hour, schedule.minute)}
                                disabled={saving}
                                onChange={(e) => {
                                  const next = parseTime(e.target.value)
                                  void saveSchedule(report, {
                                    enabled: schedule.enabled,
                                    frequency: schedule.frequency,
                                    hour: next.hour,
                                    minute: next.minute,
                                  })
                                }}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            )}
                          </div>
                          {schedule.enabled && schedule.next_run_at && (
                            <p className="text-xs text-gray-500 mt-1">
                              Sonraki: {formatDate(schedule.next_run_at)}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            disabled={saving}
                            onClick={() =>
                              void saveSchedule(report, {
                                enabled: !schedule.enabled,
                                frequency: schedule.frequency,
                                hour: schedule.hour,
                                minute: schedule.minute,
                              })
                            }
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              schedule.enabled
                                ? "bg-green-100 text-green-800 hover:bg-green-200"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {saving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : schedule.enabled ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {schedule.enabled ? "Aktif" : "Kapalı"}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => setUpdateReportIds([report.id])}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700"
                          >
                            <Play className="h-3 w-3" />
                            Şimdi Güncelle
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ReportOdakUpdateModal
        isOpen={updateReportIds.length > 0}
        reportIds={updateReportIds}
        onClose={() => setUpdateReportIds([])}
        onComplete={() => {
          setSelectedIds(new Set())
          void loadData()
        }}
      />
    </div>
  )
}
