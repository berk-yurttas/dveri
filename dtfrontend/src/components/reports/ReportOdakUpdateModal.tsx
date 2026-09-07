"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlertCircle, CheckCircle, Database, Loader2, X } from "lucide-react"
import { ApiError } from "@/lib/api"
import { reportsService, type OdakUpdateJobStatus } from "@/services/reports"

interface ReportOdakUpdateModalProps {
  isOpen: boolean
  reportId?: string
  reportIds?: Array<string | number>
  onClose: () => void
  onComplete?: () => void
}

function parseApiError(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.message)
      if (typeof parsed?.detail === "string") return parsed.detail
      if (typeof parsed?.detail?.message === "string") return parsed.detail.message
    } catch {
      if (err.message) return err.message
    }
    return err.message
  }
  if (err instanceof Error) return err.message
  return "Güncelleme başlatılırken hata oluştu"
}

export function ReportOdakUpdateModal({
  isOpen,
  reportId,
  reportIds,
  onClose,
  onComplete,
}: ReportOdakUpdateModalProps) {
  const [tableNames, setTableNames] = useState<string[]>([])
  const [skippedTables, setSkippedTables] = useState<string[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [statusMessage, setStatusMessage] = useState<string>("")
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [starting, setStarting] = useState(false)

  const logRef = useRef<HTMLPreElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const applyStatus = useCallback((status: OdakUpdateJobStatus, finished: boolean) => {
    setRunning(status.running)
    setLogs(Array.isArray(status.logs) ? status.logs : [])
    if (status.message) {
      setStatusMessage(status.message)
    }
    if (finished) {
      setDone(true)
      setRunning(false)
    }
  }, [])

  const pollOnce = useCallback(async () => {
    try {
      const status = await reportsService.getOdakUpdateStatus()
      if (status.running) {
        applyStatus(status, false)
      } else {
        stopPolling()
        applyStatus(status, true)
      }
    } catch (err) {
      stopPolling()
      setError(parseApiError(err))
      setRunning(false)
    }
  }, [applyStatus, stopPolling])

  const startPolling = useCallback(() => {
    if (pollRef.current) return
    void pollOnce()
    pollRef.current = setInterval(() => {
      void pollOnce()
    }, 1000)
  }, [pollOnce])

  useEffect(() => {
    if (!isOpen) {
      stopPolling()
      setTableNames([])
      setSkippedTables([])
      setLogs([])
      setStatusMessage("")
      setRunning(false)
      setError(null)
      setDone(false)
      setCancelling(false)
      setStarting(false)
      mountedRef.current = false
      return
    }

    const ids = (reportIds && reportIds.length > 0
      ? reportIds
      : reportId
        ? [reportId]
        : []
    ).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)

    if (mountedRef.current) return
    mountedRef.current = true

    const start = async () => {
      setStarting(true)
      setError(null)
      setDone(false)
      try {
        const current = await reportsService.getOdakUpdateStatus()
        if (current.running) {
          setStatusMessage("Devam eden bir güncelleme bulundu, loglar izleniyor...")
          applyStatus(current, false)
          startPolling()
          return
        }

        if (ids.length === 0) {
          setError("Güncellenecek rapor seçilmedi")
          return
        }

        const result = ids.length === 1
          ? await reportsService.triggerOdakUpdate(String(ids[0]))
          : await reportsService.triggerOdakBulkUpdate(ids)
        setTableNames(result.table_names || [])
        setSkippedTables(result.skipped_tables || [])
        setStatusMessage(result.message || "Güncelleme başlatıldı.")
        setRunning(true)
        startPolling()
      } catch (err) {
        const message = parseApiError(err)
        if (message.toLowerCase().includes("devam ediyor")) {
          setStatusMessage(message)
          startPolling()
          return
        }
        setError(message)
        setRunning(false)
      } finally {
        setStarting(false)
      }
    }

    void start()
  }, [isOpen, reportId, reportIds, applyStatus, startPolling, stopPolling])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, statusMessage])

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await reportsService.cancelOdakUpdate()
      setStatusMessage("İptal isteği gönderildi...")
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setCancelling(false)
    }
  }

  if (!isOpen || typeof document === "undefined") return null

  const logText = logs.length > 0
    ? logs.join("\n")
    : running || starting
      ? "Güncelleme devam ediyor, loglar bekleniyor..."
      : ""

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(3px)", backgroundColor: "rgba(15, 23, 42, 0.35)" }}
    >
      <div
        className="bg-white rounded-lg w-full max-w-3xl shadow-2xl border border-gray-100 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              {reportIds && reportIds.length > 1 ? `Raporları Güncelle (${reportIds.length})` : "Raporu Güncelle"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-hidden flex flex-col min-h-0">
          {tableNames.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Güncellenen tablolar</p>
              <div className="flex flex-wrap gap-1.5">
                {tableNames.map((name) => (
                  <span
                    key={name}
                    className="px-2 py-0.5 text-xs rounded-md bg-amber-50 text-amber-800 border border-amber-200"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {skippedTables.length > 0 && (
            <p className="text-xs text-gray-500">
              Odak listesinde olmayan tablolar atlandı: {skippedTables.join(", ")}
            </p>
          )}

          {starting && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
              Tablolar kontrol ediliyor ve güncelleme başlatılıyor...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {!error && done && !running && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-md p-3">
              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-800">{statusMessage || "Güncelleme tamamlandı."}</p>
            </div>
          )}

          {(running || logText) && (
            <pre
              ref={logRef}
              className="flex-1 min-h-[240px] max-h-[50vh] overflow-auto bg-slate-950 text-slate-100 text-xs leading-5 rounded-md p-3 whitespace-pre-wrap font-mono"
            >
              {logText}
              {done && statusMessage && logText.indexOf(statusMessage) === -1 ? `\n${statusMessage}` : ""}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          {running && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-3 py-1.5 text-sm rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {cancelling ? "İptal ediliyor..." : "İptal Et"}
            </button>
          )}
          {done && !running && onComplete && (
            <button
              onClick={() => {
                onComplete()
                onClose()
              }}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              {reportIds && reportIds.length > 1 ? "Listeyi Yenile" : "Raporu Yenile"}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
