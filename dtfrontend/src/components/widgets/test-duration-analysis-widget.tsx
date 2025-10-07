"use client"

import { useState, useEffect, useRef } from "react"
import { ProductDropdown } from "./product-dropdown"
import { TestNameDropdown } from "./test-name-dropdown"
import { SerialNumberDropdown } from "./serial-number-dropdown"
import { api } from "@/lib/api"
import { useWidgetFilters } from "@/contexts/filter-context"
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

// Widget yapılandırması
TestDurationAnalysisWidget.config = {
  id: "test_duration_analysis",
  name: "Test Süre Analiz Grafiği",
  type: "test_duration_analysis",
  color: "bg-purple-500",
  description: "Test süresi analizi ile çizgi ve alan grafikleri",
  size: { width: 3, height: 2 }
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

interface SerialNumberOption {
  teu_id: number | null
  product_id: number
  product_name: string
  serial_number: string
  additional_info?: string
}

interface ChartDataPoint {
  serial_number: string
  test_start_date: string
  test_duration: number
}

interface WidgetData {
  data: ChartDataPoint[]
  serial_numbers: string[]
  total_records: number
  filters_applied: {
    product_id: number
    test_name: string
    date_range: string
  }
}

interface TestDurationAnalysisWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function TestDurationAnalysisWidget({ widgetId, dateFrom, dateTo }: TestDurationAnalysisWidgetProps) {
  // Create unique instance identifier to ensure state isolation
  const instanceRef = useRef(widgetId || `test-duration-analysis-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Use widget-specific filters from context
  const {
    selectedProduct,
    setSelectedProduct,
    selectedSerialNumber,
    setSelectedSerialNumber,
    selectedTestName,
    setSelectedTestName,
    getFilteredProps
  } = useWidgetFilters(instanceId)

  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [testNameOptions, setTestNameOptions] = useState<TestNameOption[]>([])
  const [serialNumberOptions, setSerialNumberOptions] = useState<SerialNumberOption[]>([])
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [testNamesLoading, setTestNamesLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load product options on component mount
  useEffect(() => {
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

      setTestNamesLoading(true)
      setSelectedTestName(null)
      setWidgetData(null)

      try {
        const testNames = await api.get<TestNameOption[]>(`/data/products/${selectedProduct}/test-names`)
        setTestNameOptions(testNames)
        // Only set default if no test name is currently selected
        if (testNames.length > 0 && !selectedTestName) {
          setSelectedTestName(testNames[0].value)
        }
      } catch (err) {
        console.error(`Error loading test names for ${instanceId}:`, err)
        setTestNameOptions([])
        setSelectedTestName(null)
      } finally {
        setTestNamesLoading(false)
      }
    }

    loadTestNames()
  }, [selectedProduct, instanceId])

  // Load widget data when product and test name are selected
  useEffect(() => {
    const loadWidgetData = async () => {
      if (!selectedProduct || !selectedTestName) return

      console.log(`TestDurationAnalysisWidget ${instanceId}: Loading data for product ${selectedProduct}, test: ${selectedTestName}`)

      setDataLoading(true)
      setError(null)

      try {
        // Use shared filters with fallback to props
        const filterProps = getFilteredProps()
        const filters: any = {
          urunId: selectedProduct,
          testAdi: selectedTestName,
          dateFrom: dateFrom || filterProps.dateFrom,
          dateTo: dateTo || filterProps.dateTo
        }

        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'test_duration_analysis',
          filters
        })
        setWidgetData(data)

        // Set available serial numbers from the response
        if (data.serial_numbers && data.serial_numbers.length > 0) {
          const serialOptions = data.serial_numbers.map((serialNo, index) => ({
            teu_id: null,
            product_id: selectedProduct,
            product_name: '',
            serial_number: serialNo,
            additional_info: ''
          }))
          setSerialNumberOptions(serialOptions)
          // Set default serial number if none selected
          if (!selectedSerialNumber) {
            setSelectedSerialNumber(data.serial_numbers[0])
          }
        }

      } catch (err) {
        setError('Failed to load widget data')
        console.error(`Error loading widget data for ${instanceId}:`, err)
      } finally {
        setDataLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedProduct, selectedTestName, instanceId, dateFrom, dateTo])

  const handleProductChange = (productId: number) => {
    setSelectedProduct(productId)
    setSelectedTestName(null) // Reset test name when product changes
    setSelectedSerialNumber(null) // Reset serial number when product changes
  }

  const handleTestNameChange = (testName: string) => {
    setSelectedTestName(testName)
    setSelectedSerialNumber(null) // Reset serial number when test name changes
  }

  const handleSerialNumberChange = (serialNumber: string) => {
    setSelectedSerialNumber(serialNumber)
  }

  // Prepare chart data - each serial number gets its own data field
  const chartData = widgetData?.data ?
    widgetData.data.map(item => ({
      date: new Date(item.test_start_date).toLocaleDateString('tr-TR'),
      duration: item.test_duration,
      serialNumber: item.serial_number,
      isSelected: item.serial_number === selectedSerialNumber
    })) : []

  // Get unique serial numbers for separate areas
  const uniqueSerialNumbers = widgetData?.serial_numbers || []

  // Group data by date with separate fields for each serial number
  const groupedData = chartData.reduce((acc: any[], item) => {
    const existingEntry = acc.find(entry => entry.date === item.date)
    if (existingEntry) {
      existingEntry[item.serialNumber] = item.duration
    } else {
      const newEntry: any = { date: item.date }
      newEntry[item.serialNumber] = item.duration
      acc.push(newEntry)
    }
    return acc
  }, [])

  // Sort grouped data by date
  groupedData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Calculate overall average duration for all serial numbers
  const overallAverage = widgetData?.data && widgetData.data.length > 0
    ? widgetData.data.reduce((sum, item) => sum + item.test_duration, 0) / widgetData.data.length
    : 0

  // Fill missing data points to ensure chart connectivity and add average line
  const filledData = groupedData.map(entry => {
    const filledEntry = { ...entry }
    uniqueSerialNumbers.forEach(serialNumber => {
      if (filledEntry[serialNumber] === undefined) {
        filledEntry[serialNumber] = null // Use null for missing data points
      }
    })
    // Add overall average as a constant line
    filledEntry.overallAverage = overallAverage
    return filledEntry
  })

  // Generate colors for each serial number
  const generateColor = (index: number, total: number, isSelected: boolean) => {
    if (isSelected) {
      return '#ff7300' // Orange for selected
    }
    const hue = (index * 360) / total
    return `hsl(${hue}, 70%, 60%)`
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading test duration analysis...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-full flex items-center justify-center">
        <div className="text-center text-red-600">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Test Süre Analiz Grafiği</h3>
        </div>
        <div className="flex items-center space-x-3">
          <ProductDropdown
            options={productOptions}
            selectedValue={selectedProduct}
            onSelect={handleProductChange}
            placeholder="Ürün Seçin"
          />
          <TestNameDropdown
            options={testNameOptions}
            selectedValue={selectedTestName}
            onSelect={handleTestNameChange}
            placeholder="Test adı seçin"
            loading={testNamesLoading}
          />
          <SerialNumberDropdown
            options={serialNumberOptions}
            selectedValue={selectedSerialNumber}
            onSelect={handleSerialNumberChange}
            placeholder="Seri no seçin..."
            loading={false}
          />
        </div>
      </div>

      {/* Summary info for selected serial number - Above chart */}
      {widgetData && selectedSerialNumber && (
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div className="bg-purple-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-purple-600">
              {widgetData.data.filter(item => item.serial_number === selectedSerialNumber).length}
            </div>
            <div className="text-xs font-medium text-purple-800 text-center">
              Toplam Test Sayısı
            </div>
          </div>
          <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-blue-600">
              {(() => {
                const selectedTests = widgetData.data.filter(item => item.serial_number === selectedSerialNumber)
                if (selectedTests.length === 0) return "0s"
                const avgSeconds = selectedTests.reduce((sum, item) => sum + item.test_duration, 0) / selectedTests.length
                const minutes = Math.floor(avgSeconds / 60)
                const seconds = Math.floor(avgSeconds % 60)
                return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
              })()}
            </div>
            <div className="text-xs font-medium text-blue-800 text-center">
              Ortalama Test Süresi
            </div>
          </div>
        </div>
      )}

      {/* Chart Content */}
      {widgetData && filledData.length > 0 ? (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filledData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: any, name: string) => [
                  `${value} saniye`,
                  name === selectedSerialNumber ? `${name} (Seçili)` : name
                ]}
              />
              <Legend />
              {/* Reference line for overall average */}
              <ReferenceLine
                y={overallAverage}
                stroke="red"
                strokeDasharray="8 8"
                strokeWidth={2}
                label={{ value: `Genel Ortalama: ${Math.round(overallAverage)}s`, position: "top", fill: "red", offset: 10 }}
              />
              {/* Render separate areas for each serial number */}
              {uniqueSerialNumbers.map((serialNumber, index) => {
                const isSelected = serialNumber === selectedSerialNumber
                const color = generateColor(index, uniqueSerialNumbers.length, isSelected)

                if (isSelected) {
                  // Line chart for selected serial number
                  return (
                    <Line
                      key={serialNumber}
                      type="monotone"
                      dataKey={serialNumber}
                      stroke={color}
                      strokeWidth={3}
                      dot={{ fill: color, strokeWidth: 2, r: 4 }}
                      name={serialNumber}
                      connectNulls={true}
                    />
                  )
                } else {
                  // Area chart for other serial numbers
                  return (
                    <Area
                      key={serialNumber}
                      type="monotone"
                      dataKey={serialNumber}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.3}
                      name={serialNumber}
                      connectNulls={true}
                    />
                  )
                }
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex items-center justify-center h-80">
          <div className="text-center text-gray-500">
            <p>No data available</p>
            <p className="text-sm">Select a product and test name to view duration analysis</p>
          </div>
        </div>
      )}
    </div>
  )
}