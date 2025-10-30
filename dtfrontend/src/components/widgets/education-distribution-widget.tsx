"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { api } from "@/lib/api"
import { Payload } from "recharts/types/component/DefaultTooltipContent"

// Widget configuration
EducationDistributionWidget.config = {
  id: "education_distribution-widget",
  name: "Eğitim Durumu Dağılımı",
  type: "education_distribution",
  color: "bg-purple-500",
  description: "Firma bazlı eğitim seviyesi dağılım analizi",
  size: { width: 4, height: 2, minHeight: 2 }
}

// TypeScript interfaces
interface EducationData {
  Firma: string
  Eğitim: string
  "Yüzdelik Dilim": number
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface EducationDistributionWidgetProps {
  widgetId?: string
}

// Color palette for education levels
const EDUCATION_COLORS: { [key: string]: string } = {
  'İlkokul': '#ef4444',
  'Ortaokul': '#f97316',
  'Lise': '#f59e0b',
  'Ön Lisans': '#84cc16',
  'Lisans': '#10b981',
  'Yüksek Lisans': '#06b6d4',
  'Doktora': '#8b5cf6'
}

// Education level order for consistent display
const EDUCATION_ORDER = ['İlkokul', 'Ortaokul', 'Lise', 'Ön Lisans', 'Lisans', 'Yüksek Lisans', 'Doktora']

export function EducationDistributionWidget({ widgetId }: EducationDistributionWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `education-dist-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { 
      selectedFirmas: [], 
      selectedEducationLevels: [],
      viewMode: 'bar' 
    }
    try {
      const stored = localStorage.getItem(`education-dist-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { 
        selectedFirmas: [], 
        selectedEducationLevels: [],
        viewMode: 'bar' 
      }
    } catch {
      return { 
        selectedFirmas: [], 
        selectedEducationLevels: [],
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
  
  const [selectedEducationLevels, setSelectedEducationLevels] = useState<string[]>(initialFilters.selectedEducationLevels)
  const [educationSearch, setEducationSearch] = useState('')
  const [showEducationDropdown, setShowEducationDropdown] = useState(false)
  
  const [viewMode, setViewMode] = useState<'bar' | 'pie' | 'table' | 'stacked'>(initialFilters.viewMode)

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<EducationData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`education-dist-filters-${instanceId}`, JSON.stringify({
        selectedFirmas,
        selectedEducationLevels,
        viewMode
      }))
    }
  }, [selectedFirmas, selectedEducationLevels, viewMode, instanceId])

  // Load all data once on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: 'SELECT "Firma", "Eğitim", "Yüzdelik Dilim" FROM mes_production.get_firma_bazli_egitim_durumu ORDER BY "Firma", "Eğitim"'
        })

        if (response.success && response.data && response.data.length > 0) {
          // Transform data
          const transformed = response.data.map(row => ({
            Firma: row[0],
            Eğitim: row[1],
            "Yüzdelik Dilim": row[2]
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

  // Get education level options from data
  const educationLevelOptions = Array.from(new Set(widgetData.map(item => item.Eğitim)))
    .sort((a, b) => EDUCATION_ORDER.indexOf(a) - EDUCATION_ORDER.indexOf(b))

  // Filter data based on selections
  const filteredData = widgetData.filter(item => {
    const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item.Firma)
    const educationMatch = selectedEducationLevels.length === 0 || selectedEducationLevels.includes(item.Eğitim)
    return firmaMatch && educationMatch
  })

  // Prepare chart data based on view mode
  const prepareChartData = () => {
    if (viewMode === 'stacked') {
      // Group by firma, with each education level as a separate field
      const firmasToShow = selectedFirmas.length > 0 ? selectedFirmas : firmaOptions
      return firmasToShow.map(firma => {
        const firmaData: any = { firma }
        const firmaRecords = filteredData.filter(item => item.Firma === firma)
        
        firmaRecords.forEach(record => {
          firmaData[record.Eğitim] = record["Yüzdelik Dilim"]
        })
        
        return firmaData
      })
    } else {
      // Regular format for bar/pie charts
      return filteredData.map(item => ({
        name: `${item.Firma} - ${item.Eğitim}`,
        firma: item.Firma,
        education: item.Eğitim,
        value: item["Yüzdelik Dilim"]
      }))
    }
  }

  const chartData = prepareChartData()

  // Calculate summary statistics
  const totalPercentage = filteredData.reduce((sum, item) => sum + item["Yüzdelik Dilim"], 0)
  const avgPercentage = filteredData.length > 0 ? totalPercentage / filteredData.length : 0
  const maxPercentage = filteredData.length > 0 ? Math.max(...filteredData.map(item => item["Yüzdelik Dilim"])) : 0
  const minPercentage = filteredData.length > 0 ? Math.min(...filteredData.map(item => item["Yüzdelik Dilim"])) : 0
  
  // Count unique firms and education levels in filtered data
  const uniqueFirmas = new Set(filteredData.map(item => item.Firma)).size
  const uniqueEducationLevels = new Set(filteredData.map(item => item.Eğitim)).size

  // Filter options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  const filteredEducationOptions = educationLevelOptions.filter(education =>
    education.toLowerCase().includes(educationSearch.toLowerCase())
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
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Eğitim Durumu Dağılımı</h3>
        </div>
        <div className="flex gap-2">
          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFirmaDropdown(!showFirmaDropdown)
                setShowEducationDropdown(false)
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

          {/* Education Level Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowEducationDropdown(!showEducationDropdown)
                setShowFirmaDropdown(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">
                {selectedEducationLevels.length === 0 
                  ? 'Tüm Seviyeler' 
                  : selectedEducationLevels.length === 1 
                  ? selectedEducationLevels[0] 
                  : `${selectedEducationLevels.length} Seviye`}
              </span>
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showEducationDropdown && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                  <input
                    type="text"
                    value={educationSearch}
                    onChange={(e) => setEducationSearch(e.target.value)}
                    placeholder="Eğitim seviyesi ara..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedEducationLevels([])
                    setEducationSearch('')
                  }}
                  className="px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer border-b border-gray-200 font-medium"
                >
                  ✕ Tümünü Temizle
                </div>
                {filteredEducationOptions.map((education) => (
                  <div
                    key={education}
                    onClick={() => {
                      setSelectedEducationLevels(prev => 
                        prev.includes(education) 
                          ? prev.filter(e => e !== education)
                          : [...prev, education]
                      )
                    }}
                    className={`px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer flex items-center ${selectedEducationLevels.includes(education) ? 'bg-purple-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEducationLevels.includes(education)}
                      onChange={() => {}}
                      className="mr-2 text-purple-500 focus:ring-purple-500"
                    />
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: EDUCATION_COLORS[education] }}
                    ></div>
                    <span>{education}</span>
                  </div>
                ))}
                {filteredEducationOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('bar')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'bar' ? 'bg-purple-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              title="Bar Chart"
            >
              Bar
            </button>
            <button
              onClick={() => setViewMode('stacked')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'stacked' ? 'bg-purple-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              title="Stacked Bar"
            >
              Yığılmış
            </button>
            <button
              onClick={() => setViewMode('pie')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'pie' ? 'bg-purple-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              title="Pie Chart"
            >
              Pie
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-purple-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              title="Table"
            >
              Tablo
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="h-16 flex-shrink-0 grid grid-cols-2 gap-2 mb-3">
        {/* Firms Count */}
        <div className="bg-purple-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-purple-600">
            {uniqueFirmas}
          </div>
          <div className="text-xs font-medium text-purple-800 text-center">
            Firma Sayısı
          </div>
        </div>

        {/* Education Levels */}
        <div className="bg-fuchsia-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-fuchsia-600">
            {uniqueEducationLevels}
          </div>
          <div className="text-xs font-medium text-fuchsia-800 text-center">
            Eğitim Seviyesi
          </div>
        </div>
      </div>

      {/* Chart / Table */}
      <div className="flex-1 min-h-0">
        {viewMode === 'table' ? (
          <div className="h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-purple-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-purple-900 border-b-2 border-purple-300">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-purple-900 border-b-2 border-purple-300">Firma</th>
                  <th className="px-4 py-3 text-left font-semibold text-purple-900 border-b-2 border-purple-300">Eğitim Seviyesi</th>
                  <th className="px-4 py-3 text-right font-semibold text-purple-900 border-b-2 border-purple-300">Yüzde</th>
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
                        {item.Firma}
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                      <div className="flex items-center">
                        <div 
                          className="w-3 h-3 rounded-full mr-2" 
                          style={{ backgroundColor: EDUCATION_COLORS[item.Eğitim] }}
                        ></div>
                        <span className="font-medium">{item.Eğitim}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-gray-200 text-right font-semibold text-purple-700">
                      <div className="flex items-center justify-end">
                        <div className="w-20 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-purple-500 h-2 rounded-full" 
                            style={{ width: `${Math.min(100, item["Yüzdelik Dilim"])}%` }}
                          ></div>
                        </div>
                        <span>{item["Yüzdelik Dilim"].toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'stacked' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="firma"
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
                label={{ value: 'Yüzde (%)', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                formatter={(value: number) => `${value.toFixed(1)}%`}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '10px' }}
                iconType="circle"
              />
              {EDUCATION_ORDER.map((education) => (
                <Bar
                  key={education}
                  dataKey={education}
                  stackId="a"
                  fill={EDUCATION_COLORS[education]}
                  name={education}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : viewMode === 'bar' ? (
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
                label={{ value: 'Yüzde (%)', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                cursor={{ fill: 'rgba(168, 85, 247, 0.1)' }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Yüzde']}
                labelFormatter={(label: string, payload: any[]) => {
                  if (payload && payload.length > 0) {
                    return `${payload[0].payload.firma} - ${payload[0].payload.education}`
                  }
                  return label
                }}
              />
              <Bar
                dataKey="value"
                name="Yüzde"
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              >
                {chartData.map((entry: any, index) => (
                  <Cell key={`cell-${index}`} fill={EDUCATION_COLORS[entry.education] || '#a855f7'} />
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
                label={({ name, value }) => `${name.split(' - ')[1]}: ${value.toFixed(1)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry: any, index) => (
                  <Cell key={`cell-${index}`} fill={EDUCATION_COLORS[entry.education] || '#a855f7'} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Yüzde']}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

