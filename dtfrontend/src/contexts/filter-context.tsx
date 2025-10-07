"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Define all possible filter types that widgets might need
interface WidgetFilters {
  // Product filters
  selectedProduct: number | null

  // Company/Firma filters
  selectedCompany: string | null

  // Test filters
  selectedTestName: string | null
  selectedTestStatus: string | null

  // Infrastructure filters
  selectedInfrastructure: number | null

  // Serial number filters
  selectedSerialNumber: string | null

  // Measurement location filters
  selectedMeasurementLocation: string | null

  // Multi-select serial numbers for comparison widgets
  selectedSerialNumbers: string[] | null

  // Additional filters can be added here as needed
  [key: string]: any
}

interface FilterContextType {
  // Global date filters
  dateFrom: string
  dateTo: string
  setDateFrom: (value: string) => void
  setDateTo: (value: string) => void

  // Widget-specific filters
  getWidgetFilters: (widgetId: string) => WidgetFilters
  updateWidgetFilter: (widgetId: string, key: keyof WidgetFilters, value: any) => void
  updateWidgetFilters: (widgetId: string, newFilters: Partial<WidgetFilters>) => void
  resetWidgetFilters: (widgetId: string) => void
  getWidgetFilteredProps: () => { dateFrom: string; dateTo: string }
}

const defaultDateFilters = {
  dateFrom: '2025-01-01',
  dateTo: new Date().toISOString().split('T')[0]
}

const defaultFilters: WidgetFilters = {
  selectedProduct: null,
  selectedCompany: null,
  selectedTestName: null,
  selectedTestStatus: null,
  selectedInfrastructure: null,
  selectedSerialNumber: null,
  selectedMeasurementLocation: null,
  selectedSerialNumbers: null,
}

const FilterContext = createContext<FilterContextType | undefined>(undefined)

export function FilterProvider({ children }: { children: ReactNode }) {
  // Global date filters
  const [globalDateFrom, setGlobalDateFrom] = useState(defaultDateFilters.dateFrom)
  const [globalDateTo, setGlobalDateTo] = useState(defaultDateFilters.dateTo)

  // Widget-specific filters
  const [widgetFilters, setWidgetFilters] = useState<Record<string, WidgetFilters>>({})
  const [isLoaded, setIsLoaded] = useState(false)

  // Load filters from localStorage on mount
  useEffect(() => {
    console.log('FilterContext: Loading from localStorage on mount')
    try {
      const savedFilters = localStorage.getItem('widget-filters')
      console.log('FilterContext: Raw localStorage data:', savedFilters)
      if (savedFilters) {
        const parsedFilters = JSON.parse(savedFilters)
        console.log('FilterContext: Parsed filters:', parsedFilters)
        setWidgetFilters(parsedFilters)
      }

      const savedGlobalDates = localStorage.getItem('global-date-filters')
      if (savedGlobalDates) {
        const { dateFrom, dateTo } = JSON.parse(savedGlobalDates)
        setGlobalDateFrom(dateFrom)
        setGlobalDateTo(dateTo)
      }
    } catch (error) {
      console.error('Error loading filters from localStorage:', error)
    } finally {
      console.log('FilterContext: Finished loading, setting isLoaded to true')
      setIsLoaded(true)
    }
  }, [])

  // Save widget filters to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      try {
        console.log('FilterContext: Saving to localStorage:', widgetFilters)
        localStorage.setItem('widget-filters', JSON.stringify(widgetFilters))
      } catch (error) {
        console.error('Error saving widget filters to localStorage:', error)
      }
    }
  }, [widgetFilters, isLoaded])

  // Save global date filters to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem('global-date-filters', JSON.stringify({
          dateFrom: globalDateFrom,
          dateTo: globalDateTo
        }))
      } catch (error) {
        console.error('Error saving global date filters to localStorage:', error)
      }
    }
  }, [globalDateFrom, globalDateTo, isLoaded])

  const getWidgetFilters = (widgetId: string): WidgetFilters => {
    return widgetFilters[widgetId] || { ...defaultFilters }
  }

  const updateWidgetFilter = (widgetId: string, key: keyof WidgetFilters, value: any) => {
    console.log(`FilterContext: updateWidgetFilter called for ${widgetId}, ${key}:`, value)
    setWidgetFilters(prev => {
      const currentFilters = prev[widgetId] || { ...defaultFilters }
      const newFilters = {
        ...prev,
        [widgetId]: {
          ...currentFilters,
          [key]: value
        }
      }
      console.log(`FilterContext: New filters for ${widgetId}:`, newFilters[widgetId])
      return newFilters
    })
  }

  const updateWidgetFilters = (widgetId: string, newFilters: Partial<WidgetFilters>) => {
    setWidgetFilters(prev => ({
      ...prev,
      [widgetId]: {
        ...getWidgetFilters(widgetId),
        ...newFilters
      }
    }))
  }

  const resetWidgetFilters = (widgetId: string) => {
    setWidgetFilters(prev => ({
      ...prev,
      [widgetId]: defaultFilters
    }))
  }

  const getWidgetFilteredProps = () => {
    return {
      dateFrom: `${globalDateFrom} 00:00:00`,
      dateTo: `${globalDateTo} 23:59:59`
    }
  }

  const value: FilterContextType = {
    // Global date filters
    dateFrom: globalDateFrom,
    dateTo: globalDateTo,
    setDateFrom: setGlobalDateFrom,
    setDateTo: setGlobalDateTo,

    // Widget-specific filters
    getWidgetFilters,
    updateWidgetFilter,
    updateWidgetFilters,
    resetWidgetFilters,
    getWidgetFilteredProps
  }

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  const context = useContext(FilterContext)
  if (context === undefined) {
    throw new Error('useFilters must be used within a FilterProvider')
  }
  return context
}

// Hook for widgets to easily access their relevant filters
export function useWidgetFilters(widgetId: string) {
  const {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    getWidgetFilters,
    updateWidgetFilter,
    updateWidgetFilters,
    resetWidgetFilters,
    getWidgetFilteredProps
  } = useFilters()

  const filters = getWidgetFilters(widgetId)

  console.log(`useWidgetFilters(${widgetId}): Current filters:`, filters)

  // Return commonly used filters and update functions
  return {
    // Global date filters
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,

    // Product filters
    selectedProduct: filters.selectedProduct ?? defaultFilters.selectedProduct,
    setSelectedProduct: (value: number | null) => updateWidgetFilter(widgetId, 'selectedProduct', value),

    // Company filters
    selectedCompany: filters.selectedCompany ?? defaultFilters.selectedCompany,
    setSelectedCompany: (value: string | null) => updateWidgetFilter(widgetId, 'selectedCompany', value),

    // Test filters
    selectedTestName: filters.selectedTestName ?? defaultFilters.selectedTestName,
    setSelectedTestName: (value: string | null) => updateWidgetFilter(widgetId, 'selectedTestName', value),

    selectedTestStatus: filters.selectedTestStatus ?? defaultFilters.selectedTestStatus,
    setSelectedTestStatus: (value: string | null) => updateWidgetFilter(widgetId, 'selectedTestStatus', value),

    // Infrastructure filters
    selectedInfrastructure: filters.selectedInfrastructure ?? defaultFilters.selectedInfrastructure,
    setSelectedInfrastructure: (value: number | null) => updateWidgetFilter(widgetId, 'selectedInfrastructure', value),

    // Serial number filters
    selectedSerialNumber: filters.selectedSerialNumber ?? defaultFilters.selectedSerialNumber,
    setSelectedSerialNumber: (value: string | null) => updateWidgetFilter(widgetId, 'selectedSerialNumber', value),

    // Measurement location filters
    selectedMeasurementLocation: filters.selectedMeasurementLocation ?? defaultFilters.selectedMeasurementLocation,
    setSelectedMeasurementLocation: (value: string | null) => updateWidgetFilter(widgetId, 'selectedMeasurementLocation', value),

    // Formatted date props for widgets
    getFilteredProps: getWidgetFilteredProps,

    // All filters for advanced use cases
    allFilters: filters,
    updateFilter: (key: keyof WidgetFilters, value: any) => updateWidgetFilter(widgetId, key, value),
    updateFilters: (newFilters: Partial<WidgetFilters>) => updateWidgetFilters(widgetId, newFilters),
    resetFilters: () => resetWidgetFilters(widgetId)
  }
}