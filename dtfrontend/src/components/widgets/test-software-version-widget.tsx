"use client"

import { useState, useEffect, useRef } from "react"
import { api } from "@/lib/api"

// Widget configuration
TestSoftwareVersionWidget.config = {
  id: "test_software_version-widget",
  name: "Ürün Test Yazılımı Değişim",
  type: "test_software_version",
  color: "bg-purple-500",
  description: "Test yazılımı versiyon takibi",
  size: { width: 6, height: 2 }
}

// TypeScript interfaces
interface TestSoftwareVersionData {
  YazilimSetupHashID: string
  TestYazilimID: string
  SurecAdi: string
  SurecDurum: string
  UrunID: string
  StokNo: string
  Tanim: string
  UDKNo: string
  TestYazilimStokNo: string
  TestYazilimTanimi: string
  TestYazilimVersiyon: string
  TestTasarimKullaniciAdi: string
  TYYStok: string
  TYYTanim: string
  TYYVersiyon: string
  FirstSeenDate: string
}

interface WidgetData {
  success: boolean
  data: any[]
  columns: string[]
  total_rows: number
}

interface TestSoftwareVersionWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function TestSoftwareVersionWidget({ widgetId, dateFrom, dateTo }: TestSoftwareVersionWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `test-software-version-${Math.random().toString(36).substr(2, 9)}`)
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
      const stored = localStorage.getItem(`test-software-version-filters-${instanceId}`)
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
  const [widgetData, setWidgetData] = useState<TestSoftwareVersionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalRows, setTotalRows] = useState(0)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string>('SetupHashID')
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC')

  // Column filters
  const [columnFilters, setColumnFilters] = useState<{[key: string]: string}>({})
  const [showColumnFilter, setShowColumnFilter] = useState<string | null>(null)
  const columnFilterRef = useRef<HTMLDivElement>(null)

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
      if (columnFilterRef.current && !columnFilterRef.current.contains(event.target as Node)) {
        setShowColumnFilter(null)
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
      localStorage.setItem(`test-software-version-filters-${instanceId}`, JSON.stringify({
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
              u.StokNo,
              u.Tanim
            FROM REHIS_TestKayit_Test_TabloTestGrup tg
            LEFT JOIN REHIS_TestTanim_Test_TabloTestPlan tp ON tp.TPHashID = tg.TPHashID
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = tg.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun u ON u.UrunID = teu.UrunID
            WHERE ${dateFilter}
            GROUP BY
              tg.SurecAdi,
              tg.SurecDurum,
              u.StokNo,
              u.Tanim
          `
        })

        if (response.success && response.data && response.data.length > 0) {
          const uniqueStokNo = Array.from(new Set(response.data.map(row => row[2]))).filter(Boolean).sort()
          const uniqueSurecAdi = Array.from(new Set(response.data.map(row => row[0]))).filter(Boolean).sort()
          const uniqueSurecDurum = Array.from(new Set(response.data.map(row => row[1]))).filter(Boolean).sort()
          setStokNoOptions(uniqueStokNo as string[])
          setSurecAdiOptions(uniqueSurecAdi as string[])
          setSurecDurumOptions(uniqueSurecDurum as string[])
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

        // Add column filters to where clauses
        Object.entries(columnFilters).forEach(([column, value]) => {
          if (value.trim()) {
            const columnMap: {[key: string]: string} = {
              'SetupHashID': 'tg.SetupHashID',
              'TestYazilimID': 'ty.TestYazilimID',
              'SurecAdi': 'tg.SurecAdi',
              'SurecDurum': 'tg.SurecDurum',
              'UrunID': 'teu.UrunID',
              'StokNo': 'u.StokNo',
              'Tanim': 'u.Tanim',
              'UDKNo': 'u.UDKNo',
              'TestYazilimStokNo': 'ty.TestYazilimStokNo',
              'TestYazilimTanimi': 'ty.TestYazilimTanimi',
              'TestYazilimVersiyon': 'ty.TestYazilimVersiyon',
              'TestTasarimKullaniciAdi': 'ty.TestTasarimKullaniciAdi',
              'TYYStok': 'tyy.TYYStok',
              'TYYTanim': 'tyy.TYYTanim',
              'TYYVersiyon': 'tyy.TYYVersiyon'
            }
            const dbColumn = columnMap[column]
            if (dbColumn) {
              whereClauses.push(`${dbColumn} ILIKE '%${value}%'`)
            }
          }
        })

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

        // Map sort column to database column
        const sortColumnMap: {[key: string]: string} = {
          'SetupHashID': 'tg.SetupHashID',
          'TestYazilimID': 'ty.TestYazilimID',
          'SurecAdi': 'tg.SurecAdi',
          'SurecDurum': 'tg.SurecDurum',
          'UrunID': 'teu.UrunID',
          'StokNo': 'u.StokNo',
          'Tanim': 'u.Tanim',
          'UDKNo': 'u.UDKNo',
          'TestYazilimStokNo': 'ty.TestYazilimStokNo',
          'TestYazilimTanimi': 'ty.TestYazilimTanimi',
          'TestYazilimVersiyon': 'ty.TestYazilimVersiyon',
          'TestTasarimKullaniciAdi': 'ty.TestTasarimKullaniciAdi',
          'TYYStok': 'tyy.TYYStok',
          'TYYTanim': 'tyy.TYYTanim',
          'TYYVersiyon': 'tyy.TYYVersiyon'
        }
        const dbSortColumn = sortColumnMap[sortColumn] || 'tg.SetupHashID'
        
        // Calculate offset for pagination
        const offset = (currentPage - 1) * pageSize

        // First, get the total count
        const countResponse = await api.post<WidgetData>('/reports/preview', {
          sql_query: `
            SELECT COUNT(*) as total
            FROM (
              SELECT
                tg.SetupHashID,
                ty.TestYazilimID
              FROM REHIS_TestKayit_Test_TabloTestGrup tg
              LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = tg.TEUID
              LEFT JOIN REHIS_TestTanim_Test_TabloUrun u ON u.UrunID = teu.UrunID
              LEFT JOIN REHIS_TestKayit_Test_TabloTestYazilimSetup tys ON tys.SetupHashID = tg.SetupHashID
              LEFT JOIN REHIS_TestTanim_Test_TabloTestYazilimi ty ON ty.TestYazilimID = tys.TestYazilimID
              LEFT JOIN REHIS_TestTanim_Test_TabloTestYonetimYazilimi tyy ON tyy.TYYID = ty.TYYID
              ${whereClause}
              AND trim(u.Tanim) != ''
              GROUP BY
                tg.SetupHashID,
                ty.TestYazilimID,
                tg.SurecAdi,
                tg.SurecDurum,
                teu.UrunID,
                u.StokNo,
                u.Tanim,
                u.UDKNo,
                ty.TestYazilimStokNo,
                ty.TestYazilimTanimi,
                ty.TestYazilimVersiyon,
                ty.TestTasarimKullaniciAdi,
                tyy.TYYStok,
                tyy.TYYTanim,
                tyy.TYYVersiyon
            ) as subquery
          `
        })

        const totalCount = countResponse.success && countResponse.data?.[0]?.[0] 
          ? Number(countResponse.data[0][0]) 
          : 0

        // Query to get test software version data with pagination
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: `
            SELECT
              tg.SetupHashID,
              ty.TestYazilimID,
              tg.SurecAdi,
              tg.SurecDurum,
              teu.UrunID,
              u.StokNo,
              u.Tanim,
              u.UDKNo,
              ty.TestYazilimStokNo,
              ty.TestYazilimTanimi,
              ty.TestYazilimVersiyon,
              ty.TestTasarimKullaniciAdi,
              tyy.TYYStok,
              tyy.TYYTanim,
              tyy.TYYVersiyon
            FROM REHIS_TestKayit_Test_TabloTestGrup tg
            LEFT JOIN REHIS_TestKayit_Test_TabloTEU teu ON teu.TEUID = tg.TEUID
            LEFT JOIN REHIS_TestTanim_Test_TabloUrun u ON u.UrunID = teu.UrunID
            LEFT JOIN REHIS_TestKayit_Test_TabloTestYazilimSetup tys ON tys.SetupHashID = tg.SetupHashID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestYazilimi ty ON ty.TestYazilimID = tys.TestYazilimID
            LEFT JOIN REHIS_TestTanim_Test_TabloTestYonetimYazilimi tyy ON tyy.TYYID = ty.TYYID
            ${whereClause}
            AND trim(u.Tanim) != ''
            GROUP BY
              tg.SetupHashID,
              ty.TestYazilimID,
              tg.SurecAdi,
              tg.SurecDurum,
              teu.UrunID,
              u.StokNo,
              u.Tanim,
              u.UDKNo,
              ty.TestYazilimStokNo,
              ty.TestYazilimTanimi,
              ty.TestYazilimVersiyon,
              ty.TestTasarimKullaniciAdi,
              tyy.TYYStok,
              tyy.TYYTanim,
              tyy.TYYVersiyon
            ORDER BY ${dbSortColumn} ${sortDirection}
            LIMIT ${pageSize} OFFSET ${offset}
          `
        })

        if (response.success && response.data && response.data.length > 0) {
          const transformed: TestSoftwareVersionData[] = response.data.map(row => ({
            YazilimSetupHashID: row[0] || '',
            TestYazilimID: row[1] || '',
            SurecAdi: row[2] || '',
            SurecDurum: row[3] || '',
            UrunID: row[4] || '',
            StokNo: row[5] || '',
            Tanim: row[6] || '',
            UDKNo: row[7] || '',
            TestYazilimStokNo: row[8] || '',
            TestYazilimTanimi: row[9] || '',
            TestYazilimVersiyon: row[10] || '',
            TestTasarimKullaniciAdi: row[11] || '',
            TYYStok: row[12] || '',
            TYYTanim: row[13] || '',
            TYYVersiyon: row[14] || '',
            FirstSeenDate: '' // Not in this query
          }))

          setWidgetData(transformed)
          setTotalRows(totalCount)
        } else {
          setWidgetData([])
          setTotalRows(totalCount)
        }
      } catch (err: any) {
        setError('Veri yüklenirken hata oluştu')
        console.error(`Error loading widget data for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedStokNo, selectedSurecAdi, selectedSurecDurum, instanceId, dateFrom, dateTo, currentPage, pageSize, sortColumn, sortDirection, columnFilters])

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

  // Server-side pagination
  const totalPages = Math.ceil(totalRows / pageSize)
  
  // Handle sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC')
    } else {
      setSortColumn(column)
      setSortDirection('DESC')
    }
    setCurrentPage(1)
  }

  // Handle column filter
  const handleColumnFilter = (column: string, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value
    }))
    setCurrentPage(1)
  }

  // Handle page size change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setCurrentPage(1)
  }

  // Pagination component with page size selector
  const Pagination = () => {
    if (totalPages <= 0) return null

    const startIndex = (currentPage - 1) * pageSize + 1
    const endIndex = Math.min(currentPage * pageSize, totalRows)

    return (
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 flex-wrap gap-2 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-600">
            {startIndex}-{endIndex} / {totalRows}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-600">Sayfa:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
              className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">
            {currentPage} / {totalPages}
          </span>
          <div className="flex gap-0.5">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-1.5 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
            >
              ‹
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
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-1.5 py-0.5 text-xs border border-gray-300 rounded ${
                    currentPage === pageNum ? 'bg-purple-500 text-white' : 'hover:bg-gray-50 bg-white'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-1.5 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state
  if (loading && widgetData.length === 0 && !selectedStokNo) {
    return (
      <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center overflow-hidden">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <p className="text-sm text-gray-600 mt-2">Yükleniyor...</p>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center overflow-hidden">
        <p className="text-sm text-red-600 text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden relative">
      {/* Header with filters */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 flex-shrink-0 relative z-20">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-gray-700">Ürün Test Yazılımı Değişim Tablosu</h3>
          <p className="text-xs text-gray-500 mt-0.5">Test yazılımı versiyonlarını görüntüle</p>
        </div>
        <div className="flex gap-2">
          {/* Stok No Dropdown */}
          <div className="relative" ref={stokNoDropdownRef}>
            <button
              onClick={() => setShowStokNoDropdown(!showStokNoDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">{selectedStokNo || 'Stok No Seçin *'}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showStokNoDropdown && (
              <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={stokNoSearch}
                    onChange={(e) => setStokNoSearch(e.target.value)}
                    placeholder="Stok No ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                    className={`px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer ${selectedStokNo === stokNo ? 'bg-purple-100 font-medium' : ''}`}
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
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">{selectedSurecAdi || 'Tüm Süreç Adı'}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSurecAdiDropdown && (
              <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={surecAdiSearch}
                    onChange={(e) => setSurecAdiSearch(e.target.value)}
                    placeholder="Süreç adı ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedSurecAdi(null)
                    setShowSurecAdiDropdown(false)
                    setSurecAdiSearch('')
                  }}
                  className="px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer"
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
                    className={`px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer ${selectedSurecAdi === surecAdi ? 'bg-purple-100 font-medium' : ''}`}
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
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">{selectedSurecDurum || 'Tüm Süreç Adımı'}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSurecDurumDropdown && (
              <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={surecDurumSearch}
                    onChange={(e) => setSurecDurumSearch(e.target.value)}
                    placeholder="Süreç adımı ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedSurecDurum(null)
                    setShowSurecDurumDropdown(false)
                    setSurecDurumSearch('')
                  }}
                  className="px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer"
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
                    className={`px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer ${selectedSurecDurum === surecDurum ? 'bg-purple-100 font-medium' : ''}`}
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
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <div className="text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Stok Numarası Seçin</p>
            <p className="text-xs text-gray-500">Test yazılımı verilerini görüntülemek için stok numarası seçmeniz gerekir</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0, maxHeight: '100%' }}>
          {/* Main Table with scroll */}
          <div className="flex-1 overflow-auto" style={{ minHeight: 0, maxHeight: '100%' }}>
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {[
                    { key: 'StokNo', label: 'Ürün Stok No' },
                    { key: 'Tanim', label: 'Ürün Tanımı' },
                    { key: 'SurecAdi', label: 'Süreç Adı' },
                    { key: 'SurecDurum', label: 'Süreç Adımı' },
                    { key: 'TestYazilimStokNo', label: 'Test Yazılımı Stok No' },
                    { key: 'TestYazilimTanimi', label: 'Test Yazılımı' },
                    { key: 'TestYazilimVersiyon', label: 'Versiyon' },
                    { key: 'TestTasarimKullaniciAdi', label: 'Tasarım Kullanıcı' },
                    { key: 'TYYStok', label: 'Yardımcı Stok' },
                    { key: 'TYYTanim', label: 'Yardımcı Tanım' },
                    { key: 'TYYVersiyon', label: 'Yardımcı Ver.' },
                  ].map(column => (
                    <th key={column.key} className="px-2 py-1 text-left font-medium text-gray-700">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleSort(column.key)}
                          className="flex items-center gap-1 hover:text-purple-600"
                        >
                          <span>{column.label}</span>
                          {sortColumn === column.key && (
                            <span className="text-purple-600">
                              {sortDirection === 'ASC' ? '↑' : '↓'}
                            </span>
                          )}
                        </button>
                        <div className="relative" ref={showColumnFilter === column.key ? columnFilterRef : null}>
                          <input
                            type="text"
                            value={columnFilters[column.key] || ''}
                            onChange={(e) => handleColumnFilter(column.key, e.target.value)}
                            placeholder="Filtrele..."
                            className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-none"
                            onClick={() => setShowColumnFilter(column.key)}
                          />
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {widgetData.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-2 py-2 whitespace-nowrap">{row.StokNo}</td>
                    <td className="px-2 py-2">{row.Tanim}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.SurecAdi}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.SurecDurum}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.TestYazilimStokNo}</td>
                    <td className="px-2 py-2">{row.TestYazilimTanimi}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.TestYazilimVersiyon}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.TestTasarimKullaniciAdi}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.TYYStok}</td>
                    <td className="px-2 py-2">{row.TYYTanim}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.TYYVersiyon}</td>
                  </tr>
                ))}
                {widgetData.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-2 py-8 text-center text-gray-500">
                      {loading ? 'Yükleniyor...' : 'Veri bulunamadı'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination - Fixed at bottom */}
          <div className="flex-shrink-0">
            <Pagination />
          </div>
        </div>
      )}
    </div>
  )
}

