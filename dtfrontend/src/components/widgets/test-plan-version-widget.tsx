"use client"

import { useState, useEffect, useRef } from "react"
import { api } from "@/lib/api"

// Widget configuration
TestPlanVersionWidget.config = {
  id: "test_plan_version-widget",
  name: "Ürün Test Planı Değişim",
  type: "test_plan_version",
  color: "bg-teal-500",
  description: "Test plan versiyon takibi ve karşılaştırma",
  size: { width: 4, height: 2 }
}

// TypeScript interfaces
interface TestPlanVersionData {
  StokNo: string
  Tanim: string
  SurecAdi: string
  SurecDurum: string
  TPHashID: string
  UDKNo: string
}

interface TestPlanDetail {
  [key: string]: any
}

interface WidgetData {
  success: boolean
  data: any[]
  columns: string[]
  total_rows: number
}

interface TestPlanVersionWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function TestPlanVersionWidget({ widgetId, dateFrom, dateTo }: TestPlanVersionWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `test-plan-version-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Refs for dropdown elements
  const stokNoDropdownRef = useRef<HTMLDivElement>(null)
  const surecAdiDropdownRef = useRef<HTMLDivElement>(null)
  const surecDurumDropdownRef = useRef<HTMLDivElement>(null)

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') {
      return { stokNo: null, surecAdi: null, surecDurum: null }
    }
    try {
      const stored = localStorage.getItem(`test-plan-version-filters-${instanceId}`)
      if (stored) {
        return JSON.parse(stored)
      }
      return { stokNo: null, surecAdi: null, surecDurum: null }
    } catch {
      return { stokNo: null, surecAdi: null, surecDurum: null }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedStokNo, setSelectedStokNo] = useState<string | null>(initialFilters.stokNo)
  const [selectedSurecAdi, setSelectedSurecAdi] = useState<string | null>(initialFilters.surecAdi)
  const [selectedSurecDurum, setSelectedSurecDurum] = useState<string | null>(initialFilters.surecDurum)
  const [stokNoOptions, setStokNoOptions] = useState<string[]>([])
  const [surecAdiOptions, setSurecAdiOptions] = useState<string[]>([])
  const [surecDurumOptions, setSurecDurumOptions] = useState<string[]>([])
  const [stokNoSearch, setStokNoSearch] = useState('')
  const [surecAdiSearch, setSurecAdiSearch] = useState('')
  const [surecDurumSearch, setSurecDurumSearch] = useState('')
  const [showStokNoDropdown, setShowStokNoDropdown] = useState(false)
  const [showSurecAdiDropdown, setShowSurecAdiDropdown] = useState(false)
  const [showSurecDurumDropdown, setShowSurecDurumDropdown] = useState(false)

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<TestPlanVersionData[]>([])
  const [allData, setAllData] = useState<TestPlanVersionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // State for comparison
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [comparisonData, setComparisonData] = useState<any[]>([])
  const [comparisonColumns, setComparisonColumns] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonLoading, setComparisonLoading] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [comparisonPage, setComparisonPage] = useState(1)
  const itemsPerPage = 10

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stokNoDropdownRef.current && !stokNoDropdownRef.current.contains(event.target as Node)) {
        setShowStokNoDropdown(false)
      }
      if (surecAdiDropdownRef.current && !surecAdiDropdownRef.current.contains(event.target as Node)) {
        setShowSurecAdiDropdown(false)
      }
      if (surecDurumDropdownRef.current && !surecDurumDropdownRef.current.contains(event.target as Node)) {
        setShowSurecDurumDropdown(false)
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
      localStorage.setItem(`test-plan-version-filters-${instanceId}`, JSON.stringify({
        stokNo: selectedStokNo,
        surecAdi: selectedSurecAdi,
        surecDurum: selectedSurecDurum
      }))
    }
  }, [selectedStokNo, selectedSurecAdi, selectedSurecDurum, instanceId])

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
            SELECT
              tg.SurecAdi,
              tg.SurecDurum,
              teu.UrunID,
              u.StokNo,
              u.Tanim,
              u.UDKNo,
              tp.TPHashID
            FROM REHIS_TestKayit_Test_TabloTestGrup tg
            LEFT JOIN REHIS_TestTanim_Test_TabloTestPlan tp ON tp.TPHashID = tg.TPHashID
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = tg.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun u ON u.UrunID = teu.UrunID
            WHERE ${dateFilter}
            GROUP BY
              tg.SurecAdi,
              tg.SurecDurum,
              teu.UrunID,
              u.StokNo,
              u.Tanim,
              u.UDKNo,
              tp.TPHashID
          `
        })

        if (response.success && response.data && response.data.length > 0) {
          const transformed: TestPlanVersionData[] = response.data.map(row => ({
            SurecAdi: row[0] || '',
            SurecDurum: row[1] || '',
            StokNo: row[3] || '',
            Tanim: row[4] || '',
            UDKNo: row[5] || '',
            TPHashID: row[6] || ''
          }))

          setAllData(transformed)
          const uniqueStokNo = Array.from(new Set(transformed.map(item => item.StokNo))).filter(Boolean).sort()
          const uniqueSurecAdi = Array.from(new Set(transformed.map(item => item.SurecAdi))).filter(Boolean).sort()
          const uniqueSurecDurum = Array.from(new Set(transformed.map(item => item.SurecDurum))).filter(Boolean).sort()
          setStokNoOptions(uniqueStokNo)
          setSurecAdiOptions(uniqueSurecAdi)
          setSurecDurumOptions(uniqueSurecDurum)
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
        setWidgetData([])
        setShowComparison(false)
        setSelectedRows(new Set())
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
        
        let whereClauses: string[] = [dateFilter]

        whereClauses.push(`u.StokNo = '${selectedStokNo}'`)

        if (selectedSurecAdi) {
          whereClauses.push(`tg.SurecAdi = '${selectedSurecAdi}'`)
        }

        if (selectedSurecDurum) {
          whereClauses.push(`tg.SurecDurum = '${selectedSurecDurum}'`)
        }

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: `
            SELECT
              tg.SurecAdi,
              tg.SurecDurum,
              teu.UrunID,
              u.StokNo,
              u.Tanim,
              u.UDKNo,
              tp.TPHashID
            FROM REHIS_TestKayit_Test_TabloTestGrup tg
            LEFT JOIN REHIS_TestTanim_Test_TabloTestPlan tp ON tp.TPHashID = tg.TPHashID
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = tg.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun u ON u.UrunID = teu.UrunID
            ${whereClause}
            GROUP BY
              tg.SurecAdi,
              tg.SurecDurum,
              teu.UrunID,
              u.StokNo,
              u.Tanim,
              u.UDKNo,
              tp.TPHashID
          `
        })

        if (response.success && response.data && response.data.length > 0) {
          const transformed: TestPlanVersionData[] = response.data.map(row => ({
            SurecAdi: row[0] || '',
            SurecDurum: row[1] || '',
            StokNo: row[3] || '',
            Tanim: row[4] || '',
            UDKNo: row[5] || '',
            TPHashID: row[6] || ''
          }))

          setWidgetData(transformed)
          setCurrentPage(1)
        } else {
          setWidgetData([])
        }
      } catch (err: any) {
        setError('Veri yüklenirken hata oluştu')
        console.error(`Error loading widget data for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedStokNo, selectedSurecAdi, selectedSurecDurum, instanceId, dateFrom, dateTo])

  // Handle row selection
  const handleRowSelect = (index: number) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      if (newSelected.size >= 2) {
        // Only allow 2 selections at a time
        return
      }
      newSelected.add(index)
    }
    setSelectedRows(newSelected)
  }

  // Handle comparison
  const handleCompare = async () => {
    if (selectedRows.size !== 2) {
      alert('Lütfen karşılaştırma için tam olarak 2 satır seçin')
      return
    }

    const selectedIndices = Array.from(selectedRows)
    const row1 = widgetData[selectedIndices[0]]
    const row2 = widgetData[selectedIndices[1]]

    setComparisonLoading(true)
    setShowComparison(true)

    try {
      // Query REHIS_TestTanim_Test_TabloTestPlan directly
      const response = await api.post<WidgetData>('/reports/preview', {
        sql_query: `
          SELECT *
          FROM REHIS_TestTanim_Test_TabloTestPlan
          WHERE TPHashID IN (${row1.TPHashID}, ${row2.TPHashID})
        `
      })

      if (response.success && response.data && response.data.length > 0) {
        setComparisonColumns(response.columns || [])
        setComparisonData(response.data)
        setComparisonPage(1)
      } else {
        setComparisonData([])
        setComparisonColumns([])
      }
    } catch (err) {
      console.error('Comparison error:', err)
      alert('Karşılaştırma sırasında hata oluştu')
      setComparisonData([])
      setComparisonColumns([])
    } finally {
      setComparisonLoading(false)
    }
  }

  // Filter options based on search
  const filteredStokNoOptions = stokNoOptions.filter(stokNo =>
    stokNo.toLowerCase().includes(stokNoSearch.toLowerCase())
  )

  const filteredSurecAdiOptions = surecAdiOptions.filter(surecAdi =>
    surecAdi.toLowerCase().includes(surecAdiSearch.toLowerCase())
  )

  const filteredSurecDurumOptions = surecDurumOptions.filter(surecDurum =>
    surecDurum.toLowerCase().includes(surecDurumSearch.toLowerCase())
  )

  // Pagination helpers
  const getPaginatedData = (data: any[], page: number) => {
    const startIndex = (page - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return data.slice(startIndex, endIndex)
  }

  const totalPages = Math.ceil(widgetData.length / itemsPerPage)
  const totalComparisonPages = Math.ceil(comparisonData.length / itemsPerPage)
  const paginatedWidgetData = getPaginatedData(widgetData, currentPage)
  const paginatedComparisonData = getPaginatedData(comparisonData, comparisonPage)

  // Pagination component
  const Pagination = ({ currentPage, totalPages, onPageChange }: { currentPage: number, totalPages: number, onPageChange: (page: number) => void }) => {
    if (totalPages <= 1) return null

    return (
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200">
        <div className="text-xs text-gray-600">
          Sayfa {currentPage} / {totalPages}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Önceki
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`px-2 py-1 text-xs border border-gray-300 rounded ${
                  currentPage === pageNum ? 'bg-teal-500 text-white' : 'hover:bg-gray-50'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sonraki
          </button>
        </div>
      </div>
    )
  }

  // Show loading state
  if (loading && widgetData.length === 0 && !selectedStokNo) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        <p className="text-sm text-gray-600 mt-2">Yükleniyor...</p>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <p className="text-sm text-red-600 text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-gray-700">Ürün Test Planı Değişim Tablosu</h3>
          <p className="text-xs text-gray-500 mt-1">Test plan versiyonlarını görüntüle ve karşılaştır</p>
        </div>
        <div className="flex gap-2">
          {/* Stok No Dropdown */}
          <div className="relative" ref={stokNoDropdownRef}>
            <button
              onClick={() => setShowStokNoDropdown(!showStokNoDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">{selectedStokNo || 'Stok No Seçin *'}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showStokNoDropdown && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={stokNoSearch}
                    onChange={(e) => setStokNoSearch(e.target.value)}
                    placeholder="Stok No ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                {filteredStokNoOptions.map((stokNo) => (
                  <div
                    key={stokNo}
                    onClick={() => {
                      setSelectedStokNo(stokNo)
                      setShowStokNoDropdown(false)
                      setStokNoSearch('')
                      setShowComparison(false)
                      setSelectedRows(new Set())
                    }}
                    className={`px-3 py-2 text-xs hover:bg-teal-50 cursor-pointer ${selectedStokNo === stokNo ? 'bg-teal-100 font-medium' : ''}`}
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

          {/* Süreç Adı Dropdown */}
          <div className="relative" ref={surecAdiDropdownRef}>
            <button
              onClick={() => setShowSurecAdiDropdown(!showSurecAdiDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">{selectedSurecAdi || 'Tüm Süreç Adı'}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSurecAdiDropdown && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={surecAdiSearch}
                    onChange={(e) => setSurecAdiSearch(e.target.value)}
                    placeholder="Süreç adı ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedSurecAdi(null)
                    setShowSurecAdiDropdown(false)
                    setSurecAdiSearch('')
                  }}
                  className="px-3 py-2 text-xs hover:bg-teal-50 cursor-pointer"
                >
                  Tüm Süreç Adı
                </div>
                {filteredSurecAdiOptions.map((surecAdi) => (
                  <div
                    key={surecAdi}
                    onClick={() => {
                      setSelectedSurecAdi(surecAdi)
                      setShowSurecAdiDropdown(false)
                      setSurecAdiSearch('')
                    }}
                    className={`px-3 py-2 text-xs hover:bg-teal-50 cursor-pointer ${selectedSurecAdi === surecAdi ? 'bg-teal-100 font-medium' : ''}`}
                  >
                    {surecAdi}
                  </div>
                ))}
                {filteredSurecAdiOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>

          {/* Süreç Durum Dropdown */}
          <div className="relative" ref={surecDurumDropdownRef}>
            <button
              onClick={() => setShowSurecDurumDropdown(!showSurecDurumDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">{selectedSurecDurum || 'Tüm Süreç Adımı'}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSurecDurumDropdown && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={surecDurumSearch}
                    onChange={(e) => setSurecDurumSearch(e.target.value)}
                    placeholder="Süreç adımı ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedSurecDurum(null)
                    setShowSurecDurumDropdown(false)
                    setSurecDurumSearch('')
                  }}
                  className="px-3 py-2 text-xs hover:bg-teal-50 cursor-pointer"
                >
                  Tüm Süreç Adımı
                </div>
                {filteredSurecDurumOptions.map((surecDurum) => (
                  <div
                    key={surecDurum}
                    onClick={() => {
                      setSelectedSurecDurum(surecDurum)
                      setShowSurecDurumDropdown(false)
                      setSurecDurumSearch('')
                    }}
                    className={`px-3 py-2 text-xs hover:bg-teal-50 cursor-pointer ${selectedSurecDurum === surecDurum ? 'bg-teal-100 font-medium' : ''}`}
                  >
                    {surecDurum}
                  </div>
                ))}
                {filteredSurecDurumOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedStokNo ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Stok Numarası Seçin</p>
            <p className="text-xs text-gray-500">Test planı verilerini görüntülemek için stok numarası seçmeniz gerekir</p>
          </div>
        </div>
      ) : (
        <>
          {/* Comparison Button */}
          {selectedRows.size > 0 && !showComparison && (
            <div className="mb-3 flex items-center justify-between bg-teal-50 p-2 rounded">
              <span className="text-xs text-teal-700">
                {selectedRows.size} satır seçildi {selectedRows.size === 2 ? '(Karşılaştırma için hazır)' : '(2 satır seçin)'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedRows(new Set())}
                  className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Seçimi Temizle
                </button>
                <button
                  onClick={handleCompare}
                  disabled={selectedRows.size !== 2}
                  className="px-3 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Karşılaştır
                </button>
              </div>
            </div>
          )}

          {showComparison && (
            <div className="mb-3 flex items-center justify-between bg-teal-100 p-2 rounded">
              <span className="text-xs text-teal-800 font-medium">
                Karşılaştırma Sonuçları Gösteriliyor
              </span>
              <button
                onClick={() => {
                  setShowComparison(false)
                  setSelectedRows(new Set())
                  setComparisonData([])
                }}
                className="px-3 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700"
              >
                Tabloya Dön
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col">
            {!showComparison ? (
              <>
                {/* Main Table */}
                <div className="flex-1 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium text-gray-700">Seç</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700">Süreç Adı</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700">Süreç Adımı</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700">Ürün Stok No</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700">Ürün Tanımı</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700">UDK No</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700">TPHash</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedWidgetData.map((row, index) => {
                        const actualIndex = (currentPage - 1) * itemsPerPage + index
                        return (
                          <tr
                            key={actualIndex}
                            className={`hover:bg-gray-50 ${selectedRows.has(actualIndex) ? 'bg-teal-50' : ''}`}
                          >
                            <td className="px-2 py-2 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(actualIndex)}
                                onChange={() => handleRowSelect(actualIndex)}
                                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                              />
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">{row.SurecAdi}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{row.SurecDurum}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{row.StokNo}</td>
                            <td className="px-2 py-2">{row.Tanim}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{row.UDKNo}</td>
                            <td className="px-2 py-2 font-mono text-xs">{String(row.TPHashID).substring(0, 12)}...</td>
                          </tr>
                        )
                      })}
                      {paginatedWidgetData.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-2 py-8 text-center text-gray-500">
                            Veri bulunamadı
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination 
                  currentPage={currentPage} 
                  totalPages={totalPages} 
                  onPageChange={setCurrentPage} 
                />
              </>
            ) : comparisonLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
                <span className="ml-2 text-sm text-gray-600">Karşılaştırma yükleniyor...</span>
              </div>
            ) : (
              <>
                {/* Comparison Table */}
                <div className="flex-1 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {comparisonColumns.map((col, idx) => (
                          <th key={idx} className="px-2 py-2 text-left font-medium text-gray-700">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedComparisonData.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          {row.map((cell: any, cellIdx: number) => (
                            <td key={cellIdx} className="px-2 py-2 whitespace-nowrap">
                              {cell !== null && cell !== undefined ? String(cell) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {paginatedComparisonData.length === 0 && (
                        <tr>
                          <td colSpan={comparisonColumns.length} className="px-2 py-8 text-center text-gray-500">
                            Karşılaştırma verisi bulunamadı
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination 
                  currentPage={comparisonPage} 
                  totalPages={totalComparisonPages} 
                  onPageChange={setComparisonPage} 
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
