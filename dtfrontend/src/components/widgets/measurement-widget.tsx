"use client"

import { useState, useEffect, useRef } from "react"
import { ProductDropdown } from "./product-dropdown"
import { TestNameDropdown } from "./test-name-dropdown"
import { TestStatusDropdown } from "./test-status-dropdown"
import { MeasurementLocationDropdown } from "./measurement-location-dropdown"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { api } from "@/lib/api"
import { useWidgetFilters } from "@/contexts/filter-context"

MeasurementWidget.config = {
  id: "measurement-widget",
  name: "Ölçüm Analizi",
  type: "measurement_analysis",
  color: "bg-blue-500",
  description: "Ölçüm değerlerini zaman serisi grafik ile analiz et",
  size: { width: 4, height: 1 }
}

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

interface MeasurementDataPoint {
  stok_no: string
  seri_no: string
  test_adi: string
  test_durum: string
  olcum_yeri: string
  olculen_deger: number
  alt_limit: number
  ust_limit: number
  test_adimi_gecti_kaldi: string
  veri_tipi: string
  test_baslangic_tarihi: string
}

interface WidgetData {
  data: MeasurementDataPoint[]
  filters: any
  alt_limit: number | null
  ust_limit: number | null
}

interface MeasurementWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function MeasurementWidget({ widgetId, dateFrom, dateTo }: MeasurementWidgetProps) {
  // Ensure consistent widget ID - prefer provided widgetId, fallback only once
  const instanceRef = useRef<string>(widgetId || `measurement-${Math.random().toString(36).substr(2, 9)}`)
  if (!instanceRef.current) {
    instanceRef.current = widgetId || `measurement-${Math.random().toString(36).substr(2, 9)}`
  }
  // Always use the provided widgetId if available, but keep the fallback consistent
  const instanceId = widgetId || instanceRef.current

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
    getFilteredProps
  } = useWidgetFilters(instanceId)

  // Debug: Log filter values when they change
  useEffect(() => {
    console.log(`[${instanceId}] Filter values:`, {
      selectedProduct,
      selectedTestName,
      selectedTestStatus,
      selectedMeasurementLocation
    })
  }, [instanceId, selectedProduct, selectedTestName, selectedTestStatus, selectedMeasurementLocation])

  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [testNameOptions, setTestNameOptions] = useState<TestNameOption[]>([])
  const [testStatusOptions, setTestStatusOptions] = useState<TestStatusOption[]>([])
  const [measurementLocationOptions, setMeasurementLocationOptions] = useState<MeasurementLocationOption[]>([])

  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [testNamesLoading, setTestNamesLoading] = useState(false)
  const [testStatusLoading, setTestStatusLoading] = useState(false)
  const [measurementLocationLoading, setMeasurementLocationLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load product options on component mount
  useEffect(() => {
    console.log(`MeasurementWidget ${instanceId}: Loading product options`)

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

      console.log(`MeasurementWidget ${instanceId}: Loading test names for product ${selectedProduct}`)

      setTestNamesLoading(true)

      // Only clear dependent selections if this is not the initial load
      // During initial load, filter context might be restoring saved values
      if (!loading) {
        setSelectedTestName(null)
        setTestStatusOptions([])
        setSelectedTestStatus(null)
        setMeasurementLocationOptions([])
        setSelectedMeasurementLocation(null)
      }
      setWidgetData(null)

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

  // Load test status options when test name is selected
  useEffect(() => {
    const loadTestStatuses = async () => {
      if (!selectedProduct || !selectedTestName) {
        setTestStatusOptions([])
        setSelectedTestStatus(null)
        return
      }

      console.log(`MeasurementWidget ${instanceId}: Loading test statuses for product ${selectedProduct}, test ${selectedTestName}`)

      setTestStatusLoading(true)

      // Only clear dependent selections if this is not the initial load
      if (!loading) {
        setSelectedTestStatus(null)
        setMeasurementLocationOptions([])
        setSelectedMeasurementLocation(null)
      }
      setWidgetData(null)

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

  // Load measurement location options when test status is selected
  useEffect(() => {
    const loadMeasurementLocations = async () => {
      if (!selectedProduct || !selectedTestName || !selectedTestStatus) {
        setMeasurementLocationOptions([])
        // Only clear selection if not during initial load
        if (!loading) {
          setSelectedMeasurementLocation(null)
        }
        return
      }

      console.log(`MeasurementWidget ${instanceId}: Loading measurement locations`)

      setMeasurementLocationLoading(true)
      // Only clear selection if not during initial load
      if (!loading) {
        setSelectedMeasurementLocation(null)
      }
      setWidgetData(null)

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

  // Load widget data when all filters are selected
  useEffect(() => {
    const loadWidgetData = async () => {
      if (!selectedProduct || !selectedTestName || !selectedTestStatus || !selectedMeasurementLocation) {
        setWidgetData(null)
        return
      }

      console.log(`MeasurementWidget ${instanceId}: Loading measurement data`)

      setDataLoading(true)
      setError(null)

      try {
        const productName = productOptions.find(p => p.value === selectedProduct)?.name || selectedProduct.toString()

        // Use shared filters with fallback to props
        const filterProps = getFilteredProps()
        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'measurement_analysis',
          filters: {
            stok_no: productName,
            test_adi: selectedTestName,
            test_durum: selectedTestStatus,
            olcum_yeri: selectedMeasurementLocation,
            date_from: dateFrom || filterProps.dateFrom,
            date_to: dateTo || filterProps.dateTo
          }
        })
        setWidgetData(data)
      } catch (err) {
        setError('Failed to load measurement data')
        console.error(`Error loading measurement data for ${instanceId}:`, err)
      } finally {
        setDataLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedProduct, selectedTestName, selectedTestStatus, selectedMeasurementLocation, productOptions, dateFrom, dateTo, instanceId])

  // Prepare chart data
  const chartData = widgetData?.data ? widgetData.data.map((point, index) => ({
    index: index + 1,
    date: new Date(point.test_baslangic_tarihi).toLocaleDateString('tr-TR'),
    value: point.olculen_deger,
    seri_no: point.seri_no,
    timestamp: point.test_baslangic_tarihi
  })).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) : []

  // Show loading state
  if (loading) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
          className="mt-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Yeniden Dene
        </button>
      </div>
    )
  }

  return (
    <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header with dropdowns in a single row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Ölçüm Analizi</h3>
        </div>

        {/* Four dropdowns in one row */}
        <div className="flex space-x-2">
          <ProductDropdown
            options={productOptions}
            selectedValue={selectedProduct}
            onSelect={setSelectedProduct}
            placeholder="Ürün ara..."
            className="w-32"
          />
          <TestNameDropdown
            options={testNameOptions}
            selectedValue={selectedTestName}
            onSelect={setSelectedTestName}
            placeholder="Test ara..."
            className="w-32"
            loading={testNamesLoading}
          />
          <TestStatusDropdown
            options={testStatusOptions}
            selectedValue={selectedTestStatus}
            onSelect={setSelectedTestStatus}
            placeholder="Durum ara..."
            className="w-32"
            loading={testStatusLoading}
          />
          <MeasurementLocationDropdown
            options={measurementLocationOptions}
            selectedValue={selectedMeasurementLocation}
            onSelect={setSelectedMeasurementLocation}
            placeholder="Ölçüm yeri ara..."
            className="w-32"
            loading={measurementLocationLoading}
          />
        </div>
      </div>

      {/* Chart Content */}
      <div className="flex-1 min-h-0">
        {dataLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-sm text-gray-600">Ölçüm verileri yükleniyor...</span>
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={60}
                fontSize={12}
              />
              <YAxis fontSize={12} />
              <Tooltip
                labelFormatter={(value, payload) => {
                  if (payload && payload.length > 0) {
                    const seriNo = payload[0].payload.seri_no
                    return `Tarih: ${value}${seriNo ? ` | Seri No: ${seriNo}` : ''}`
                  }
                  return `Tarih: ${value}`
                }}
                formatter={(value, name) => [
                  typeof value === 'number' ? value.toFixed(2) : value,
                  name === 'value' ? 'Ölçülen Değer' :
                  name === 'altLimit' ? 'Alt Limit' :
                  name === 'ustLimit' ? 'Üst Limit' : name
                ]}
              />
              {/* Reference lines for limits - always visible as horizontal lines */}
              {widgetData?.alt_limit && (
                <ReferenceLine
                  y={widgetData.alt_limit}
                  stroke="#dc2626"
                  strokeDasharray="8 4"
                  strokeWidth={2}
                  label={{ value: `Alt Limit: ${widgetData.alt_limit}`, position: "top", fill: "#dc2626", fontSize: 12 }}
                />
              )}
              {widgetData?.ust_limit && (
                <ReferenceLine
                  y={widgetData.ust_limit}
                  stroke="#dc2626"
                  strokeDasharray="8 4"
                  strokeWidth={2}
                  label={{ value: `Üst Limit: ${widgetData.ust_limit}`, position: "top", fill: "#dc2626", fontSize: 12 }}
                />
              )}
              {/* Main measurement line */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ fill: '#2563eb', strokeWidth: 2, r: 5 }}
                name="Ölçülen Değer"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Ölçüm verisi bulunamadı</p>
            <p className="text-xs text-gray-500 text-center">
              {!selectedProduct || !selectedTestName || !selectedTestStatus || !selectedMeasurementLocation
                ? 'Lütfen tüm filtreleri seçin'
                : 'Seçilen kriterler için veri bulunmuyor'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}