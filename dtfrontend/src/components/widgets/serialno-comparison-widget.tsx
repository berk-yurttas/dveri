"use client"

import { useState, useEffect, useRef } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { ProductDropdown } from "./product-dropdown"
import { TestNameDropdown } from "./test-name-dropdown"
import { TestStatusDropdown } from "./test-status-dropdown"
import { MeasurementLocationDropdown } from "./measurement-location-dropdown"
import { SerialNumberMultiselect } from "./serial-number-multiselect"
import { api } from "@/lib/api"
import { useWidgetFilters } from "@/contexts/filter-context"

// Widget configuration
SerialNoComparisonWidget.config = {
  id: "serialno_comparison",
  name: "Seri No Karşılaştırma",
  type: "serialno_comparison",
  color: "bg-indigo-500",
  description: "Birden fazla seri numarasını karşılaştırmalı analiz",
  size: { width: 4, height: 2 }
}

// TypeScript interfaces
interface ProductOption {
  id: number
  name: string
  value: number
  description?: string
}

interface TestNameOption {
  id: number
  name: string
  value: string
}

interface TestStatusOption {
  id: number
  name: string
  value: string
}

interface MeasurementLocationOption {
  id: number
  name: string
  value: string
}

interface SerialNumberOption {
  teu_id: number | null
  product_id: number
  product_name: string
  serial_number: string
  additional_info?: string
}

interface SeriesData {
  name: string
  data: number[]
  timestamps: string[]
  measurement_count: number
  statistics: {
    avg: number | null
    min: number | null
    max: number | null
  }
}

interface ChartDataPoint {
  timestamp: string
  [key: string]: string | number | null
}

interface WidgetData {
  urun_id: number
  test_adi: string
  test_durum: string
  olcum_yeri: string
  stok_no: string
  chart_data: {
    series: SeriesData[]
    categories: string[]
    limits: {
      alt_limit: number | null
      ust_limit: number | null
    }
  }
  summary: {
    total_serials: number
    total_measurements: number
    date_range: {
      from: string
      to: string
    }
  }
}

interface SerialNoComparisonWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

// Color palette for different serial numbers
const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00',
  '#ff00ff', '#00ffff', '#ff0000', '#0000ff', '#ffff00'
]

export function SerialNoComparisonWidget({ widgetId, dateFrom, dateTo }: SerialNoComparisonWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `serialno-comparison-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Use widget-specific filters from context
  const {
    selectedProduct,
    setSelectedProduct,
    selectedTestName,
    setSelectedTestName,
    selectedTestStatus,
    setSelectedTestStatus,
    selectedMeasurementLocation,
    setSelectedMeasurementLocation,
    getFilteredProps,
    allFilters,
    updateFilter
  } = useWidgetFilters(instanceId)

  // Serial numbers need special handling for multi-select
  const selectedSerialNumbers = (allFilters.selectedSerialNumbers as string[]) || []
  const setSelectedSerialNumbers = (value: string[]) => updateFilter('selectedSerialNumbers', value)

  // State for dropdown options
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [testNameOptions, setTestNameOptions] = useState<TestNameOption[]>([])
  const [testStatusOptions, setTestStatusOptions] = useState<TestStatusOption[]>([])
  const [measurementLocationOptions, setMeasurementLocationOptions] = useState<MeasurementLocationOption[]>([])
  const [serialNumberOptions, setSerialNumberOptions] = useState<SerialNumberOption[]>([])
  
  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [testNamesLoading, setTestNamesLoading] = useState(false)
  const [testStatusLoading, setTestStatusLoading] = useState(false)
  const [measurementLocationLoading, setMeasurementLocationLoading] = useState(false)
  const [serialNumbersLoading, setSerialNumbersLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load product options on component mount
  useEffect(() => {
    console.log(`SerialNoComparisonWidget ${instanceId}: Loading product options`)
    
    const loadProductOptions = async () => {
      try {
        const options = await api.get<ProductOption[]>('/data/products')
        setProductOptions(options)
        // Only set default if no product is currently selected
        if (options.length > 0 && !selectedProduct) {
          setSelectedProduct(options[0].value)
        }
      } catch (err) {
        setError('Failed to load product options')
        console.error(`Error loading products for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadProductOptions()
  }, [instanceId])

  // Load test names when product is selected
  useEffect(() => {
    const loadTestNames = async () => {
      if (!selectedProduct) {
        setTestNameOptions([])
        setSelectedTestName(null)
        return
      }

      console.log(`SerialNoComparisonWidget ${instanceId}: Loading test names for product ${selectedProduct}`)
      
      setTestNamesLoading(true)
      setSelectedTestName(null)

      try {
        const testNames = await api.get<TestNameOption[]>(`/data/products/${selectedProduct}/test-names`)
        setTestNameOptions(testNames)
        // Only set default if no test name is currently selected
        if (testNames.length > 0 && !selectedTestName) {
          setSelectedTestName(testNames[0].value)
        }
      } catch (err) {
        setError('Failed to load test names')
        console.error(`Error loading test names for ${instanceId}:`, err)
      } finally {
        setTestNamesLoading(false)
      }
    }

    loadTestNames()
  }, [selectedProduct, instanceId])

  // Load test statuses when product and test name are selected
  useEffect(() => {
    const loadTestStatuses = async () => {
      if (!selectedProduct || !selectedTestName) {
        setTestStatusOptions([])
        setSelectedTestStatus(null)
        return
      }

      console.log(`SerialNoComparisonWidget ${instanceId}: Loading test statuses`)
      
      setTestStatusLoading(true)
      setSelectedTestStatus(null)

       try {
         const testStatuses = await api.get<TestStatusOption[]>(`/data/products/${selectedProduct}/test-names/${selectedTestName}/test-statuses`)
         setTestStatusOptions(testStatuses)
        // Only set default if no test status is currently selected
        if (testStatuses.length > 0 && !selectedTestStatus) {
          setSelectedTestStatus(testStatuses[0].value)
        }
      } catch (err) {
        setError('Failed to load test statuses')
        console.error(`Error loading test statuses for ${instanceId}:`, err)
      } finally {
        setTestStatusLoading(false)
      }
    }

    loadTestStatuses()
  }, [selectedProduct, selectedTestName, instanceId])

  // Load measurement locations when product, test name, and test status are selected
  useEffect(() => {
    const loadMeasurementLocations = async () => {
      if (!selectedProduct || !selectedTestName || !selectedTestStatus) {
        setMeasurementLocationOptions([])
        setSelectedMeasurementLocation(null)
        return
      }

      console.log(`SerialNoComparisonWidget ${instanceId}: Loading measurement locations`)
      
      setMeasurementLocationLoading(true)
      setSelectedMeasurementLocation(null)

       try {
         const locations = await api.get<MeasurementLocationOption[]>(`/data/products/${selectedProduct}/test-names/${selectedTestName}/test-statuses/${selectedTestStatus}/measurement-locations`)
         setMeasurementLocationOptions(locations)
        // Only set default if no measurement location is currently selected
        if (locations.length > 0 && !selectedMeasurementLocation) {
          setSelectedMeasurementLocation(locations[0].value)
        }
      } catch (err) {
        setError('Failed to load measurement locations')
        console.error(`Error loading measurement locations for ${instanceId}:`, err)
      } finally {
        setMeasurementLocationLoading(false)
      }
    }

    loadMeasurementLocations()
  }, [selectedProduct, selectedTestName, selectedTestStatus, instanceId])

  // Load serial numbers when all filters are selected
  useEffect(() => {
    const loadSerialNumbers = async () => {
      if (!selectedProduct || !selectedTestName || !selectedTestStatus || !selectedMeasurementLocation) {
        setSerialNumberOptions([])
        setSelectedSerialNumbers([])
        return
      }

      console.log(`SerialNoComparisonWidget ${instanceId}: Loading serial numbers`)
      
      setSerialNumbersLoading(true)
      setSelectedSerialNumbers([])

      try {
        const serialNumbers = await api.get<SerialNumberOption[]>(`/data/products/${selectedProduct}/serial-numbers?test_name=${selectedTestName}&test_status=${selectedTestStatus}&measurement_location=${selectedMeasurementLocation}`)
        setSerialNumberOptions(serialNumbers)
      } catch (err) {
        setError('Failed to load serial numbers')
        console.error(`Error loading serial numbers for ${instanceId}:`, err)
      } finally {
        setSerialNumbersLoading(false)
      }
    }

    loadSerialNumbers()
  }, [selectedProduct, selectedTestName, selectedTestStatus, selectedMeasurementLocation, instanceId])

  // Load widget data when all filters are selected
  useEffect(() => {
    const loadWidgetData = async () => {
      if (!selectedProduct || !selectedTestName || !selectedTestStatus || !selectedMeasurementLocation || selectedSerialNumbers.length === 0) {
        setWidgetData(null)
        return
      }

      console.log(`SerialNoComparisonWidget ${instanceId}: Loading data`)
      
      setDataLoading(true)
      setError(null)

      try {
        // Use shared filters with fallback to props
        const filterProps = getFilteredProps()
        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'serialno_comparison',
          filters: {
            urun_id: selectedProduct,
            test_adi: selectedTestName,
            test_durum: selectedTestStatus,
            olcum_yeri: selectedMeasurementLocation,
            seri_no: selectedSerialNumbers,
            date_from: dateFrom || filterProps.dateFrom,
            date_to: dateTo || filterProps.dateTo
          }
        })
        setWidgetData(data)
      } catch (err) {
        setError('Failed to load widget data')
        console.error(`Error loading widget data for ${instanceId}:`, err)
      } finally {
        setDataLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedProduct, selectedTestName, selectedTestStatus, selectedMeasurementLocation, selectedSerialNumbers, dateFrom, dateTo, instanceId])

  // Format timestamp to dd-mm-yyyy hh:mm:ss
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp)
      const day = date.getDate().toString().padStart(2, '0')
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const year = date.getFullYear()
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      const seconds = date.getSeconds().toString().padStart(2, '0')
      return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`
    } catch (error) {
      return timestamp
    }
  }

  // Transform data for recharts
  const transformDataForChart = (data: WidgetData): ChartDataPoint[] => {
    if (!data.chart_data.series.length) return []

    // Collect all unique timestamps from all series
    const allTimestamps = new Set<string>()
    data.chart_data.series.forEach(series => {
      series.timestamps.forEach(timestamp => allTimestamps.add(timestamp))
    })

    // Sort timestamps chronologically
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    )

    // Create chart data points for each timestamp
    return sortedTimestamps.map(timestamp => {
      const formattedTimestamp = formatTimestamp(timestamp)
      const dataPoint: ChartDataPoint = { timestamp: formattedTimestamp }
      
      // For each series, find the value at this timestamp or set to null
      data.chart_data.series.forEach(series => {
        const index = series.timestamps.indexOf(timestamp)
        dataPoint[series.name] = index >= 0 ? series.data[index] : null
      })
      
      return dataPoint
    })
  }

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
          className="mt-2 px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Yeniden Dene
        </button>
      </div>
    )
  }

  const chartData = widgetData ? transformDataForChart(widgetData) : []
  
  // Debug: Log limit values
  if (widgetData) {
    console.log('Chart limits:', widgetData.chart_data.limits)
  }

  return (
    <div className="w-full h-full max-h-[555.5px] p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Seri No Karşılaştırma</h3>
        </div>
        <div className="flex space-x-2 flex-wrap">
          <ProductDropdown
            options={productOptions}
            selectedValue={selectedProduct}
            onSelect={setSelectedProduct}
            placeholder="Ürün ara..."
            className="w-24"
          />
          <TestNameDropdown
            options={testNameOptions}
            selectedValue={selectedTestName}
            onSelect={setSelectedTestName}
            placeholder="Test ara..."
            className="w-24"
            loading={testNamesLoading}
          />
          <TestStatusDropdown
            options={testStatusOptions}
            selectedValue={selectedTestStatus}
            onSelect={setSelectedTestStatus}
            placeholder="Durum ara..."
            className="w-24"
            loading={testStatusLoading}
          />
          <MeasurementLocationDropdown
            options={measurementLocationOptions}
            selectedValue={selectedMeasurementLocation}
            onSelect={setSelectedMeasurementLocation}
            placeholder="Ölçüm yeri ara..."
            className="w-24"
            loading={measurementLocationLoading}
          />
          <SerialNumberMultiselect
            options={serialNumberOptions}
            selectedValues={selectedSerialNumbers}
            onSelect={setSelectedSerialNumbers}
            placeholder="Seri no seçin..."
            className="w-32"
            loading={serialNumbersLoading}
            maxSelections={5}
          />
        </div>
      </div>

      {dataLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          <span className="ml-2 text-sm text-gray-600">Karşılaştırma yükleniyor...</span>
        </div>
      ) : widgetData && chartData.length > 0 ? (
        <>
          {/* Summary Section */}
          <div className="h-16 flex-shrink-0 grid grid-cols-3 gap-2 mb-4">
            <div className="bg-indigo-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-indigo-600">
                {widgetData.summary.total_serials}
              </div>
              <div className="text-xs font-medium text-indigo-800 text-center">
                Seri No
              </div>
            </div>
            <div className="bg-green-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-green-600">
                {widgetData.summary.total_measurements}
              </div>
              <div className="text-xs font-medium text-green-800 text-center">
                Ölçüm
              </div>
            </div>
            <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-blue-600">
                {widgetData.olcum_yeri}
              </div>
              <div className="text-xs font-medium text-blue-800 text-center">
                Ölçüm Yeri
              </div>
            </div>
          </div>

          {/* Chart Section */}
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 100 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tick={{ fontSize: 9 }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval="preserveStartEnd"
                  domain={['dataMin', 'dataMax']}
                  padding={{ left: 30, right: 30 }}
                />
                <YAxis 
                  tick={{ fontSize: 10 }} 
                  domain={[
                    (dataMin: number) => {
                      const altLimit = widgetData.chart_data.limits.alt_limit ? Number(widgetData.chart_data.limits.alt_limit) : dataMin
                      return Math.min(dataMin - 10, altLimit - 10)
                    },
                    (dataMax: number) => {
                      const ustLimit = widgetData.chart_data.limits.ust_limit ? Number(widgetData.chart_data.limits.ust_limit) : dataMax
                      return Math.max(dataMax + 10, ustLimit + 10)
                    }
                  ]}
                />
                <Tooltip 
                  labelStyle={{ fontSize: '12px' }}
                  contentStyle={{ fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                
                {/* Reference lines for limits */}
                {widgetData.chart_data.limits.alt_limit !== null && widgetData.chart_data.limits.alt_limit !== undefined && (
                  <ReferenceLine 
                    y={Number(widgetData.chart_data.limits.alt_limit)} 
                    stroke="#ff4444" 
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    label={{
                      value: `Alt Limit: ${widgetData.chart_data.limits.alt_limit}`,
                      fontSize: 11,
                      fill: "#ff4444",
                      fontWeight: "bold",
                      dy: -12
                    }}
                  />
                )}
                {widgetData.chart_data.limits.ust_limit !== null && widgetData.chart_data.limits.ust_limit !== undefined && (
                  <ReferenceLine 
                    y={Number(widgetData.chart_data.limits.ust_limit)} 
                    stroke="#ff4444" 
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    label={{
                      value: `Üst Limit: ${widgetData.chart_data.limits.ust_limit}`,
                      position: "top",
                      fontSize: 11,
                      fill: "#ff4444",
                      fontWeight: "bold",
                      dy: -12
                    }}
                  />
                )}
                
                {/* Lines for each serial number */}
                {widgetData.chart_data.series.map((series, index) => (
                  <Line
                    key={series.name}
                    type="monotone"
                    dataKey={series.name}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 6, fill: COLORS[index % COLORS.length], strokeWidth: 2 }}
                    activeDot={{ r: 8, fill: COLORS[index % COLORS.length] }}
                    connectNulls={true}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">Karşılaştırma verisi bulunamadı</p>
          <p className="text-xs text-gray-500 text-center">
            Tüm filtreleri seçin ve en az bir seri numarası seçin
          </p>
        </div>
      )}
    </div>
  )
}
