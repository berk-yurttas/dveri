"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } from 'recharts'
import { api } from "@/lib/api"
import { Payload } from "recharts/types/component/DefaultTooltipContent"

// Widget configuration
AverageTenureWidget.config = {
  id: "average_tenure-widget",
  name: "Ortalama Çalışma Yılı",
  type: "average_tenure",
  color: "bg-teal-500",
  description: "Firma, departman ve görev bazlı ortalama çalışma yılı analizi",
  size: { width: 4, height: 2, minHeight: 2 }
}

// TypeScript interfaces
interface FirmaTenureData {
  Firma: string
  "Ortalama Çalışma Yılı": number
}

interface DepartmanTenureData {
  Firma: string
  Departman: string
  "Ortalama Çalışma Yılı": number
}

interface GorevTenureData {
  Firma: string
  Görev: string
  "Ortalama Çalışma Yılı": number
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface AverageTenureWidgetProps {
  widgetId?: string
}

// Color palette
const COLORS = ['#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef']

export function AverageTenureWidget({ widgetId }: AverageTenureWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `average-tenure-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { 
      dataType: 'firma',
      selectedFirmas: [], 
      selectedDepartments: [], 
      selectedRoles: [],
      viewMode: 'bar' 
    }
    try {
      const stored = localStorage.getItem(`average-tenure-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { 
        dataType: 'firma',
        selectedFirmas: [], 
        selectedDepartments: [], 
        selectedRoles: [],
        viewMode: 'bar' 
      }
    } catch {
      return { 
        dataType: 'firma',
        selectedFirmas: [], 
        selectedDepartments: [], 
        selectedRoles: [],
        viewMode: 'bar' 
      }
    }
  }

  const initialFilters = getStoredFilters()

  // State for data type selection
  const [dataType, setDataType] = useState<'firma' | 'departman' | 'gorev'>(initialFilters.dataType)

  // State for filters
  const [selectedFirmas, setSelectedFirmas] = useState<string[]>(initialFilters.selectedFirmas)
  const [firmaOptions, setFirmaOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)
  
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(initialFilters.selectedDepartments)
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false)
  
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initialFilters.selectedRoles)
  const [roleSearch, setRoleSearch] = useState('')
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)
  
  const [viewMode, setViewMode] = useState<'bar' | 'pie' | 'table'>(initialFilters.viewMode)

  // State for widget data and loading
  const [firmaData, setFirmaData] = useState<FirmaTenureData[]>([])
  const [departmanData, setDepartmanData] = useState<DepartmanTenureData[]>([])
  const [gorevData, setGorevData] = useState<GorevTenureData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`average-tenure-filters-${instanceId}`, JSON.stringify({
        dataType,
        selectedFirmas,
        selectedDepartments,
        selectedRoles,
        viewMode
      }))
    }
  }, [dataType, selectedFirmas, selectedDepartments, selectedRoles, viewMode, instanceId])

  // Load all data once on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load all three data types in parallel
        const [firmaResponse, departmanResponse, gorevResponse] = await Promise.all([
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "Firma", "Ortalama Çalışma Yılı" FROM mes_production.get_ortalama_calisma_yili ORDER BY "Ortalama Çalışma Yılı" DESC'
          }),
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "Firma", "Departman", "Ortalama Çalışma Yılı" FROM mes_production.get_ortalama_calisma_yili_departman ORDER BY "Firma", "Ortalama Çalışma Yılı" DESC'
          }),
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "Firma", "Görev", "Ortalama Çalışma Yılı" FROM mes_production.get_ortalama_calisma_yili_görev_bazli ORDER BY "Firma", "Ortalama Çalışma Yılı" DESC'
          })
        ])

        // Transform firma data
        if (firmaResponse.success && firmaResponse.data && firmaResponse.data.length > 0) {
          const transformedFirma = firmaResponse.data.map(row => ({
            Firma: row[0],
            "Ortalama Çalışma Yılı": row[1]
          }))
          setFirmaData(transformedFirma)

          // Extract unique firma options
          const uniqueFirmas = Array.from(new Set(transformedFirma.map(item => item.Firma))).sort()
          setFirmaOptions(uniqueFirmas)
        }

        // Transform departman data
        if (departmanResponse.success && departmanResponse.data && departmanResponse.data.length > 0) {
          const transformedDepartman = departmanResponse.data.map(row => ({
            Firma: row[0],
            Departman: row[1],
            "Ortalama Çalışma Yılı": row[2]
          }))
          setDepartmanData(transformedDepartman)
        }

        // Transform gorev data
        if (gorevResponse.success && gorevResponse.data && gorevResponse.data.length > 0) {
          const transformedGorev = gorevResponse.data.map(row => ({
            Firma: row[0],
            Görev: row[1],
            "Ortalama Çalışma Yılı": row[2]
          }))
          setGorevData(transformedGorev)
        }
      } catch (err) {
        console.error(`Error loading data for ${instanceId}:`, err)
        setError('Veri yüklenirken hata oluştu')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [instanceId])

  // Get current data based on selected data type
  const getCurrentData = () => {
    switch (dataType) {
      case 'firma':
        return firmaData.filter(item => 
          selectedFirmas.length === 0 || selectedFirmas.includes(item.Firma)
        )
      case 'departman':
        return departmanData.filter(item => {
          const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item.Firma)
          const departmentMatch = selectedDepartments.length === 0 || selectedDepartments.includes(item.Departman)
          return firmaMatch && departmentMatch
        })
      case 'gorev':
        return gorevData.filter(item => {
          const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item.Firma)
          const roleMatch = selectedRoles.length === 0 || selectedRoles.includes(item.Görev)
          return firmaMatch && roleMatch
        })
      default:
        return []
    }
  }

  const filteredData = getCurrentData()

  // Get department options based on selected firmas
  const departmentOptions = selectedFirmas.length > 0
    ? Array.from(new Set(
        departmanData
          .filter(item => selectedFirmas.includes(item.Firma))
          .map(item => item.Departman)
      )).sort()
    : Array.from(new Set(departmanData.map(item => item.Departman))).sort()

  // Get role options based on selected firmas
  const roleOptions = selectedFirmas.length > 0
    ? Array.from(new Set(
        gorevData
          .filter(item => selectedFirmas.includes(item.Firma))
          .map(item => item.Görev)
      )).sort()
    : Array.from(new Set(gorevData.map(item => item.Görev))).sort()

  // Prepare chart data
  const chartData = filteredData.map(item => {
    if (dataType === 'firma') {
      return {
        name: item.Firma,
        value: item["Ortalama Çalışma Yılı"]
      }
    } else if (dataType === 'departman') {
      const deptItem = item as DepartmanTenureData
      return {
        name: `${deptItem.Firma} - ${deptItem.Departman}`,
        firma: deptItem.Firma,
        detail: deptItem.Departman,
        value: deptItem["Ortalama Çalışma Yılı"]
      }
    } else {
      const roleItem = item as GorevTenureData
      return {
        name: `${roleItem.Firma} - ${roleItem.Görev}`,
        firma: roleItem.Firma,
        detail: roleItem.Görev,
        value: roleItem["Ortalama Çalışma Yılı"]
      }
    }
  })

  // Calculate summary statistics
  const totalYears = filteredData.reduce((sum, item) => sum + item["Ortalama Çalışma Yılı"], 0)
  const avgYears = filteredData.length > 0 ? totalYears / filteredData.length : 0
  const maxYears = filteredData.length > 0 ? Math.max(...filteredData.map(item => item["Ortalama Çalışma Yılı"])) : 0
  const minYears = filteredData.length > 0 ? Math.min(...filteredData.map(item => item["Ortalama Çalışma Yılı"])) : 0

  // Filter options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  const filteredDepartmentOptions = departmentOptions.filter(department =>
    department.toLowerCase().includes(departmentSearch.toLowerCase())
  )

  const filteredRoleOptions = roleOptions.filter(role =>
    role.toLowerCase().includes(roleSearch.toLowerCase())
  )

  // Handle data type change
  const handleDataTypeChange = (newType: 'firma' | 'departman' | 'gorev') => {
    setDataType(newType)
    // Clear relevant filters when changing data type
    if (newType === 'firma') {
      setSelectedDepartments([])
      setSelectedRoles([])
    }
  }

  // Show loading state
  if (loading) {
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

  // Show no data state
  if (filteredData.length === 0) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <p className="text-sm text-gray-500">Veri bulunamadı</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Ortalama Çalışma Yılı</h3>
        </div>
        <div className="flex gap-2">
          {/* Data Type Selector */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => handleDataTypeChange('firma')}
              className={`px-3 py-1.5 text-sm ${dataType === 'firma' ? 'bg-teal-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Firma
            </button>
            <button
              onClick={() => handleDataTypeChange('departman')}
              className={`px-3 py-1.5 text-sm ${dataType === 'departman' ? 'bg-teal-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Departman
            </button>
            <button
              onClick={() => handleDataTypeChange('gorev')}
              className={`px-3 py-1.5 text-sm ${dataType === 'gorev' ? 'bg-teal-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Görev
            </button>
          </div>

          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFirmaDropdown(!showFirmaDropdown)
                setShowDepartmentDropdown(false)
                setShowRoleDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">
                {selectedFirmas.length === 0 
                  ? 'Tüm Firmalar' 
                  : selectedFirmas.length === 1 
                  ? selectedFirmas[0] 
                  : `${selectedFirmas.length} Firma Seçili`}
              </span>
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showFirmaDropdown && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                  <input
                    type="text"
                    value={firmaSearch}
                    onChange={(e) => setFirmaSearch(e.target.value)}
                    placeholder="Firma ara..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedFirmas([])
                    setSelectedDepartments([])
                    setSelectedRoles([])
                    setFirmaSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-teal-50 cursor-pointer border-b border-gray-200 font-medium"
                >
                  ✕ Tümünü Temizle
                </div>
                {filteredFirmaOptions.map((firma) => (
                  <div
                    key={firma}
                    onClick={() => {
                      setSelectedFirmas(prev => 
                        prev.includes(firma) 
                          ? prev.filter(f => f !== firma)
                          : [...prev, firma]
                      )
                      if (selectedFirmas.length === 1 && selectedFirmas.includes(firma)) {
                        setSelectedDepartments([])
                        setSelectedRoles([])
                      }
                    }}
                    className={`px-3 py-2 text-sm hover:bg-teal-50 cursor-pointer flex items-center ${selectedFirmas.includes(firma) ? 'bg-teal-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFirmas.includes(firma)}
                      onChange={() => {}}
                      className="mr-2 text-teal-500 focus:ring-teal-500"
                    />
                    <span>{firma}</span>
                  </div>
                ))}
                {filteredFirmaOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>

          {/* Department Dropdown (only for departman view) */}
          {dataType === 'departman' && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowDepartmentDropdown(!showDepartmentDropdown)
                  setShowFirmaDropdown(false)
                  setShowRoleDropdown(false)
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white min-w-[140px] text-left flex items-center justify-between"
              >
                <span className="truncate">
                  {selectedDepartments.length === 0 
                    ? 'Tüm Departmanlar' 
                    : selectedDepartments.length === 1 
                    ? selectedDepartments[0].substring(0, 15) + (selectedDepartments[0].length > 15 ? '...' : '')
                    : `${selectedDepartments.length} Departman`}
                </span>
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showDepartmentDropdown && (
                <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                  <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                    <input
                      type="text"
                      value={departmentSearch}
                      onChange={(e) => setDepartmentSearch(e.target.value)}
                      placeholder="Departman ara..."
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div
                    onClick={() => {
                      setSelectedDepartments([])
                      setDepartmentSearch('')
                    }}
                    className="px-3 py-2 text-sm hover:bg-teal-50 cursor-pointer border-b border-gray-200 font-medium"
                  >
                    ✕ Tümünü Temizle
                  </div>
                  {filteredDepartmentOptions.map((department) => (
                    <div
                      key={department}
                      onClick={() => {
                        setSelectedDepartments(prev => 
                          prev.includes(department) 
                            ? prev.filter(d => d !== department)
                            : [...prev, department]
                        )
                      }}
                      className={`px-3 py-2 text-sm hover:bg-teal-50 cursor-pointer flex items-center ${selectedDepartments.includes(department) ? 'bg-teal-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDepartments.includes(department)}
                        onChange={() => {}}
                        className="mr-2 text-teal-500 focus:ring-teal-500"
                      />
                      <span>{department}</span>
                    </div>
                  ))}
                  {filteredDepartmentOptions.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500">Sonuç bulunamadı</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Role Dropdown (only for gorev view) */}
          {dataType === 'gorev' && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowRoleDropdown(!showRoleDropdown)
                  setShowFirmaDropdown(false)
                  setShowDepartmentDropdown(false)
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white min-w-[140px] text-left flex items-center justify-between"
              >
                <span className="truncate">
                  {selectedRoles.length === 0 
                    ? 'Tüm Görevler' 
                    : selectedRoles.length === 1 
                    ? selectedRoles[0] 
                    : `${selectedRoles.length} Görev`}
                </span>
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showRoleDropdown && (
                <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                  <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                    <input
                      type="text"
                      value={roleSearch}
                      onChange={(e) => setRoleSearch(e.target.value)}
                      placeholder="Görev ara..."
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div
                    onClick={() => {
                      setSelectedRoles([])
                      setRoleSearch('')
                    }}
                    className="px-3 py-2 text-sm hover:bg-teal-50 cursor-pointer border-b border-gray-200 font-medium"
                  >
                    ✕ Tümünü Temizle
                  </div>
                  {filteredRoleOptions.map((role) => (
                    <div
                      key={role}
                      onClick={() => {
                        setSelectedRoles(prev => 
                          prev.includes(role) 
                            ? prev.filter(r => r !== role)
                            : [...prev, role]
                        )
                      }}
                      className={`px-3 py-2 text-sm hover:bg-teal-50 cursor-pointer flex items-center ${selectedRoles.includes(role) ? 'bg-teal-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={() => {}}
                        className="mr-2 text-teal-500 focus:ring-teal-500"
                      />
                      <span>{role}</span>
                    </div>
                  ))}
                  {filteredRoleOptions.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500">Sonuç bulunamadı</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('bar')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'bar' ? 'bg-teal-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Bar
            </button>
            <button
              onClick={() => setViewMode('pie')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'pie' ? 'bg-teal-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Pie
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-teal-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Tablo
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="h-16 flex-shrink-0 grid grid-cols-4 gap-2 mb-3">
        {/* Average Years */}
        <div className="bg-teal-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-teal-600">
            {avgYears.toFixed(1)}
          </div>
          <div className="text-xs font-medium text-teal-800 text-center">
            Ortalama (Yıl)
          </div>
        </div>

        {/* Maximum Years */}
        <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-blue-600">
            {maxYears}
          </div>
          <div className="text-xs font-medium text-blue-800 text-center">
            Maksimum (Yıl)
          </div>
        </div>

        {/* Minimum Years */}
        <div className="bg-cyan-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-cyan-600">
            {minYears}
          </div>
          <div className="text-xs font-medium text-cyan-800 text-center">
            Minimum (Yıl)
          </div>
        </div>

        {/* Total Records */}
        <div className="bg-emerald-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-emerald-600">
            {filteredData.length}
          </div>
          <div className="text-xs font-medium text-emerald-800 text-center">
            Kayıt Sayısı
          </div>
        </div>
      </div>

      {/* Chart / Table */}
      <div className="flex-1 min-h-0">
        {viewMode === 'table' ? (
          <div className="h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-teal-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-teal-900 border-b-2 border-teal-300">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-teal-900 border-b-2 border-teal-300">Firma</th>
                  {dataType === 'departman' && (
                    <th className="px-4 py-3 text-left font-semibold text-teal-900 border-b-2 border-teal-300">Departman</th>
                  )}
                  {dataType === 'gorev' && (
                    <th className="px-4 py-3 text-left font-semibold text-teal-900 border-b-2 border-teal-300">Görev</th>
                  )}
                  <th className="px-4 py-3 text-right font-semibold text-teal-900 border-b-2 border-teal-300">Ort. Çalışma Yılı</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-teal-50'} hover:bg-teal-100 transition-colors`}>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-600">{index + 1}</td>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {item.Firma}
                      </div>
                    </td>
                    {dataType === 'departman' && (
                      <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                        {(item as DepartmanTenureData).Departman}
                      </td>
                    )}
                    {dataType === 'gorev' && (
                      <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                        {(item as GorevTenureData).Görev}
                      </td>
                    )}
                    <td className="px-4 py-3 border-b border-gray-200 text-right font-semibold text-teal-700">
                      {item["Ortalama Çalışma Yılı"]} yıl
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
            >
              <defs>
                {COLORS.map((color, index) => (
                  <linearGradient key={`gradient-${index}`} id={`colorBar${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.9}/>
                    <stop offset="100%" stopColor={color} stopOpacity={0.7}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                stroke="#6b7280"
                style={{ fontSize: '12px', fontWeight: 500 }}
                tickLine={false}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '12px', fontWeight: 500 }}
                tickLine={false}
                label={{ value: 'Ortalama Çalışma Yılı', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                cursor={{ fill: 'rgba(20, 184, 166, 0.1)' }}
                formatter={(value: number) => [`${value} yıl`, 'Ortalama Çalışma Yılı']}
                labelFormatter={(label: string, payload: any[]) => {
                  if (payload && payload.length > 0 && payload[0].payload.detail) {
                    return `${payload[0].payload.firma} - ${payload[0].payload.detail}`
                  }
                  return label
                }}
              />
              <Bar
                dataKey="value"
                name="Ortalama Çalışma Yılı"
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`url(#colorBar${index % COLORS.length})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value} yıl`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [`${value} yıl`, 'Ortalama Çalışma Yılı']}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

