"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { api } from "@/lib/api"
import { Payload } from "recharts/types/component/DefaultTooltipContent"

// Widget configuration
MekanikHatalarWidget.config = {
  id: "mekanik_hatalar-widget",
  name: "Mekanik Firma Hataları",
  type: "mekanik_hatalar",
  color: "bg-rose-500",
  description: "Mekanik firmalarının hata analizi ve dağılımı",
  size: { width: 4, height: 2, minHeight: 2 }
}

// TypeScript interfaces
interface MekanikHataData {
  NAME: string
  Hatalar: string
  "Toplam Hata": number
  Yüzde: number
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface MekanikHatalarWidgetProps {
  widgetId?: string
}

// Color palette
const COLORS = ['#f43f5e', '#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

export function MekanikHatalarWidget({ widgetId }: MekanikHatalarWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `mekanik-hatalar-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { selectedFirmas: [], selectedHataTipi: [], viewMode: 'bar' }
    try {
      const stored = localStorage.getItem(`mekanik-hatalar-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { selectedFirmas: [], selectedHataTipi: [], viewMode: 'bar' }
    } catch {
      return { selectedFirmas: [], selectedHataTipi: [], viewMode: 'bar' }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedFirmas, setSelectedFirmas] = useState<string[]>(initialFilters.selectedFirmas)
  const [firmaOptions, setFirmaOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)
  const [selectedHataTipi, setSelectedHataTipi] = useState<string[]>(initialFilters.selectedHataTipi)
  const [hataTipiSearch, setHataTipiSearch] = useState('')
  const [showHataTipiDropdown, setShowHataTipiDropdown] = useState(false)
  const [viewMode, setViewMode] = useState<'bar' | 'pie' | 'table'>(initialFilters.viewMode)

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<MekanikHataData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`mekanik-hatalar-filters-${instanceId}`, JSON.stringify({
        selectedFirmas,
        selectedHataTipi,
        viewMode
      }))
    }
  }, [selectedFirmas, selectedHataTipi, viewMode, instanceId])

  // Load all firma options once on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: 'SELECT "NAME", "Hatalar", "Toplam Hata", "Yüzde" FROM mes_production.mekanik_firma_duruslar ORDER BY "Toplam Hata" DESC'
        })

        if (response.success && response.data && response.data.length > 0) {
          // Transform data
          const transformed = response.data.map(row => ({
            NAME: row[0],
            Hatalar: row[1],
            "Toplam Hata": row[2],
            Yüzde: row[3]
          }))
          setWidgetData(transformed)

          // Extract unique firma options
          const uniqueFirmas = Array.from(new Set(transformed.map(item => item.NAME))).sort()
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

  // Get hata tipi options based on selected firmas
  const hataTipiOptions = selectedFirmas.length > 0
    ? Array.from(new Set(
        widgetData
          .filter(item => selectedFirmas.includes(item.NAME))
          .map(item => item.Hatalar)
      )).sort()
    : Array.from(new Set(widgetData.map(item => item.Hatalar))).sort()

  // Filter data based on selected firmas and hata tipi
  const filteredData = widgetData.filter(item => {
    const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item.NAME)
    const hataTipiMatch = selectedHataTipi.length === 0 || selectedHataTipi.includes(item.Hatalar)
    return firmaMatch && hataTipiMatch
  })

  // Prepare chart data - show by error type
  const chartData = filteredData.map(item => ({
    name: item.Hatalar,
    firma: item.NAME,
    value: item["Toplam Hata"],
    percentage: item.Yüzde
  }))

  // Calculate summary statistics
  const totalHata = filteredData.reduce((sum, item) => sum + item["Toplam Hata"], 0)
  const avgHata = filteredData.length > 0 ? totalHata / filteredData.length : 0
  const maxHata = filteredData.length > 0 ? Math.max(...filteredData.map(item => item["Toplam Hata"])) : 0
  const avgPercentage = filteredData.length > 0 
    ? filteredData.reduce((sum, item) => sum + item.Yüzde, 0) / filteredData.length 
    : 0

  // Filter firma options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  // Filter hata tipi options based on search
  const filteredHataTipiOptions = hataTipiOptions.filter(hataTipi =>
    hataTipi.toLowerCase().includes(hataTipiSearch.toLowerCase())
  )

  // Show loading state
  if (loading) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
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
          className="mt-2 px-4 py-2 text-sm bg-rose-600 text-white rounded hover:bg-rose-700"
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
          <div className="w-3 h-3 bg-rose-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Mekanik Firma Hataları</h3>
        </div>
        <div className="flex gap-2">
          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFirmaDropdown(!showFirmaDropdown)
                setShowHataTipiDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white min-w-[140px] text-left flex items-center justify-between"
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
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedFirmas([])
                    setSelectedHataTipi([])
                    setFirmaSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-rose-50 cursor-pointer border-b border-gray-200 font-medium"
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
                        setSelectedHataTipi([])
                      }
                    }}
                    className={`px-3 py-2 text-sm hover:bg-rose-50 cursor-pointer flex items-center ${selectedFirmas.includes(firma) ? 'bg-rose-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFirmas.includes(firma)}
                      onChange={() => {}}
                      className="mr-2 text-rose-500 focus:ring-rose-500"
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

          {/* Hata Tipi Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowHataTipiDropdown(!showHataTipiDropdown)
                setShowFirmaDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">
                {selectedHataTipi.length === 0 
                  ? 'Tüm Hata Tipleri' 
                  : selectedHataTipi.length === 1 
                  ? selectedHataTipi[0].substring(0, 20) + (selectedHataTipi[0].length > 20 ? '...' : '')
                  : `${selectedHataTipi.length} Hata Seçili`}
              </span>
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showHataTipiDropdown && (
              <div className="absolute z-10 mt-1 w-80 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                  <input
                    type="text"
                    value={hataTipiSearch}
                    onChange={(e) => setHataTipiSearch(e.target.value)}
                    placeholder="Hata tipi ara..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedHataTipi([])
                    setHataTipiSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-rose-50 cursor-pointer border-b border-gray-200 font-medium"
                >
                  ✕ Tümünü Temizle
                </div>
                {filteredHataTipiOptions.map((hataTipi) => (
                  <div
                    key={hataTipi}
                    onClick={() => {
                      setSelectedHataTipi(prev => 
                        prev.includes(hataTipi) 
                          ? prev.filter(h => h !== hataTipi)
                          : [...prev, hataTipi]
                      )
                    }}
                    className={`px-3 py-2 text-sm hover:bg-rose-50 cursor-pointer flex items-start ${selectedHataTipi.includes(hataTipi) ? 'bg-rose-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedHataTipi.includes(hataTipi)}
                      onChange={() => {}}
                      className="mr-2 mt-0.5 text-rose-500 focus:ring-rose-500 flex-shrink-0"
                    />
                    <span className="break-words">{hataTipi}</span>
                  </div>
                ))}
                {filteredHataTipiOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('bar')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'bar' ? 'bg-rose-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Bar
            </button>
            <button
              onClick={() => setViewMode('pie')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'pie' ? 'bg-rose-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Pie
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-rose-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Tablo
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="h-16 flex-shrink-0 grid grid-cols-4 gap-2 mb-3">
        {/* Total Errors */}
        <div className="bg-rose-50 p-1.5 rounded-lg flex flex-col items-center justify-center">
          <div className="text-base font-bold text-rose-600">
            {totalHata}
          </div>
          <div className="text-[10px] font-medium text-rose-800 text-center leading-tight">
            Toplam Hata
          </div>
        </div>

        {/* Average Errors */}
        <div className="bg-blue-50 p-1.5 rounded-lg flex flex-col items-center justify-center">
          <div className="text-base font-bold text-blue-600">
            {avgHata.toFixed(1)}
          </div>
          <div className="text-[10px] font-medium text-blue-800 text-center leading-tight">
            Ortalama Hata
          </div>
        </div>

        {/* Maximum */}
        <div className="bg-red-50 p-1.5 rounded-lg flex flex-col items-center justify-center">
          <div className="text-base font-bold text-red-600">
            {maxHata}
          </div>
          <div className="text-[10px] font-medium text-red-800 text-center leading-tight">
            Maksimum Hata
          </div>
        </div>

        {/* Average Percentage */}
        <div className="bg-purple-50 p-1.5 rounded-lg flex flex-col items-center justify-center">
          <div className="text-base font-bold text-purple-600">
            {avgPercentage.toFixed(1)}%
          </div>
          <div className="text-[10px] font-medium text-purple-800 text-center leading-tight">
            Ortalama Yüzde
          </div>
        </div>
      </div>

      {/* Chart / Table */}
      <div className="flex-1 min-h-0">
        {viewMode === 'table' ? (
          <div className="h-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-rose-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-rose-900 border-b-2 border-rose-300">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-rose-900 border-b-2 border-rose-300">Firma</th>
                  <th className="px-4 py-3 text-left font-semibold text-rose-900 border-b-2 border-rose-300">Hata Tipi</th>
                  <th className="px-4 py-3 text-right font-semibold text-rose-900 border-b-2 border-rose-300">Hata Sayısı</th>
                  <th className="px-4 py-3 text-right font-semibold text-rose-900 border-b-2 border-rose-300">Yüzde</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-rose-50'} hover:bg-rose-100 transition-colors`}>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-600">{index + 1}</td>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {item.NAME}
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                      <div className="flex items-start">
                        <svg className="w-4 h-4 mr-2 mt-0.5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="font-medium">{item.Hatalar}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-right font-semibold text-rose-700">
                      {item["Toplam Hata"]}
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-right">
                      <div className="flex items-center justify-end">
                        <div className="w-20 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-rose-500 h-2 rounded-full" 
                            style={{ width: `${Math.min(100, item.Yüzde)}%` }}
                          ></div>
                        </div>
                        <span className="text-gray-600 font-medium">
                          {item.Yüzde.toFixed(1)}%
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
                label={{ value: 'Hata Sayısı', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                cursor={{ fill: 'rgba(244, 63, 94, 0.1)' }}
                formatter={(value: number, name: string, props: any) => {
                  const percentage = props.payload.percentage
                  return [
                    `${value} (${percentage?.toFixed(2)}%)`,
                    'Hata Sayısı'
                  ]
                }}
                labelFormatter={(label: string, payload: Payload<number, "Hata Sayısı">[]) => {
                  if (payload && payload.length > 0) {
                    const firma = payload[0].payload.firma
                    return `${label}${firma ? ` - ${firma}` : ''}`
                  }
                  return label
                }}
              />
              <Bar
                dataKey="value"
                name="Hata Sayısı"
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
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string, props: any) => {
                  const percentage = props.payload.percentage
                  return [`${value} hata (${percentage?.toFixed(2)}%)`, 'Toplam']
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

