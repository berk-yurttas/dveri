"use client"

import React, { useState, useEffect, useRef } from "react"
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { api } from "@/lib/api"

// Widget configuration
AselsanSivasWidget.config = {
  id: "aselsan_sivas-widget",
  name: "Aselsan Sivas - Üretim Kokpiti",
  type: "aselsan_sivas",
  color: "bg-blue-600",
  description: "Aselsan Sivas cihaz bilgi ve iş planı takibi",
  size: { width: 6, height: 6, minHeight: 4 }
}

// TypeScript interfaces
interface DeviceData {
  PRODUCTCODE: string
  ORDERNO: number
  WORKPLAINID: number
  DESCRIPTION: string
  DevicesInProduction: number
  DevicesWithDowntime: number
}

interface ProductionStatusData {
  PRODUCT_KEY: string
  PRODUCT: string
  SERIALNO: string
  REVISION: string
  WORKORDERID: number
  LAST_UPDATE_DATE: string
  STATUS_TYPE: string
  CURRENT_STEP: string
  ISSTOPPED: boolean
  STOPREASON: number | null
  STOPDESCRIPTION: number | null
  RECORD_TYPE: string
}

interface CompletedProductionData {
  KEY: string
  TYPE: string
  PRODUCTCODE: string
  SERIALNO: string
  WORKORDERNO: number
  COMPLETEDDATE: string
}

interface WidgetData {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface AselsanSivasWidgetProps {
  widgetId?: string
}

export function AselsanSivasWidget({ widgetId }: AselsanSivasWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `aselsan-sivas-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return {
      selectedProductCode: ''
    }
    try {
      const stored = localStorage.getItem(`aselsan-sivas-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : {
        selectedProductCode: ''
      }
    } catch {
      return {
        selectedProductCode: ''
      }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedProductCode, setSelectedProductCode] = useState<string>(initialFilters.selectedProductCode)
  const [productCodeOptions, setProductCodeOptions] = useState<string[]>([])
  const [showProductCodeDropdown, setShowProductCodeDropdown] = useState(false)

  // State for production status table filters and sorting
  const [productFilter, setProductFilter] = useState<string>('')
  const [productKeyFilter, setProductKeyFilter] = useState<string>('')
  const [serialNoFilter, setSerialNoFilter] = useState<string>('')
  const [stepFilter, setStepFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [stopReasonFilter, setStopReasonFilter] = useState<string>('')
  const [stopDescFilter, setStopDescFilter] = useState<string>('')
  const [sortColumn, setSortColumn] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [showFilterColumn, setShowFilterColumn] = useState<string | null>(null)

  // State for widget data and loading
  const [deviceData, setDeviceData] = useState<DeviceData[]>([])
  const [productionStatusData, setProductionStatusData] = useState<ProductionStatusData[]>([])
  const [completedProductionData, setCompletedProductionData] = useState<CompletedProductionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`aselsan-sivas-filters-${instanceId}`, JSON.stringify({
        selectedProductCode
      }))
    }
  }, [selectedProductCode, instanceId])

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [deviceResponse, statusResponse, completedResponse] = await Promise.all([
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "PRODUCTCODE", "ORDERNO", "WORKPLAINID", "DESCRIPTION", "DevicesInProduction", "DevicesWithDowntime" FROM mes_production.aselsan_sivas_is_plan_cihaz_bilgi_ ORDER BY "ORDERNO"'
          }),
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "PRODUCT_KEY", "PRODUCT", "SERIALNO", "REVISION", "WORKORDERID", "LAST_UPDATE_DATE", "STATUS_TYPE", "CURRENT_STEP", "ISSTOPPED", "STOPREASON", "STOPDESCRIPTION", "RECORD_TYPE" FROM mes_production.aselsan_sivas_uretim_durumlari_ ORDER BY "PRODUCT"'
          }),
          api.post<WidgetData>('/reports/preview', {
            sql_query: 'SELECT "KEY", "TYPE", "PRODUCTCODE", "SERIALNO", "WORKORDERNO", "COMPLETEDDATE" FROM mes_production.aselsan_sivas_biten_uretimler_ ORDER BY "COMPLETEDDATE" DESC'
          })
        ])

        if (deviceResponse.success && deviceResponse.data && deviceResponse.data.length > 0) {
          const transformed = deviceResponse.data.map(row => ({
            PRODUCTCODE: row[0],
            ORDERNO: Number(row[1]) || 0,
            WORKPLAINID: Number(row[2]) || 0,
            DESCRIPTION: row[3],
            DevicesInProduction: Number(row[4]) || 0,
            DevicesWithDowntime: Number(row[5]) || 0
          }))
          setDeviceData(transformed)

          // Extract unique product codes
          const productCodes = deviceResponse.data.map(row => row[0]).filter(Boolean)
          setProductCodeOptions(Array.from(new Set(productCodes)).sort())
        }

        if (statusResponse.success && statusResponse.data && statusResponse.data.length > 0) {
          const transformed = statusResponse.data.map(row => ({
            PRODUCT_KEY: row[0],
            PRODUCT: row[1],
            SERIALNO: row[2],
            REVISION: row[3],
            WORKORDERID: Number(row[4]) || 0,
            LAST_UPDATE_DATE: row[5],
            STATUS_TYPE: row[6],
            CURRENT_STEP: row[7],
            ISSTOPPED: row[8],
            STOPREASON: row[9] ? Number(row[9]) : null,
            STOPDESCRIPTION: row[10] ? Number(row[10]) : null,
            RECORD_TYPE: row[11]
          }))
          setProductionStatusData(transformed)
        }

        if (completedResponse.success && completedResponse.data && completedResponse.data.length > 0) {
          const transformed = completedResponse.data.map(row => ({
            KEY: row[0],
            TYPE: row[1],
            PRODUCTCODE: row[2],
            SERIALNO: row[3],
            WORKORDERNO: Number(row[4]) || 0,
            COMPLETEDDATE: row[5]
          }))
          setCompletedProductionData(transformed)
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

  // Filter data based on selections
  const filteredData = deviceData.filter(item => {
    return selectedProductCode === '' || item.PRODUCTCODE === selectedProductCode
  })

  // Get unique descriptions ordered by ORDERNO
  const uniqueDescriptions = Array.from(
    new Set(
      deviceData
        .sort((a, b) => a.ORDERNO - b.ORDERNO)
        .map(item => item.DESCRIPTION)
    )
  )

  // Aggregate data by DESCRIPTION
  const aggregatedData = uniqueDescriptions.map(description => {
    const itemsForDescription = filteredData.filter(item => item.DESCRIPTION === description)

    return {
      description,
      devicesInProduction: itemsForDescription.reduce((sum, item) => sum + item.DevicesInProduction, 0),
      devicesWithDowntime: itemsForDescription.reduce((sum, item) => sum + item.DevicesWithDowntime, 0)
    }
  })

  // Filter and sort production status data
  const filteredStatusData = productionStatusData.filter(item => {
    const matchesProduct = productFilter === '' || item.PRODUCT.toLowerCase().includes(productFilter.toLowerCase())
    const matchesProductKey = productKeyFilter === '' || item.PRODUCT_KEY.toLowerCase().includes(productKeyFilter.toLowerCase())
    const matchesSerialNo = serialNoFilter === '' || item.SERIALNO.toLowerCase().includes(serialNoFilter.toLowerCase())
    const matchesStep = stepFilter === '' || item.CURRENT_STEP.toLowerCase().includes(stepFilter.toLowerCase())
    const matchesStatus = statusFilter === '' || (
      statusFilter === 'durus' ? item.ISSTOPPED : !item.ISSTOPPED
    )
    const matchesStopReason = stopReasonFilter === '' || (
      item.STOPREASON !== null && String(item.STOPREASON).toLowerCase().includes(stopReasonFilter.toLowerCase())
    )
    const matchesStopDesc = stopDescFilter === '' || (
      item.STOPDESCRIPTION !== null && String(item.STOPDESCRIPTION).toLowerCase().includes(stopDescFilter.toLowerCase())
    )
    return matchesProduct && matchesProductKey && matchesSerialNo && matchesStep && matchesStatus && matchesStopReason && matchesStopDesc
  })

  // Sort production status data
  const sortedStatusData = [...filteredStatusData].sort((a, b) => {
    if (!sortColumn) return 0

    let aValue: any = a[sortColumn as keyof ProductionStatusData]
    let bValue: any = b[sortColumn as keyof ProductionStatusData]

    // Handle null values
    if (aValue === null) aValue = ''
    if (bValue === null) bValue = ''

    // Convert to string for comparison
    aValue = String(aValue).toLowerCase()
    bValue = String(bValue).toLowerCase()

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Handle sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Prepare chart data from completed production and device data
  // Production Realization Graph - weekly completed and ongoing devices
  const prepareProductionRealizationData = () => {
    // Helper function to get week number from date
    const getWeekNumber = (date: Date): string => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
      const dayNum = d.getUTCDay() || 7
      d.setUTCDate(d.getUTCDate() + 4 - dayNum)
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
      const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
      return `Hafta ${weekNo}`
    }

    // Group by week
    const weeklyData: { [key: string]: { tamamlandi: number, devam: number } } = {}

    // Count completed devices by week
    completedProductionData.forEach(item => {
      if (item.TYPE === 'Tamamlandi') {
        const completedDate = new Date(item.COMPLETEDDATE)
        const week = getWeekNumber(completedDate)
        if (!weeklyData[week]) {
          weeklyData[week] = { tamamlandi: 0, devam: 0 }
        }
        weeklyData[week].tamamlandi++
      }
    })

    // Count ongoing devices by week (using LAST_UPDATE_DATE)
    productionStatusData.forEach(item => {
      if (item.ISSTOPPED === false) {
        const updateDate = new Date(item.LAST_UPDATE_DATE)
        const week = getWeekNumber(updateDate)
        if (!weeklyData[week]) {
          weeklyData[week] = { tamamlandi: 0, devam: 0 }
        }
        weeklyData[week].devam++
      }
    })

    // Sort by week number
    return Object.entries(weeklyData)
      .sort((a, b) => {
        const weekA = parseInt(a[0].replace('Hafta ', ''))
        const weekB = parseInt(b[0].replace('Hafta ', ''))
        return weekA - weekB
      })
      .map(([week, data]) => ({
        hafta: week,
        'Devam': data.devam,
        'Tamamlandı': data.tamamlandi
      }))
  }

  // Production Delay Status - bar chart by step
  const prepareDelayStatusData = () => {
    // Get all unique steps from device data (DESCRIPTION field represents steps)
    const allSteps = Array.from(new Set(deviceData.map(d => d.DESCRIPTION)))
    const stepCounts: { [key: string]: { devam: number, durus: number } } = {}

    // Initialize all steps with 0 counts
    allSteps.forEach(step => {
      stepCounts[step] = { devam: 0, durus: 0 }
    })

    // Count actual data
    productionStatusData.forEach(item => {
      const step = item.CURRENT_STEP
      if (!stepCounts[step]) {
        stepCounts[step] = { devam: 0, durus: 0 }
      }
      if (item.ISSTOPPED) {
        stepCounts[step].durus++
      } else {
        stepCounts[step].devam++
      }
    })

    return Object.entries(stepCounts).map(([step, counts]) => ({
      name: step,
      'DEVAM EDİYOR': counts.devam,
      'DURUŞ': counts.durus
    }))
  }

  // Delay Reason Distribution - pie chart
  const prepareDelayReasonData = () => {
    const reasons: { [key: string]: number } = {}

    productionStatusData.filter(item => item.ISSTOPPED).forEach(item => {
      const reason = item.STOPREASON?.toString() || 'Diğer'
      reasons[reason] = (reasons[reason] || 0) + 1
    })

    return Object.entries(reasons).map(([reason, count]) => ({
      name: `Duruş Nedeni ${reason}`,
      value: count
    }))
  }

  // Prepare weekly completion data
  const prepareWeeklyCompletionData = () => {
    const productCounts: { [key: string]: number } = {}
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    completedProductionData.forEach(item => {
      const completedDate = new Date(item.COMPLETEDDATE)
      // Only count items completed in the last 7 days
      if (completedDate >= oneWeekAgo && completedDate <= now) {
        const product = item.PRODUCTCODE
        productCounts[product] = (productCounts[product] || 0) + 1
      }
    })

    const total = Object.values(productCounts).reduce((sum, count) => sum + count, 0)

    return [
      { name: 'Toplam', count: total },
      ...Object.entries(productCounts).map(([product, count]) => ({
        name: product,
        count
      }))
    ]
  }

  // Prepare monthly completion data
  const prepareMonthlyCompletionData = () => {
    const productCounts: { [key: string]: number } = {}
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    completedProductionData.forEach(item => {
      const completedDate = new Date(item.COMPLETEDDATE)
      // Only count items completed in the current month
      if (completedDate.getMonth() === currentMonth && completedDate.getFullYear() === currentYear) {
        const product = item.PRODUCTCODE
        productCounts[product] = (productCounts[product] || 0) + 1
      }
    })

    return Object.entries(productCounts).map(([product, count]) => ({
      name: product,
      count
    }))
  }

  const productionRealizationData = prepareProductionRealizationData()
  const delayStatusData = prepareDelayStatusData()
  const delayReasonData = prepareDelayReasonData()
  const weeklyCompletionData = prepareWeeklyCompletionData()
  const monthlyCompletionData = prepareMonthlyCompletionData()

  const COLORS = ['#8B5CF6', '#3B82F6', '#1F2937', '#EF4444']

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
          className="mt-2 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
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
          <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Aselsan Sivas - Üretim Kokpiti</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Product Code Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowProductCodeDropdown(!showProductCodeDropdown)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[180px] text-left flex items-center justify-between"
            >
              <span className="truncate">
                {selectedProductCode || 'Tüm Ürün Kodları'}
              </span>
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showProductCodeDropdown && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                <div
                  onClick={() => {
                    setSelectedProductCode('')
                    setShowProductCodeDropdown(false)
                  }}
                  className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer border-b border-gray-200 font-medium"
                >
                  ✕ Tümünü Göster
                </div>
                {productCodeOptions.map((code) => (
                  <div
                    key={code}
                    onClick={() => {
                      setSelectedProductCode(code)
                      setShowProductCodeDropdown(false)
                    }}
                    className={`px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedProductCode === code ? 'bg-blue-50 font-medium' : ''}`}
                  >
                    {code}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-shrink-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-6 py-4 text-left font-semibold text-gray-900 w-56">

              </th>
              {aggregatedData.map((item, idx) => (
                <th key={idx} className="px-6 py-4 text-center font-semibold text-gray-900">
                  {item.description}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Row 1: Devam Eden Cihazlar */}
            <tr>
              <td className="px-6 py-5 text-left font-medium text-gray-800 bg-blue-50">
                Devam Eden Cihazlar
              </td>
              {aggregatedData.map((item, idx) => (
                <td
                  key={idx}
                  className="px-6 py-5 text-center"
                >
                  {item.devicesInProduction > 0 ? (
                    <span className="text-blue-800 font-bold text-lg">
                      {item.devicesInProduction}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Row 2: Duruş Yaşanan Cihazlar */}
            <tr>
              <td className="px-6 py-5 text-left font-medium text-gray-800 bg-red-50">
                Duruş Yaşanan Cihazlar
              </td>
              {aggregatedData.map((item, idx) => (
                <td
                  key={idx}
                  className="px-6 py-5 text-center"
                >
                  {item.devicesWithDowntime > 0 ? (
                    <span className="text-red-800 font-bold text-lg">
                      {item.devicesWithDowntime}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Production Status Table - Hat Devam/Duruş Detayı */}
      {productionStatusData.length > 0 && (
        <div className="mt-6 flex-shrink-0">
          <h4 className="text-base font-semibold text-gray-800 mb-3">Hat Devam/ Duruş Detayı</h4>
          <div className="max-h-96 overflow-auto border-t border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>Tanım</span>
                      <button
                        onClick={() => handleSort('PRODUCT')}
                        className="hover:text-blue-600"
                      >
                        {sortColumn === 'PRODUCT' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </button>
                      <button
                        onClick={() => setShowFilterColumn(showFilterColumn === 'PRODUCT' ? null : 'PRODUCT')}
                        className="hover:text-blue-600"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      </button>
                    </div>
                    {showFilterColumn === 'PRODUCT' && (
                      <input
                        type="text"
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value)}
                        placeholder="Filtrele..."
                        className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>P/N</span>
                      <button
                        onClick={() => handleSort('PRODUCT_KEY')}
                        className="hover:text-blue-600"
                      >
                        {sortColumn === 'PRODUCT_KEY' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </button>
                      <button
                        onClick={() => setShowFilterColumn(showFilterColumn === 'PRODUCT_KEY' ? null : 'PRODUCT_KEY')}
                        className="hover:text-blue-600"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      </button>
                    </div>
                    {showFilterColumn === 'PRODUCT_KEY' && (
                      <input
                        type="text"
                        value={productKeyFilter}
                        onChange={(e) => setProductKeyFilter(e.target.value)}
                        placeholder="Filtrele..."
                        className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>Seri No</span>
                      <button
                        onClick={() => handleSort('SERIALNO')}
                        className="hover:text-blue-600"
                      >
                        {sortColumn === 'SERIALNO' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </button>
                      <button
                        onClick={() => setShowFilterColumn(showFilterColumn === 'SERIALNO' ? null : 'SERIALNO')}
                        className="hover:text-blue-600"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      </button>
                    </div>
                    {showFilterColumn === 'SERIALNO' && (
                      <input
                        type="text"
                        value={serialNoFilter}
                        onChange={(e) => setSerialNoFilter(e.target.value)}
                        placeholder="Filtrele..."
                        className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>İşlem Adımı</span>
                      <button
                        onClick={() => handleSort('CURRENT_STEP')}
                        className="hover:text-blue-600"
                      >
                        {sortColumn === 'CURRENT_STEP' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </button>
                      <button
                        onClick={() => setShowFilterColumn(showFilterColumn === 'CURRENT_STEP' ? null : 'CURRENT_STEP')}
                        className="hover:text-blue-600"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      </button>
                    </div>
                    {showFilterColumn === 'CURRENT_STEP' && (
                      <input
                        type="text"
                        value={stepFilter}
                        onChange={(e) => setStepFilter(e.target.value)}
                        placeholder="Filtrele..."
                        className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>Hat Devam Durumu</span>
                      <button
                        onClick={() => handleSort('ISSTOPPED')}
                        className="hover:text-blue-600"
                      >
                        {sortColumn === 'ISSTOPPED' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </button>
                      <button
                        onClick={() => setShowFilterColumn(showFilterColumn === 'ISSTOPPED' ? null : 'ISSTOPPED')}
                        className="hover:text-blue-600"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      </button>
                    </div>
                    {showFilterColumn === 'ISSTOPPED' && (
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Tümü</option>
                        <option value="durus">DURUŞ</option>
                        <option value="devam">DEVAM</option>
                      </select>
                    )}
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>Duruş Nedeni</span>
                      <button
                        onClick={() => handleSort('STOPREASON')}
                        className="hover:text-blue-600"
                      >
                        {sortColumn === 'STOPREASON' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </button>
                      <button
                        onClick={() => setShowFilterColumn(showFilterColumn === 'STOPREASON' ? null : 'STOPREASON')}
                        className="hover:text-blue-600"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      </button>
                    </div>
                    {showFilterColumn === 'STOPREASON' && (
                      <input
                        type="text"
                        value={stopReasonFilter}
                        onChange={(e) => setStopReasonFilter(e.target.value)}
                        placeholder="Filtrele..."
                        className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>Güncel Durum</span>
                      <button
                        onClick={() => handleSort('STOPDESCRIPTION')}
                        className="hover:text-blue-600"
                      >
                        {sortColumn === 'STOPDESCRIPTION' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </button>
                      <button
                        onClick={() => setShowFilterColumn(showFilterColumn === 'STOPDESCRIPTION' ? null : 'STOPDESCRIPTION')}
                        className="hover:text-blue-600"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      </button>
                    </div>
                    {showFilterColumn === 'STOPDESCRIPTION' && (
                      <input
                        type="text"
                        value={stopDescFilter}
                        onChange={(e) => setStopDescFilter(e.target.value)}
                        placeholder="Filtrele..."
                        className="mt-1 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedStatusData.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-gray-900">{item.PRODUCT}</td>
                    <td className="px-4 py-3 text-gray-700">{item.PRODUCT_KEY}</td>
                    <td className="px-4 py-3 text-gray-700">{item.SERIALNO}</td>
                    <td className="px-4 py-3 text-gray-700">{item.CURRENT_STEP}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        item.ISSTOPPED ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {item.ISSTOPPED ? 'DURUŞ' : 'DEVAM'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {item.STOPREASON !== null ? item.STOPREASON : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {item.STOPDESCRIPTION !== null ? item.STOPDESCRIPTION : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="mt-6 grid grid-cols-12 gap-4">
        {/* Left Column - 3/4 width (9 columns) */}
        <div className="col-span-9 space-y-4">
          {/* Production Realization Graph */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Üretim Gerçekleşme Grafiği</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={productionRealizationData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hafta" style={{ fontSize: '10px' }} />
                <YAxis style={{ fontSize: '10px' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="Devam" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="Tamamlandı" stroke="#10B981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Production Delay Status */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Üretim Detay Durumu (Yeni + Rework)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={delayStatusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" style={{ fontSize: '10px' }} angle={-45} textAnchor="end" height={80} />
                <YAxis style={{ fontSize: '10px' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="DEVAM EDİYOR" fill="#3B82F6" label={{ position: 'top', fontSize: 10 }} />
                <Bar dataKey="DURUŞ" fill="#EF4444" label={{ position: 'top', fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Completion Tables side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Weekly Completion Table */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Haftalık Cihaz Tamamlanma Durumu (Yeni + Rework)</h4>
              <div className="overflow-auto max-h-32">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Tanım</th>
                      <th className="px-3 py-2 text-right font-medium border-b border-gray-200">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyCompletionData.map((item, index) => (
                      <tr key={index} className={index === 0 ? 'bg-gray-50' : ''}>
                        <td className="px-3 py-2 text-left border-b border-gray-100">{item.name}</td>
                        <td className="px-3 py-2 text-right border-b border-gray-100">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Monthly Completion Table */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">Aylık Cihaz Tamamlanma Durumu (Yeni + Rework)</h4>
              <div className="overflow-auto max-h-32">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Tanım</th>
                      <th className="px-3 py-2 text-right font-medium border-b border-gray-200">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyCompletionData.map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-left border-b border-gray-100">{item.name}</td>
                        <td className="px-3 py-2 text-right border-b border-gray-100">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Aktif Duran İş Listesi */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Aktif Duran İş Listesi</h4>
            <div className="overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Parça No</th>
                    <th className="px-3 py-2 text-right font-medium border-b border-gray-200">Planlanan Üretim Adedi</th>
                    <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Hata Nedeni</th>
                    <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Hata Açıklaması</th>
                    <th className="px-3 py-2 text-right font-medium border-b border-gray-200">Durma Gün Sayısı</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-500 border-b border-gray-100">
                      Veri bulunamadı
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - 1/4 width (3 columns) */}
        <div className="col-span-3 space-y-4">
          {/* Summary Cards */}
          <div className="bg-purple-500 rounded-lg p-4 text-white flex flex-col items-center justify-center">
            <div className="text-3xl font-bold">
              {completedProductionData.filter(d => d.TYPE === 'Tamamlandi').length}
            </div>
            <div className="text-xs mt-1 text-center">Toplam Üretilen Cihaz Sayısı</div>
          </div>
          <div className="bg-blue-500 rounded-lg p-4 text-white flex flex-col items-center justify-center">
            <div className="text-3xl font-bold">
              {completedProductionData.filter(d => {
                const completedDate = new Date(d.COMPLETEDDATE)
                const currentYear = new Date().getFullYear()
                return completedDate.getFullYear() === currentYear && d.TYPE === 'Tamamlandi'
              }).length}
            </div>
            <div className="text-xs mt-1 text-center">Bu Yıl Tamamlanan Yeni Cihaz Sayısı</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-green-600">
              {completedProductionData.filter(d => {
                const completedDate = new Date(d.COMPLETEDDATE)
                const now = new Date()
                return completedDate.getMonth() === now.getMonth() && 
                       completedDate.getFullYear() === now.getFullYear() && 
                       d.TYPE === 'Tamamlandi'
              }).length}
            </div>
            <div className="text-xs mt-1 text-center">Bu Ay Tamamlanan Yeni Cihaz Sayısı</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-gray-600">
              {completedProductionData.filter(d => {
                const completedDate = new Date(d.COMPLETEDDATE)
                const now = new Date()
                const startOfWeek = new Date(now)
                startOfWeek.setDate(now.getDate() - now.getDay()) // Start of week (Sunday)
                startOfWeek.setHours(0, 0, 0, 0)
                const endOfWeek = new Date(startOfWeek)
                endOfWeek.setDate(startOfWeek.getDate() + 6)
                endOfWeek.setHours(23, 59, 59, 999)
                return completedDate >= startOfWeek && 
                       completedDate <= endOfWeek && 
                       d.TYPE === 'Tamamlandi'
              }).length}
            </div>
            <div className="text-xs mt-1 text-center">Bu Hafta Üretilen Cihaz Sayısı</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-red-600">
              {productionStatusData.filter(d => d.ISSTOPPED === false).length}
            </div>
            <div className="text-xs mt-1 text-center">Hatta Devam Eden Cihaz Sayısı</div>
          </div>

          {/* Delay Reason Distribution */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Duruş Nedeni Dağılımı (Yeni + Rework)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={delayReasonData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {delayReasonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
