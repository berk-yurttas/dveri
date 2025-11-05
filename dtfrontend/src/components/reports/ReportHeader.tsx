import React, { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, User, RefreshCw, FileSpreadsheet, Edit, Trash2, Settings, Loader2 } from 'lucide-react'

interface ReportHeaderProps {
  report: {
    id: number
    name: string
    description: string
    is_public: boolean
    tags: string[]
    owner_name: string
    created_at: string
  }
  platformCode: string
  reportId: string
  subplatform: string | null
  isExporting: boolean
  isSettingsDropdownOpen: boolean
  setIsSettingsDropdownOpen: (open: boolean) => void
  setIsDeleteDialogOpen: (open: boolean) => void
  onRefresh: () => void
  onExport: () => void
  canExport: boolean
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  report,
  platformCode,
  reportId,
  subplatform,
  isExporting,
  isSettingsDropdownOpen,
  setIsSettingsDropdownOpen,
  setIsDeleteDialogOpen,
  onRefresh,
  onExport,
  canExport,
}) => {
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)

  return (
    <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-6 space-y-4 rounded-lg shadow-lg shadow-slate-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{report.name}</h1>
              <div className="relative" ref={dropdownRef}>
                <button
                  className="h-8 w-8 p-0 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700"
                  onClick={() => setIsSettingsDropdownOpen(!isSettingsDropdownOpen)}
                >
                  <Settings className="h-4 w-4" />
                </button>

                {/* Settings Dropdown */}
                {isSettingsDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setIsSettingsDropdownOpen(false)
                          if (subplatform) {
                            router.push(`/${platformCode}/reports/${reportId}/edit?subplatform=${subplatform}`)
                          } else {
                            router.push(`/${platformCode}/reports/${reportId}/edit`)
                          }
                        }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Düzenle
                      </button>
                      <button
                        onClick={() => {
                          setIsSettingsDropdownOpen(false)
                          setIsDeleteDialogOpen(true)
                        }}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Sil
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-gray-600 mt-2">{report.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Raporu Yenile
          </button>
          <button
            onClick={onExport}
            disabled={isExporting || !canExport}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Dışa Aktarılıyor...
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                Excel'e Aktar
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500" style={{ marginTop: '10px' }}>
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(report.created_at).toLocaleDateString()}
        </div>
        {report.owner_name && (
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {report.owner_name}
          </div>
        )}
        {report.is_public && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Public
          </span>
        )}
      </div>

      {report.tags && report.tags.length > 0 && (
        <div className="flex items-center gap-2">
          {report.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

