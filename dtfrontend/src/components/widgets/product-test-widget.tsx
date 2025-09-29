"use client"

import { useState, useEffect, useRef } from "react"
import { ProductDropdown } from "./product-dropdown"
import { SerialNumberDropdown } from "./serial-number-dropdown"
import { api } from "@/lib/api"

// Widget yapılandırması
ProductTestWidget.config = {
  id: "product-test-widget",
  name: "Ürün Test Analizi",
  type: "product_test",
  color: "bg-blue-500",
  description: "Ürün bazlı test sonuçları ve ilk geçiş analizi",
  size: { width: 2, height: 2 }
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

interface TestResult {
  test_name: string
  total: number
  passed: number
  pass_ratio: number
  first_pass: boolean
}

interface WidgetData {
  urun_id: number
  seri_no: string
  stok_no: string
  test_results: TestResult[]
  summary: {
    total_tests: number
    total_passed: number
    overall_pass_ratio: number
    first_pass_tests: number
    first_pass_ratio: number
  }
}

interface ProductTestWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function ProductTestWidget({ widgetId, dateFrom, dateTo }: ProductTestWidgetProps) {
  // Create unique instance identifier to ensure state isolation
  const instanceRef = useRef(widgetId || `product-test-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current
  
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [serialOptions, setSerialOptions] = useState<SerialNumberOption[]>([])
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null)
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null)
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [serialLoading, setSerialLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load product options on component mount
  useEffect(() => {
    console.log(`ProductTestWidget ${instanceId}: Loading product options`)
    
    const loadProductOptions = async () => {
      try {
        const options = await api.get<ProductOption[]>('/data/products')
        setProductOptions(options)
        // Select first option by default
        if (options.length > 0) {
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

  // Load serial numbers when product is selected
  useEffect(() => {
    const loadSerialNumbers = async () => {
      if (!selectedProduct) {
        setSerialOptions([])
        setSelectedSerial(null)
        return
      }

      console.log(`ProductTestWidget ${instanceId}: Loading serial numbers for product ${selectedProduct}`)
      
      setSerialLoading(true)
      setSelectedSerial(null)
      setWidgetData(null)

      try {
        const serials = await api.get<SerialNumberOption[]>(`/data/products/${selectedProduct}/serial-numbers`)
        setSerialOptions(serials)
        // Select first serial by default
        if (serials.length > 0 && serials[0].serial_number !== "No serial numbers available") {
          setSelectedSerial(serials[0].serial_number)
        }
      } catch (err) {
        setError('Failed to load serial numbers')
        console.error(`Error loading serial numbers for ${instanceId}:`, err)
      } finally {
        setSerialLoading(false)
      }
    }

    loadSerialNumbers()
  }, [selectedProduct, instanceId])

  // Load widget data when both product and serial are selected
  useEffect(() => {
    const loadWidgetData = async () => {
      if (!selectedProduct || !selectedSerial || selectedSerial === "No serial numbers available") {
        setWidgetData(null)
        return
      }

      console.log(`ProductTestWidget ${instanceId}: Loading data for product ${selectedProduct}, serial ${selectedSerial}`)
      
      setDataLoading(true)
      setError(null)

      try {
        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'product_test',
          filters: {
            urun_id: selectedProduct,
            seri_no: selectedSerial,
            date_from: '2025-08-01 00:00:00',
            date_to: '2025-09-01 23:59:59'
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
  }, [selectedProduct, selectedSerial, instanceId])

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

  // Show empty state if no data
  if (!widgetData && !dataLoading && selectedProduct && selectedSerial) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <h3 className="text-lg font-semibold text-gray-800">Ürün Test Analizi</h3>
          </div>
          <div className="flex space-x-2">
            <ProductDropdown
              options={productOptions}
              selectedValue={selectedProduct}
              onSelect={setSelectedProduct}
              placeholder="Ürün ara..."
              className="w-32"
            />
            <SerialNumberDropdown
              options={serialOptions}
              selectedValue={selectedSerial}
              onSelect={setSelectedSerial}
              placeholder="Seri no ara..."
              className="w-32"
              loading={serialLoading}
            />
          </div>
        </div>
        
        {/* Empty state content */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">Test verisi bulunamadı</p>
          <p className="text-xs text-gray-500 text-center">
            Seçilen ürün ve seri no için test verisi bulunmuyor
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Ürün Test Analizi</h3>
        </div>
        <div className="flex space-x-2">
          <ProductDropdown
            options={productOptions}
            selectedValue={selectedProduct}
            onSelect={setSelectedProduct}
            placeholder="Ürün ara..."
            className="w-32"
          />
          <SerialNumberDropdown
            options={serialOptions}
            selectedValue={selectedSerial}
            onSelect={setSelectedSerial}
            placeholder="Seri no ara..."
            className="w-32"
            loading={serialLoading}
          />
        </div>
      </div>

      {dataLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm text-gray-600">Test verileri yükleniyor...</span>
        </div>
      ) : widgetData ? (
        <>
          {/* Summary Section - Fixed Height */}
          <div className="h-20 flex-shrink-0 grid grid-cols-4 gap-2 mb-4">
            {/* Overall Pass Ratio */}
            <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-blue-600">
                {widgetData.summary.overall_pass_ratio}%
              </div>
              <div className="text-xs font-medium text-blue-800 text-center">
                Genel Başarı
              </div>
            </div>

            {/* First Pass Ratio */}
            <div className="bg-green-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-green-600">
                {widgetData.summary.first_pass_ratio}%
              </div>
              <div className="text-xs font-medium text-green-800 text-center">
                İlk Geçiş
              </div>
            </div>

            {/* Total Tests */}
            <div className="bg-gray-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-gray-600">
                {widgetData.summary.total_tests}
              </div>
              <div className="text-xs font-medium text-gray-800 text-center">
                Toplam Test
              </div>
            </div>

            {/* Passed Tests */}
            <div className="bg-purple-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-purple-600">
                {widgetData.summary.total_passed}
              </div>
              <div className="text-xs font-medium text-purple-800 text-center">
                Başarılı
              </div>
            </div>
          </div>

          {/* Test Results Section - Scrollable */}
          <div className="flex-1 flex flex-col min-h-0">
            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex-shrink-0">Test Detayları</h4>
            
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-1">
                {widgetData.test_results.map((test, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded flex-shrink-0">
                    <div className="flex items-center space-x-2 flex-1">
                      <div className={`w-3 h-3 rounded-full ${test.first_pass ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <span className="text-xs font-medium text-gray-900 truncate">{test.test_name}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-center">
                        <div className="text-xs font-bold text-gray-900">{test.passed}/{test.total}</div>
                        <div className="text-xs text-gray-600">geçen</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-xs font-bold ${test.pass_ratio === 100 ? 'text-green-600' : test.pass_ratio >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {test.pass_ratio.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-600">oran</div>
                      </div>
                      {test.first_pass && (
                        <div className="text-center">
                          <div className="text-xs font-bold text-green-600">✓</div>
                          <div className="text-xs text-green-600">İlk</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
