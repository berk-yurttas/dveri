"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { api } from "@/lib/api"
import { useWidgetFilters } from "@/contexts/filter-context"

// Widget configuration
CapacityAnalysisWidget.config = {
  id: "capacity_analysis-widget",
  name: "Kapasite Analizi",
  type: "capacity_analysis",
  color: "bg-cyan-500",
  description: "Firma ve eksen sayısına göre kapasite analizi (oran veya çalışma süresi)",
  size: { width: 4, height: 2 }
}

// TypeScript interfaces
interface CapacityData {
  firma: string
  eksensayisi: number
  machine_count: number
  metric_value: number
  metric_label: string
  monthly_rate: number
  weekly_rate: number
  monthly_worktime: number
  weekly_worktime: number
  all_metrics: {
    monthly_rate: number
    weekly_rate: number
    monthly_worktime: number
    weekly_worktime: number
  }
}

interface WidgetData {
  data: CapacityData[]
  filters: {
    firma?: string
    eksensayisi?: number
    period: string
    metric: string
  }
  period: string
  metric: string
  total_records: number
}

interface CapacityAnalysisWidgetProps {
  widgetId?: string
}

// Color palette
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658']

export function CapacityAnalysisWidget({ widgetId }: CapacityAnalysisWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `capacity-analysis-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { period: 'monthly', metric: 'rate', firma: null }
    try {
      const stored = localStorage.getItem(`capacity-analysis-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { period: 'monthly', metric: 'rate', firma: null }
    } catch {
      return { period: 'monthly', metric: 'rate', firma: null }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [period, setPeriod] = useState<'monthly' | 'weekly'>(initialFilters.period)
  const [metric, setMetric] = useState<'worktime' | 'rate'>(initialFilters.metric)
  const [selectedFirma, setSelectedFirma] = useState<string | null>(initialFilters.firma)
  const [firmaOptions, setFirmaOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`capacity-analysis-filters-${instanceId}`, JSON.stringify({
        period,
        metric,
        firma: selectedFirma
      }))
    }
  }, [period, metric, selectedFirma, instanceId])

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load all firma options once on mount
  useEffect(() => {
    const loadFirmaOptions = async () => {
      try {
        // Fetch all data without firma filter to get all options
        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'capacity_analysis',
          filters: {
            period: period,
            metric: metric
          }
        })

        // Extract unique firma options from full response
        if (data.data && data.data.length > 0) {
          const uniqueFirmas = Array.from(new Set(data.data.map(item => item.firma))).sort()
          setFirmaOptions(uniqueFirmas)
        }
      } catch (err) {
        console.error(`Error loading firma options for ${instanceId}:`, err)
      }
    }

    loadFirmaOptions()
  }, [instanceId])

  // Load widget data
  useEffect(() => {
    const abortController = new AbortController()

    const loadWidgetData = async () => {
      console.log(`CapacityAnalysisWidget ${instanceId}: Loading data for ${period} ${metric} ${selectedFirma || 'all'}`)

      setLoading(true)
      setError(null)

      try {
        const filters: any = {
          period: period,
          metric: metric
        }

        if (selectedFirma) {
          filters.firma = selectedFirma
        }

        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'capacity_analysis',
          filters: filters
        }, { signal: abortController.signal })

        setWidgetData(data)
      } catch (err: any) {
        if (err?.status !== 0 && err?.message !== 'Request was cancelled') {
          setError('Veri yüklenirken hata oluştu')
          console.error(`Error loading widget data for ${instanceId}:`, err)
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadWidgetData()

    return () => {
      abortController.abort()
    }
  }, [period, metric, selectedFirma, instanceId])

  // Prepare chart data
  const chartData = widgetData?.data?.map((item) => ({
    name: `${item.firma} - ${item.eksensayisi}`,
    value: item.metric_value,
    firma: item.firma,
    eksensayisi: item.eksensayisi,
    machine_count: item.machine_count,
    metric_label: item.metric_label
  })) || []

  // Filter firma options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

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
  if (!widgetData || !widgetData.data || widgetData.data.length === 0) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Kapasite Analizi</h3>
          <div className="flex gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'monthly' | 'weekly')}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="monthly">Aylık</option>
              <option value="weekly">Haftalık</option>
            </select>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as 'worktime' | 'rate')}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="rate">Oran (%)</option>
              <option value="worktime">Çalışma Süresi (saat)</option>
            </select>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">Veri bulunamadı</p>
        </div>
      </div>
    )
  }

  const metricLabel = widgetData.data[0]?.metric_label || 'Değer'

  return (
    <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-gray-700">Kapasite Analizi</h3>
          <p className="text-xs text-gray-500 mt-1">{metricLabel}</p>
        </div>
        <div className="flex gap-2">
          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFirmaDropdown(!showFirmaDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[120px] text-left flex items-center justify-between"
            >
              <span className="truncate">{selectedFirma || 'Tüm Firmalar'}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showFirmaDropdown && (
              <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={firmaSearch}
                    onChange={(e) => setFirmaSearch(e.target.value)}
                    placeholder="Firma ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedFirma(null)
                    setShowFirmaDropdown(false)
                    setFirmaSearch('')
                  }}
                  className="px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer"
                >
                  Tüm Firmalar
                </div>
                {filteredFirmaOptions.map((firma) => (
                  <div
                    key={firma}
                    onClick={() => {
                      setSelectedFirma(firma)
                      setShowFirmaDropdown(false)
                      setFirmaSearch('')
                    }}
                    className={`px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer ${selectedFirma === firma ? 'bg-blue-100 font-medium' : ''}`}
                  >
                    {firma}
                  </div>
                ))}
                {filteredFirmaOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>

          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'monthly' | 'weekly')}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="monthly">Aylık</option>
            <option value="weekly">Haftalık</option>
          </select>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as 'worktime' | 'rate')}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="rate">Oran (%)</option>
            <option value="worktime">Çalışma Süresi (saat)</option>
          </select>
        </div>
      </div>
      {/* Summary Stats */}
      <div className="h-20 flex-shrink-0 grid grid-cols-4 gap-2 mt-4">
        {/* Total Records */}
        <div className="bg-cyan-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-cyan-600">
            {widgetData.total_records}
          </div>
          <div className="text-xs font-medium text-cyan-800 text-center">
            Toplam Kayıt
          </div>
        </div>

        {/* Average */}
        <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-blue-600">
            {chartData.length > 0
              ? (chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length).toFixed(1)
              : '0'}
            {metric === 'worktime' ? '' : '%'}
          </div>
          <div className="text-xs font-medium text-blue-800 text-center">
            Ortalama {metric === 'worktime' ? '(saat)' : ''}
          </div>
        </div>

        {/* Maximum */}
        <div className="bg-green-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-green-600">
            {chartData.length > 0
              ? Math.max(...chartData.map(item => item.value)).toFixed(1)
              : '0'}
            {metric === 'worktime' ? '' : '%'}
          </div>
          <div className="text-xs font-medium text-green-800 text-center">
            Maksimum {metric === 'worktime' ? '(saat)' : ''}
          </div>
        </div>

        {/* Minimum */}
        <div className="bg-orange-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-orange-600">
            {chartData.length > 0
              ? Math.min(...chartData.map(item => item.value)).toFixed(1)
              : '0'}
            {metric === 'worktime' ? '' : '%'}
          </div>
          <div className="text-xs font-medium text-orange-800 text-center">
            Minimum {metric === 'worktime' ? '(saat)' : ''}
          </div>
        </div>
      </div>
      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <defs>
              <linearGradient id="colorBar0" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorBar1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorBar2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#059669" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorBar3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#d97706" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorBar4" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorBar5" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ec4899" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#db2777" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorBar6" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#0891b2" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorBar7" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#84cc16" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#65a30d" stopOpacity={0.9}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={80}
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
            />
            <YAxis
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              }}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              formatter={(value: number) => [
                metric === 'worktime'
                  ? `${value.toFixed(2)} saat`
                  : `${value.toFixed(2)}%`,
                metricLabel
              ]}
              labelFormatter={(label) => `${label}`}
            />
            <Bar
              dataKey="value"
              name={metricLabel}
              radius={[8, 8, 0, 0]}
              maxBarSize={60}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={`url(#colorBar${index % 8})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      
    </div>
  )
}
