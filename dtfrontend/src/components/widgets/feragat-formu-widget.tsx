"use client"

import { useState, useEffect, useRef } from "react"
import { Download } from "lucide-react"
import { api } from "@/lib/api"

// Widget configuration
FeragatFormuWidget.config = {
    id: "feragat_formu-widget",
    name: "Feragat Formu",
    type: "feragat_formu",
    color: "bg-blue-500",
    description: "Feragat Formu - PDF olarak indir",
    size: { width: 6, height: 4 }
}

interface AttributeData {
    name: string
    value: any
    updated_at: string
}

interface StepInfo {
    assignee: string
    completed_at: string
    fullName?: string
}

interface StepDataMap {
    [gorev: string]: StepInfo
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
        if (typeof jsonbValue === 'object' && jsonbValue !== null) {
            if ('name' in jsonbValue) {
                return jsonbValue.name
            }
            return JSON.stringify(jsonbValue)
        }
        
        if (typeof jsonbValue === 'string') {
            try {
                const parsed = JSON.parse(jsonbValue)
                if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
                    return parsed.name
                }
                return parsed
            } catch {
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
    const [stepData, setStepData] = useState<StepDataMap>({})
    const [loading, setLoading] = useState(true)
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [jobInstanceId, setJobInstanceId] = useState<string>('')

    const seyirDbConfig = {
        db_type: 'postgresql',
        host: '10.60.139.11',
        port: 5437,
        database: 'aflow_db',
        user: 'postgres',
        password: 'postgres'
    }

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search)
            const jobId = params.get('job_instance_id')
            if (jobId) {
                setJobInstanceId(jobId)
            }
        }
    }, [])

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
                // Fetch form attributes
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
                
                // Fetch step definitions for E, F, G sections from job_step_instances
                const stepSql = `
                    SELECT 
                        sd.name,
                        si.assignee,
                        si.completed_at
                    FROM 
                        job_step_instances si
                    LEFT JOIN step_definitions sd ON si.step_definition_id = sd.id
                    WHERE si.job_id = '${jobInstanceId}'
                    AND sd.name LIKE '%Onayı'
                    AND si.status = 'done'
                    ORDER BY sd.id
                `
                
                const stepRows = await runQuery(stepSql, seyirDbConfig)
                
                if (cancelled) return
                
                const stepDataMap: StepDataMap = {}
                const userCache: { [username: string]: any } = {}
                
                // First, collect all unique assignees
                const assignees = new Set<string>()
                stepRows.forEach(row => {
                    const assignee = row[1] || ''
                    if (assignee) assignees.add(assignee)
                })
                
                // Fetch user info from Pocketbase for all assignees
                for (const username of Array.from(assignees)) {
                    try {
                        const userRes = await api.get(`/feragat-formu/get-user-info?username=${encodeURIComponent(username)}`)
                        if ((userRes as any).name || (userRes as any).surname) {
                            userCache[username] = {
                                name: (userRes as any).name || '',
                                surname: (userRes as any).surname || ''
                            }
                        } else {
                            userCache[username] = { name: username, surname: '' }
                        }
                    } catch (err) {
                        console.error(`Failed to fetch user ${username}:`, err)
                        userCache[username] = { name: username, surname: '' }
                    }
                }
                
                // Build step data with full names
                stepRows.forEach(row => {
                    const name = row[0] || ''
                    const assignee = row[1] || ''
                    const completed_at = row[2] || ''
                    
                    // Remove " Onayı" suffix to get the Görev name
                    const gorev = name.replace(' Onayı', '').trim()
                    
                    if (gorev && assignee) {
                        const userInfo = userCache[assignee] || { name: assignee, surname: '' }
                        const fullName = `${userInfo.name} ${userInfo.surname}`.trim()
                        
                        stepDataMap[gorev] = {
                            assignee: assignee,
                            completed_at: completed_at,
                            fullName: fullName
                        }
                    }
                })
                
                setStepData(stepDataMap)
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
            const feragatTuru = getFieldValue('Feragat Türü')
            const title = feragatTuru === 'Alt Yüklenici' ? 'Alt_Yüklenici_Feragat_Formu' : 'Uyarlama_Feragat_Formu'
            a.download = `${title}_${jobInstanceId}.pdf`
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

    const getFieldValue = (fieldName: string): string => {
        const field = data.find(d => d.name.includes(fieldName))
        return field ? extractValue(field.value) : ''
    }
    
    const getSignature = (gorev: string): string => {
        const signatureKey = `${gorev} Onayı`
        return getFieldValue(signatureKey)
    }
    
    const getRiskData = (attributeName: string) => {
        const field = data.find(d => d.name === attributeName)
        if (!field || !field.value) return []
        
        try {
            let riskList = []
            if (typeof field.value === 'string') {
                let riskValue = field.value
                try {
                    riskList = JSON.parse(riskValue)
                } catch (err) {
                    riskValue = riskValue.replace(/'/g, '"')
                    riskList = JSON.parse(riskValue)
                }
            } else if (Array.isArray(field.value)) {
                riskList = field.value
            }
            
            return riskList.map((item: any) => {
                const sorumluRaw = item.sorumlu || ''
                let sorumluName = ''
                
                // Extract name from sorumlu array: sorumlu[0]["name"]
                if (Array.isArray(sorumluRaw) && sorumluRaw.length > 0) {
                    const firstItem = sorumluRaw[0]
                    if (typeof firstItem === 'object' && firstItem.name) {
                        sorumluName = firstItem.name
                    }
                } else if (typeof sorumluRaw === 'string') {
                    sorumluName = sorumluRaw
                }
                
                return {
                    riskler: item.riskler || '',
                    eylem_plani: item.risk_azaltici_onleyici_faaliyetler_eylem_plani || '',
                    sorumlu: sorumluName
                }
            })
        } catch (err) {
            console.error(`Failed to parse ${attributeName}:`, err)
            return []
        }
    }
    
    const getGerekceData = () => {
        const field = data.find(d => d.name === 'Feragate Ait Gerekçeler')
        if (!field || !field.value) return []
        
        try {
            let gerekceList: string[] = []
            let parsedValue: any[] = []
            
            if (typeof field.value === 'string') {
                let gerekceValue = field.value
                try {
                    parsedValue = JSON.parse(gerekceValue)
                } catch (err) {
                    gerekceValue = gerekceValue.replace(/'/g, '"')
                    parsedValue = JSON.parse(gerekceValue)
                }
            } else if (Array.isArray(field.value)) {
                parsedValue = field.value
            }
            
            // Each item is a dict with one key:value, extract the value
            for (const item of parsedValue) {
                if (typeof item === 'object' && item !== null) {
                    // Get the first value from the object
                    for (const key in item) {
                        if (item.hasOwnProperty(key)) {
                            gerekceList.push(String(item[key]))
                            break // Only take the first value
                        }
                    }
                } else if (typeof item === 'string') {
                    gerekceList.push(item)
                }
            }
            
            return gerekceList
        } catch (err) {
            console.error('Failed to parse Feragate Ait Gerekçeler:', err)
            return []
        }
    }
    
    const getTalepItems = () => {
        const items: string[] = []
        for (const attr of data) {
            if (attr.name.includes('Detaylı açıklayınız')) {
                items.push(extractValue(attr.value))
            }
        }
        return items.length > 0 ? items : ['', '']
    }
    
    const getHakkindaGerekceData = () => {
        const gerekceItems: { [key: string]: string[] } = {}
        
        for (const attr of data) {
            if (attr.name.includes('Hakkında Gerekçeler')) {
                const feragatName = attr.name.replace(' Hakkında Gerekçeler', '')
                
                try {
                    let parsedValue: any[] = []
                    
                    if (typeof attr.value === 'string') {
                        let gerekceValue = attr.value
                        try {
                            parsedValue = JSON.parse(gerekceValue)
                        } catch (err) {
                            gerekceValue = gerekceValue.replace(/'/g, '"')
                            parsedValue = JSON.parse(gerekceValue)
                        }
                    } else if (Array.isArray(attr.value)) {
                        parsedValue = attr.value
                    }
                    
                    const gerekceList: string[] = []
                    for (const item of parsedValue) {
                        if (typeof item === 'object' && item !== null) {
                            for (const key in item) {
                                if (item.hasOwnProperty(key)) {
                                    gerekceList.push(String(item[key]))
                                    break
                                }
                            }
                        } else if (typeof item === 'string') {
                            gerekceList.push(item)
                        }
                    }
                    
                    gerekceItems[feragatName] = gerekceList.length > 0 ? gerekceList : ['']
                } catch (err) {
                    console.error(`Failed to parse ${attr.name}:`, err)
                    gerekceItems[feragatName] = ['']
                }
            }
        }
        
        return gerekceItems
    }
    
    const getUyarlamaRiskData = () => {
        const field = data.find(d => d.name === 'Feragatin Olası Etkileri (Riskler/Eylem Planı)')
        if (!field || !field.value) return []
        
        try {
            let riskList: any[] = []
            
            if (typeof field.value === 'string') {
                let riskValue = field.value
                try {
                    riskList = JSON.parse(riskValue)
                } catch (err) {
                    riskValue = riskValue.replace(/'/g, '"')
                    riskList = JSON.parse(riskValue)
                }
            } else if (Array.isArray(field.value)) {
                riskList = field.value
            }
            
            return riskList.map((item: any) => {
                const sorumluRaw = item.sorumlu || ''
                let sorumluName = ''
                
                if (Array.isArray(sorumluRaw) && sorumluRaw.length > 0) {
                    const firstItem = sorumluRaw[0]
                    if (typeof firstItem === 'object' && firstItem.name) {
                        sorumluName = firstItem.name
                    }
                } else if (typeof sorumluRaw === 'string') {
                    sorumluName = sorumluRaw
                }
                
                return {
                    riskler: item.riskler_riziko_no || '',
                    eylem_plani: item.risk_azaltici_onleyici_faaliyetler_eylem_plani || '',
                    sorumlu: sorumluName
                }
            })
        } catch (err) {
            console.error('Failed to parse Uyarlama risk data:', err)
            return []
        }
    }

    const formatDate = (dateStr: string): string => {
        if (!dateStr) return ''
        try {
            const date = new Date(dateStr)
            return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        } catch {
            return dateStr
        }
    }

    const feragatTuru = getFieldValue('Feragat Türü')
    const projeTuru = getFieldValue('Proje Türü')
    
    const getTitle = (): string => {
        return feragatTuru === 'Alt Yüklenici' ? 'Alt Yüklenici Feragat Formu' : 'Uyarlama Feragat Formu'
    }

    const getGorevList = (): string[] => {
        if (projeTuru === 'Radar') {
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
        } else if (projeTuru === 'Elektronik Harp') {
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
    
    const getSorumluLabel = (): string => {
        return feragatTuru === 'Alt Yüklenici' ? 'AY Sorumlusu' : 'Feragat Sorumlusu'
    }
    
    const getSorumluValue = (): string => {
        const field = data.find(d => d.name === 'İşin Sorumlusu')
        if (!field || !field.value) return ''
        
        try {
            let isinList = []
            if (typeof field.value === 'string') {
                let isinValue = field.value
                try {
                    isinList = JSON.parse(isinValue)
                } catch (err) {
                    isinValue = isinValue.replace(/'/g, '"')
                    isinList = JSON.parse(isinValue)
                }
            } else if (Array.isArray(field.value)) {
                isinList = field.value
            }
            
            if (isinList.length > 0) {
                const item = isinList[0]
                if (typeof item === 'object') {
                    const name = item.name || ''
                    return name
                }
            }
            
            return ''
        } catch (err) {
            console.error('Failed to parse İşin Sorumlusu/Bölümü:', err)
            return ''
        }
    }
    
    const getFeragatSorumlusuValue = (): string => {
        const sorumluLabel = getSorumluLabel()
        const field = data.find(d => d.name === sorumluLabel)
        if (!field || !field.value) return ''
        
        let value = field.value
        
        // If it's a JSON string, parse it first
        if (typeof value === 'string') {
            try {
                value = value.replace(/'/g, '"')
                value = JSON.parse(value)
            } catch {
                // Not JSON, return as is
                return value
            }
        }
        
        // If it's an array, get the first item and extract name
        if (Array.isArray(value) && value.length > 0) {
            const firstItem = value[0]
            if (typeof firstItem === 'object' && firstItem !== null && 'name' in firstItem) {
                return String(firstItem.name)
            }
            // If first item is a string, return it
            if (typeof firstItem === 'string') {
                return firstItem
            }
        }
        
        // If it's an object with a 'name' property, return the name
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            if ('name' in value) {
                return String(value.name)
            }
        }
        
        // Last resort: stringify the object
        console.warn(`${sorumluLabel} has unexpected structure:`, value)
        return JSON.stringify(value)
    }

    if (loading) {
        return (
            <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600 mt-2">Yükleniyor...</p>
            </div>
        )
    }

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
        <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col gap-3 overflow-auto">
            {/* Header with Download Button */}
            <div className="flex items-center justify-between flex-shrink-0 pb-2 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-800">{getTitle()}</h3>
                <button
                    onClick={handleDownloadPdf}
                    disabled={downloading || data.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                    <Download className="w-4 h-4" />
                    {downloading ? 'İndiriliyor...' : 'PDF İndir'}
                </button>
            </div>

            {/* Form Preview */}
            {data.length > 0 ? (
                <div className="flex-1 overflow-auto">
                    <div className="border border-gray-300 bg-white p-4 space-y-3">
                        {/* PDF Header */}
                        <div className="grid grid-cols-8 gap-2 border-2 border-black">
                            <div className="col-span-2 row-span-2 border-r-2 border-black p-2 flex flex-col justify-center items-center">
                                <img src="/feragat_aselsan.jpg" alt="Aselsan Logo" className="max-w-50 max-h-full object-contain" />
                            </div>
                            <div className="col-span-5 row-span-2 border-r-2 border-black p-2 flex items-center justify-center">
                                <div className="text-base font-bold text-blue-900 text-center">{getTitle()}</div>
                            </div>
                            <div className="row-span-1 bg-blue-100 border-b border-black p-1 flex items-center justify-center">
                                <div className="text-[9px] font-bold text-blue-900">Feragat No:</div>
                            </div>
                            <div className="row-span-1 bg-white p-1 flex items-center justify-center">
                                <div className="text-[9px] text-gray-700">{getFieldValue('Feragat No')}</div>
                            </div>
                        </div>

                        {/* A. GENEL BİLGİLER */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                A. GENEL BİLGİLER
                            </div>
                            
                            {feragatTuru === 'Alt Yüklenici' ? (
                                <>
                                    {/* Alt Yüklenici Layout */}
                                    {/* Row 1: Three columns */}
                                    <div className="border border-black">
                                        <table className="w-full text-[10px]">
                                            <tbody>
                                                <tr>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '37.5%' }}>
                                                        <div className="font-bold text-blue-900">1. Firma Adı/Satıcı No</div>
                                                        <div className="mt-1">{getFieldValue('Firma Adı/ Satıcı no')}</div>
                                                    </td>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">2. Firmaya Daha Önceden Gerçekleştirilen Tetkik</div>
                                                        <div className="mt-1">{getFieldValue('Firmaya Daha Önceden Gerçekleştirilen Tetkik')}</div>
                                                    </td>
                                                    <td className="p-2 bg-blue-50" style={{ width: '37.5%' }}>
                                                        <div className="font-bold text-blue-900">3. Firmaya Ait Önceden Alınan Feragatler</div>
                                                        <div className="mt-1">{getFieldValue('Firmaya Ait Önceden Alınan Feragatler')}</div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    {/* Row 2: Four columns */}
                                    <div className="border-l border-r border-b border-black">
                                        <table className="w-full text-[10px]">
                                            <tbody>
                                                <tr>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">4. Proje No</div>
                                                        <div className="mt-1">{getFieldValue('Proje No (Proje kodu ve U-P\'li kodu XXXX/PYYYYYYY)')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">5. Proje Tanımı</div>
                                                        <div className="mt-1">{getFieldValue('Proje Tanımı ( Proje Adı)')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">6. Müşteri</div>
                                                        <div className="mt-1">{getFieldValue('Müşteri ( Proje Ana Sözleşmesi\'nin imza makamı )')}</div>
                                                    </td>
                                                    <td className="border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">7. Proje Tipi</div>
                                                        <div className="mt-1">{getFieldValue('Proje Tipi')}</div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    {/* Row 3: Six columns */}
                                    <div className="border-l border-r border-b border-black">
                                        <table className="w-full text-[10px]">
                                            <tbody>
                                                <tr>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '12.5%' }}>
                                                        <div className="font-bold text-blue-900">8. Malzeme No</div>
                                                        <div className="mt-1">{getFieldValue('Malzeme No')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">9. Malzeme Tanımı</div>
                                                        <div className="mt-1">{getFieldValue('Malzeme Tanımı')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '12.5%' }}>
                                                        <div className="font-bold text-blue-900">10. Alım Türü</div>
                                                        <div className="mt-1">{getFieldValue('Alım Türü')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '12.5%' }}>
                                                        <div className="font-bold text-blue-900">11. Alım Adedi</div>
                                                        <div className="mt-1">{getFieldValue('Alım Adedi')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">12. İşin Sorumlusu/Bölümü</div>
                                                        <div className="mt-1">{getSorumluValue()}</div>
                                                    </td>
                                                    <td className="border-t border-black p-2 bg-blue-50" style={{ width: '12.5%' }}>
                                                        <div className="font-bold text-blue-900">13. Bildirim No</div>
                                                        <div className="mt-1">{getFieldValue('Feragat Bildirim No')}</div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Uyarlama Layout (Radar/EH) */}
                                    {/* Row 1: Four columns */}
                                    <div className="border border-black">
                                        <table className="w-full text-[10px]">
                                            <tbody>
                                                <tr>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">1. Proje No</div>
                                                        <div className="mt-1">{getFieldValue('Proje No (Proje kodu ve U-P\'li kodu XXXX/PYYYYYYY)')}</div>
                                                    </td>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">2. Proje Tanımı</div>
                                                        <div className="mt-1">{getFieldValue('Proje Tanımı ( Proje Adı)')}</div>
                                                    </td>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">3. Müşteri</div>
                                                        <div className="mt-1">{getFieldValue('Müşteri ( Proje Ana Sözleşmesi\'nin imza makamı )')}</div>
                                                    </td>
                                                    <td className="p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">4. Proje Tipi</div>
                                                        <div className="mt-1">{getFieldValue('Proje Tipi')}</div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    {/* Row 2: Four columns */}
                                    <div className="border-l border-r border-b border-black">
                                        <table className="w-full text-[10px]">
                                            <tbody>
                                                <tr>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">5. Proje Aşaması</div>
                                                        <div className="mt-1">{getFieldValue('Proje Aşaması')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">6. Proje Süresi (ay)</div>
                                                        <div className="mt-1">{getFieldValue('Proje Süresi (ay)')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '12.5%' }}>
                                                        <div className="font-bold text-blue-900">7. İlgili Süreçler</div>
                                                        <div className="mt-1">{getFieldValue('İlgili Süreçler')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '12.5%' }}>
                                                        <div className="font-bold text-blue-900">8. {getSorumluLabel()}</div>
                                                        <div className="mt-1">{getFeragatSorumlusuValue()}</div>
                                                    </td>
                                                    <td className="border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">9. Feragat Bildirim Numarası</div>
                                                        <div className="mt-1">{getFieldValue('Feragat Bildirim No')}</div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* B. TALEP EDİLEN FERAGAT / DEĞERLENDİRMELER */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                {feragatTuru === 'Alt Yüklenici' ? 'B. FERAGATE AİT DEĞERLENDİRMELER' : 'B. TALEP EDİLEN FERAGAT'}
                            </div>
                            {feragatTuru === 'Alt Yüklenici' ? (
                                <div className="border border-black">
                                    <table className="w-full text-[10px]">
                                        <tbody>
                                            {/* B1 */}
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black p-2 font-bold text-center bg-gray-200 w-16 align-top">B1</td>
                                                <td className="border-r border-black p-2 align-top w-1/2">
                                                    Firmanın onaylı olduğu bir faaliyet var mı, varsa nelerdir?
                                                </td>
                                                <td className="p-2 align-top bg-gray-50">{getFieldValue('Firmanın onaylı olduğu bir faaliyet var mı, varsa nelerdir?')}</td>
                                            </tr>
                                            
                                            {/* B2 */}
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black p-2 font-bold text-center bg-gray-200 align-top">B2</td>
                                                <td className="border-r border-black p-2 align-top">
                                                    Firma hangi faaliyet alanlarında feragat alacaktır?
                                                </td>
                                                <td className="p-2 align-top bg-gray-50">{getFieldValue('Firma hangi faaliyet alanlarında feragat alacaktır?')}</td>
                                            </tr>
                                            
                                            {/* B3 */}
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black p-2 font-bold text-center bg-gray-200 align-top">B3</td>
                                                <td className="border-r border-black p-2 align-top">
                                                    <div className="mb-2">Firmaya daha önce bir tetkik / ön ziyaret gerçekleştirildi mi ?</div>
                                                    <div className="ml-2 space-y-1">
                                                        <div>a) Tetkik Tarihi</div>
                                                        <div>b) Tetkikte ortaya çıkan başlıca tespitler nelerdir ?</div>
                                                    </div>
                                                </td>
                                                <td className="p-2 align-top bg-gray-50">
                                                    <div className="mb-2">{getFieldValue('Firmaya daha önce bir tetkik / ön ziyaret gerçekleştirildi mi ?') === 'true' ? 'Evet' : 'Hayır'}</div>
                                                    {getFieldValue('Firmaya daha önce bir tetkik / ön ziyaret gerçekleştirildi mi ?') === 'true' && (
                                                        <div className="ml-2 space-y-1">
                                                            <div>{getFieldValue('Tetkik Tarihi')}</div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                            
                                            {/* B4 */}
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black p-2 font-bold text-center bg-gray-200 align-top">B4</td>
                                                <td className="border-r border-black p-2 align-top">
                                                    <div className="mb-2">Firmaya Ait Önceden Alınan Feragat var mı ?</div>
                                                    <div className="ml-2 space-y-1">
                                                        <div>a. Feragat Tarihi</div>
                                                        <div>b. Feragat Alınan Konu (X birimi tasarımı/üretimi vb.)</div>
                                                        <div>c. Feragatlere konulan ödeme şerhi var mı? Varsa son durumu nedir?</div>
                                                    </div>
                                                </td>
                                                <td className="p-2 align-top bg-gray-50">
                                                    <div className="mb-2">{getFieldValue('Firmaya Ait Önceden Alınan Feragat var mı ?') === 'true' ? 'Evet' : 'Hayır'}</div>
                                                    {getFieldValue('Firmaya Ait Önceden Alınan Feragat var mı ?') === 'true' && (
                                                        <div className="ml-2 space-y-1">
                                                            <div>{getFieldValue('Feragat Tarihi')}</div>
                                                            <div>{getFieldValue('Feragat Alınan Konu (X birimi tasarımı/üretimi vb.)')}</div>
                                                            <div>{getFieldValue('Feragatlere konulan ödeme şerhi var mı? Varsa son durumu nedir?')}</div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                            
                                            {/* B5 */}
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black p-2 font-bold text-center bg-gray-200 align-top">B5</td>
                                                <td className="border-r border-black p-2 align-top">
                                                    <div className="mb-2">Sipariş geçilmeden önce onaylı AY başvurusu sağlandı mı ?</div>
                                                    <div className="ml-2">a) Başvuru Tarihi</div>
                                                </td>
                                                <td className="p-2 align-top bg-gray-50">
                                                    <div className="mb-2">{getFieldValue('Sipariş geçilmeden önce onaylı AY başvurusu sağlandı mı ?') === 'true' ? 'Evet' : 'Hayır'}</div>
                                                    {getFieldValue('Sipariş geçilmeden önce onaylı AY başvurusu sağlandı mı ?') === 'true' && (
                                                        <div className="ml-2">{getFieldValue('Başvuru Tarihi')}</div>
                                                    )}
                                                </td>
                                            </tr>
                                            
                                            {/* B6 */}
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black p-2 font-bold text-center bg-gray-200 align-top">B6</td>
                                                <td className="border-r border-black p-2 align-top">
                                                    <div className="mb-2">Teklif dönemi/öncesinde, teknik isterlerin yanı sıra idari/kalite isterleri firmaya iletildi mi?</div>
                                                    <div className="ml-2">a) Firmaya KGK'ların nasıl aktarılacağı bilgisi</div>
                                                </td>
                                                <td className="p-2 align-top bg-gray-50">
                                                    <div className="mb-2">{getFieldValue('Teklif dönemi/öncesinde, teknik isterlerin yanı sıra idari/kalite isterleri firmaya iletildi mi?') === 'true' ? 'Evet' : 'Hayır'}</div>
                                                    <div className="ml-2">
                                                        {getFieldValue('Teklif dönemi/öncesinde, teknik isterlerin yanı sıra idari/kalite isterleri firmaya iletildi mi?') === 'true' 
                                                            ? getFieldValue('Firmaya iletilen KGK\'lar')
                                                            : getFieldValue('Firmaya KGK\'ların nasıl aktarılacağı bilgisi')}
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="border border-black">
                                    <table className="w-full text-[10px]">
                                        <tbody>
                                            {(() => {
                                                const talepItems = getTalepItems()
                                                return talepItems.map((item: string, idx: number) => (
                                                    <tr key={idx} className="border-b border-black last:border-b-0">
                                                        <td className="border-r border-black p-2 font-bold text-center bg-gray-100 w-12 align-top">{idx + 1}</td>
                                                        <td className="p-2 align-top bg-gray-50">{item}</td>
                                                    </tr>
                                                ))
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* C. FERAGATE AİT GEREKÇELER */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                C. FERAGATE AİT GEREKÇELER
                            </div>
                            {feragatTuru === 'Alt Yüklenici' ? (
                                <div className="border border-black">
                                    <table className="w-full text-[10px]">
                                        <tbody>
                                            {(() => {
                                                const gerekceList = getGerekceData()
                                                if (gerekceList.length === 0) {
                                                    return (
                                                        <tr className="border-b border-black">
                                                            <td className="border-r border-black p-2 font-bold text-center bg-gray-200 w-16 align-top">C1</td>
                                                            <td className="p-2 align-top bg-gray-50"></td>
                                                        </tr>
                                                    )
                                                }
                                                return gerekceList.map((gerekce: string, idx: number) => (
                                                    <tr key={idx} className="border-b border-black">
                                                        <td className="border-r border-black p-2 font-bold text-center bg-gray-200 w-16 align-top">C{idx + 1}</td>
                                                        <td className="p-2 align-top bg-gray-50">{gerekce}</td>
                                                    </tr>
                                                ))
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="border border-black">
                                    <table className="w-full text-[10px]">
                                        <tbody>
                                            {(() => {
                                                const hakkindaData = getHakkindaGerekceData()
                                                const rows: React.ReactElement[] = []
                                                
                                                Object.entries(hakkindaData).forEach(([feragatName, gerekceList]) => {
                                                    gerekceList.forEach((gerekce: string, idx: number) => {
                                                        rows.push(
                                                            <tr key={`${feragatName}-${idx}`} className="border-b border-black last:border-b-0">
                                                                {idx === 0 ? (
                                                                    <td 
                                                                        className="border-r border-black p-2 align-top bg-blue-50 font-bold text-blue-900"
                                                                        rowSpan={gerekceList.length}
                                                                        style={{ width: '25%' }}
                                                                    >
                                                                        <div>{feragatName}</div>
                                                                        <div>Hakkında Gerekçeler</div>
                                                                    </td>
                                                                ) : null}
                                                                <td className="border-r border-black p-2 font-bold text-center bg-gray-100 align-top" style={{ width: '10%' }}>
                                                                    {idx + 1}
                                                                </td>
                                                                <td className="p-2 align-top bg-gray-50">{gerekce}</td>
                                                            </tr>
                                                        )
                                                    })
                                                })
                                                
                                                return rows.length > 0 ? rows : (
                                                    <tr className="border-b border-black">
                                                        <td className="border-r border-black p-2 align-top bg-blue-50 font-bold text-blue-900" style={{ width: '25%' }}>
                                                            Gerekçe
                                                        </td>
                                                        <td className="border-r border-black p-2 font-bold text-center bg-gray-100 align-top" style={{ width: '10%' }}>1</td>
                                                        <td className="p-2 align-top bg-gray-50"></td>
                                                    </tr>
                                                )
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* D. FERAGATİN OLASI ETKİLERİ */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                D. FERAGATİN OLASI ETKİLERİ
                            </div>
                            {feragatTuru === 'Alt Yüklenici' ? (
                                <div className="space-y-0">
                                    {/* İdari Riskler/Eylem Planı */}
                                    <div className="border border-black border-b-0">
                                        <div className="bg-blue-900 text-white text-center py-1 text-[10px] font-bold">
                                            İdari Riskler/Eylem Planı
                                        </div>
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="bg-gray-200 border-t border-b border-black">
                                                    <th className="border-r border-black p-1 font-bold text-center w-12"></th>
                                                    <th className="border-r border-black p-1 font-bold text-center w-80">Riskler</th>
                                                    <th className="border-r border-black p-1 font-bold text-center">Risk Azaltıcı/Önleyici Faaliyetler/Eylem Planı</th>
                                                    <th className="p-1 font-bold text-center">Sorumlu</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const idariRisks = getRiskData('Feragatin Olası Etkileri (İdari Riskler/Eylem Planı)')
                                                    if (idariRisks.length === 0) {
                                                        return (
                                                            <tr className="border-b border-black">
                                                                <td className="border-r border-black p-3 font-bold text-center bg-gray-200 align-top">İR.1</td>
                                                                <td className="border-r border-black p-3 align-top bg-gray-50"></td>
                                                                <td className="border-r border-black p-3 align-top bg-gray-50"></td>
                                                                <td className="p-3 align-top bg-gray-50"></td>
                                                            </tr>
                                                        )
                                                    }
                                                    return idariRisks.map((risk: any, idx: number) => (
                                                        <tr key={idx} className="border-b border-black">
                                                            <td className="border-r border-black p-3 font-bold text-center bg-gray-200 align-top">İR.{idx + 1}</td>
                                                            <td className="border-r border-black p-3 align-top bg-gray-50">{risk.riskler}</td>
                                                            <td className="border-r border-black p-3 align-top bg-gray-50">{risk.eylem_plani}</td>
                                                            <td className="p-3 align-top bg-gray-50">{risk.sorumlu}</td>
                                                        </tr>
                                                    ))
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    {/* Teknik Riskler/Eylem Planı */}
                                    <div className="border border-black border-b-0">
                                        <div className="bg-blue-900 text-white text-center py-1 text-[10px] font-bold">
                                            Teknik Riskler/Eylem Planı
                                        </div>
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="bg-gray-200 border-t border-b border-black">
                                                    <th className="border-r border-black p-1 font-bold text-center w-12"></th>
                                                    <th className="border-r border-black p-1 font-bold text-center w-80">Riskler</th>
                                                    <th className="border-r border-black p-1 font-bold text-center">Risk Azaltıcı/Önleyici Faaliyetler/Eylem Planı</th>
                                                    <th className="p-1 font-bold text-center">Sorumlu</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const teknikRisks = getRiskData('Feragatin Olası Etkileri (Teknik Riskler/Eylem Planı)')
                                                    if (teknikRisks.length === 0) {
                                                        return (
                                                            <tr className="border-b border-black">
                                                                <td className="border-r border-black p-3 font-bold text-center bg-gray-200 align-top">TR.1</td>
                                                                <td className="border-r border-black p-3 align-top bg-gray-50"></td>
                                                                <td className="border-r border-black p-3 align-top bg-gray-50"></td>
                                                                <td className="p-3 align-top bg-gray-50"></td>
                                                            </tr>
                                                        )
                                                    }
                                                    return teknikRisks.map((risk: any, idx: number) => (
                                                        <tr key={idx} className="border-b border-black">
                                                            <td className="border-r border-black p-3 font-bold text-center bg-gray-200 align-top">TR.{idx + 1}</td>
                                                            <td className="border-r border-black p-3 align-top bg-gray-50">{risk.riskler}</td>
                                                            <td className="border-r border-black p-3 align-top bg-gray-50">{risk.eylem_plani}</td>
                                                            <td className="p-3 align-top bg-gray-50">{risk.sorumlu}</td>
                                                        </tr>
                                                    ))
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    {/* Kalite Riskleri/Eylem Planı */}
                                    <div className="border border-black">
                                        <div className="bg-blue-900 text-white text-center py-1 text-[10px] font-bold">
                                            Kalite Riskleri/Eylem Planı
                                        </div>
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="bg-gray-200 border-t border-b border-black">
                                                    <th className="border-r border-black p-1 font-bold text-center w-12"></th>
                                                    <th className="border-r border-black p-1 font-bold text-center w-80">Riskler</th>
                                                    <th className="border-r border-black p-1 font-bold text-center">Risk Azaltıcı/Önleyici Faaliyetler/Eylem Planı</th>
                                                    <th className="p-1 font-bold text-center">Sorumlu</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const kaliteRisks = getRiskData('Feragatin Olası Etkileri (Kalite Riskleri/Eylem Planı)')
                                                    if (kaliteRisks.length === 0) {
                                                        return (
                                                            <tr className="border-b border-black">
                                                                <td className="border-r border-black p-3 font-bold text-center bg-gray-200 align-top">KR.1</td>
                                                                <td className="border-r border-black p-3 align-top bg-gray-50"></td>
                                                                <td className="border-r border-black p-3 align-top bg-gray-50"></td>
                                                                <td className="p-3 align-top bg-gray-50"></td>
                                                            </tr>
                                                        )
                                                    }
                                                    return kaliteRisks.map((risk: any, idx: number) => (
                                                        <tr key={idx} className="border-b border-black">
                                                            <td className="border-r border-black p-3 font-bold text-center bg-gray-200 align-top">KR.{idx + 1}</td>
                                                            <td className="border-r border-black p-3 align-top bg-gray-50">{risk.riskler}</td>
                                                            <td className="border-r border-black p-3 align-top bg-gray-50">{risk.eylem_plani}</td>
                                                            <td className="p-3 align-top bg-gray-50">{risk.sorumlu}</td>
                                                        </tr>
                                                    ))
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="border border-black">
                                    <table className="w-full text-[10px]">
                                        <thead>
                                            <tr className="bg-gray-200 border-b border-black">
                                                <th className="border-r border-black p-1 font-bold text-center" colSpan={2}>Riskler/Riziko No</th>
                                                <th className="border-r border-black p-1 font-bold text-center">Risk Azaltıcı/Önleyici Faaliyetler/Eylem Planı</th>
                                                <th className="p-1 font-bold text-center">Sorumlu</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const uyarlamaRisks = getUyarlamaRiskData()
                                                if (uyarlamaRisks.length === 0) {
                                                    return ['R.1', 'R.2', 'R.3'].map((label) => (
                                                        <tr key={label} className="border-b border-black last:border-b-0">
                                                            <td className="border-r border-black p-2 font-bold text-center bg-gray-200 align-top" style={{ width: '8%' }}>{label}</td>
                                                            <td className="border-r border-black p-2 align-top bg-gray-50" style={{ width: '25%' }}></td>
                                                            <td className="border-r border-black p-2 align-top bg-gray-50"></td>
                                                            <td className="p-2 align-top bg-gray-50" style={{ width: '20%' }}></td>
                                                        </tr>
                                                    ))
                                                }
                                                return uyarlamaRisks.map((risk: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-black last:border-b-0">
                                                        <td className="border-r border-black p-2 font-bold text-center bg-gray-200 align-top" style={{ width: '8%' }}>R.{idx + 1}</td>
                                                        <td className="border-r border-black p-2 align-top bg-gray-50" style={{ width: '25%' }}>{risk.riskler}</td>
                                                        <td className="border-r border-black p-2 align-top bg-gray-50">{risk.eylem_plani}</td>
                                                        <td className="p-2 align-top bg-gray-50" style={{ width: '20%' }}>{risk.sorumlu}</td>
                                                    </tr>
                                                ))
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* E. HAZIRLAYAN */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                E. HAZIRLAYAN
                            </div>
                            <div className="border border-gray-400">
                                <table className="w-full text-[10px]">
                                    <thead>
                                        <tr className="bg-gray-200 border-b border-gray-400">
                                            <th className="border-r border-gray-400 p-1 font-bold text-center">Görev</th>
                                            <th className="border-r border-gray-400 p-1 font-bold text-center">Ad/Soyad</th>
                                            <th className="border-r border-gray-400 p-1 font-bold text-center">Tarih</th>
                                            <th className="p-1 font-bold text-center">İmza</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {['Proje Yöneticisi', getSorumluLabel(), 'Sorumlu Müdür'].map((gorev, idx) => {
                                            const stepInfo = stepData[gorev] || {}
                                            const fullName = stepInfo.fullName || ''
                                            const completedAt = stepInfo.completed_at || ''
                                            const tarih = completedAt ? formatDate(completedAt) : ''
                                            const imza = getSignature(gorev)
                                            
                                            return (
                                                <tr key={idx} className="border-b border-gray-300">
                                                    <td className="border-r border-gray-400 p-1 font-bold bg-gray-100">{gorev}</td>
                                                    <td className="border-r border-gray-400 p-1">{fullName}</td>
                                                    <td className="border-r border-gray-400 p-1">{tarih}</td>
                                                    <td className="p-1">{imza}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* F. KONTROL */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                F. KONTROL
                            </div>
                            <div className="border border-black border-t-0">
                                <table className="w-full text-[10px]">
                                    <thead>
                                        <tr className="bg-gray-200 border-b border-black">
                                            <th className="border-r border-black p-1 font-bold text-center">Görev</th>
                                            <th className="border-r border-black p-1 font-bold text-center">Ad/Soyad</th>
                                            <th className="border-r border-black p-1 font-bold text-center">Tarih</th>
                                            <th className="p-1 font-bold text-center">İmza</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {getGorevList().length > 0 ? (
                                            getGorevList().map((gorev, idx) => {
                                                const stepInfo = stepData[gorev] || {}
                                                const fullName = stepInfo.fullName || ''
                                                const completedAt = stepInfo.completed_at || ''
                                                const tarih = completedAt ? formatDate(completedAt) : ''
                                                const imza = getSignature(gorev)
                                                
                                                return (
                                                    <tr key={idx} className="border-b border-black last:border-b-0">
                                                        <td className="border-r border-black p-2 align-top">{gorev}</td>
                                                        <td className="border-r border-black p-2 align-top bg-gray-50">{fullName}</td>
                                                        <td className="border-r border-black p-2 align-top bg-gray-50">{tarih}</td>
                                                        <td className="p-2 align-top bg-gray-50">{imza}</td>
                                                    </tr>
                                                )
                                            })
                                        ) : (
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black p-2 align-top" colSpan={4}>
                                                    <div className="text-center text-gray-500">Görev listesi tanımlı değil</div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* G. ONAY */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                G. ONAY
                            </div>
                            <div className="border border-black border-t-0">
                                <table className="w-full text-[10px]">
                                    <thead>
                                        <tr className="bg-gray-200 border-b border-black">
                                            <th className="border-r border-black p-1 font-bold text-center">Görev</th>
                                            <th className="border-r border-black p-1 font-bold text-center">Ad/Soyad</th>
                                            <th className="border-r border-black p-1 font-bold text-center">Tarih</th>
                                            <th className="p-1 font-bold text-center">İmza</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const gorev = 'REHİS Sektör Başkanı'
                                            const stepInfo = stepData[gorev] || {}
                                            const fullName = stepInfo.fullName || ''
                                            const completedAt = stepInfo.completed_at || ''
                                            const tarih = completedAt ? formatDate(completedAt) : ''
                                            const imza = getSignature(gorev)
                                            
                                            return (
                                                <tr className="border-b border-black">
                                                    <td className="border-r border-black p-2 align-top font-bold">{gorev}</td>
                                                    <td className="border-r border-black p-2 align-top bg-gray-50">{fullName}</td>
                                                    <td className="border-r border-black p-2 align-top bg-gray-50">{tarih}</td>
                                                    <td className="p-2 align-top bg-gray-50">{imza}</td>
                                                </tr>
                                            )
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-500 text-sm">Form verisi bulunamadı</p>
                </div>
            )}
        </div>
    )
}
