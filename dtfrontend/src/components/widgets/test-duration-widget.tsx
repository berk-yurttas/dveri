"use client"

import { useState, useEffect, useRef } from "react"
import { ProductDropdown } from "./product-dropdown"
import { SerialNumberDropdown } from "./serial-number-dropdown"
import { api } from "@/lib/api"
import { useWidgetFilters } from "@/contexts/filter-context"

// Widget yapılandırması
TestDurationWidget.config = {
  id: "test_duration-widget",
  name: "Test Süre Analizi",
  type: "test_duration",
  color: "bg-orange-500",
  description: "Test süreleri ve ilk geçiş yüzdesi analizi",
  size: { width: 2, height: 1 }
}

// TypeScript interfaces
interface ProductOption {
  id: number
  name: string
  value: number
  description?: string
}

interface SerialNumberOption {
  teu_id: number | null
  product_id: number
  product_name: string
  serial_number: string
  additional_info?: string
}

interface WidgetData {
  urun_id: number
  stok_no: string
  total_duration_seconds: number
  total_duration_formatted: string
  first_pass_percentage: number
  summary: {
    total_tests: number
    average_duration_seconds: number
    average_duration_formatted: string
    total_test_combinations: number
    first_pass_count: number
    first_pass_percentage: number
  }
}

interface TestDurationWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function TestDurationWidget({ widgetId, dateFrom, dateTo }: TestDurationWidgetProps) {
  // Create unique instance identifier to ensure state isolation
  const instanceRef = useRef(widgetId || `test-duration-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Use widget-specific filters from context
  const {
    selectedProduct,
    setSelectedProduct,
    selectedSerialNumber,
    setSelectedSerialNumber,
    getFilteredProps
  } = useWidgetFilters(instanceId)

  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [serialNumberOptions, setSerialNumberOptions] = useState<SerialNumberOption[]>([])
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [serialNumbersLoading, setSerialNumbersLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load product options on component mount
  useEffect(() => {
    console.log(`TestDurationWidget ${instanceId}: Loading product options`)
    
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
      }
    }

    loadProductOptions()
  }, [instanceId])

  // Load serial numbers when product is selected
  useEffect(() => {
    const loadSerialNumbers = async () => {
      if (!selectedProduct) {
        setSerialNumberOptions([])
        setSelectedSerialNumber(null)
        return
      }

      console.log(`TestDurationWidget ${instanceId}: Loading serial numbers for product ${selectedProduct}`)

      setSerialNumbersLoading(true)

      try {
        const serialNumbers = await api.get<SerialNumberOption[]>(`/data/products/${selectedProduct}/serial-numbers`)
        setSerialNumberOptions(serialNumbers)
        // Only set default if no serial number is currently selected
        if (serialNumbers.length > 0 && !selectedSerialNumber) {
          setSelectedSerialNumber(serialNumbers[0].serial_number)
        }
      } catch (err) {
        console.error(`Error loading serial numbers for ${instanceId}:`, err)
        setSerialNumberOptions([])
        setSelectedSerialNumber(null)
      } finally {
        setSerialNumbersLoading(false)
      }
    }

    loadSerialNumbers()
  }, [selectedProduct, instanceId])

  // Load widget data when product or serial number is selected
  useEffect(() => {
    const loadWidgetData = async () => {
      if (!selectedProduct) return

      console.log(`TestDurationWidget ${instanceId}: Loading data for product ${selectedProduct}, serial: ${selectedSerialNumber}`)

      setLoading(true)
      setError(null)

      try {
        // Use shared filters with fallback to props
        const filterProps = getFilteredProps()
        const filters: any = {
          urun_id: selectedProduct,
          date_from: dateFrom || filterProps.dateFrom,
          date_to: dateTo || filterProps.dateTo
        }

        // Add serial number to filters if selected
        if (selectedSerialNumber) {
          filters.seri_no = selectedSerialNumber
        }

        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'test_duration',
          filters
        })
        setWidgetData(data)
      } catch (err) {
        setError('Failed to load widget data')
        console.error(`Error loading widget data for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedSerialNumber, instanceId, dateFrom, dateTo])

  const handleProductChange = (productId: number) => {
    setSelectedProduct(productId)
  }

  const handleSerialNumberChange = (serialNumber: string) => {
    setSelectedSerialNumber(serialNumber)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading test duration data...</p>
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
          <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Test Süre Analizi</h3>
        </div>
        <div className="flex items-center space-x-3">
          <ProductDropdown
            options={productOptions}
            selectedValue={selectedProduct}
            onSelect={handleProductChange}
            placeholder="Ürün Seçin"
          />
          <SerialNumberDropdown
            options={serialNumberOptions}
            selectedValue={selectedSerialNumber}
            onSelect={handleSerialNumberChange}
            placeholder="Seri no ara..."
            loading={serialNumbersLoading}
          />
        </div>
      </div>

      {/* Content - 1 row 2 columns */}
      {widgetData ? (
        <div className="grid grid-cols-2 gap-3 h-3/4">
          {/* Left Column - First Pass Percentage */}
          <div className="bg-orange-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600 mb-1">
                {widgetData.first_pass_percentage.toFixed(1)}%
              </div>
              <div className="text-xs font-medium text-orange-800 mb-1">İlk Geçiş Yüzdesi</div>
              <div className="text-xs text-orange-600">
                {widgetData.summary.first_pass_count} / {widgetData.summary.total_test_combinations} test
              </div>
            </div>
          </div>

          {/* Right Column - Average Duration */}
          <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
            <div className="text-center">
              <div className="text-xl font-bold text-blue-600 mb-1">
                {widgetData.summary.average_duration_formatted}
              </div>
              <div className="text-xs font-medium text-blue-800 mb-1">Ortalama Test Süresi</div>
              <div className="text-xs text-blue-600">
                Toplam: {widgetData.total_duration_formatted}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-500">
            <p>No data available</p>
            <p className="text-sm">Select a product to view test duration analysis</p>
          </div>
        </div>
      )}

      
    </div>
  )
}
