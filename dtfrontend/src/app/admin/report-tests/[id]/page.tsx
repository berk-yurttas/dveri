"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Square,
  XCircle,
} from "lucide-react"
import AdminSidebar from "@/components/AdminSidebar"
import { reportTestService } from "@/services/report-tests"
import type { ReportTestCase, ReportTestResult, ReportTestRun } from "@/types/report-tests"
import {
  friendlyCaseMessage,
  friendlyCaseName,
  friendlySummary,
  isErrorStatus,
} from "@/lib/friendly-report-test"

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("tr-TR")
}

function formatMs(ms?: number | null) {
  if (ms == null || Number.isNaN(Number(ms)) || ms < 0) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) {
    const seconds = ms / 1000
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`
  }
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes} dk ${seconds} s`
}

function resultBadge(status: string) {
  if (status === "passed") {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Sorunsuz</span>
  }
  if (status === "skipped") {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Atlandı</span>
  }
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Hata</span>
}

function caseBadge(status: string) {
  if (status === "passed") return <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
  if (status === "skipped") return <span className="h-4 w-4 shrink-0 text-gray-400">–</span>
  return <XCircle className="h-4 w-4 text-red-600 shrink-0" />
}

const CATEGORY_LABELS: Record<string, string> = {
  structure: "Rapor ayarları",
  ui: "Ekran",
  filter: "Filtreler",
  query: "Tablolar",
  visualization: "Görünüm",
  performance: "Yavaşlık",
  error: "Hata",
}

export default function AdminReportTestRunPage() {
  const params = useParams()
  const router = useRouter()
  const runId = Number(params.id)
  const [run, setRun] = useState<ReportTestRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("failed")
  const [searchTerm, setSearchTerm] = useState("")
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())
  const [cancelling, setCancelling] = useState(false)

  const loadRun = async () => {
    try {
      const data = await reportTestService.getRun(runId, true)
      setRun(data)
      setError(null)
    } catch (err) {
      console.error(err)
      setError("Sonuçlar yüklenemedi")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRun()
  }, [runId])

  useEffect(() => {
    if (!run || run.status === "running" || run.status === "queued") return
    setOpenIds((prev) => {
      if (prev.size) return prev
      return new Set(
        (run.results || [])
          .filter((item) => item.status === "failed" || item.status === "error")
          .map((item) => item.id)
      )
    })
  }, [run?.id, run?.status])

  const isActive = run?.status === "running" || run?.status === "queued"
  useEffect(() => {
    if (!isActive) return
    const timer = setInterval(loadRun, 2500)
    return () => clearInterval(timer)
  }, [isActive, runId])

  const results = run?.results || []
  const filtered = useMemo(() => {
    return results.filter((item) => {
      if (statusFilter === "failed") {
        if (!isErrorStatus(item.status)) return false
      } else if (statusFilter !== "all" && item.status !== statusFilter) {
        return false
      }
      const term = searchTerm.trim().toLowerCase()
      if (!term) return true
      return (
        item.report_name.toLowerCase().includes(term) ||
        (item.platform_name || "").toLowerCase().includes(term) ||
        (item.summary || "").toLowerCase().includes(term)
      )
    })
  }, [results, statusFilter, searchTerm])

  const toggle = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await reportTestService.cancelRun(runId)
      await loadRun()
    } finally {
      setCancelling(false)
    }
  }

  if (loading && !run) {
    return (
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div className="flex-1 flex items-center justify-center text-gray-500">Yükleniyor...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.push("/admin/report-tests")}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Tüm kontroller
          </button>

          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Kontrol #{runId}</h1>
              <p className="text-gray-600 text-sm">
                {run?.trigger === "scheduled" ? "Otomatik" : "Elle başlatıldı"} · {run?.triggered_by || "—"} · {formatDate(run?.started_at)}
              </p>
            </div>
            {isActive && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
              >
                <Square className="h-4 w-4" />
                Durdur
              </button>
            )}
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
          )}

          {isActive && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 font-medium text-amber-900 mb-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Çalışıyor: {run?.processed_reports}/{run?.total_reports || "?"}
              </div>
              <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500"
                  style={{
                    width: `${run && run.total_reports ? Math.min(100, (run.processed_reports / run.total_reports) * 100) : 5}%`,
                  }}
                />
              </div>
              {run?.current_report_name && (
                <div className="text-sm text-amber-800 mt-2">Şu an: {run.current_report_name}</div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <Stat label="Sorunsuz" value={run?.passed_reports ?? 0} color="text-green-700" />
            <Stat label="Hata" value={run?.failed_reports ?? 0} color="text-red-700" />
            <Stat label="Toplam rapor" value={run?.total_reports ?? results.length} color="text-gray-800" />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rapor ara..."
              className="border border-gray-300 rounded-lg px-3 py-2 flex-1"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="failed">Sadece hatalar</option>
              <option value="all">Tümü</option>
            </select>
          </div>

          <div className="space-y-2">
            {filtered.map((result) => (
              <ReportResultCard
                key={result.id}
                result={result}
                open={openIds.has(result.id)}
                onToggle={() => toggle(result.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-lg py-12 text-center text-gray-500">
                Hata bulunan rapor yok.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  )
}

function ReportResultCard({
  result,
  open,
  onToggle,
}: {
  result: ReportTestResult
  open: boolean
  onToggle: () => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ReportTestCase[]>()
    for (const item of result.cases || []) {
      if (!isErrorStatus(item.status)) continue
      const list = map.get(item.category) || []
      list.push(item)
      map.set(item.category, list)
    }
    return Array.from(map.entries())
  }, [result.cases])

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 truncate">{result.report_name}</span>
            {resultBadge(result.status)}
            {result.platform_name && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{result.platform_name}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatMs(result.duration_ms)}
            {result.summary ? ` · ${friendlySummary(result.summary)}` : ""}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-4">
          {grouped.length === 0 ? (
            <div className="text-sm text-gray-500">Bu raporda hata yok.</div>
          ) : (
            grouped.map(([category, cases]) => (
              <div key={category}>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                  {CATEGORY_LABELS[category] || category}
                </div>
                <div className="space-y-2">
                  {cases.map((item) => (
                    <div key={item.case_id} className="flex items-start gap-2 text-sm">
                      {caseBadge(item.status)}
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-900">{friendlyCaseName(item)}</div>
                        <div className="text-gray-500">{friendlyCaseMessage(item)}</div>
                      </div>
                      <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap pt-0.5">
                        {formatMs(item.duration_ms)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
