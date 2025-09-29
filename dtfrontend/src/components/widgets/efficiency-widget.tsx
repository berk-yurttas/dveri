"use client"

import { useState, useEffect, useRef } from "react"
import { InfrastructureDropdown } from "./infrastructure-dropdown"
import { api } from "@/lib/api"

// Widget yapılandırması
EfficiencyWidget.config = {
  id: "efficiency-widget",
  name: "Üretim Verimliliği",
  type: "efficiency",
  color: "bg-green-500",
  description: "Verimlilik yüzdesi, toplam test edilen ürünler ve en başarısız 5 ürün",
  size: { width: 2, height: 2 }
}

// TypeScript interfaces
interface InfrastructureOption {
  id: number
  name: string
  value: number
}

interface WidgetData {
  infrastructure_id: string
  infrastructure_name: string
  efficiency_percentage: number
  total_tested_products: number
  pass_percentage: number
  top_failed_products: Array<{
    name: string
    fail_count: number
    fail_percentage: number
  }>
}

interface EfficiencyWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function EfficiencyWidget({ widgetId, dateFrom, dateTo }: EfficiencyWidgetProps) {
  // Create unique instance identifier to ensure state isolation
  const instanceRef = useRef(widgetId || `efficiency-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current
  
  const [infrastructureOptions, setInfrastructureOptions] = useState<InfrastructureOption[]>([])
  const [selectedInfra, setSelectedInfra] = useState<number | null>(null)
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load infrastructure options on component mount
  useEffect(() => {
    console.log(`EfficiencyWidget ${instanceId}: Loading infrastructure options`)
    
    const loadInfrastructureOptions = async () => {
      try {
        const options = await api.get<InfrastructureOption[]>('/data/infrastructure')
        setInfrastructureOptions(options)
        // Select first option by default
        if (options.length > 0) {
          setSelectedInfra(options[0].value)
        }
      } catch (err) {
        setError('Failed to load infrastructure options')
        console.error(`Error loading infrastructure for ${instanceId}:`, err)
      }
    }

    loadInfrastructureOptions()
  }, [instanceId])

  // Load widget data when infrastructure is selected
  useEffect(() => {
    const loadWidgetData = async () => {
      if (!selectedInfra) return

      console.log(`EfficiencyWidget ${instanceId}: Loading data for infrastructure ${selectedInfra}`)
      
      setLoading(true)
      setError(null)

      try {
        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'efficiency',
          filters: {
            infrastructure_id: selectedInfra,
            date_from: dateFrom || '2025-08-01 00:00:00',
            date_to: dateTo || '2025-09-01 23:59:59'
          }
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
  }, [selectedInfra, instanceId, dateFrom, dateTo])

  // Calculate derived values
  const totalFailCount = widgetData?.top_failed_products?.reduce((sum, product) => sum + product.fail_count, 0) || 0
  const averageFailPercentage = widgetData?.top_failed_products?.length 
    ? widgetData.top_failed_products.reduce((sum, product) => sum + product.fail_percentage, 0) / widgetData.top_failed_products.length
    : 0

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
  if (!widgetData) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <p className="text-sm text-gray-600 text-center">Veri bulunamadı</p>
      </div>
    )
  }

  // Check if data is essentially empty (all zeros)
  const isEmptyData = widgetData.total_tested_products === 0 && 
                      widgetData.efficiency_percentage === 0 && 
                      (!widgetData.top_failed_products || widgetData.top_failed_products.length === 0)

  if (isEmptyData) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <h3 className="text-lg font-semibold text-gray-800">Test Sonuçları Özeti</h3>
          </div>
          <InfrastructureDropdown
            options={infrastructureOptions}
            selectedValue={selectedInfra}
            onSelect={setSelectedInfra}
            placeholder="Test altyapısı ara..."
          />
        </div>
        
        {/* Empty state content - Fixed Height */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">Seçilen dönemde veri bulunamadı</p>
          <p className="text-xs text-gray-500 text-center">
            Cihaz için belirtilen tarih aralığında test verisi bulunmuyor
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
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Test Sonuçları Özeti</h3>
        </div>
        <InfrastructureDropdown
          options={infrastructureOptions}
          selectedValue={selectedInfra}
          onSelect={setSelectedInfra}
          placeholder="Test altyapısı ara..."
        />
      </div>

      {/* First Section: Two Columns - Fixed Height */}
      <div className="h-20 flex-shrink-0 grid grid-cols-2 gap-4 mb-4">
        {/* Efficiency Percentage */}
        <div className="bg-green-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-green-600 mb-1">
            {widgetData.efficiency_percentage.toFixed(1)}%
          </div>
          <div className="text-xs font-medium text-green-800 text-center">
            Verimlilik Oranı
          </div>
        </div>

        {/* Pass/Fail Percentage */}
        <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-blue-600 mb-1">
            {widgetData.pass_percentage.toFixed(1)}%
          </div>
          <div className="text-xs font-medium text-blue-800 text-center mb-1">
            Testten Geçme Oranı
          </div>
          <div className="text-xs text-blue-700 text-center">
            {Math.round((widgetData.pass_percentage / 100) * widgetData.total_tested_products)} / {widgetData.total_tested_products.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Second Section: Top 5 Failed Products - Fixed Height with Scroll */}
      <div className="flex-1 flex flex-col min-h-0">
        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex-shrink-0">En Başarısız 5 Ürün</h4>
        
        {/* Products List - Fixed Height with Scroll */}
        <div className="flex-1 overflow-y-auto mb-3">
          <div className="space-y-1">
            {widgetData.top_failed_products && widgetData.top_failed_products.length > 0 ? (
              widgetData.top_failed_products.map((product, index) => (
                <div key={index} className="flex items-center justify-between p-1 bg-red-50 rounded flex-shrink-0">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-red-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-red-600">{index + 1}</span>
                    </div>
                    <span className="text-xs font-medium text-gray-900">{product.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-12 text-center">
                      <div className="text-xs font-bold text-red-600">{product.fail_count}</div>
                      <div className="text-xs text-red-500 whitespace-nowrap">hata</div>
                    </div>
                    <div className="w-12 text-center">
                      <div className="text-xs font-bold text-red-600">{product.fail_percentage.toFixed(1)}%</div>
                      <div className="text-xs text-red-500 whitespace-nowrap">oran</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-sm text-gray-500 py-4">
                Başarısız ürün bulunamadı
              </div>
            )}
          </div>
        </div>

        {/* Summary Statistics - Fixed Height */}
        <div className="h-12 flex-shrink-0 border-t pt-2 border-gray-100">
          <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
            <div className="text-xs font-medium text-gray-700">Toplam Özet:</div>
            <div className="flex items-center space-x-3">
              <div className="w-16 text-center">
                <div className="text-xs font-bold text-gray-900">{totalFailCount}</div>
                <div className="text-xs text-gray-600 whitespace-nowrap">Toplam Hata</div>
              </div>
              <div className="w-16 text-center">
                <div className="text-xs font-bold text-gray-900">{averageFailPercentage.toFixed(1)}%</div>
                <div className="text-xs text-gray-600 whitespace-nowrap">Ort. Oran</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

