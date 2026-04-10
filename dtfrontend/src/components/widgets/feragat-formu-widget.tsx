"use client"

import { useState, useEffect, useRef } from "react"
import { Download } from "lucide-react"
import { api } from "@/lib/api"

// Widget configuration
FeragatFormuWidget.config = {
    id: "feragat_formu-widget",
    name: "Uyarlama Feragat Formu",
    type: "feragat_formu",
    color: "bg-blue-500",
    description: "Uyarlama Feragat Formu - PDF olarak indir",
    size: { width: 6, height: 4 }
}

interface AttributeData {
    name: string
    value: any
    updated_at: string
}

interface FeragatFormuWidgetProps {
    widgetId?: string
}

interface PreviewResponse {
    columns: string[]
    data: any[][] | null
    total_rows: number
    execution_time_ms: number
    success: boolean
    message?: string
}

async function runQuery(sql: string, dbConfig: any): Promise<any[][]> {
    const res = await api.post<PreviewResponse>('/reports/preview', {
        sql_query: sql,
        limit: 1000000,
        db_config: dbConfig,
    })
    if (!res.success) {
        throw new Error(res.message || 'Query failed')
    }
    if (res.success && res.data && res.data.length > 0) {
        return res.data
    }
    return []
}

function extractValue(jsonbValue: any): string {
    if (!jsonbValue) return ''
    
    try {
        // If it's already an object
        if (typeof jsonbValue === 'object' && jsonbValue !== null) {
            // If it has a name field (for user objects)
            if ('name' in jsonbValue) {
                return jsonbValue.name
            }
            // Otherwise return as JSON string
            return JSON.stringify(jsonbValue)
        }
        
        // If it's a string, try to parse it
        if (typeof jsonbValue === 'string') {
            try {
                const parsed = JSON.parse(jsonbValue)
                if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
                    return parsed.name
                }
                return parsed
            } catch {
                // If parsing fails, return as is
                return jsonbValue
            }
        }
        
        return String(jsonbValue)
    } catch (err) {
        console.error('Error extracting value:', err)
        return String(jsonbValue)
    }
}

export function FeragatFormuWidget({ widgetId }: FeragatFormuWidgetProps) {
    const instanceRef = useRef(widgetId || `feragat-formu-${Math.random().toString(36).substr(2, 9)}`)
    
    const [data, setData] = useState<AttributeData[]>([])
    const [loading, setLoading] = useState(true)
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [jobInstanceId, setJobInstanceId] = useState<string>('')

    // Database configuration for "seyir" platform
    const seyirDbConfig = {
        db_type: 'postgresql',
        host: '10.60.139.11',
        port: 5437,
        database: 'aflow_db',
        user: 'postgres',
        password: 'postgres'
    }

    // Extract job_instance_id from URL on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search)
            const jobId = params.get('job_instance_id')
            if (jobId) {
                setJobInstanceId(jobId)
            }
        }
    }, [])

    // Fetch form data
    useEffect(() => {
        if (!jobInstanceId) {
            setLoading(false)
            return
        }

        let cancelled = false
        setLoading(true)
        setError(null)

        const fetchData = async () => {
            try {
                console.log('[FeragatFormuWidget] Executing SQL with job_instance_id:', jobInstanceId)
                
                const sql = `
                    SELECT 
                        ad."name",
                        ia.value,
                        ia.updated_at
                    FROM 
                        job_instance_attributes ia
                    LEFT JOIN attribute_definitions ad ON ia.attribute_definition_id = ad.id
                    WHERE ia.job_instance_id = '${jobInstanceId}'
                    ORDER BY ad.id
                `

                const rows = await runQuery(sql, seyirDbConfig)
                
                if (cancelled) return

                const formattedData: AttributeData[] = rows.map(row => ({
                    name: row[0] || '',
                    value: row[1],
                    updated_at: row[2] || ''
                }))

                setData(formattedData)
            } catch (err: any) {
                if (!cancelled) {
                    console.error('Error loading feragat formu:', err)
                    setError(err?.message || 'Form verisi alınamadı')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        fetchData()
        return () => { cancelled = true }
    }, [jobInstanceId])

    const handleDownloadPdf = async () => {
        if (!jobInstanceId) {
            alert('Job Instance ID bulunamadı. URL\'de job_instance_id parametresi olmalı.')
            return
        }

        setDownloading(true)
        setError(null)

        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'}/feragat-formu/download-pdf?job_instance_id=${jobInstanceId}`,
                {
                    method: 'GET',
                    credentials: 'include',
                }
            )

            if (!response.ok) {
                throw new Error(`PDF indirme başarısız: ${response.statusText}`)
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `Uyarlama_Feragat_Formu_${jobInstanceId}.pdf`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch (err: any) {
            console.error('Error downloading PDF:', err)
            setError(err?.message || 'PDF indirme hatası')
        } finally {
            setDownloading(false)
        }
    }

    // Helper to get field value by name
    const getFieldValue = (fieldName: string): string => {
        const field = data.find(d => d.name.includes(fieldName))
        return field ? extractValue(field.value) : ''
    }

    // Get Görev list based on Feragat Türü
    const getGorevList = (): string[] => {
        const feragatTuru = getFieldValue('Feragat Türü')

        if (feragatTuru === 'Radar') {
            return [
                "Radar Program Dir.",
                "Radar Sistem Müh. Dir.",
                "Radom Düşük Gör. ve İleri Malz. Tsr. Dir.",
                "Yazılım Mühendisliği Dir.",
                "Mekanik Sis. Ve Platform Ent. Tsr. Dir.",
                "Süreç Tasarım ve Ürün Yön. Dir.",
                "Test ve Doğrulama Dir.",
                "Üretim Dir.",
                "Entegre Lojistik Destek Dir.",
                "Kalite Yönetim Dir."
            ]
        } else if (feragatTuru === 'Elektronik Harp') {
            return [
                "Elektronik Harp Prog. Dir",
                "Hab. EH ve Kendini Kor. Sis. Müh. Dir.",
                "Radar Elektronik Harp Sis. Müh. Dir.",
                "Donanım Tasarım Dir.",
                "Radom Düşük Gör. ve İleri Malz. Tsr. Dir.",
                "Yazılım Mühendisliği Dir.",
                "Mekanik Sis. Ve Platform Ent. Tsr. Dir.",
                "Süreç Tasarım ve Ürün Yön. Dir.",
                "Test ve Doğrulama Dir.",
                "Üretim Dir.",
                "Entegre Lojistik Destek Dir.",
                "Kalite Yönetim Dir."
            ]
        }
        
        return []
    }

    // Loading state
    if (loading) {
        return (
            <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600 mt-2">Yükleniyor...</p>
            </div>
        )
    }

    // Error state
    if (error) {
        return (
            <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                <p className="text-sm text-red-600 text-center mb-2">Hata: {error}</p>
                <button
                    onClick={() => { setError(null); setLoading(true) }}
                    className="mt-2 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Tekrar Dene
                </button>
            </div>
        )
    }

    // No job_instance_id provided
    if (!jobInstanceId) {
        return (
            <div className="w-full h-full p-6 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 text-center mb-2">URL'de job_instance_id parametresi bulunamadı</p>
                <p className="text-xs text-gray-400 text-center">Örnek: ?job_instance_id=123</p>
            </div>
        )
    }

    return (
        <div className="w-full h-full p-6 bg-gradient-to-br from-white to-blue-50 rounded-xl border border-blue-200 shadow-lg flex flex-col gap-4 overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    <div className="w-2 h-8 bg-gradient-to-b from-blue-500 to-blue-700 rounded-full shadow-md"></div>
                    <h3 className="text-xl font-bold text-gray-800 tracking-tight">Uyarlama Feragat Formu</h3>
                </div>
                
                <button
                    onClick={handleDownloadPdf}
                    disabled={downloading || data.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg font-medium"
                >
                    <Download className="w-4 h-4" />
                    {downloading ? 'İndiriliyor...' : 'Feragat Formunu İndir'}
                </button>
            </div>

            {/* Form Preview */}
            {data.length > 0 ? (
                <div className="bg-white border-2 border-blue-100 rounded-xl p-6 shadow-lg flex-1 overflow-auto">
                    {/* Aselsan Header */}
                    <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-blue-600">
                        <div className="flex items-center gap-4">
                            <div className="text-2xl font-bold text-blue-900">aselsan</div>
                            <div className="text-xs text-gray-600">
                                <div>POWER AND ELECTRONIC</div>
                                <div>RADAR AND ELECTRONIC WARFARE SYSTEMS</div>
                            </div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-blue-900 text-center">Uyarlama Feragat Formu</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-semibold text-gray-700">No:</div>
                        </div>
                    </div>

                    {/* A. GENEL BİLGİLER Section */}
                    <div className="mb-6">
                        <div className="bg-blue-700 text-white font-bold text-center py-2 mb-4">
                            A. GENEL BİLGİLER
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            {/* Row 1 */}
                            <div className="border-2 border-blue-300 bg-blue-50 p-3">
                                <div className="text-xs font-bold text-blue-900 mb-1">1. Proje No</div>
                                <div className="text-xs text-gray-600 mb-2">(Proje dörtlü kodu ve U-P'li kodu)</div>
                                <div className="text-sm font-semibold">{getFieldValue('Proje No')}</div>
                            </div>
                            
                            <div className="border-2 border-blue-300 bg-blue-50 p-3">
                                <div className="text-xs font-bold text-blue-900 mb-1">2. Proje Tanımı</div>
                                <div className="text-xs text-gray-600 mb-2">(Proje uzun adı yazılır..)</div>
                                <div className="text-sm font-semibold">{getFieldValue('Proje Tanımı')}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="border-2 border-blue-300 bg-blue-50 p-3">
                                <div className="text-xs font-bold text-blue-900 mb-1">3. Müşteri</div>
                                <div className="text-xs text-gray-600 mb-2">(Proje Ana Sözleşmesi'nin imza makamı yazılır..)</div>
                                <div className="text-sm font-semibold">{getFieldValue('Müşteri')}</div>
                            </div>
                            
                            <div className="border-2 border-blue-300 bg-blue-50 p-3">
                                <div className="text-xs font-bold text-blue-900 mb-1">4. Proje Tipi</div>
                                <div className="text-xs text-gray-600 mb-2">(Geliştirme, Üretim, Öz Kaynaklı vb. tiplerden biri yazılır..)</div>
                                <div className="text-sm font-semibold">{getFieldValue('Proje Tipi')}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                            <div className="border-2 border-blue-300 bg-blue-50 p-3">
                                <div className="text-xs font-bold text-blue-900 mb-1">5. Proje Aşaması</div>
                                <div className="text-xs text-gray-600 mb-2">Proje hangi fazdaysa (Geliştirme, doğrulama, seri üretim vb.) seçilir..</div>
                                <div className="text-sm font-semibold">{getFieldValue('Proje Aşaması')}</div>
                            </div>
                            
                            <div className="border-2 border-blue-300 bg-blue-50 p-3">
                                <div className="text-xs font-bold text-blue-900 mb-1">6. Proje Süresi (ay)</div>
                                <div className="text-xs text-gray-600 mb-2">(Proje süresi ay şeklinde yazılır..)</div>
                                <div className="text-sm font-semibold">{getFieldValue('Proje Süresi')}</div>
                            </div>

                            <div className="border-2 border-blue-300 bg-blue-50 p-3">
                                <div className="text-xs font-bold text-blue-900 mb-1">7. İlgili Süreçler</div>
                                <div className="text-xs text-gray-600 mb-2">(Hangi süreçler etkileniyorsa yazılır..)</div>
                                <div className="text-sm font-semibold">{getFieldValue('İlgili Süreçler')}</div>
                            </div>

                            <div className="border-2 border-blue-300 bg-blue-50 p-3">
                                <div className="text-xs font-bold text-blue-900 mb-1">8. Feragat Sorumlusu</div>
                                <div className="text-xs text-gray-600 mb-2">(Feragatin sorumlusu kişi/kisiler yazılır..)</div>
                                <div className="text-sm font-semibold">{getFieldValue('Feragat Sorumlusu')}</div>
                            </div>
                        </div>

                        <div className="mt-4 border-2 border-blue-300 bg-blue-50 p-3">
                            <div className="text-xs font-bold text-blue-900 mb-1">9. Feragat Bildirim Numarası</div>
                            <div className="text-xs text-gray-600 mb-2">(Feragatin koordinasyonu için başlatılan bildirim numarası yazılır..)</div>
                            <div className="text-sm font-semibold">{getFieldValue('Feragat Bildirim Numarası')}</div>
                        </div>
                    </div>

                    {/* B. TALEP EDİLEN FERAGAT Section */}
                    <div className="mb-6">
                        <div className="bg-blue-700 text-white font-bold text-center py-2 mb-4">
                            B. TALEP EDİLEN FERAGAT
                        </div>
                        
                        <div className="border-2 border-blue-300 p-4 bg-gray-50">
                            <div className="text-xs text-gray-700 leading-relaxed">
                                (Feragatin ne olduğu, hangi sürecin hangi adımından veya hangi sebepten dolayı feragat talındığı açık, net ve izlenebilir şekilde yazılır..)<br />
                                (Ör: MM-XXXX-YYYY stoklu seri üretim çıktısı olan biriminin ....... sebebiyle, prototip birimim müşteriye teslim edilecek sistemde kullanılması için feragat talep edilmektedir..)
                            </div>
                        </div>
                    </div>

                    {/* F. KONTROL Section */}
                    {getGorevList().length > 0 && (
                        <div className="mb-6">
                            <div className="bg-blue-700 text-white font-bold text-center py-2 mb-4">
                                F. KONTROL
                            </div>
                            
                            <div className="border-2 border-blue-300 rounded-lg overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-blue-100 border-b-2 border-blue-300">
                                            <th className="text-center py-2 px-3 font-bold text-blue-900 border-r border-blue-300">Görev</th>
                                            <th className="text-center py-2 px-3 font-bold text-blue-900 border-r border-blue-300">Ad Soyad</th>
                                            <th className="text-center py-2 px-3 font-bold text-blue-900 border-r border-blue-300">İmza</th>
                                            <th className="text-center py-2 px-3 font-bold text-blue-900">Tarih</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {getGorevList().map((gorev, idx) => (
                                            <tr key={idx} className="border-b border-blue-200 hover:bg-blue-50">
                                                <td className="py-3 px-3 text-gray-800 font-medium border-r border-blue-200">{gorev}</td>
                                                <td className="py-3 px-3 text-gray-700 border-r border-blue-200">&nbsp;</td>
                                                <td className="py-3 px-3 text-gray-700 border-r border-blue-200">&nbsp;</td>
                                                <td className="py-3 px-3 text-gray-700">&nbsp;</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Data Table */}
                    <div className="mt-6 border-2 border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-100 border-b border-gray-300">
                                    <th className="text-left py-2 px-3 font-bold text-gray-700">Alan Adı</th>
                                    <th className="text-left py-2 px-3 font-bold text-gray-700">Değer</th>
                                    <th className="text-left py-2 px-3 font-bold text-gray-700">Güncelleme Tarihi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-200 hover:bg-blue-50">
                                        <td className="py-2 px-3 text-gray-800 font-medium">{item.name}</td>
                                        <td className="py-2 px-3 text-gray-700">
                                            <div className="max-w-md truncate" title={extractValue(item.value)}>
                                                {extractValue(item.value)}
                                            </div>
                                        </td>
                                        <td className="py-2 px-3 text-gray-600">
                                            {item.updated_at ? new Date(item.updated_at).toLocaleString('tr-TR') : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white border-2 border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center">
                    <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-500 text-center">Bu Job Instance için form verisi bulunamadı</p>
                </div>
            )}
        </div>
    )
}
