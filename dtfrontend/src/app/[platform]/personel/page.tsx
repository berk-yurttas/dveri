"use client"

import { useState } from "react"
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, Users, FileSpreadsheet, Wrench, TrendingUp } from "lucide-react"
import { useParams } from "next/navigation"

type TabType = 'kablaj' | 'talasli' | 'tezgah'
type FirmaTipi = 'kablaj' | 'talasli'

export default function PersonelPage() {
  const params = useParams()
  const platformCode = params?.platform as string

  const [activeTab, setActiveTab] = useState<TabType>('kablaj')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const tabs = [
    { 
      id: 'kablaj' as TabType, 
      label: 'Kablaj Personel', 
      icon: Users,
      description: 'Kablaj işlemi yapan personel sayıları',
      color: 'orange'
    },
    { 
      id: 'talasli' as TabType, 
      label: 'Talaşlı İmalat Personel', 
      icon: TrendingUp,
      description: 'Talaşlı imalat yapan personel sayıları',
      color: 'blue'
    },
    { 
      id: 'tezgah' as TabType, 
      label: 'Tezgah Bilgileri', 
      icon: Wrench,
      description: 'Talaşlı imalat tezgah detayları',
      color: 'green'
    }
  ]

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setMessage(null)
    }
  }

  const handleDownloadTemplate = (firmaTipi: FirmaTipi) => {
    const templatePath = firmaTipi === 'kablaj' 
      ? '/import_templates/kablaj-template.xlsx'
      : '/import_templates/talasli-template.xlsx'
    
    const link = document.createElement('a')
    link.href = templatePath
    link.download = `${firmaTipi}-template.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleUpload = async (firmaTipi: FirmaTipi) => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Lütfen bir dosya seçin' })
      return
    }

    setUploading(true)
    setMessage(null)

    try {
      const token = localStorage.getItem('access_token')
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('firma_tipi', firmaTipi)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/personel/upload-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Upload failed')
      }

      const result = await response.json()
      setMessage({ 
        type: 'success', 
        text: `Başarıyla yüklendi! ${result.records_count} kayıt eklendi.` 
      })
      setSelectedFile(null)
      
      const fileInput = document.getElementById(`file-upload-${activeTab}`) as HTMLInputElement
      if (fileInput) fileInput.value = ''
    } catch (error: any) {
      console.error('Upload error:', error)
      setMessage({ 
        type: 'error', 
        text: error.message || 'Dosya yüklenirken hata oluştu' 
      })
    } finally {
      setUploading(false)
    }
  }

  const handleUploadTezgah = async () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Lütfen bir dosya seçin' })
      return
    }

    setUploading(true)
    setMessage(null)

    try {
      const token = localStorage.getItem('access_token')
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/personel/upload-tezgah-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Upload failed')
      }

      const result = await response.json()
      setMessage({ 
        type: 'success', 
        text: `Başarıyla yüklendi! ${result.records_count} tezgah kaydı eklendi.` 
      })
      setSelectedFile(null)
      
      const fileInput = document.getElementById(`file-upload-${activeTab}`) as HTMLInputElement
      if (fileInput) fileInput.value = ''
    } catch (error: any) {
      console.error('Upload error:', error)
      setMessage({ 
        type: 'error', 
        text: error.message || 'Dosya yüklenirken hata oluştu' 
      })
    } finally {
      setUploading(false)
    }
  }

  const renderUploadSection = (firmaTipi: FirmaTipi) => (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-orange-600" />
          Excel Dosyası Yükle
        </h2>
        <p className="text-sm text-gray-600">Personel verilerinizi toplu olarak içe aktarın</p>
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label 
            htmlFor={`file-upload-${activeTab}`}
            className="cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-700 px-4 py-2 rounded-lg border border-orange-200 flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Dosya Seç
          </label>
          <input
            id={`file-upload-${activeTab}`}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          {selectedFile && (
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span className="text-sm text-gray-700">{selectedFile.name}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleDownloadTemplate(firmaTipi)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Şablon İndir
          </button>

          <button
            onClick={() => handleUpload(firmaTipi)}
            disabled={!selectedFile || uploading}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Yükleniyor...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Yükle ve Güncelle
              </>
            )}
          </button>
        </div>

        {message && (
          <div className={`flex items-start gap-2 p-3 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <span className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {message.text}
            </span>
          </div>
        )}

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="font-semibold text-sm text-blue-900 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Önemli Bilgiler
          </p>
          <ul className="space-y-1.5 text-xs text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span>Excel dosyası şablon formatında olmalıdır</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span>Veri 2. satırdan başlamalı ve I sütununda bitmelidir</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span>Firmalar arasında 2 satır boşluk olmalıdır</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span className="font-semibold">Dosya yüklendiğinde mevcut veriler silinip yeni veriler eklenecektir</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )

  const renderTezgahUploadSection = () => (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-green-600" />
          Tezgah Bilgileri Excel Dosyası Yükle
        </h2>
        <p className="text-sm text-gray-600">Tezgah verilerinizi toplu olarak içe aktarın</p>
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label 
            htmlFor={`file-upload-${activeTab}`}
            className="cursor-pointer bg-green-50 hover:bg-green-100 text-green-700 px-4 py-2 rounded-lg border border-green-200 flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Dosya Seç
          </label>
          <input
            id={`file-upload-${activeTab}`}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          {selectedFile && (
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span className="text-sm text-gray-700">{selectedFile.name}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              const link = document.createElement('a')
              link.href = '/import_templates/tezgah-template.xlsx'
              link.download = 'tezgah-template.xlsx'
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Şablon İndir
          </button>

          <button
            onClick={handleUploadTezgah}
            disabled={!selectedFile || uploading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Yükleniyor...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Yükle ve Güncelle
              </>
            )}
          </button>
        </div>

        {message && (
          <div className={`flex items-start gap-2 p-3 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <span className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {message.text}
            </span>
          </div>
        )}

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="font-semibold text-sm text-blue-900 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Önemli Bilgiler
          </p>
          <ul className="space-y-1.5 text-xs text-blue-800">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span>Excel dosyası şablon formatında olmalıdır</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span>İlk satır başlık satırıdır</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span>Veriler 2. satırdan itibaren başlamalıdır</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 font-bold mt-0.5">•</span>
              <span className="font-semibold">Dosya yüklendiğinde <span className="text-green-600">tüm mevcut tezgah verileri</span> silinip yeni veriler eklenecektir</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Users className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Personel Yönetimi
              </h1>
              <p className="text-sm text-gray-600">Personel sayıları ve tezgah bilgileri yönetimi</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-1">
            <nav className="flex gap-1" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setSelectedFile(null)
                      setMessage(null)
                    }}
                    className={`
                      flex-1 rounded-lg px-4 py-2.5 text-sm font-medium
                      ${isActive
                        ? 'bg-orange-500 text-white shadow'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }
                    `}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Icon className="w-5 h-5" />
                      <span className="font-semibold">{tab.label}</span>
                      <span className={`text-xs ${isActive ? 'text-orange-100' : 'text-gray-500'}`}>
                        {tab.description}
                      </span>
                    </div>
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'kablaj' && renderUploadSection('kablaj')}
          {activeTab === 'talasli' && renderUploadSection('talasli')}
          {activeTab === 'tezgah' && renderTezgahUploadSection()}
        </div>
      </div>
    </div>
  )
}
