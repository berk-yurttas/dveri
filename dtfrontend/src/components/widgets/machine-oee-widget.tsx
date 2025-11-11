"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { api } from "@/lib/api"

// Widget configuration
MachineOeeWidget.config = {
  id: "machine_oee-widget",
  name: "Makine OEE Analizi",
  type: "machine_oee",
  color: "bg-purple-500",
  description: "Firma ve makine koduna göre tarih bazlı OEE analizi",
  size: { width: 4, height: 2 }
}

// TypeScript interfaces
interface MachineOeeData {
  "Firma Adı": string
  "Makina Kodu": string
  "Üretim Tarihi": string
  "OEE": number
}

interface AggregatedOeeData {
  name: string
  firma: string
  machinecode: string
  avgOee: number
}

interface WidgetData {
  success: boolean
  data: any[]
  columns: string[]
  total_rows: number
}

interface MachineOeeWidgetProps {
  widgetId?: string
}

export function MachineOeeWidget({ widgetId }: MachineOeeWidgetProps) {
  // Create unique instance identifier
  const instanceRef = useRef(widgetId || `machine-oee-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  // Refs for dropdown elements
  const firmaDropdownRef = useRef<HTMLDivElement>(null)
  const machineDropdownRef = useRef<HTMLDivElement>(null)

  // Calculate default date range (last 30 days)
  const getDefaultDateRange = () => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    }
  }

  // Load filters from localStorage
  const getStoredFilters = () => {
    if (typeof window === 'undefined') {
      const defaultDates = getDefaultDateRange()
      return { firma: null, machinecode: null, startDate: defaultDates.start, endDate: defaultDates.end }
    }
    try {
      const stored = localStorage.getItem(`machine-oee-filters-${instanceId}`)
      if (stored) {
        return JSON.parse(stored)
      }
      const defaultDates = getDefaultDateRange()
      return { firma: null, machinecode: null, startDate: defaultDates.start, endDate: defaultDates.end }
    } catch {
      const defaultDates = getDefaultDateRange()
      return { firma: null, machinecode: null, startDate: defaultDates.start, endDate: defaultDates.end }
    }
  }

  const initialFilters = getStoredFilters()

  // State for filters
  const [selectedFirma, setSelectedFirma] = useState<string | null>(initialFilters.firma)
  const [selectedMachine, setSelectedMachine] = useState<string | null>(initialFilters.machinecode)
  const [startDate, setStartDate] = useState<string>(initialFilters.startDate)
  const [endDate, setEndDate] = useState<string>(initialFilters.endDate)
  const [firmaOptions, setFirmaOptions] = useState<string[]>([])
  const [machineOptions, setMachineOptions] = useState<string[]>([])
  const [firmaSearch, setFirmaSearch] = useState('')
  const [machineSearch, setMachineSearch] = useState('')
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false)
  const [showMachineDropdown, setShowMachineDropdown] = useState(false)

  // State for widget data and loading
  const [widgetData, setWidgetData] = useState<MachineOeeData[]>([])
  const [allData, setAllData] = useState<MachineOeeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (firmaDropdownRef.current && !firmaDropdownRef.current.contains(event.target as Node)) {
        setShowFirmaDropdown(false)
      }
      if (machineDropdownRef.current && !machineDropdownRef.current.contains(event.target as Node)) {
        setShowMachineDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Save filters to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`machine-oee-filters-${instanceId}`, JSON.stringify({
        firma: selectedFirma,
        machinecode: selectedMachine,
        startDate,
        endDate
      }))
    }
  }, [selectedFirma, selectedMachine, startDate, endDate, instanceId])

  // Load all firma and machine options once on mount
  useEffect(() => {
    const loadOptions = async () => {
      try {
        // Fetch all data to get all options
        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: 'SELECT "Firma Adı", "Makina Kodu", "Üretim Tarihi", "OEE" FROM mes_production.tarih_bazli_oee ORDER BY "Üretim Tarihi" DESC'
        })

        if (response.success && response.data && response.data.length > 0) {
          const transformed: MachineOeeData[] = response.data.map(row => ({
            "Firma Adı": row[0],
            "Makina Kodu": row[1],
            "Üretim Tarihi": row[2],
            "OEE": parseFloat(row[3]) || 0
          }))

          setAllData(transformed)
          const uniqueFirmas = Array.from(new Set(transformed.map(item => item["Firma Adı"]))).sort()
          const uniqueMachines = Array.from(new Set(transformed.map(item => item["Makina Kodu"]))).sort()
          setFirmaOptions(uniqueFirmas)
          setMachineOptions(uniqueMachines)
        }
      } catch (err) {
        console.error(`Error loading options for ${instanceId}:`, err)
      }
    }

    loadOptions()
  }, [instanceId])

  // Clear selected machine when firma changes
  useEffect(() => {
    if (selectedFirma) {
      setSelectedMachine(null)
    }
  }, [selectedFirma])

  // Load widget data
  useEffect(() => {
    const loadWidgetData = async () => {
      setLoading(true)
      setError(null)

      try {
        let whereClauses: string[] = []

        if (startDate && endDate) {
          whereClauses.push(`"Üretim Tarihi" BETWEEN '${startDate}' AND '${endDate}'`)
        }

        if (selectedFirma) {
          whereClauses.push(`"Firma Adı" = '${selectedFirma}'`)
        }

        if (selectedMachine) {
          whereClauses.push(`"Makina Kodu" = '${selectedMachine}'`)
        }

        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

        const response = await api.post<WidgetData>('/reports/preview', {
          sql_query: `SELECT "Firma Adı", "Makina Kodu", "Üretim Tarihi", "OEE" FROM mes_production.tarih_bazli_oee ${whereClause} ORDER BY "Üretim Tarihi" DESC`
        })

        if (response.success && response.data && response.data.length > 0) {
          const transformed: MachineOeeData[] = response.data.map(row => ({
            "Firma Adı": row[0],
            "Makina Kodu": row[1],
            "Üretim Tarihi": row[2],
            "OEE": parseFloat(row[3]) || 0
          }))

          setWidgetData(transformed)
        } else {
          setWidgetData([])
        }
      } catch (err: any) {
        setError('Veri yüklenirken hata oluştu')
        console.error(`Error loading widget data for ${instanceId}:`, err)
      } finally {
        setLoading(false)
      }
    }

    loadWidgetData()
  }, [selectedFirma, selectedMachine, startDate, endDate, instanceId])

  // Prepare chart data based on filters
  const isDetailedView = selectedFirma && selectedMachine

  let chartData: any[] = []
  let avgOee = 0
  let maxOee = 0
  let minOee = 0

  if (isDetailedView) {
    // Time-series view: show OEE over time for specific firma and machine
    chartData = widgetData.map(item => ({
      date: item["Üretim Tarihi"],
      OEE: (item["OEE"] * 100).toFixed(2)
    })).reverse() // Reverse to show chronological order

    const oeeValues = widgetData.map(item => item["OEE"] * 100)
    avgOee = oeeValues.length > 0 ? oeeValues.reduce((sum, val) => sum + val, 0) / oeeValues.length : 0
    maxOee = oeeValues.length > 0 ? Math.max(...oeeValues) : 0
    minOee = oeeValues.length > 0 ? Math.min(...oeeValues) : 0
  } else {
    // Aggregated view: show average OEE per firma/machine combination
    const aggregated = new Map<string, { sum: number, count: number, firma: string, machine: string }>()

    widgetData.forEach(item => {
      const key = `${item["Firma Adı"]}-${item["Makina Kodu"]}`
      if (!aggregated.has(key)) {
        aggregated.set(key, { sum: 0, count: 0, firma: item["Firma Adı"], machine: item["Makina Kodu"] })
      }
      const agg = aggregated.get(key)!
      agg.sum += item["OEE"]
      agg.count += 1
    })

    chartData = Array.from(aggregated.entries()).map(([key, value]) => ({
      name: selectedFirma ? value.machine : key,
      firma: value.firma,
      machine: value.machine,
      OEE: ((value.sum / value.count) * 100).toFixed(2)
    }))

    const oeeValues = chartData.map(item => parseFloat(item.OEE))
    avgOee = oeeValues.length > 0 ? oeeValues.reduce((sum, val) => sum + val, 0) / oeeValues.length : 0
    maxOee = oeeValues.length > 0 ? Math.max(...oeeValues) : 0
    minOee = oeeValues.length > 0 ? Math.min(...oeeValues) : 0
  }

  // Filter options based on search
  const filteredFirmaOptions = firmaOptions.filter(firma =>
    firma.toLowerCase().includes(firmaSearch.toLowerCase())
  )

  // Filter machine options based on selected firma
  const availableMachineOptions = selectedFirma && allData.length > 0
    ? Array.from(new Set(
        allData
          .filter(item => item["Firma Adı"] === selectedFirma)
          .map(item => item["Makina Kodu"])
      )).sort()
    : machineOptions

  const filteredMachineOptions = availableMachineOptions.filter(machine =>
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
  if (!widgetData || widgetData.length === 0) {
    return (
      <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Makine OEE Analizi</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">Veri bulunamadı</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header with filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-gray-700">Makine OEE Analizi</h3>
          <p className="text-xs text-gray-500 mt-1">
            {isDetailedView ? 'Günlük OEE Trendi' : 'Ortalama OEE (%)'}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Date Range Filters */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

          {/* Firma Dropdown */}
          <div className="relative" ref={firmaDropdownRef}>
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
          <div className="relative" ref={machineDropdownRef}>
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
            {widgetData.length}
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
          {isDetailedView ? (
            // Line chart for time series when firma and machine are selected
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <defs>
                <linearGradient id="colorOee" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={80}
                stroke="#6b7280"
                style={{ fontSize: '11px', fontWeight: 500 }}
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
                formatter={(value: number) => `${parseFloat(value.toString()).toFixed(2)}%`}
              />
              <Line
                type="monotone"
                dataKey="OEE"
                stroke="#8b5cf6"
                strokeWidth={3}
                dot={{ r: 4, fill: '#8b5cf6' }}
                activeDot={{ r: 6 }}
                fill="url(#colorOee)"
              />
            </LineChart>
          ) : (
            // Bar chart for aggregated view
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <defs>
                <linearGradient id="colorOeeBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                  <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.9}/>
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
                formatter={(value: number) => `${parseFloat(value.toString()).toFixed(2)}%`}
              />
              <Bar
                dataKey="OEE"
                fill="url(#colorOeeBar)"
                radius={[8, 8, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
