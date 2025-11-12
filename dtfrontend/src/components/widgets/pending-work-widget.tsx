"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { api } from "@/lib/api"

// Widget configuration
PendingWorkWidget.config = {
  id: "pending_work-widget",
  name: "Bekleyen İşler",
  type: "pending_work",
  color: "bg-indigo-500",
  description: "Firma bazlı bekleyen iş ve gecikme analizi",
  size: { width: 6, height: 2, minHeight: 2 }
}

// TypeScript interfaces
interface KablajData {
  "Firma Adı": string
  "İş Emri": string
  "Kalem Numarası": string | null
  "Miktar": number
  "Planlanan Başlangıç Tarihi": string
  "Planlanan Bitiş Tarihi": string
  "Gecikme Gün Sayısı": number
}

interface MekanikData {
  NAME: string
  MachineCode: string | null
  not_start: number
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface PendingWorkWidgetProps {
  widgetId?: string
}

// Color palette
const DELAY_COLORS = {
  onTime: '#10b981',      // green - 0 days
  slight: '#84cc16',      // lime - 1-5 days
  moderate: '#eab308',    // yellow - 6-10 days
  high: '#f59e0b',        // amber - 11-20 days
  critical: '#ef4444'     // red - 21+ days
}

const getColorForDelay = (days: number): string => {
  if (days === 0) return DELAY_COLORS.onTime
  if (days <= 5) return DELAY_COLORS.slight
  if (days <= 10) return DELAY_COLORS.moderate
  if (days <= 20) return DELAY_COLORS.high
  return DELAY_COLORS.critical
}

// Date formatting helper
const formatDate = (dateString: string): string => {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}-${month}-${year}`
  } catch {
    return dateString
  }
}

// Parse dd-mm-yyyy to Date
const parseDate = (dateString: string): Date | null => {
  if (!dateString) return null
  const parts = dateString.split('-')
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const year = parseInt(parts[2], 10)
    return new Date(year, month, day)
  }
  return null
}

// Convert dd-mm-yyyy to yyyy-mm-dd for date input
const convertToInputDate = (dateString: string): string => {
  if (!dateString) return ''
  const parts = dateString.split('-')
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return ''
}

// Convert yyyy-mm-dd to dd-mm-yyyy
const convertFromInputDate = (dateString: string): string => {
  if (!dateString) return ''
  const parts = dateString.split('-')
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return ''
}

export function PendingWorkWidget({ widgetId }: PendingWorkWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `pending-work-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { 
      selectedFirmas: [],
      selectedDataType: 'kablaj',
      startDate: '',
      endDate: '',
      viewMode: 'bar'
    }
    try {
      const stored = localStorage.getItem(`pending-work-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { 
        selectedFirmas: [],
        selectedDataType: 'kablaj',
        startDate: '',
        endDate: '',
        viewMode: 'bar'
      }
    } catch {
      return { 
        selectedFirmas: [],
        selectedDataType: 'kablaj',
        startDate: '',
        endDate: '',
        viewMode: 'bar'
      }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedFirmas, setSelectedFirmas] = useState<string[]>(initialFilters.selectedFirmas)
  const [kablajFirmaOptions, setKablajFirmaOptions] = useState<string[]>([])
  const [mekanikFirmaOptions, setMekanikFirmaOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)
  
  const [selectedDataType, setSelectedDataType] = useState<'kablaj' | 'mekanik'>(initialFilters.selectedDataType)
  const [startDate, setStartDate] = useState<string>(initialFilters.startDate)
  const [endDate, setEndDate] = useState<string>(initialFilters.endDate)
  const [viewMode, setViewMode] = useState<'bar' | 'pie' | 'table'>(initialFilters.viewMode)
  const [showStartDatePicker, setShowStartDatePicker] = useState(false)
  const [showEndDatePicker, setShowEndDatePicker] = useState(false)

  // State for widget data and loading
  const [kablajData, setKablajData] = useState<KablajData[]>([])
  const [mekanikData, setMekanikData] = useState<MekanikData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`pending-work-filters-${instanceId}`, JSON.stringify({
        selectedFirmas,
        selectedDataType,
        startDate,
        endDate,
        viewMode
      }))
    }
  }, [selectedFirmas, selectedDataType, startDate, endDate, viewMode, instanceId])

  // Clear selected firmas when switching data type if they don't exist in new dataset
  useEffect(() => {
    const currentOptions = selectedDataType === 'kablaj' ? kablajFirmaOptions : mekanikFirmaOptions
    if (currentOptions.length > 0 && selectedFirmas.length > 0) {
      const validFirmas = selectedFirmas.filter(firma => currentOptions.includes(firma))
      if (validFirmas.length !== selectedFirmas.length) {
        setSelectedFirmas(validFirmas)
      }
    }
  }, [selectedDataType, kablajFirmaOptions, mekanikFirmaOptions])

  // Load all data once on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [kablajResponse, mekanikResponse] = await Promise.all([
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "Firma Adı", "İş Emri", "Kalem Numarası", "Miktar", "Planlanan Başlangıç Tarihi", "Planlanan Bitiş Tarihi", "Gecikme Gün Sayısı" FROM mes_production.kablaj_firma_bekleyen_is ORDER BY "Gecikme Gün Sayısı" DESC'
          }),
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "NAME", "MachineCode", "not_start" FROM mes_production.mekanik_firma_bekleyen_is ORDER BY "not_start" DESC'
          })
        ])

        if (kablajResponse.success && kablajResponse.data && kablajResponse.data.length > 0) {
          const transformed = kablajResponse.data.map(row => ({
            "Firma Adı": row[0],
            "İş Emri": row[1],
            "Kalem Numarası": row[2],
            "Miktar": Number(row[3]) || 0,
            "Planlanan Başlangıç Tarihi": row[4],
            "Planlanan Bitiş Tarihi": row[5],
            "Gecikme Gün Sayısı": Number(row[6]) || 0
          }))
          setKablajData(transformed)
        }

        if (mekanikResponse.success && mekanikResponse.data && mekanikResponse.data.length > 0) {
          const transformed = mekanikResponse.data.map(row => ({
            NAME: row[0],
            MachineCode: row[1],
            not_start: Number(row[2]) || 0
          }))
          setMekanikData(transformed)
        }

        // Extract unique firma options from both datasets, filtering out null/undefined
        const kablajFirmas = kablajResponse.data?.map(row => row[0]).filter(Boolean) || []
        const mekanikFirmas = mekanikResponse.data?.map(row => row[0]).filter(Boolean) || []
        setKablajFirmaOptions(Array.from(new Set(kablajFirmas)).sort())
        setMekanikFirmaOptions(Array.from(new Set(mekanikFirmas)).sort())

      } catch (err) {
        console.error(`Error loading data for ${instanceId}:`, err)
        setError('Veri yüklenirken hata oluştu')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [instanceId])

  // Filter data based on selections
  const filteredKablajData = kablajData.filter(item => {
    const firmaMatch = selectedFirmas.length === 0 || selectedFirmas.includes(item["Firma Adı"])
    
    // Date filtering
    if (startDate || endDate) {
      const itemStartDate = new Date(item["Planlanan Başlangıç Tarihi"])
      const itemEndDate = new Date(item["Planlanan Bitiş Tarihi"])
      
      if (startDate) {
        const filterStart = parseDate(startDate)
        if (filterStart && itemEndDate < filterStart) return false
      }
      
      if (endDate) {
        const filterEnd = parseDate(endDate)
        if (filterEnd && itemStartDate > filterEnd) return false
      }
    }
    
    return firmaMatch
  })

  const filteredMekanikData = mekanikData.filter(item => {
    return selectedFirmas.length === 0 || selectedFirmas.includes(item.NAME)
  })

  // Prepare chart data based on selected data type
  const currentData = selectedDataType === 'kablaj' ? filteredKablajData : filteredMekanikData

  // Aggregate data by firma for charts
  const aggregateByFirma = () => {
    if (selectedDataType === 'kablaj') {
      const firmaMap = new Map<string, { totalJobs: number, totalDelay: number, totalQuantity: number }>()
      
      filteredKablajData.forEach(item => {
        const firma = item["Firma Adı"]
        const current = firmaMap.get(firma) || { totalJobs: 0, totalDelay: 0, totalQuantity: 0 }
        firmaMap.set(firma, {
          totalJobs: current.totalJobs + 1,
          totalDelay: current.totalDelay + item["Gecikme Gün Sayısı"],
          totalQuantity: current.totalQuantity + item["Miktar"]
        })
      })

      return Array.from(firmaMap.entries()).map(([firma, data]) => ({
        name: firma,
        value: data.totalJobs,
        avgDelay: data.totalJobs > 0 ? data.totalDelay / data.totalJobs : 0,
        totalQuantity: data.totalQuantity,
        color: getColorForDelay(data.totalJobs > 0 ? data.totalDelay / data.totalJobs : 0)
      }))
    } else {
      const firmaMap = new Map<string, { totalMachines: number, totalNotStart: number }>()
      
      filteredMekanikData.forEach(item => {
        const firma = item.NAME
        const current = firmaMap.get(firma) || { totalMachines: 0, totalNotStart: 0 }
        firmaMap.set(firma, {
          totalMachines: current.totalMachines + 1,
          totalNotStart: current.totalNotStart + item.not_start
        })
      })

      return Array.from(firmaMap.entries()).map(([firma, data]) => ({
        name: firma,
        value: data.totalNotStart,
        avgNotStart: data.totalMachines > 0 ? data.totalNotStart / data.totalMachines : 0,
        totalMachines: data.totalMachines,
        color: '#6366f1' // indigo
      }))
    }
  }

  const chartData = aggregateByFirma()

  // Calculate dynamic XAxis height based on longest label
  const calculateXAxisHeight = () => {
    const xAxisValue = chartData.map(item => item.name)
    const maxLabelLength = Math.max(...xAxisValue.map(item => String(item).length), 0)

    // Calculate number of lines needed for longest label (20 chars per line)
    const charsPerLine = 20
    const maxLines = Math.ceil(maxLabelLength / charsPerLine)

    // Base height + extra per line (with -45° angle, each line needs ~15px vertical space)
    const calculatedHeight = Math.max(70, Math.min(250, 50 + (maxLines - 1) * 15))
    return calculatedHeight
  }

  // Custom tick to render multiline labels
  const CustomXAxisTick = ({ x, y, payload }: any) => {
    const str = String(payload.value)
    const charsPerLine = 30
    const lines: string[] = []

    // Split into multiple lines
    for (let i = 0; i < str.length; i += charsPerLine) {
      lines.push(str.substring(i, i + charsPerLine))
    }

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={0}
          textAnchor="end"
          fill="#6b7280"
          fontSize="10px"
          fontWeight={400}
          transform="rotate(-45)"
        >
          {lines.map((line, index) => (
            <tspan key={index} x={0} dy={index === 0 ? 0 : 12}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    )
  }

  const xAxisHeight = calculateXAxisHeight()
  const bottomMargin = Math.max(5, xAxisHeight - 60) // Adjust bottom margin based on height

  // Calculate summary statistics
  const totalRecords = currentData.length
  const totalFirmas = new Set(chartData.map(d => d.name)).size

  let avgDelay = 0
  let maxDelay = 0
  let totalQuantity = 0
  let totalNotStart = 0

  if (selectedDataType === 'kablaj') {
    const delays = filteredKablajData.map(item => item["Gecikme Gün Sayısı"])
    avgDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0
    maxDelay = delays.length > 0 ? Math.max(...delays) : 0
    totalQuantity = filteredKablajData.reduce((sum, item) => sum + item["Miktar"], 0)
  } else {
    const notStarts = filteredMekanikData.map(item => item.not_start)
    totalNotStart = notStarts.reduce((a, b) => a + b, 0)
  }

  // Get current firma options based on selected data type
  const currentFirmaOptions = selectedDataType === 'kablaj' ? kablajFirmaOptions : mekanikFirmaOptions

  // Filter options based on search
  const filteredFirmaOptions = currentFirmaOptions.filter(firma =>
    firma && firma.toLowerCase().includes(firmaSearch.toLowerCase())
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
  if (currentData.length === 0) {
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
          <h3 className="text-lg font-semibold text-gray-800">Bekleyen İşler</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Data Type Toggle */}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setSelectedDataType('kablaj')}
              className={`px-3 py-1.5 text-sm ${selectedDataType === 'kablaj' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Kablaj
            </button>
            <button
              onClick={() => setSelectedDataType('mekanik')}
              className={`px-3 py-1.5 text-sm ${selectedDataType === 'mekanik' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Mekanik
            </button>
          </div>

          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFirmaDropdown(!showFirmaDropdown)
                setShowStartDatePicker(false)
                setShowEndDatePicker(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-[140px] text-left flex items-center justify-between"
            >
              <span className="truncate">
                {selectedFirmas.length === 0 
                  ? 'Tüm Firmalar' 
                  : selectedFirmas.length === 1 
                  ? selectedFirmas[0] 
                  : `${selectedFirmas.length} Firma`}
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

          {/* Date Filters - Only for Kablaj */}
          {selectedDataType === 'kablaj' && (
            <>
              {/* Start Date Picker */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowStartDatePicker(!showStartDatePicker)
                    setShowEndDatePicker(false)
                    setShowFirmaDropdown(false)
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white w-[160px] text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {startDate || 'Başlangıç'}
                  </span>
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                {showStartDatePicker && (
                  <div className="absolute z-20 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-700">Başlangıç Tarihi</span>
                      {startDate && (
                        <button
                          onClick={() => {
                            setStartDate('')
                            setShowStartDatePicker(false)
                          }}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Temizle
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={convertToInputDate(startDate)}
                      onChange={(e) => {
                        setStartDate(convertFromInputDate(e.target.value))
                        setShowStartDatePicker(false)
                      }}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* End Date Picker */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowEndDatePicker(!showEndDatePicker)
                    setShowStartDatePicker(false)
                    setShowFirmaDropdown(false)
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white w-[160px] text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {endDate || 'Bitiş'}
                  </span>
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                {showEndDatePicker && (
                  <div className="absolute z-20 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-700">Bitiş Tarihi</span>
                      {endDate && (
                        <button
                          onClick={() => {
                            setEndDate('')
                            setShowEndDatePicker(false)
                          }}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Temizle
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={convertToInputDate(endDate)}
                      onChange={(e) => {
                        setEndDate(convertFromInputDate(e.target.value))
                        setShowEndDatePicker(false)
                      }}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>
            </>
          )}

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
              Pasta
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
      {selectedDataType === 'kablaj' ? (
        <div className="h-16 flex-shrink-0 grid grid-cols-4 gap-2 mb-3">
          <div className="bg-indigo-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-indigo-600">{totalRecords}</div>
            <div className="text-xs font-medium text-indigo-800 text-center">İş Emri</div>
          </div>
          <div className="bg-amber-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-amber-600">{avgDelay.toFixed(1)} gün</div>
            <div className="text-xs font-medium text-amber-800 text-center">Ort. Gecikme</div>
          </div>
          <div className="bg-red-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-red-600">{maxDelay} gün</div>
            <div className="text-xs font-medium text-red-800 text-center">Max Gecikme</div>
          </div>
          <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-blue-600">{totalQuantity.toFixed(0)}</div>
            <div className="text-xs font-medium text-blue-800 text-center">Toplam Miktar</div>
          </div>
        </div>
      ) : (
        <div className="h-16 flex-shrink-0 grid grid-cols-3 gap-2 mb-3">
          <div className="bg-indigo-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-indigo-600">{totalRecords}</div>
            <div className="text-xs font-medium text-indigo-800 text-center">Makine</div>
          </div>
          <div className="bg-purple-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-purple-600">{totalNotStart}</div>
            <div className="text-xs font-medium text-purple-800 text-center">Bekleyen İş</div>
          </div>
          <div className="bg-cyan-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-cyan-600">{totalFirmas}</div>
            <div className="text-xs font-medium text-cyan-800 text-center">Firma</div>
          </div>
        </div>
      )}

      {/* Chart / Table */}
      <div className="flex-1 min-h-0">
        {viewMode === 'table' ? (
          <div className="h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-indigo-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">#</th>
                  {selectedDataType === 'kablaj' ? (
                    <>
                      <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">Firma</th>
                      <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">İş Emri</th>
                      <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">Kalem No</th>
                      <th className="px-4 py-3 text-right font-semibold text-indigo-900 border-b-2 border-indigo-300">Miktar</th>
                      <th className="px-4 py-3 text-center font-semibold text-indigo-900 border-b-2 border-indigo-300">Başlangıç</th>
                      <th className="px-4 py-3 text-center font-semibold text-indigo-900 border-b-2 border-indigo-300">Bitiş</th>
                      <th className="px-4 py-3 text-right font-semibold text-indigo-900 border-b-2 border-indigo-300">Gecikme</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">Firma</th>
                      <th className="px-4 py-3 text-left font-semibold text-indigo-900 border-b-2 border-indigo-300">Makine Kodu</th>
                      <th className="px-4 py-3 text-right font-semibold text-indigo-900 border-b-2 border-indigo-300">Başlamamış İş</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {selectedDataType === 'kablaj' ? (
                  filteredKablajData.map((item, index) => (
                    <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-indigo-50'} hover:bg-indigo-100 transition-colors`}>
                      <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-600">{index + 1}</td>
                      <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">{item["Firma Adı"]}</td>
                      <td className="px-4 py-3 border-b border-gray-200 text-gray-700">{item["İş Emri"]}</td>
                      <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                        {item["Kalem Numarası"] || <span className="text-gray-400 italic">-</span>}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-200 text-right text-gray-700">{item["Miktar"].toFixed(1)}</td>
                      <td className="px-4 py-3 border-b border-gray-200 text-center text-gray-700">{formatDate(item["Planlanan Başlangıç Tarihi"])}</td>
                      <td className="px-4 py-3 border-b border-gray-200 text-center text-gray-700">{formatDate(item["Planlanan Bitiş Tarihi"])}</td>
                      <td className="px-4 py-3 border-b border-gray-200 text-right">
                        <span 
                          className="px-2 py-1 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: getColorForDelay(item["Gecikme Gün Sayısı"]) }}
                        >
                          {item["Gecikme Gün Sayısı"]} gün
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  filteredMekanikData.map((item, index) => (
                    <tr key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-indigo-50'} hover:bg-indigo-100 transition-colors`}>
                      <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-600">{index + 1}</td>
                      <td className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">{item.NAME}</td>
                      <td className="px-4 py-3 border-b border-gray-200 text-gray-700">
                        {item.MachineCode || <span className="text-gray-400 italic">-</span>}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-200 text-right">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                          {item.not_start}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'pie' ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value}`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: bottomMargin }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                stroke="#6b7280"
                tickLine={false}
                padding={{ left: 30, right: 30 }}
                height={xAxisHeight}
                interval={0}
                tick={<CustomXAxisTick />}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '12px', fontWeight: 500 }}
                tickLine={false}
                label={{ 
                  value: selectedDataType === 'kablaj' ? 'İş Emri Sayısı' : 'Bekleyen İş', 
                  angle: -90, 
                  position: 'insideLeft', 
                  style: { fontSize: '12px' } 
                }}
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
                formatter={(value: number, name: string, props: any) => {
                  if (selectedDataType === 'kablaj') {
                    return [
                      `${value} İş Emri`,
                      `Ort. Gecikme: ${props.payload.avgDelay.toFixed(1)} gün`
                    ]
                  } else {
                    return [
                      `${value} Bekleyen İş`,
                      `${props.payload.totalMachines} Makine`
                    ]
                  }
                }}
              />
              <Bar
                dataKey="value"
                name={selectedDataType === 'kablaj' ? 'İş Emri Sayısı' : 'Bekleyen İş'}
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

