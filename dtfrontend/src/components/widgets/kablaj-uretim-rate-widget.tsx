"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { api } from "@/lib/api"

// Widget configuration
KablajUretimRateWidget.config = {
  id: "kablaj_uretim_rate-widget",
  name: "Kablaj Üretim Takibi",
  type: "kablaj_uretim_rate",
  color: "bg-purple-500",
  description: "Firma bazlı aylık kablaj üretim miktarı takibi",
  size: { width: 4, height: 2, minHeight: 2 }
}

// TypeScript interfaces
interface KablajUretimData {
  NAME: string
  "Yıl": number
  "Ay": number
  "Ay Bilgi": string
  "Miktar": number
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface KablajUretimRateWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

// Color palette - Blue, Green, Yellow, Red sequence
const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444']

export function KablajUretimRateWidget({ widgetId, dateFrom, dateTo }: KablajUretimRateWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `kablaj-uretim-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return {
      selectedFirmas: [],
      selectedYears: [],
      viewMode: 'bar',
      hedefValue: 0
    }
    try {
      const stored = localStorage.getItem(`kablaj-uretim-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : {
        selectedFirmas: [],
        selectedYears: [],
        viewMode: 'bar',
        hedefValue: 0
      }
    } catch {
      return {
        selectedFirmas: [],
        selectedYears: [],
        viewMode: 'bar',
        hedefValue: 0
      }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedFirmas, setSelectedFirmas] = useState<string[]>(initialFilters.selectedFirmas)
  const [firmaOptions, setFirmaOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)

  const [selectedYears, setSelectedYears] = useState<number[]>(initialFilters.selectedYears)
  const [yearOptions, setYearOptions] = useState<number[]>([])
  const [showYearDropdown, setShowYearDropdown] = useState(false)

  const [viewMode, setViewMode] = useState<'bar' | 'table'>(initialFilters.viewMode)
  const [hedefValue, setHedefValue] = useState<number>(initialFilters.hedefValue)

  // State for widget data and loading
  const [rawData, setRawData] = useState<KablajUretimData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`kablaj-uretim-filters-${instanceId}`, JSON.stringify({
        selectedFirmas,
        selectedYears,
        viewMode,
        hedefValue
      }))
    }
  }, [selectedFirmas, selectedYears, viewMode, hedefValue, instanceId])

  // Load data when date filters change
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Build SQL query with date filtering
        let sqlQuery = 'SELECT "NAME", "Yıl", "Ay", "Ay Bilgi", "Miktar" FROM mes_production.kablaj_uretim_rate_takibi'

        // Add date filtering based on Year and Month if provided
        if (dateFrom || dateTo) {
          const whereClauses: string[] = []

          if (dateFrom) {
            // Parse dateFrom to extract year and month (format: "YYYY-MM-DD HH:MM:SS")
            const fromDate = new Date(dateFrom)
            const fromYear = fromDate.getFullYear()
            const fromMonth = fromDate.getMonth() + 1 // JavaScript months are 0-indexed

            // Create condition: (Yıl > fromYear) OR (Yıl = fromYear AND Ay >= fromMonth)
            whereClauses.push(`("Yıl" > ${fromYear} OR ("Yıl" = ${fromYear} AND "Ay" >= ${fromMonth}))`)
          }

          if (dateTo) {
            // Parse dateTo to extract year and month
            const toDate = new Date(dateTo)
            const toYear = toDate.getFullYear()
            const toMonth = toDate.getMonth() + 1

            // Create condition: (Yıl < toYear) OR (Yıl = toYear AND Ay <= toMonth)
            whereClauses.push(`("Yıl" < ${toYear} OR ("Yıl" = ${toYear} AND "Ay" <= ${toMonth}))`)
          }

          if (whereClauses.length > 0) {
            sqlQuery += ' WHERE ' + whereClauses.join(' AND ')
          }
        }

        sqlQuery += ' ORDER BY "Yıl", "Ay"'

        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: sqlQuery
        })

        if (response.success && response.data && response.data.length > 0) {
          const transformed = response.data.map(row => ({
            NAME: row[0],
            "Yıl": parseInt(row[1]),
            "Ay": parseInt(row[2]),
            "Ay Bilgi": row[3],
            "Miktar": parseInt(row[4]) || 0
          }))
          setRawData(transformed)

          // Extract unique firma options with predefined firms at the top
          const predefinedFirmas = ['CDK', 'HESA', 'MEGE']
          const allFirmas = Array.from(new Set(transformed.map(item => item.NAME)))
          const otherFirmas = allFirmas.filter(f => !predefinedFirmas.includes(f)).sort()
          const uniqueFirmas = [...predefinedFirmas, ...otherFirmas]
          setFirmaOptions(uniqueFirmas)

          // Extract unique year options
          const uniqueYears = Array.from(new Set(transformed.map(item => item["Yıl"]))).sort()
          setYearOptions(uniqueYears)
        } else {
          // No data returned - reset to empty
          setRawData([])
          setFirmaOptions([])
          setYearOptions([])
        }
      } catch (err) {
        console.error(`Error loading data for ${instanceId}:`, err)
        setError('Veri yüklenirken hata oluştu')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [instanceId, dateFrom, dateTo])

  // Filter data
  const filteredData = rawData.filter(item => {
    const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item.NAME)
    const yearMatch = selectedYears.length === 0 || selectedYears.includes(item["Yıl"])
    return firmaMatch && yearMatch
  })

  // Prepare chart data - group by month and year
  const chartData = (() => {
    // Create a map of month-year combinations
    const monthYearMap = new Map<string, any>()

    filteredData.forEach(item => {
      const key = `${item["Yıl"]} ${item["Ay Bilgi"]}`
      if (!monthYearMap.has(key)) {
        monthYearMap.set(key, {
          name: key,
          year: item["Yıl"],
          month: item["Ay"]
        })
      }
      const entry = monthYearMap.get(key)
      entry[item.NAME] = (entry[item.NAME] || 0) + item["Miktar"]
    })

    // Convert to array and sort by year and month
    return Array.from(monthYearMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return a.month - b.month
    })
  })()

  // Get unique firma names for the chart
  const firmaNames = selectedFirmas.length > 0
    ? selectedFirmas
    : Array.from(new Set(filteredData.map(item => item.NAME))).sort()

  // Calculate summary statistics
  const totalMiktar = filteredData.reduce((sum, item) => sum + item["Miktar"], 0)
  const avgMiktar = filteredData.length > 0 ? totalMiktar / filteredData.length : 0
  const maxMiktar = filteredData.length > 0 ? Math.max(...filteredData.map(item => item["Miktar"])) : 0

  // Filter options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  // Show loading state
  if (loading) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
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
          className="mt-2 px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  return (
    <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Kablaj Üretim Takibi</h3>
        </div>
        <div className="flex gap-2">
          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFirmaDropdown(!showFirmaDropdown)
                setShowYearDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[140px] text-left flex items-center justify-between"
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
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedFirmas([])
                    setFirmaSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer border-b border-gray-200 font-medium"
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
                    }}
                    className={`px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer flex items-center ${selectedFirmas.includes(firma) ? 'bg-purple-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFirmas.includes(firma)}
                      onChange={() => {}}
                      className="mr-2 text-purple-500 focus:ring-purple-500"
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

          {/* Year Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowYearDropdown(!showYearDropdown)
                setShowFirmaDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[120px] text-left flex items-center justify-between"
            >
              <span className="truncate">
                {selectedYears.length === 0
                  ? 'Tüm Yıllar'
                  : selectedYears.length === 1
                  ? selectedYears[0]
                  : `${selectedYears.length} Yıl Seçili`}
              </span>
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showYearDropdown && (
              <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div
                  onClick={() => setSelectedYears([])}
                  className="px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer border-b border-gray-200 font-medium"
                >
                  ✕ Tümünü Temizle
                </div>
                {yearOptions.map((year) => (
                  <div
                    key={year}
                    onClick={() => {
                      setSelectedYears(prev =>
                        prev.includes(year)
                          ? prev.filter(y => y !== year)
                          : [...prev, year]
                      )
                    }}
                    className={`px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer flex items-center ${selectedYears.includes(year) ? 'bg-purple-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(year)}
                      onChange={() => {}}
                      className="mr-2 text-purple-500 focus:ring-purple-500"
                    />
                    <span>{year}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hedef Input */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Hedef:</label>
            <input
              type="number"
              value={hedefValue || ''}
              onChange={(e) => setHedefValue(e.target.value === '' ? 0 : Number(e.target.value))}
              className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="0"
              min="0"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('bar')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'bar' ? 'bg-purple-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Grafik
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-purple-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Tablo
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="h-16 flex-shrink-0 grid grid-cols-3 gap-2 mb-3">
        {/* Total Miktar */}
        <div className="bg-purple-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-purple-600">
            {totalMiktar.toLocaleString()}
          </div>
          <div className="text-xs font-medium text-purple-800 text-center">
            Toplam Miktar
          </div>
        </div>

        {/* Average Miktar */}
        <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-blue-600">
            {avgMiktar.toFixed(0)}
          </div>
          <div className="text-xs font-medium text-blue-800 text-center">
            Ortalama Miktar
          </div>
        </div>

        {/* Maximum Miktar */}
        <div className="bg-cyan-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-cyan-600">
            {maxMiktar.toLocaleString()}
          </div>
          <div className="text-xs font-medium text-cyan-800 text-center">
            Maksimum Miktar
          </div>
        </div>
      </div>

      {/* Chart / Table */}
      <div className="flex-1 min-h-0">
        {filteredData.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm text-gray-500 font-medium">Seçilen filtrelere uygun veri bulunamadı</p>
            <p className="text-xs text-gray-400 mt-1">Lütfen farklı filtre seçenekleri deneyin</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-purple-900 border-b-2 border-purple-300">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-purple-900 border-b-2 border-purple-300">Firma</th>
                  <th className="px-4 py-3 text-left font-semibold text-purple-900 border-b-2 border-purple-300">Yıl</th>
                  <th className="px-4 py-3 text-left font-semibold text-purple-900 border-b-2 border-purple-300">Ay</th>
                  <th className="px-4 py-3 text-right font-semibold text-purple-900 border-b-2 border-purple-300">Miktar</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-purple-50'} hover:bg-purple-100 transition-colors`}>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-600">{index + 1}</td>
                    <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {item.NAME}
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                      {item["Yıl"]}
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                      {item["Ay Bilgi"]}
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-right font-semibold text-purple-700">
                      {item["Miktar"].toLocaleString()}
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
                {firmaNames.map((firma, index) => (
                  <linearGradient key={`gradient-${index}`} id={`colorBar${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.9}/>
                    <stop offset="100%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.7}/>
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
                label={{ value: 'Miktar', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
              />
              <Legend
                verticalAlign="top"
                height={36}
                iconType="square"
              />
              {hedefValue > 0 && (
                <ReferenceLine
                  y={hedefValue}
                  stroke="#ff0000"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{
                    value: `${hedefValue}`,
                    position: 'top',
                    fill: '#ff0000',
                    fontSize: 12,
                    fontWeight: 'bold'
                  }}
                />
              )}
              {firmaNames.map((firma, index) => (
                <Bar
                  key={firma}
                  dataKey={firma}
                  name={firma}
                  fill={`url(#colorBar${index})`}
                  radius={[8, 8, 0, 0]}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
