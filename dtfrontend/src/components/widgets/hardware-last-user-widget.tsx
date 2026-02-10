"use client"

import { useState, useEffect, useRef } from "react"
import { api } from "@/lib/api"

// Widget configuration
HardwareLastUserWidget.config = {
  id: "hardware_last_user-widget",
  name: "Donanım Son Kullanıcı",
  type: "hardware_last_user",
  color: "bg-emerald-500",
  description: "Test donanımını son kullanan personel bilgileri",
  size: { width: 3, height: 2 }
}

// TypeScript interfaces
interface HardwareLastUserData {
  StokNo: string
  Tanim: string
  SeriNo: string
  UDK: string
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

interface HardwareLastUserWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function HardwareLastUserWidget({ widgetId, dateFrom, dateTo }: HardwareLastUserWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `hardware-last-user-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Refs for dropdown elements
  const stokNoDropdownRef = useRef<HTMLDivElement>(null)

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') {
      return { stokNo: null }
    }
    try {
      const stored = localStorage.getItem(`hardware-last-user-filters-${instanceId}`)
      if (stored) {
        return JSON.parse(stored)
      }
      return { stokNo: null }
    } catch {
      return { stokNo: null }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedStokNo, setSelectedStokNo] = useState<string | null>(initialFilters.stokNo)
  const [stokNoOptions, setStokNoOptions] = useState<string[]>([])
  const [stokNoSearch, setStokNoSearch] = useState('')
  const [showStokNoDropdown, setShowStokNoDropdown] = useState(false)

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<HardwareLastUserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stokNoDropdownRef.current && !stokNoDropdownRef.current.contains(event.target as Node)) {
        setShowStokNoDropdown(false)
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
      localStorage.setItem(`hardware-last-user-filters-${instanceId}`, JSON.stringify({
        stokNo: selectedStokNo
      }))
    }
  }, [selectedStokNo, instanceId])

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
              td.StokNo
            FROM REHIS_TestKayit_Test_TabloTestGrup tg
            LEFT JOIN REHIS_TestKayit_Test_TabloTestDonanimSetup tds ON tds.SetupHashID = tg.SetupHashID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestDonanimi td ON td.TestDonanimID = tds.TestDonanimID
            WHERE ${dateFilter}
            AND td.StokNo IS NOT NULL
            AND td.StokNo != ''
            ORDER BY td.StokNo
          `
        })

        if (response.success && response.data && response.data.length > 0) {
          const uniqueStokNo = response.data.map(row => row[0]).filter(Boolean)
          setStokNoOptions(uniqueStokNo as string[])
        }
      } catch (err) {
        console.error(`Error loading options for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadOptions()
  }, [instanceId, dateFrom, dateTo])

  // Load widget data with filters - only when stokNo is selected
  useEffect(() => {
    const loadWidgetData = async () => {
      // Don't load data if no stock number is selected
      if (!selectedStokNo) {
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
        
        // Query to get the last user of the hardware
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: `
            SELECT 
              td.StokNo, 
              td.Tanim, 
              td.SeriNo, 
              td.UDK, 
              tp.Sicil, 
              tp.Ad, 
              tp.Soyad, 
              tp.PCKullaniciAdi 
            FROM REHIS_TestKayit_Test_TabloTestGrup tg
            LEFT JOIN REHIS_TestKayit_Test_TabloTestDonanimSetup tds ON tds.SetupHashID = tg.SetupHashID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestDonanimi td ON td.TestDonanimID = tds.TestDonanimID
            LEFT JOIN REHIS_TestTanim_Test_TabloPersonel tp ON tp.PersonelID = tg.PersonelID
            WHERE td.StokNo = '${selectedStokNo}'
            AND ${dateFilter}
            ORDER BY tg.YuklenmeTarihi DESC
            LIMIT 1
          `
        })

        if (response.success && response.data && response.data.length > 0) {
          const row = response.data[0]
          const userData: HardwareLastUserData = {
            StokNo: row[0] || '',
            Tanim: row[1] || '',
            SeriNo: row[2] || '',
            UDK: row[3] || '',
            Sicil: row[4] || '',
            Ad: row[5] || '',
            Soyad: row[6] || '',
            PCKullaniciAdi: row[7] || ''
          }

          setWidgetData(userData)
        } else {
          setWidgetData(null)
          setError('Bu donanım için kullanıcı bilgisi bulunamadı')
        }
      } catch (err: any) {
        setError('Veri yüklenirken hata oluştu')
        console.error(`Error loading widget data for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedStokNo, instanceId, dateFrom, dateTo])

  // Filter options based on search
  const filteredStokNoOptions = stokNoOptions.filter(stokNo =>
    stokNo.toLowerCase().includes(stokNoSearch.toLowerCase())
  )

  // Show loading state
  if (loading && !widgetData && !selectedStokNo) {
    return (
      <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center overflow-hidden">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        <p className="text-sm text-gray-600 mt-2">Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden relative">
      {/* Header with filter */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 flex-shrink-0 relative z-20 bg-gradient-to-r from-emerald-50 to-white">
        <div className="flex flex-col flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-700">Donanım Son Kullanıcı</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">Son kullanan personel bilgileri</p>
        </div>
        <div className="flex gap-2 ml-2">
          {/* Stok No Dropdown */}
          <div className="relative" ref={stokNoDropdownRef}>
            <button
              onClick={() => setShowStokNoDropdown(!showStokNoDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white min-w-[140px] text-left flex items-center justify-between hover:border-emerald-400 transition-colors"
            >
              <span className="truncate">{selectedStokNo || 'Stok No Seçin *'}</span>
              <svg className="w-4 h-4 ml-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showStokNoDropdown && (
              <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                  <input
                    type="text"
                    value={stokNoSearch}
                    onChange={(e) => setStokNoSearch(e.target.value)}
                    placeholder="Stok No ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                {filteredStokNoOptions.map((stokNo) => (
                  <div
                    key={stokNo}
                    onClick={() => {
                      setSelectedStokNo(stokNo)
                      setShowStokNoDropdown(false)
                      setStokNoSearch('')
                    }}
                    className={`px-3 py-2 text-xs hover:bg-emerald-50 cursor-pointer ${selectedStokNo === stokNo ? 'bg-emerald-100 font-medium' : ''}`}
                  >
                    {stokNo}
                  </div>
                ))}
                {filteredStokNoOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedStokNo ? (
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <div className="text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Stok Numarası Seçin</p>
            <p className="text-xs text-gray-500">Son kullanıcı bilgilerini görmek için donanım stok numarası seçin</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
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
            {/* Hardware Information Card */}
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg p-3 border border-emerald-100">
              <h4 className="text-xs font-semibold text-emerald-900 mb-2 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                Donanım Bilgileri
              </h4>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-start">
                  <span className="text-xs font-medium text-emerald-700 w-20 flex-shrink-0">Stok No:</span>
                  <span className="text-xs text-gray-800 font-semibold">{widgetData.StokNo}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-emerald-700 w-20 flex-shrink-0">Tanım:</span>
                  <span className="text-xs text-gray-800">{widgetData.Tanim || '-'}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-emerald-700 w-20 flex-shrink-0">Seri No:</span>
                  <span className="text-xs text-gray-800 font-mono bg-white px-2 py-0.5 rounded border border-emerald-200">
                    {widgetData.SeriNo || '-'}
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-emerald-700 w-20 flex-shrink-0">UDK:</span>
                  <span className="text-xs text-gray-800">{widgetData.UDK || '-'}</span>
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
              <span>Bu bilgiler donanımın en son kullanım kaydına aittir.</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

