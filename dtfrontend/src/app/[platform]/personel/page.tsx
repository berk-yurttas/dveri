"use client"

import { useState, useEffect } from "react"
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, Users, Building2, Briefcase } from "lucide-react"
import { useParams } from "next/navigation"

interface PersonelRecord {
  id: number
  firma_adi: string
  ust_birim: string
  birim: string | null
  personel_sayisi: number
  created_at: string
}

interface CompanyData {
  firma_adi: string
  total: number
  departments: {
    [key: string]: {
      total: number
      subDepartments?: { [key: string]: number }
    }
  }
}

export default function PersonelPage() {
  const params = useParams()
  const platformCode = params?.platform as string

  const [data, setData] = useState<PersonelRecord[]>([])
  const [companyData, setCompanyData] = useState<CompanyData[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/personel/data`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) throw new Error('Failed to fetch data')

      const result = await response.json()
      setData(result.data)
      processData(result.data)
    } catch (error) {
      console.error('Error fetching data:', error)
      setMessage({ type: 'error', text: 'Veriler yüklenirken hata oluştu' })
    } finally {
      setLoading(false)
    }
  }

  const processData = (records: PersonelRecord[]) => {
    const companies: { [key: string]: CompanyData } = {}

    records.forEach(record => {
      if (!companies[record.firma_adi]) {
        companies[record.firma_adi] = {
          firma_adi: record.firma_adi,
          total: 0,
          departments: {}
        }
      }

      const company = companies[record.firma_adi]
      company.total += record.personel_sayisi

      if (!company.departments[record.ust_birim]) {
        company.departments[record.ust_birim] = {
          total: 0,
          subDepartments: {}
        }
      }

      const dept = company.departments[record.ust_birim]
      dept.total += record.personel_sayisi

      if (record.birim) {
        if (!dept.subDepartments) dept.subDepartments = {}
        dept.subDepartments[record.birim] = record.personel_sayisi
      }
    })

    setCompanyData(Object.values(companies))
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setMessage(null)
    }
  }

  const handleUpload = async () => {
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
      
      // Reset file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''

      // Refresh data
      await fetchData()
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Users className="w-8 h-8 text-orange-600" />
            Personel Sayıları
          </h1>
          <p className="text-gray-600">Firma ve departman bazlı personel sayıları</p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-orange-600" />
            Excel Dosyası Yükle
          </h2>
          
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <label 
                htmlFor="file-upload" 
                className="cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-700 px-4 py-2 rounded-lg border-2 border-orange-200 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Dosya Seç
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              {selectedFile && (
                <span className="text-sm text-gray-600">{selectedFile.name}</span>
              )}
            </div>

            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2 w-fit"
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

            {message && (
              <div className={`flex items-start gap-2 p-4 rounded-lg ${
                message.type === 'success' 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                {message.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <span className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
                  {message.text}
                </span>
              </div>
            )}

            <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="font-medium mb-2">📌 Önemli Notlar:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Excel dosyası ekran görüntüsündeki formatta olmalıdır</li>
                <li>Veri 2. satırdan başlamalı ve I sütununda bitmelidir</li>
                <li>Firmalar arasında 2 satır boşluk olmalıdır</li>
                <li>Dosya yüklendiğinde mevcut veriler silinip yeni veriler eklenecektir</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Data Display */}
        {companyData.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Henüz veri yüklenmemiş</p>
            <p className="text-gray-400 text-sm mt-2">Excel dosyasını yükleyerek başlayın</p>
          </div>
        ) : (
          <div className="space-y-6">
            {companyData.map((company, idx) => (
              <div key={idx} className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Company Header */}
                <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-6 h-6" />
                      <h3 className="text-2xl font-bold">{company.firma_adi}</h3>
                    </div>
                    <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                      <p className="text-sm opacity-90">Toplam Personel</p>
                      <p className="text-3xl font-bold">{company.total}</p>
                    </div>
                  </div>
                </div>

                {/* Departments */}
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(company.departments).map(([deptName, deptData], deptIdx) => (
                      <div 
                        key={deptIdx} 
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-orange-600" />
                            <h4 className="font-semibold text-gray-900">{deptName}</h4>
                          </div>
                          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-semibold">
                            {deptData.total}
                          </span>
                        </div>

                        {deptData.subDepartments && Object.keys(deptData.subDepartments).length > 0 && (
                          <div className="space-y-2 mt-3 pt-3 border-t border-gray-200">
                            {Object.entries(deptData.subDepartments).map(([subDept, count], subIdx) => (
                              <div 
                                key={subIdx} 
                                className="flex justify-between items-center text-sm bg-gray-50 px-3 py-2 rounded"
                              >
                                <span className="text-gray-700">{subDept}</span>
                                <span className="font-medium text-gray-900">{count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
