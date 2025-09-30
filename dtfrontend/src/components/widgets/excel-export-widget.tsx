"use client"

import { useState, useEffect, useRef } from "react"
import { Download } from "lucide-react"
import { ProductDropdown } from "./product-dropdown"
import { CompanyDropdown } from "./company-dropdown"
import { SerialNumberDropdown } from "./serial-number-dropdown"
import { api } from "@/lib/api"

// Widget configuration
ExcelExportWidget.config = {
  id: "excel-export-widget",
  name: "Excel Dışa Aktarım",
  type: "excel_export",
  color: "bg-orange-500",
  description: "Test verilerini Excel formatında indirme",
  size: { width: 1, height: 1 }
}

interface ProductOption {
  id: number
  name: string
  value: number
  description?: string
}

interface CompanyOption {
  id: number
  name: string
  value: string
}

interface SerialNumberOption {
  teu_id: number | null
  product_id: number
  product_name: string
  serial_number: string
  additional_info?: string
  firma?: string
}

interface ExcelExportWidgetProps {
  widgetId?: string
  dateFrom?: string
  dateTo?: string
}

export function ExcelExportWidget({ widgetId, dateFrom, dateTo }: ExcelExportWidgetProps) {
  const instanceRef = useRef(widgetId || `excel-export-${Math.random().toString(36).substr(2, 9)}`)
  const instanceId = instanceRef.current

  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([])
  const [serialNumberOptions, setSerialNumberOptions] = useState<SerialNumberOption[]>([])
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [selectedSerialNumber, setSelectedSerialNumber] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSerialNumbers, setLoadingSerialNumbers] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load product options on component mount
  useEffect(() => {
    console.log(`ExcelExportWidget ${instanceId}: Loading product options`)

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
      }
    }

    loadProductOptions()
  }, [instanceId])

  // Load company options when product is selected
  useEffect(() => {
    const loadCompanyOptions = async () => {
      if (!selectedProduct) return

      console.log(`ExcelExportWidget ${instanceId}: Loading company options for product ${selectedProduct}`)

      try {
        const options = await api.get<CompanyOption[]>(`/data/companies?product_id=${selectedProduct}`)
        setCompanyOptions(options)
        // Select first option by default
        if (options.length > 0) {
          setSelectedCompany(options[0].value)
        }
        setLoading(false)
      } catch (err) {
        setError('Failed to load company options')
        console.error(`Error loading companies for ${instanceId}:`, err)
        setLoading(false)
      }
    }

    loadCompanyOptions()
  }, [selectedProduct, instanceId])

  // Load serial number options when product or company is selected
  useEffect(() => {
    const loadSerialNumberOptions = async () => {
      if (!selectedProduct || !selectedCompany) {
        setSerialNumberOptions([])
        setSelectedSerialNumber(null)
        return
      }

      console.log(`ExcelExportWidget ${instanceId}: Loading serial number options for product ${selectedProduct} and company ${selectedCompany}`)

      setLoadingSerialNumbers(true)
      try {
        const options = await api.get<SerialNumberOption[]>(`/data/products/${selectedProduct}/serial-numbers?firma=${selectedCompany}`)
        setSerialNumberOptions(options)
        // Don't auto-select serial number, let user choose or keep all
        setSelectedSerialNumber(null)
      } catch (err) {
        console.error(`Error loading serial numbers for ${instanceId}:`, err)
        setSerialNumberOptions([])
        setSelectedSerialNumber(null)
      } finally {
        setLoadingSerialNumbers(false)
      }
    }

    loadSerialNumberOptions()
  }, [selectedProduct, selectedCompany, instanceId])

  // Get company logo URL
  const getCompanyLogo = (companyName: string | null) => {
    if (!companyName) return null

    if (companyName.toUpperCase().includes('ASELSANNET')) {
      return '/aselsannet.png'
    }


    if (companyName.toUpperCase().includes('ASELSAN')) {
      return '/aselsan.jpg'
    }


    if (companyName.toUpperCase().includes('HTR')) {
      return '/htr.png'
    }

    if (companyName.toUpperCase().includes('KAREL')) {
      return '/karel.png'
    }

    if (companyName.toUpperCase().includes('MELSİS') || companyName.toUpperCase().includes('MELSIS')) {
      return '/melsis.jpg'
    }

    // Return a dummy logo for other companies
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzU1NzNBQSIvPgo8dGV4dCB4PSIyMCIgeT0iMjYiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DTzwvdGV4dD4KPC9zdmc+'
  }

  // Handle Excel download
  const handleDownload = async () => {
    if (!selectedProduct || !selectedCompany || !selectedSerialNumber) {
      setError('Lütfen ürün, firma ve seri no seçin')
      return
    }

    setDownloading(true)
    setError(null)

    try {
      console.log(`ExcelExportWidget ${instanceId}: Downloading Excel for product ${selectedProduct}, company ${selectedCompany}, serial number ${selectedSerialNumber || 'all'}`)

      const filters: any = {
        urun_id: selectedProduct,
        firma: selectedCompany,
        date_from: dateFrom || '2025-08-01 00:00:00',
        date_to: dateTo || '2025-09-01 23:59:59'
      }

      // Add serial number filter if selected
      if (selectedSerialNumber) {
        filters.seri_no = selectedSerialNumber
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'}/data/widget`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          widget_type: 'excel_export',
          filters: filters
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Get filename from response headers
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'test_data_export.xlsx'
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '')
        }
      }

      // Create blob and download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (err) {
      setError('Excel indirme işlemi başarısız oldu')
      console.error(`Error downloading Excel for ${instanceId}:`, err)
    } finally {
      setDownloading(false)
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="w-full h-full p-3 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
        <p className="text-xs text-gray-600 mt-2">Yükleniyor...</p>
      </div>
    )
  }

  // Show error state
  if (error && !selectedProduct) {
    return (
      <div className="w-full h-full p-3 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
        <p className="text-xs text-red-600 text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
        >
          Yeniden Dene
        </button>
      </div>
    )
  }

  const companyLogo = getCompanyLogo(selectedCompany)
  const currentCompany = companyOptions.find(c => c.value === selectedCompany)

  return (
    <div className="w-full h-full p-3 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          <h3 className="text-sm font-semibold text-gray-800">Excel İndir</h3>
        </div>
      </div>

      {/* Product Dropdown */}
      <div className="mb-2 flex items-center space-x-2">
        <label className="text-xs font-medium text-gray-700 flex-shrink-0">Ürün:</label>
        <div className="flex-1">
          <ProductDropdown
            options={productOptions}
            selectedValue={selectedProduct}
            onSelect={setSelectedProduct}
            placeholder="Ürün ara..."
            className="w-full"
          />
        </div>
      </div>

      {/* Company Dropdown */}
      <div className="mb-2 flex items-center space-x-2">
        <label className="text-xs font-medium text-gray-700 flex-shrink-0">Firma:</label>
        <div className="flex-1">
          <CompanyDropdown
            options={companyOptions}
            selectedValue={selectedCompany}
            onSelect={setSelectedCompany}
            placeholder="Firma ara..."
            className="w-full"
            loading={!selectedProduct}
          />
        </div>
      </div>

      {/* Serial Number Dropdown */}
      <div className="mb-3 flex items-center space-x-2">
        <label className="text-xs font-medium text-gray-700 flex-shrink-0">Seri No:</label>
        <div className="flex-1">
          <SerialNumberDropdown
            options={serialNumberOptions}
            selectedValue={selectedSerialNumber}
            onSelect={setSelectedSerialNumber}
            showFirma={true}
            firmaFilter={selectedCompany}
            placeholder="Seri no ara..."
            className="w-full"
            loading={loadingSerialNumbers}
          />
        </div>
      </div>

      {/* Center Logo */}
      <div className="flex-1 flex items-center justify-center mb-3">
        {companyLogo && (
          <img
            src={companyLogo}
            alt={currentCompany?.name || 'Company Logo'}
            className="h-16 w-auto object-contain max-w-full"
            onError={(e) => {
              // Fallback to dummy logo if ASELSAN logo fails to load
              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzU1NzNBQSIvPgo8dGV4dCB4PSIyMCIgeT0iMjYiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DTzwvdGV4dD4KPC9zdmc+'
            }}
          />
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 text-center">
          {error}
        </div>
      )}

      {/* Download Button */}
      <div>
        <button
          onClick={handleDownload}
          disabled={!selectedProduct || !selectedCompany || !selectedSerialNumber || downloading}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-orange-600 text-white text-sm font-medium rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>{downloading ? 'İndiriliyor...' : 'İndir'}</span>
        </button>
      </div>
    </div>
  )
}