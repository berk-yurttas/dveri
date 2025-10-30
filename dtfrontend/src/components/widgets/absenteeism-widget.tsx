"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { api } from "@/lib/api"
import { Payload } from "recharts/types/component/DefaultTooltipContent"

// Widget configuration
AbsenteeismWidget.config = {
  id: "absenteeism-widget",
  name: "Devamsızlık Analizi",
  type: "absenteeism",
  color: "bg-orange-500",
  description: "Firma ve görev bazlı ortalama devamsızlık analizi",
  size: { width: 4, height: 2, minHeight: 2 }
}

// TypeScript interfaces
interface AbsenteeismData {
  Firma: string
  Görev: string
  "Ortalama Devamsızlık": number
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface AbsenteeismWidgetProps {
  widgetId?: string
}

// Color palette - gradient from green (low) to red (high)
const getColorForAbsenteeism = (value: number): string => {
  if (value < 2) return '#10b981' // green
  if (value < 3) return '#84cc16' // lime
  if (value < 4) return '#eab308' // yellow
  if (value < 5) return '#f59e0b' // amber
  if (value < 6) return '#f97316' // orange
  return '#ef4444' // red
}

const COLORS = ['#10b981', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#dc2626', '#b91c1c']

export function AbsenteeismWidget({ widgetId }: AbsenteeismWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `absenteeism-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { 
      selectedFirmas: [], 
      selectedRoles: [],
      viewMode: 'bar' 
    }
    try {
      const stored = localStorage.getItem(`absenteeism-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { 
        selectedFirmas: [], 
        selectedRoles: [],
        viewMode: 'bar' 
      }
    } catch {
      return { 
        selectedFirmas: [], 
        selectedRoles: [],
        viewMode: 'bar' 
      }
    }
  }

  const initialFilters = getStoredFilters()

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
  const [widgetData, setWidgetData] = useState<AbsenteeismData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`absenteeism-filters-${instanceId}`, JSON.stringify({
        selectedFirmas,
        selectedRoles,
        viewMode
      }))
    }
  }, [selectedFirmas, selectedRoles, viewMode, instanceId])

  // Load all data once on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: 'SELECT "Firma", "Görev", "Ortalama Devamsızlık" FROM mes_production.firma_gorev_bazli_ort_devamsizlik ORDER BY "Ortalama Devamsızlık" DESC'
        })

        if (response.success && response.data && response.data.length > 0) {
          // Transform data
          const transformed = response.data.map(row => ({
            Firma: row[0],
            Görev: row[1],
            "Ortalama Devamsızlık": Number(row[2]) || 0
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

  // Get role options based on selected firmas
  const roleOptions = selectedFirmas.length > 0
    ? Array.from(new Set(
        widgetData
          .filter(item => selectedFirmas.includes(item.Firma))
          .map(item => item.Görev)
      )).sort()
    : Array.from(new Set(widgetData.map(item => item.Görev))).sort()

  // Filter data based on selections
  const filteredData = widgetData.filter(item => {
    const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item.Firma)
    const roleMatch = selectedRoles.length === 0 || selectedRoles.includes(item.Görev)
    return firmaMatch && roleMatch
  })

  // Prepare chart data
  const chartData = filteredData.map(item => ({
    name: `${item.Firma} - ${item.Görev}`,
    firma: item.Firma,
    role: item.Görev,
    value: item["Ortalama Devamsızlık"],
    color: getColorForAbsenteeism(item["Ortalama Devamsızlık"])
  }))

  // Calculate summary statistics
  const totalAbsenteeism = filteredData.reduce((sum, item) => sum + item["Ortalama Devamsızlık"], 0)
  const avgAbsenteeism = filteredData.length > 0 ? totalAbsenteeism / filteredData.length : 0
  const maxAbsenteeism = filteredData.length > 0 ? Math.max(...filteredData.map(item => item["Ortalama Devamsızlık"])) : 0
  const minAbsenteeism = filteredData.length > 0 ? Math.min(...filteredData.map(item => item["Ortalama Devamsızlık"])) : 0

  // Filter options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  const filteredRoleOptions = roleOptions.filter(role =>
    role.toLowerCase().includes(roleSearch.toLowerCase())
  )

  // Show loading state
  if (loading) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
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
          className="mt-2 px-4 py-2 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
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
          <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Devamsızlık Analizi</h3>
        </div>
        <div className="flex gap-2">
          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFirmaDropdown(!showFirmaDropdown)
                setShowRoleDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white min-w-[140px] text-left flex items-center justify-between"
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
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedFirmas([])
                    setSelectedRoles([])
                    setFirmaSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-orange-50 cursor-pointer border-b border-gray-200 font-medium"
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
                    className={`px-3 py-2 text-sm hover:bg-orange-50 cursor-pointer flex items-center ${selectedFirmas.includes(firma) ? 'bg-orange-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFirmas.includes(firma)}
                      onChange={() => {}}
                      className="mr-2 text-orange-500 focus:ring-orange-500"
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

          {/* Role Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowRoleDropdown(!showRoleDropdown)
                setShowFirmaDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white min-w-[140px] text-left flex items-center justify-between"
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
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedRoles([])
                    setRoleSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-orange-50 cursor-pointer border-b border-gray-200 font-medium"
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
                    className={`px-3 py-2 text-sm hover:bg-orange-50 cursor-pointer flex items-center ${selectedRoles.includes(role) ? 'bg-orange-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role)}
                      onChange={() => {}}
                      className="mr-2 text-orange-500 focus:ring-orange-500"
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

          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('bar')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'bar' ? 'bg-orange-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Bar
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-orange-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Tablo
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="h-16 flex-shrink-0 grid grid-cols-4 gap-2 mb-3">
        {/* Average Absenteeism */}
        <div className="bg-orange-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-orange-600">
            {avgAbsenteeism.toFixed(1)} gün
          </div>
          <div className="text-xs font-medium text-orange-800 text-center">
            Ortalama
          </div>
        </div>

        {/* Maximum Absenteeism */}
        <div className="bg-red-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-red-600">
            {maxAbsenteeism.toFixed(1)} gün
          </div>
          <div className="text-xs font-medium text-red-800 text-center">
            Maksimum
          </div>
        </div>

        {/* Minimum Absenteeism */}
        <div className="bg-green-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-green-600">
            {minAbsenteeism.toFixed(1)} gün
          </div>
          <div className="text-xs font-medium text-green-800 text-center">
            Minimum
          </div>
        </div>

        {/* Total Records */}
        <div className="bg-amber-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-amber-600">
            {filteredData.length}
          </div>
          <div className="text-xs font-medium text-amber-800 text-center">
            Kayıt Sayısı
          </div>
        </div>
      </div>

      {/* Chart / Table */}
      <div className="flex-1 min-h-0">
        {viewMode === 'table' ? (
          <div className="h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-orange-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-orange-900 border-b-2 border-orange-300">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-orange-900 border-b-2 border-orange-300">Firma</th>
                  <th className="px-4 py-3 text-left font-semibold text-orange-900 border-b-2 border-orange-300">Görev</th>
                  <th className="px-4 py-3 text-right font-semibold text-orange-900 border-b-2 border-orange-300">Devamsızlık (gün/yıl)</th>
                  <th className="px-4 py-3 text-center font-semibold text-orange-900 border-b-2 border-orange-300">Durum</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => {
                  const statusColor = getColorForAbsenteeism(item["Ortalama Devamsızlık"])
                  let statusText = ''
                  if (item["Ortalama Devamsızlık"] < 2) statusText = 'Mükemmel'
                  else if (item["Ortalama Devamsızlık"] < 3) statusText = 'Çok İyi'
                  else if (item["Ortalama Devamsızlık"] < 4) statusText = 'İyi'
                  else if (item["Ortalama Devamsızlık"] < 5) statusText = 'Normal'
                  else if (item["Ortalama Devamsızlık"] < 6) statusText = 'Dikkat'
                  else statusText = 'Kötü'
                  
                  return (
                    <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-orange-50'} hover:bg-orange-100 transition-colors`}>
                      <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-600">{index + 1}</td>
                      <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {item.Firma}
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-200 text-gray-700 font-medium">
                        {item.Görev}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-200 text-right font-semibold text-orange-700">
                        {item["Ortalama Devamsızlık"].toFixed(1)} gün
                      </td>
                      <td className="px-4 py-3 border-b border-gray-200 text-center">
                        <span 
                          className="px-2 py-1 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: statusColor }}
                        >
                          {statusText}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
            >
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
                label={{ value: 'Devamsızlık (gün/yıl)', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                cursor={{ fill: 'rgba(249, 115, 22, 0.1)' }}
                formatter={(value: number) => [`${value.toFixed(1)} gün/yıl`, 'Ortalama Devamsızlık']}
                labelFormatter={(label: string, payload: any[]) => {
                  if (payload && payload.length > 0) {
                    return `${payload[0].payload.firma} - ${payload[0].payload.role}`
                  }
                  return label
                }}
              />
              <Bar
                dataKey="value"
                name="Ortalama Devamsızlık"
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

