"use client"

import { useState, useEffect, useRef } from "react"
import { api } from "@/lib/api"

// Widget configuration
EquipmentLastUserWidget.config = {
  id: "equipment_last_user-widget",
  name: "Cihaz Son Kullanıcı",
  type: "equipment_last_user",
  color: "bg-indigo-500",
  description: "Test cihazını son kullanan personel bilgileri",
  size: { width: 3, height: 2 }
}

// TypeScript interfaces
interface EquipmentLastUserData {
  DemirbasNo: string
  CihazTipi: string
  CihazModeli: string
  Sicil: string
  Ad: string
  Soyad: string
  PCKullaniciAdi: string
}

interface WidgetData {
  success: boolean
  data: any[]
  columns: string[]
  total_rows: number
}

interface EquipmentLastUserWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function EquipmentLastUserWidget({ widgetId, dateFrom, dateTo }: EquipmentLastUserWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `equipment-last-user-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Refs for dropdown elements
  const demirbasNoDropdownRef = useRef<HTMLDivElement>(null)

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') {
      return { demirbasNo: null }
    }
    try {
      const stored = localStorage.getItem(`equipment-last-user-filters-${instanceId}`)
      if (stored) {
        return JSON.parse(stored)
      }
      return { demirbasNo: null }
    } catch {
      return { demirbasNo: null }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedDemirbasNo, setSelectedDemirbasNo] = useState<string | null>(initialFilters.demirbasNo)
  const [demirbasNoOptions, setDemirbasNoOptions] = useState<string[]>([])
  const [demirbasNoSearch, setDemirbasNoSearch] = useState('')
  const [showDemirbasNoDropdown, setShowDemirbasNoDropdown] = useState(false)

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<EquipmentLastUserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (demirbasNoDropdownRef.current && !demirbasNoDropdownRef.current.contains(event.target as Node)) {
        setShowDemirbasNoDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`equipment-last-user-filters-${instanceId}`, JSON.stringify({
        demirbasNo: selectedDemirbasNo
      }))
    }
  }, [selectedDemirbasNo, instanceId])

  // Load all options once on mount
  useEffect(() => {
    const loadOptions = async () => {
      try {
        // Build date filter condition
        let dateFilter = "tg.BitisTarihi > toDate('2000-01-01')"
        if (dateFrom && dateTo) {
          dateFilter = `tg.BitisTarihi BETWEEN toDateTime('${dateFrom}') AND toDateTime('${dateTo}')`
        }
        
        // Fetch all data to get all options
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: `
            SELECT DISTINCT
              tc.DemirbasNo
            FROM REHIS_TestKayit_Test_TabloTestGrup tg
            LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = tg.SetupHashID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
            WHERE ${dateFilter}
            AND tc.DemirbasNo IS NOT NULL
            AND tc.DemirbasNo != ''
            ORDER BY tc.DemirbasNo
          `
        })

        if (response.success && response.data && response.data.length > 0) {
          const uniqueDemirbasNo = response.data.map(row => row[0]).filter(Boolean)
          setDemirbasNoOptions(uniqueDemirbasNo as string[])
        }
      } catch (err) {
        console.error(`Error loading options for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadOptions()
  }, [instanceId, dateFrom, dateTo])

  // Load widget data with filters - only when demirbasNo is selected
  useEffect(() => {
    const loadWidgetData = async () => {
      // Don't load data if no demirbaş number is selected
      if (!selectedDemirbasNo) {
        setWidgetData(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Build date filter condition
        let dateFilter = "tg.BitisTarihi > toDate('2000-01-01')"
        if (dateFrom && dateTo) {
          dateFilter = `tg.BitisTarihi BETWEEN toDateTime('${dateFrom}') AND toDateTime('${dateTo}')`
        }
        
        // Query to get the last user of the equipment
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: `
            SELECT 
              tc.DemirbasNo, 
              tc.CihazTipi, 
              tc.CihazModeli, 
              tp.Sicil, 
              tp.Ad, 
              tp.Soyad, 
              tp.PCKullaniciAdi 
            FROM REHIS_TestKayit_Test_TabloTestGrup tg
            LEFT JOIN REHIS_TestKayit_Test_TabloTestCihazSetup tcs ON tcs.SetupHashID = tg.SetupHashID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestCihaz tc ON tc.CihazID = tcs.CihazID
            LEFT JOIN REHIS_TestTanim_Test_TabloPersonel tp ON tp.PersonelID = tg.PersonelID
            WHERE tc.DemirbasNo = '${selectedDemirbasNo}'
            AND ${dateFilter}
            ORDER BY tg.YuklenmeTarihi DESC
            LIMIT 1
          `
        })

        if (response.success && response.data && response.data.length > 0) {
          const row = response.data[0]
          const userData: EquipmentLastUserData = {
            DemirbasNo: row[0] || '',
            CihazTipi: row[1] || '',
            CihazModeli: row[2] || '',
            Sicil: row[3] || '',
            Ad: row[4] || '',
            Soyad: row[5] || '',
            PCKullaniciAdi: row[6] || ''
          }

          setWidgetData(userData)
        } else {
          setWidgetData(null)
          setError('Bu cihaz için kullanıcı bilgisi bulunamadı')
        }
      } catch (err: any) {
        setError('Veri yüklenirken hata oluştu')
        console.error(`Error loading widget data for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedDemirbasNo, instanceId, dateFrom, dateTo])

  // Filter options based on search
  const filteredDemirbasNoOptions = demirbasNoOptions.filter(demirbasNo =>
    demirbasNo.toLowerCase().includes(demirbasNoSearch.toLowerCase())
  )

  // Show loading state
  if (loading && !widgetData && !selectedDemirbasNo) {
    return (
      <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center overflow-hidden">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="text-sm text-gray-600 mt-2">Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden relative">
      {/* Header with filter */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 flex-shrink-0 relative z-20 bg-gradient-to-r from-indigo-50 to-white">
        <div className="flex flex-col flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-700">Cihaz Son Kullanıcı</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">Son kullanan personel bilgileri</p>
        </div>
        <div className="flex gap-2 ml-2">
          {/* Demirbaş No Dropdown */}
          <div className="relative" ref={demirbasNoDropdownRef}>
            <button
              onClick={() => setShowDemirbasNoDropdown(!showDemirbasNoDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-[140px] text-left flex items-center justify-between hover:border-indigo-400 transition-colors"
            >
              <span className="truncate">{selectedDemirbasNo || 'Demirbaş No Seçin *'}</span>
              <svg className="w-4 h-4 ml-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDemirbasNoDropdown && (
              <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                  <input
                    type="text"
                    value={demirbasNoSearch}
                    onChange={(e) => setDemirbasNoSearch(e.target.value)}
                    placeholder="Demirbaş No ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {filteredDemirbasNoOptions.map((demirbasNo) => (
                  <div
                    key={demirbasNo}
                    onClick={() => {
                      setSelectedDemirbasNo(demirbasNo)
                      setShowDemirbasNoDropdown(false)
                      setDemirbasNoSearch('')
                    }}
                    className={`px-3 py-2 text-xs hover:bg-indigo-50 cursor-pointer ${selectedDemirbasNo === demirbasNo ? 'bg-indigo-100 font-medium' : ''}`}
                  >
                    {demirbasNo}
                  </div>
                ))}
                {filteredDemirbasNoOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedDemirbasNo ? (
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <div className="text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Demirbaş Numarası Seçin</p>
            <p className="text-xs text-gray-500">Son kullanıcı bilgilerini görmek için demirbaş numarası seçin</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-2">Yükleniyor...</p>
          </div>
        </div>
      ) : error && !widgetData ? (
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <div className="text-center">
            <div className="text-orange-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm text-orange-600">{error}</p>
          </div>
        </div>
      ) : widgetData ? (
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-4">
            {/* Equipment Information Card */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-3 border border-indigo-100">
              <h4 className="text-xs font-semibold text-indigo-900 mb-2 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                Cihaz Bilgileri
              </h4>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-start">
                  <span className="text-xs font-medium text-indigo-700 w-24 flex-shrink-0">Demirbaş No:</span>
                  <span className="text-xs text-gray-800 font-semibold">{widgetData.DemirbasNo}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-indigo-700 w-24 flex-shrink-0">Cihaz Tipi:</span>
                  <span className="text-xs text-gray-800">{widgetData.CihazTipi || '-'}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-indigo-700 w-24 flex-shrink-0">Model:</span>
                  <span className="text-xs text-gray-800">{widgetData.CihazModeli || '-'}</span>
                </div>
              </div>
            </div>

            {/* Personnel Information Card */}
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3 border border-blue-100">
              <h4 className="text-xs font-semibold text-blue-900 mb-2 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Son Kullanan Personel
              </h4>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-start">
                  <span className="text-xs font-medium text-blue-700 w-24 flex-shrink-0">Sicil No:</span>
                  <span className="text-xs text-gray-800 font-semibold">{widgetData.Sicil || '-'}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-blue-700 w-24 flex-shrink-0">Ad Soyad:</span>
                  <span className="text-xs text-gray-800 font-semibold">{widgetData.Ad} {widgetData.Soyad}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-blue-700 w-24 flex-shrink-0">PC Kullanıcı:</span>
                  <span className="text-xs text-gray-800 font-mono bg-white px-2 py-0.5 rounded border border-blue-200">
                    {widgetData.PCKullaniciAdi || '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded p-2 border border-gray-200">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Bu bilgiler cihazın en son kullanım kaydına aittir.</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

