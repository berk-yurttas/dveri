"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { api } from "@/lib/api"
import { Payload } from "recharts/types/component/DefaultTooltipContent"

// Widget configuration
AverageSalaryWidget.config = {
  id: "average_salary-widget",
  name: "Ortalama Maaş Analizi",
  type: "average_salary",
  color: "bg-emerald-500",
  description: "Firma ve görev bazlı ortalama maaş analizi",
  size: { width: 4, height: 2, minHeight: 2 }
}

// TypeScript interfaces
interface FirmaSalaryData {
  Firma: string
  "Ortalama Maaş": number
}

interface RoleSalaryData {
  Firma: string
  Görev: string
  "Ortalama Maaş": number
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface AverageSalaryWidgetProps {
  widgetId?: string
}

// Color palette
const COLORS = ['#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7']

export function AverageSalaryWidget({ widgetId }: AverageSalaryWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `average-salary-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { 
      dataType: 'firma',
      selectedFirmas: [], 
      selectedRoles: [],
      viewMode: 'bar' 
    }
    try {
      const stored = localStorage.getItem(`average-salary-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { 
        dataType: 'firma',
        selectedFirmas: [], 
        selectedRoles: [],
        viewMode: 'bar' 
      }
    } catch {
      return { 
        dataType: 'firma',
        selectedFirmas: [], 
        selectedRoles: [],
        viewMode: 'bar' 
      }
    }
  }

  const initialFilters = getStoredFilters()

  // State for data type selection
  const [dataType, setDataType] = useState<'firma' | 'gorev'>(initialFilters.dataType)

  // State for filters
  const [selectedFirmas, setSelectedFirmas] = useState<string[]>(initialFilters.selectedFirmas)
  const [firmaOptions, setFirmaOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)
  
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initialFilters.selectedRoles)
  const [roleSearch, setRoleSearch] = useState('')
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)
  
  const [viewMode, setViewMode] = useState<'bar' | 'table'>(initialFilters.viewMode)

  // State for widget data and loading
  const [firmaData, setFirmaData] = useState<FirmaSalaryData[]>([])
  const [roleData, setRoleData] = useState<RoleSalaryData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`average-salary-filters-${instanceId}`, JSON.stringify({
        dataType,
        selectedFirmas,
        selectedRoles,
        viewMode
      }))
    }
  }, [dataType, selectedFirmas, selectedRoles, viewMode, instanceId])

  // Load all data once on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load both data types in parallel
        const [firmaResponse, roleResponse] = await Promise.all([
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "Firma", "Ortalama Maaş" FROM mes_production.firma_bazli_ort_maas ORDER BY "Ortalama Maaş" DESC'
          }),
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "Firma", "Görev", "Ortalama Maaş" FROM mes_production.firma_gorev_bazli_ort_maas ORDER BY "Firma", "Ortalama Maaş" DESC'
          })
        ])

        // Transform firma data
        if (firmaResponse.success && firmaResponse.data && firmaResponse.data.length > 0) {
          const transformedFirma = firmaResponse.data.map(row => ({
            Firma: row[0],
            "Ortalama Maaş": Number(row[1]) || 0
          }))
          setFirmaData(transformedFirma)

          // Extract unique firma options
          const uniqueFirmas = Array.from(new Set(transformedFirma.map(item => item.Firma))).sort()
          setFirmaOptions(uniqueFirmas)
        }

        // Transform role data
        if (roleResponse.success && roleResponse.data && roleResponse.data.length > 0) {
          const transformedRole = roleResponse.data.map(row => ({
            Firma: row[0],
            Görev: row[1],
            "Ortalama Maaş": Number(row[2]) || 0
          }))
          setRoleData(transformedRole)
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
    if (dataType === 'firma') {
      return firmaData.filter(item => 
        selectedFirmas.length === 0 || selectedFirmas.includes(item.Firma)
      )
    } else {
      return roleData.filter(item => {
        const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item.Firma)
        const roleMatch = selectedRoles.length === 0 || selectedRoles.includes(item.Görev)
        return firmaMatch && roleMatch
      })
    }
  }

  const filteredData = getCurrentData()

  // Get role options based on selected firmas
  const roleOptions = selectedFirmas.length > 0
    ? Array.from(new Set(
        roleData
          .filter(item => selectedFirmas.includes(item.Firma))
          .map(item => item.Görev)
      )).sort()
    : Array.from(new Set(roleData.map(item => item.Görev))).sort()

  // Prepare chart data
  const chartData = filteredData.map(item => {
    if (dataType === 'firma') {
      const firmaItem = item as FirmaSalaryData
      return {
        name: firmaItem.Firma,
        value: firmaItem["Ortalama Maaş"]
      }
    } else {
      const roleItem = item as RoleSalaryData
      return {
        name: `${roleItem.Firma} - ${roleItem.Görev}`,
        firma: roleItem.Firma,
        role: roleItem.Görev,
        value: roleItem["Ortalama Maaş"]
      }
    }
  })

  // Calculate summary statistics
  const totalSalary = filteredData.reduce((sum, item) => sum + item["Ortalama Maaş"], 0)
  const avgSalary = filteredData.length > 0 ? totalSalary / filteredData.length : 0
  const maxSalary = filteredData.length > 0 ? Math.max(...filteredData.map(item => item["Ortalama Maaş"])) : 0
  const minSalary = filteredData.length > 0 ? Math.min(...filteredData.map(item => item["Ortalama Maaş"])) : 0

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Filter options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  const filteredRoleOptions = roleOptions.filter(role =>
    role.toLowerCase().includes(roleSearch.toLowerCase())
  )

  // Handle data type change
  const handleDataTypeChange = (newType: 'firma' | 'gorev') => {
    setDataType(newType)
    // Clear role filter when switching to firma view
    if (newType === 'firma') {
      setSelectedRoles([])
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
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
          className="mt-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700"
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
          <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Ortalama Maaş Analizi</h3>
        </div>
        <div className="flex gap-2">
          {/* Data Type Selector */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => handleDataTypeChange('firma')}
              className={`px-3 py-1.5 text-sm ${dataType === 'firma' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Firma
            </button>
            <button
              onClick={() => handleDataTypeChange('gorev')}
              className={`px-3 py-1.5 text-sm ${dataType === 'gorev' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Görev
            </button>
          </div>

          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFirmaDropdown(!showFirmaDropdown)
                setShowRoleDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white min-w-[140px] text-left flex items-center justify-between"
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
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedFirmas([])
                    setSelectedRoles([])
                    setFirmaSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-emerald-50 cursor-pointer border-b border-gray-200 font-medium"
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
                        setSelectedRoles([])
                      }
                    }}
                    className={`px-3 py-2 text-sm hover:bg-emerald-50 cursor-pointer flex items-center ${selectedFirmas.includes(firma) ? 'bg-emerald-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFirmas.includes(firma)}
                      onChange={() => {}}
                      className="mr-2 text-emerald-500 focus:ring-emerald-500"
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

          {/* Role Dropdown (only for gorev view) */}
          {dataType === 'gorev' && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowRoleDropdown(!showRoleDropdown)
                  setShowFirmaDropdown(false)
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white min-w-[140px] text-left flex items-center justify-between"
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
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div
                    onClick={() => {
                      setSelectedRoles([])
                      setRoleSearch('')
                    }}
                    className="px-3 py-2 text-sm hover:bg-emerald-50 cursor-pointer border-b border-gray-200 font-medium"
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
                      className={`px-3 py-2 text-sm hover:bg-emerald-50 cursor-pointer flex items-center ${selectedRoles.includes(role) ? 'bg-emerald-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={() => {}}
                        className="mr-2 text-emerald-500 focus:ring-emerald-500"
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
              className={`px-3 py-1.5 text-sm ${viewMode === 'bar' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Bar
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Tablo
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="h-16 flex-shrink-0 grid grid-cols-4 gap-2 mb-3">
        {/* Average Salary */}
        <div className="bg-emerald-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-emerald-600">
            {formatCurrency(avgSalary)}
          </div>
          <div className="text-xs font-medium text-emerald-800 text-center">
            Ortalama
          </div>
        </div>

        {/* Maximum Salary */}
        <div className="bg-teal-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-teal-600">
            {formatCurrency(maxSalary)}
          </div>
          <div className="text-xs font-medium text-teal-800 text-center">
            Maksimum
          </div>
        </div>

        {/* Minimum Salary */}
        <div className="bg-cyan-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-cyan-600">
            {formatCurrency(minSalary)}
          </div>
          <div className="text-xs font-medium text-cyan-800 text-center">
            Minimum
          </div>
        </div>

        {/* Total Records */}
        <div className="bg-green-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-green-600">
            {filteredData.length}
          </div>
          <div className="text-xs font-medium text-green-800 text-center">
            Kayıt Sayısı
          </div>
        </div>
      </div>

      {/* Chart / Table */}
      <div className="flex-1 min-h-0">
        {viewMode === 'table' ? (
          <div className="h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-emerald-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-emerald-900 border-b-2 border-emerald-300">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-emerald-900 border-b-2 border-emerald-300">Firma</th>
                  {dataType === 'gorev' && (
                    <th className="px-4 py-3 text-left font-semibold text-emerald-900 border-b-2 border-emerald-300">Görev</th>
                  )}
                  <th className="px-4 py-3 text-right font-semibold text-emerald-900 border-b-2 border-emerald-300">Ortalama Maaş</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-emerald-50'} hover:bg-emerald-100 transition-colors`}>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-600">{index + 1}</td>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {item.Firma}
                      </div>
                    </td>
                    {dataType === 'gorev' && (
                      <td className="px-4 py-3 border-b border-gray-200 text-gray-700 font-medium">
                        {(item as RoleSalaryData).Görev}
                      </td>
                    )}
                    <td className="px-4 py-3 border-b border-gray-200 text-right font-semibold text-emerald-700">
                      {formatCurrency(item["Ortalama Maaş"])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
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
                label={{ value: 'Ortalama Maaş (₺)', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }}
                formatter={(value: number) => [formatCurrency(value), 'Ortalama Maaş']}
                labelFormatter={(label: string, payload: any[]) => {
                  if (payload && payload.length > 0 && payload[0].payload.role) {
                    return `${payload[0].payload.firma} - ${payload[0].payload.role}`
                  }
                  return label
                }}
              />
              <Bar
                dataKey="value"
                name="Ortalama Maaş"
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`url(#colorBar${index % COLORS.length})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

