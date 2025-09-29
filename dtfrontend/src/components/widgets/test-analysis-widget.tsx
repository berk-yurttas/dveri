"use client"

import { useState, useEffect, useRef } from "react"
import { ProductDropdown } from "./product-dropdown"
import { TestNameDropdown } from "./test-name-dropdown"
import { api } from "@/lib/api"

// Widget yapılandırması
TestAnalysisWidget.config = {
  id: "test-analysis-widget",
  name: "Test Analizi",
  type: "test_analysis",
  color: "bg-purple-500",
  description: "Belirli bir test için seri numaralarına göre analiz",
  size: { width: 2, height: 2 }
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

interface SerialResult {
  seri_no: string
  total: number
  passed: number
  failed: number
  pass_ratio: number
  fail_ratio: number
  first_pass: boolean
}

interface WidgetData {
  urun_id: number
  test_adi: string
  stok_no: string
  serial_results: SerialResult[]
  summary: {
    total_tests: number
    total_passed: number
    overall_pass_ratio: number
    first_pass_serials: number
    first_pass_ratio: number
    total_serials: number
  }
}

interface TestAnalysisWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function TestAnalysisWidget({ widgetId, dateFrom, dateTo }: TestAnalysisWidgetProps) {
  // Create unique instance identifier to ensure state isolation
  const instanceRef = useRef(widgetId || `test-analysis-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current
  
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [testNameOptions, setTestNameOptions] = useState<TestNameOption[]>([])
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null)
  const [selectedTestName, setSelectedTestName] = useState<string | null>(null)
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [testNamesLoading, setTestNamesLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load product options on component mount
  useEffect(() => {
    console.log(`TestAnalysisWidget ${instanceId}: Loading product options`)
    
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

  // Load test names when product is selected
  useEffect(() => {
    const loadTestNames = async () => {
      if (!selectedProduct) {
        setTestNameOptions([])
        setSelectedTestName(null)
        return
      }

      console.log(`TestAnalysisWidget ${instanceId}: Loading test names for product ${selectedProduct}`)
      
      setTestNamesLoading(true)
      setSelectedTestName(null)
      setWidgetData(null)

      try {
        const testNames = await api.get<TestNameOption[]>(`/data/products/${selectedProduct}/test-names`)
        setTestNameOptions(testNames)
        // Select first test by default
        if (testNames.length > 0) {
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

  // Load widget data when both product and test name are selected
  useEffect(() => {
    const loadWidgetData = async () => {
      if (!selectedProduct || !selectedTestName) {
        setWidgetData(null)
        return
      }

      console.log(`TestAnalysisWidget ${instanceId}: Loading data for product ${selectedProduct}, test ${selectedTestName}`)
      
      setDataLoading(true)
      setError(null)

      try {
        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'test_analysis',
          filters: {
            urun_id: selectedProduct,
            test_adi: selectedTestName,
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
  }, [selectedProduct, selectedTestName, instanceId])

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
          className="mt-2 px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Yeniden Dene
        </button>
      </div>
    )
  }

  // Show empty state if no data
  if (!widgetData && !dataLoading && selectedProduct && selectedTestName) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
            <h3 className="text-lg font-semibold text-gray-800">Test Analizi</h3>
          </div>
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
          </div>
        </div>
        
        {/* Empty state content */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">Test verisi bulunamadı</p>
          <p className="text-xs text-gray-500 text-center">
            Seçilen ürün ve test için veri bulunmuyor
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full max-h-[555.5px] p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Test Analizi</h3>
        </div>
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
        </div>
      </div>

      {dataLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
          <span className="ml-2 text-sm text-gray-600">Test analizi yükleniyor...</span>
        </div>
      ) : widgetData ? (
        <>
          {/* Summary Section - Fixed Height */}
          <div className="h-20 flex-shrink-0 grid grid-cols-4 gap-2 mb-4">
            {/* Overall Pass Ratio */}
            <div className="bg-purple-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-purple-600">
                {widgetData.summary.overall_pass_ratio}%
              </div>
              <div className="text-xs font-medium text-purple-800 text-center">
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

            {/* Total Serials */}
            <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-blue-600">
                {widgetData.summary.total_serials}
              </div>
              <div className="text-xs font-medium text-blue-800 text-center">
                Seri No
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
          </div>

          {/* Serial Results Section - Scrollable */}
          <div className="flex-1 flex flex-col min-h-0">
            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex-shrink-0">
              Seri No Detayları ({widgetData.test_adi})
            </h4>
            
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-1">
                {widgetData.serial_results.map((serial, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded flex-shrink-0">
                    <div className="flex items-center space-x-2 flex-1">
                      <div className={`w-3 h-3 rounded-full ${serial.first_pass ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <span className="text-xs font-medium text-gray-900">{serial.seri_no}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-center">
                        <div className="text-xs font-bold text-red-600">{serial.failed}/{serial.total}</div>
                        <div className="text-xs text-red-600">başarısız</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-xs font-bold ${serial.fail_ratio === 0 ? 'text-green-600' : serial.fail_ratio <= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {serial.fail_ratio.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-600">oran</div>
                      </div>
                      {serial.first_pass && (
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
