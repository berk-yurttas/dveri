"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { api } from "@/lib/api"

// Widget configuration
MachineOeeWidget.config = {
  id: "machine_oee-widget",
  name: "Makine OEE Analizi",
  type: "machine_oee",
  color: "bg-purple-500",
  description: "Firma ve makine koduna göre OEE analizi (7, 30, 60, 90 günlük)",
  size: { width: 4, height: 2 }
}

// TypeScript interfaces
interface MachineOeeData {
  firma: string
  machinecode: string
  avg_oee_7_days: number
  avg_oee_30_days: number
  avg_oee_60_days: number
  avg_oee_90_days: number
}

interface WidgetData {
  data: MachineOeeData[]
  filters: {
    firma?: string
    machinecode?: string
  }
  total_records: number
}

interface MachineOeeWidgetProps {
  widgetId?: string
}

export function MachineOeeWidget({ widgetId }: MachineOeeWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `machine-oee-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') return { firma: null, machinecode: null }
    try {
      const stored = localStorage.getItem(`machine-oee-filters-${instanceId}`)
      return stored ? JSON.parse(stored) : { firma: null, machinecode: null }
    } catch {
      return { firma: null, machinecode: null }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedFirma, setSelectedFirma] = useState<string | null>(initialFilters.firma)
  const [selectedMachine, setSelectedMachine] = useState<string | null>(initialFilters.machinecode)
  const [firmaOptions, setFirmaOptions] = useState<string[]>([])
  const [machineOptions, setMachineOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [machineSearch, setMachineSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)
  const [showMachineDropdown, setShowMachineDropdown] = useState(false)

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`machine-oee-filters-${instanceId}`, JSON.stringify({
        firma: selectedFirma,
        machinecode: selectedMachine
      }))
    }
  }, [selectedFirma, selectedMachine, instanceId])

  // Load all firma and machine options once on mount
  useEffect(() => {
    const loadOptions = async () => {
      try {
        // Fetch all data without filters to get all options
        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'machine_oee',
          filters: {}
        })

        // Extract unique firma and machine options from full response
        if (data.data && data.data.length > 0) {
          const uniqueFirmas = Array.from(new Set(data.data.map(item => item.firma))).sort()
          const uniqueMachines = Array.from(new Set(data.data.map(item => item.machinecode))).sort()
          setFirmaOptions(uniqueFirmas)
          setMachineOptions(uniqueMachines)
        }
      } catch (err) {
        console.error(`Error loading options for ${instanceId}:`, err)
      }
    }

    loadOptions()
  }, [instanceId])

  // Load widget data
  useEffect(() => {
    const abortController = new AbortController()

    const loadWidgetData = async () => {
      console.log(`MachineOeeWidget ${instanceId}: Loading data for firma=${selectedFirma || 'all'} machine=${selectedMachine || 'all'}`)

      setLoading(true)
      setError(null)

      try {
        const filters: any = {}

        if (selectedFirma) {
          filters.firma = selectedFirma
        }

        if (selectedMachine) {
          filters.machinecode = selectedMachine
        }

        const data = await api.post<WidgetData>('/data/widget', {
          widget_type: 'machine_oee',
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
  }, [selectedFirma, selectedMachine, instanceId])

  // Prepare chart data - transform from rows to columns for grouped bar chart
  const chartData = widgetData?.data?.map((item) => ({
    name: `${item.firma} - ${item.machinecode}`,
    firma: item.firma,
    machinecode: item.machinecode,
    '7 Gün': item.avg_oee_7_days,
    '30 Gün': item.avg_oee_30_days,
    '60 Gün': item.avg_oee_60_days,
    '90 Gün': item.avg_oee_90_days
  })) || []

  // Filter options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  const filteredMachineOptions = machineOptions.filter(machine =>
    machine.toLowerCase().includes(machineSearch.toLowerCase())
  )

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
          className="mt-2 px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
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
          <h3 className="text-sm font-semibold text-gray-700">Makine OEE Analizi</h3>
          <div className="flex gap-2">
            <div className="relative">
              <button
                onClick={() => setShowFirmaDropdown(!showFirmaDropdown)}
                className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[120px] text-left flex items-center justify-between"
              >
                <span className="truncate">{selectedFirma || 'Tüm Firmalar'}</span>
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowMachineDropdown(!showMachineDropdown)}
                className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[120px] text-left flex items-center justify-between"
              >
                <span className="truncate">{selectedMachine || 'Tüm Makineler'}</span>
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">Veri bulunamadı</p>
        </div>
      </div>
    )
  }

  // Calculate statistics
  const allOeeValues = widgetData.data.flatMap(item => [
    item.avg_oee_7_days,
    item.avg_oee_30_days,
    item.avg_oee_60_days,
    item.avg_oee_90_days
  ])
  const avgOee = allOeeValues.length > 0 ? allOeeValues.reduce((sum, val) => sum + val, 0) / allOeeValues.length : 0
  const maxOee = allOeeValues.length > 0 ? Math.max(...allOeeValues) : 0
  const minOee = allOeeValues.length > 0 ? Math.min(...allOeeValues) : 0

  return (
    <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-gray-700">Makine OEE Analizi</h3>
          <p className="text-xs text-gray-500 mt-1">Ortalama OEE (%)</p>
        </div>
        <div className="flex gap-2">
          {/* Firma Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFirmaDropdown(!showFirmaDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[120px] text-left flex items-center justify-between"
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
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedFirma(null)
                    setShowFirmaDropdown(false)
                    setFirmaSearch('')
                  }}
                  className="px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer"
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
                    className={`px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer ${selectedFirma === firma ? 'bg-purple-100 font-medium' : ''}`}
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

          {/* Machine Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMachineDropdown(!showMachineDropdown)}
              className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white min-w-[120px] text-left flex items-center justify-between"
            >
              <span className="truncate">{selectedMachine || 'Tüm Makineler'}</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showMachineDropdown && (
              <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                <div className="p-2 border-b border-gray-200">
                  <input
                    type="text"
                    value={machineSearch}
                    onChange={(e) => setMachineSearch(e.target.value)}
                    placeholder="Makine ara..."
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div
                  onClick={() => {
                    setSelectedMachine(null)
                    setShowMachineDropdown(false)
                    setMachineSearch('')
                  }}
                  className="px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer"
                >
                  Tüm Makineler
                </div>
                {filteredMachineOptions.map((machine) => (
                  <div
                    key={machine}
                    onClick={() => {
                      setSelectedMachine(machine)
                      setShowMachineDropdown(false)
                      setMachineSearch('')
                    }}
                    className={`px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer ${selectedMachine === machine ? 'bg-purple-100 font-medium' : ''}`}
                  >
                    {machine}
                  </div>
                ))}
                {filteredMachineOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="h-20 flex-shrink-0 grid grid-cols-4 gap-2 mt-4">
        {/* Total Records */}
        <div className="bg-purple-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-purple-600">
            {widgetData.total_records}
          </div>
          <div className="text-xs font-medium text-purple-800 text-center">
            Toplam Kayıt
          </div>
        </div>

        {/* Average */}
        <div className="bg-blue-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-blue-600">
            {avgOee.toFixed(1)}%
          </div>
          <div className="text-xs font-medium text-blue-800 text-center">
            Ortalama OEE
          </div>
        </div>

        {/* Maximum */}
        <div className="bg-green-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-green-600">
            {maxOee.toFixed(1)}%
          </div>
          <div className="text-xs font-medium text-green-800 text-center">
            Maksimum OEE
          </div>
        </div>

        {/* Minimum */}
        <div className="bg-orange-50 p-2 rounded-lg flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-orange-600">
            {minOee.toFixed(1)}%
          </div>
          <div className="text-xs font-medium text-orange-800 text-center">
            Minimum OEE
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
              <linearGradient id="colorOee7" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorOee30" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorOee60" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#059669" stopOpacity={0.9}/>
              </linearGradient>
              <linearGradient id="colorOee90" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#d97706" stopOpacity={0.9}/>
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
              label={{ value: 'OEE (%)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              }}
              cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
              formatter={(value: number) => `${value.toFixed(2)}%`}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            <Bar
              dataKey="7 Gün"
              fill="url(#colorOee7)"
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="30 Gün"
              fill="url(#colorOee30)"
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="60 Gün"
              fill="url(#colorOee60)"
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="90 Gün"
              fill="url(#colorOee90)"
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
