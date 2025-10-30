"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { api } from "@/lib/api"
import { Payload } from "recharts/types/component/DefaultTooltipContent"

// Widget configuration
EmployeeCountWidget.config = {
  id: "employee_count-widget",
  name: "Firma Çalışan Sayısı",
  type: "employee_count",
  color: "bg-indigo-500",
  description: "Firma ve departman bazlı çalışan sayısı analizi",
  size: { width: 4, height: 2, minHeight: 2 }
}

// TypeScript interfaces
interface EmployeeData {
  Firma: string
  Departman: string
  "Toplam Çalışan Sayısı": number
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface EmployeeCountWidgetProps {
  widgetId?: string
}

// Color palette
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6']

export function EmployeeCountWidget({ widgetId }: EmployeeCountWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `employee-count-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { selectedFirmas: [], selectedDepartments: [], viewMode: 'bar' }
    try {
      const stored = localStorage.getItem(`employee-count-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { selectedFirmas: [], selectedDepartments: [], viewMode: 'bar' }
    } catch {
      return { selectedFirmas: [], selectedDepartments: [], viewMode: 'bar' }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedFirmas, setSelectedFirmas] = useState<string[]>(initialFilters.selectedFirmas)
  const [firmaOptions, setFirmaOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(initialFilters.selectedDepartments)
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false)
  const [viewMode, setViewMode] = useState<'bar' | 'pie' | 'table'>(initialFilters.viewMode)

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<EmployeeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`employee-count-filters-${instanceId}`, JSON.stringify({
        selectedFirmas,
        selectedDepartments,
        viewMode
      }))
    }
  }, [selectedFirmas, selectedDepartments, viewMode, instanceId])

  // Load all data once on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: 'SELECT "Firma", "Departman", "Toplam Çalışan Sayısı" FROM mes_production.get_firma_departman_bazli_calisan_sayisi ORDER BY "Firma", "Toplam Çalışan Sayısı" DESC'
        })

        if (response.success && response.data && response.data.length > 0) {
          // Transform data
          const transformed = response.data.map(row => ({
            Firma: row[0],
            Departman: row[1],
            "Toplam Çalışan Sayısı": row[2]
          }))
          setWidgetData(transformed)

          // Extract unique firma options
          const uniqueFirmas = Array.from(new Set(transformed.map(item => item.Firma))).sort()
          setFirmaOptions(uniqueFirmas)
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

  // Get department options based on selected firmas
  const departmentOptions = selectedFirmas.length > 0
    ? Array.from(new Set(
        widgetData
          .filter(item => selectedFirmas.includes(item.Firma))
          .map(item => item.Departman)
      )).sort()
    : Array.from(new Set(widgetData.map(item => item.Departman))).sort()

  // Filter data based on selected firmas and departments
  const filteredData = widgetData.filter(item => {
    const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item.Firma)
    const departmentMatch = selectedDepartments.length === 0 || selectedDepartments.includes(item.Departman)
    return firmaMatch && departmentMatch
  })

  // Prepare chart data - group by firma for bar/pie chart
  const chartDataByFirma = selectedDepartments.length === 0 && selectedFirmas.length === 0
    ? // Show total by firma when no filters
      Array.from(
        filteredData.reduce((acc, item) => {
          const existing = acc.get(item.Firma) || { name: item.Firma, value: 0 }
          existing.value += item["Toplam Çalışan Sayısı"]
          acc.set(item.Firma, existing)
          return acc
        }, new Map<string, { name: string; value: number }>())
      ).map(([_, data]) => data)
    : // Show by department when filtered
      filteredData.map(item => ({
        name: `${item.Firma} - ${item.Departman}`,
        firma: item.Firma,
        departman: item.Departman,
        value: item["Toplam Çalışan Sayısı"]
      }))

  // Calculate summary statistics
  const totalEmployees = filteredData.reduce((sum, item) => sum + item["Toplam Çalışan Sayısı"], 0)
  const avgEmployees = filteredData.length > 0 ? totalEmployees / filteredData.length : 0
  const maxEmployees = filteredData.length > 0 ? Math.max(...filteredData.map(item => item["Toplam Çalışan Sayısı"])) : 0
  const totalDepartments = new Set(filteredData.map(item => item.Departman)).size
  const totalFirmas = new Set(filteredData.map(item => item.Firma)).size

  // Filter firma options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  // Filter department options based on search
  const filteredDepartmentOptions = departmentOptions.filter(department =>
    department.toLowerCase().includes(departmentSearch.toLowerCase())
  )

  // Show loading state
  if (loading) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
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
          className="mt-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  // Show no data state
  if (!widgetData || widgetData.length === 0) {
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
          <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Firma Çalışan Sayısı</h3>
        </div>
        <div className="flex gap-2">
          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFirmaDropdown(!showFirmaDropdown)
                setShowDepartmentDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-[140px] text-left flex items-center justify-between"
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
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedFirmas([])
                    setSelectedDepartments([])
                    setFirmaSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer border-b border-gray-200 font-medium"
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
                      // Clear departments if deselecting all firmas
                      if (selectedFirmas.length === 1 && selectedFirmas.includes(firma)) {
                        setSelectedDepartments([])
                      }
                    }}
                    className={`px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer flex items-center ${selectedFirmas.includes(firma) ? 'bg-indigo-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFirmas.includes(firma)}
                      onChange={() => {}}
                      className="mr-2 text-indigo-500 focus:ring-indigo-500"
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

          {/* Department Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowDepartmentDropdown(!showDepartmentDropdown)
                setShowFirmaDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">
                {selectedDepartments.length === 0 
                  ? 'Tüm Departmanlar' 
                  : selectedDepartments.length === 1 
                  ? selectedDepartments[0].substring(0, 20) + (selectedDepartments[0].length > 20 ? '...' : '')
                  : `${selectedDepartments.length} Departman Seçili`}
              </span>
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDepartmentDropdown && (
              <div className="absolute z-10 mt-1 w-80 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                  <input
                    type="text"
                    value={departmentSearch}
                    onChange={(e) => setDepartmentSearch(e.target.value)}
                    placeholder="Departman ara..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedDepartments([])
                    setDepartmentSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer border-b border-gray-200 font-medium"
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
                    className={`px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer flex items-start ${selectedDepartments.includes(department) ? 'bg-indigo-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDepartments.includes(department)}
                      onChange={() => {}}
                      className="mr-2 mt-0.5 text-indigo-500 focus:ring-indigo-500 flex-shrink-0"
                    />
                    <span className="break-words">{department}</span>
                  </div>
                ))}
                {filteredDepartmentOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('bar')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'bar' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Bar
            </button>
            <button
              onClick={() => setViewMode('pie')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'pie' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Pie
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Tablo
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="h-16 flex-shrink-0 grid grid-cols-4 gap-2 mb-3">
        {/* Total Employees */}
        <div className="bg-indigo-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-indigo-600">
            {totalEmployees}
          </div>
          <div className="text-xs font-medium text-indigo-800 text-center">
            Toplam Çalışan
          </div>
        </div>

        {/* Average */}
        <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-blue-600">
            {avgEmployees.toFixed(1)}
          </div>
          <div className="text-xs font-medium text-blue-800 text-center">
            Ortalama
          </div>
        </div>

        {/* Total Firms */}
        <div className="bg-purple-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-purple-600">
            {totalFirmas}
          </div>
          <div className="text-xs font-medium text-purple-800 text-center">
            Firma Sayısı
          </div>
        </div>

        {/* Total Departments */}
        <div className="bg-green-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-green-600">
            {totalDepartments}
          </div>
          <div className="text-xs font-medium text-green-800 text-center">
            Departman Sayısı
          </div>
        </div>
      </div>

      {/* Chart / Table */}
      <div className="flex-1 min-h-0">
        {viewMode === 'table' ? (
          <div className="h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-indigo-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">Firma</th>
                  <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">Departman</th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-900 border-b-2 border-indigo-300">Çalışan Sayısı</th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-900 border-b-2 border-indigo-300">Yüzde</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-indigo-50'} hover:bg-indigo-100 transition-colors`}>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-600">{index + 1}</td>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {item.Firma}
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                      <div className="flex items-start">
                        <svg className="w-4 h-4 mr-2 mt-0.5 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span>{item.Departman}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-right font-semibold text-indigo-700">
                      {item["Toplam Çalışan Sayısı"]} kişi
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-right">
                      <div className="flex items-center justify-end">
                        <div className="w-20 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-indigo-500 h-2 rounded-full" 
                            style={{ width: `${Math.min(100, (item["Toplam Çalışan Sayısı"] / maxEmployees) * 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-gray-600 font-medium">
                          {((item["Toplam Çalışan Sayısı"] / totalEmployees) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartDataByFirma}
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
                label={{ value: 'Çalışan Sayısı', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                formatter={(value: number, name: string, props: any) => [
                  `${value} kişi`,
                  'Çalışan Sayısı'
                ]}
                labelFormatter={(label: string, payload: Payload<number, "Çalışan Sayısı">[]) => {
                  if (payload && payload.length > 0) {
                    const firma = payload[0].payload.firma
                    const departman = payload[0].payload.departman
                    if (departman) {
                      return `${firma} - ${departman}`
                    }
                  }
                  return label
                }}
              />
              <Bar
                dataKey="value"
                name="Çalışan Sayısı"
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              >
                {chartDataByFirma.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`url(#colorBar${index % COLORS.length})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartDataByFirma}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {chartDataByFirma.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [`${value} kişi`, 'Çalışan Sayısı']}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

