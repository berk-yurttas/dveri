"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
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
    job_step_instance_id: string | null
}

interface StepInfo {
    id: string
    assignee: string
    completed_at: string
    fullName?: string
    status?: string
    attributes?: Array<{
        attribute_definition_id: string
        attribute_name: string
    }>
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

// Helper function to parse Python-style JSON strings
function parsePythonStyleJSON(str: string): any {
    // Try normal JSON parse first
    try {
        return JSON.parse(str)
    } catch (err) {
        // If that fails, handle Python-style strings by using eval
        // This converts Python dict/list syntax to JavaScript
        try {
            // Replace Python boolean/null values
            let cleaned = str
                .replace(/\bTrue\b/g, 'true')
                .replace(/\bFalse\b/g, 'false')
                .replace(/\bNone\b/g, 'null')
            
            // Use Function constructor to safely evaluate the expression
            // This handles single quotes properly without breaking values
            const result = new Function('return ' + cleaned)()
            return result
        } catch (evalErr) {
            console.error('Failed to parse Python-style JSON:', evalErr)
            throw err
        }
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
    const [currentUsername, setCurrentUsername] = useState<string>('')
    const [showActionModal, setShowActionModal] = useState(false)
    const [actionType, setActionType] = useState<'onayla' | 'serh'>('onayla')
    const [actionStepId, setActionStepId] = useState<string>('')
    const [explanation, setExplanation] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const seyirDbConfig = {
        db_type: 'postgresql',
        host: process.env.NEXT_PUBLIC_SEYIR_DB_HOST || '10.60.139.11',
        port: parseInt(process.env.NEXT_PUBLIC_SEYIR_DB_PORT || '5437'),
        database: process.env.NEXT_PUBLIC_SEYIR_DB_NAME || 'aflow_db',
        user: process.env.NEXT_PUBLIC_SEYIR_DB_USER || 'postgres',
        password: process.env.NEXT_PUBLIC_SEYIR_DB_PASSWORD || 'postgres'
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
        const fetchCurrentUser = async () => {
            try {
                const userRes = await api.get('/feragat-formu/get-current-user')
                if ((userRes as any).username) {
                    setCurrentUsername((userRes as any).username)
                }
            } catch (err) {
                console.error('Failed to fetch current user:', err)
            }
        }
        fetchCurrentUser()
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
                        ia.job_instance_id,
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
                    job_step_instance_id: row[1],
                    value: row[2],
                    updated_at: row[3] || ''
                }))

                setData(formattedData)
                
                // Fetch step definitions for E, F, G sections from job_step_instances
                const stepSql = `
                    SELECT 
                        si.id,
                        sd.name,
                        si.status,
                        COALESCE(si.assignee, jsia.username) as assignee,
                        si.completed_at,
                        si.workflow_step_id,
                        wsa.attribute_definition_id,
                        ad.name as attribute_name
                    FROM 
                        job_step_instances si
                    LEFT JOIN step_definitions sd ON si.step_definition_id = sd.id
                    LEFT JOIN job_step_instance_assignees jsia ON jsia.job_step_instance_id = si.id
                    LEFT JOIN workflow_step_attributes wsa ON si.workflow_step_id = wsa.workflow_step_id
                    LEFT JOIN attribute_definitions ad ON wsa.attribute_definition_id = ad.id
                    WHERE si.job_id = '${jobInstanceId}'
                    AND sd.name LIKE '%Onayı'
                    AND (ad.name LIKE '%Onayı' OR ad.name = 'Şerh Açıklaması' OR ad.name = 'Açıklama' OR ad.name IS NULL)
                    ORDER BY sd.id, wsa.attribute_definition_id
                `
                
                const stepRows = await runQuery(stepSql, seyirDbConfig)
                
                if (cancelled) return
                
                const stepDataMap: StepDataMap = {}
                const userCache: { [username: string]: any } = {}
                
                // First, collect all unique assignees and check for representation users
                const assignees = new Set<string>()
                const representationUsers = new Map<string, string>() // step_instance_id -> representation_user
                
                // Create promises for all outbox queries
                const outboxPromises = stepRows.map(async (row) => {
                    const stepInstanceId = row[0] || ''
                    const assignee = row[3] || ''
                    
                    if (assignee) assignees.add(assignee)
                    
                    // Check outbox_events for representation user
                    if (stepInstanceId) {
                        const outboxSql = `
                            SELECT payload
                            FROM outbox_events
                            WHERE aggregate_type = 'job_step_instance'
                            AND aggregate_id = '${stepInstanceId}'
                            AND event_type = 'STEP_STATUS_CHANGED'
                            ORDER BY created_at DESC
                            LIMIT 1
                        `
                        
                        try {
                            const outboxRows = await runQuery(outboxSql, seyirDbConfig)
                            if (outboxRows.length > 0 && outboxRows[0][0]) {
                                const payload = outboxRows[0][0]
                                
                                // Parse payload if it's a string
                                let payloadObj = payload
                                if (typeof payload === 'string') {
                                    try {
                                        payloadObj = parsePythonStyleJSON(payload)
                                    } catch (e) {
                                        console.error('Failed to parse payload:', e)
                                    }
                                }
                                
                                if (payloadObj && typeof payloadObj === 'object') {
                                    const newStatus = payloadObj.newStatus
                                    const changedBy = payloadObj.changedBy
                                    
                                    if (newStatus === 'done' && changedBy && changedBy !== assignee) {
                                        representationUsers.set(stepInstanceId, changedBy)
                                        assignees.add(changedBy) // Also fetch representation user's info
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`Failed to fetch outbox events for ${stepInstanceId}:`, err)
                        }
                    }
                })
                
                // Wait for all outbox queries to complete
                await Promise.all(outboxPromises)
                
                // Fetch user info from Pocketbase for all assignees and representation users in parallel
                const userFetchPromises = Array.from(assignees).map(async (username) => {
                    try {
                        const userRes = await api.get(`/feragat-formu/get-user-info?username=${encodeURIComponent(username)}`)
                        if ((userRes as any).name) {
                            return {
                                username,
                                data: {
                                    name: (userRes as any).name || '',
                                }
                            }
                        } else {
                            return {
                                username,
                                data: { name: username }
                            }
                        }
                    } catch (err) {
                        console.error(`Failed to fetch user ${username}:`, err)
                        return {
                            username,
                            data: { name: username }
                        }
                    }
                })
                
                // Wait for all user fetches to complete
                const userResults = await Promise.all(userFetchPromises)
                
                // Build userCache from results
                userResults.forEach(result => {
                    userCache[result.username] = result.data
                })
                
                // Build step data with full names
                stepRows.forEach(row => {
                    const stepInstanceId = row[0] || ''
                    const name = row[1] || ''
                    const status = row[2] || ''
                    const assignee = row[3] || ''
                    const completed_at = row[4] || ''
                    const workflow_step_id = row[5] || ''
                    const attribute_definition_id = row[6] || ''
                    const attribute_name = row[7] || ''
                    
                    // Remove " Onayı" suffix to get the Görev name
                    const gorev = name.replace(' Onayı', '').trim()
                    
                    if (gorev && assignee) {
                        const representationUser = representationUsers.get(stepInstanceId)
                        
                        let fullName = ''
                        if (representationUser && representationUser in userCache) {
                            // Use representation user's name with "(assignee adına vekaleten)"
                            const reprUserInfo = userCache[representationUser]
                            const assigneeUserInfo = userCache[assignee] || { name: assignee }
                            fullName = `${reprUserInfo.name} (${assigneeUserInfo.name} adına vekaleten)`.trim()
                        } else {
                            // Use regular assignee name
                            const userInfo = userCache[assignee] || { name: assignee }
                            fullName = `${userInfo.name}`.trim()
                        }
                        
                        // Initialize or update step data
                        // Prefer steps with status = 'done' when there are duplicates
                        if (!stepDataMap[gorev]) {
                            // First time seeing this gorev, add it
                            stepDataMap[gorev] = {
                                id: stepInstanceId,
                                assignee: assignee,
                                completed_at: completed_at,
                                fullName: fullName,
                                status: status,
                                attributes: []
                            }
                        } else if (status === 'done' && stepDataMap[gorev].status !== 'done') {
                            // Replace with 'done' status step (but keep attributes)
                            const existingAttributes = stepDataMap[gorev].attributes || []
                            stepDataMap[gorev] = {
                                id: stepInstanceId,
                                assignee: assignee,
                                completed_at: completed_at,
                                fullName: fullName,
                                status: status,
                                attributes: existingAttributes
                            }
                        }
                        
                        // Add attribute definition if present
                        if (attribute_definition_id && attribute_name) {
                            stepDataMap[gorev].attributes = stepDataMap[gorev].attributes || []
                            // Check if this attribute is already added
                            const exists = stepDataMap[gorev].attributes!.some(
                                attr => attr.attribute_definition_id === attribute_definition_id
                            )
                            if (!exists) {
                                stepDataMap[gorev].attributes!.push({
                                    attribute_definition_id: attribute_definition_id,
                                    attribute_name: attribute_name
                                })
                            }
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

    // Auto-open onayla modal if onay=true in URL
    useEffect(() => {
        if (typeof window !== 'undefined' && stepData && Object.keys(stepData).length > 0 && currentUsername) {
            const params = new URLSearchParams(window.location.search)
            const onayParam = params.get('onay')
            
            if (onayParam === 'true') {
                // Find the single actionable step
                const singleStep = getSingleActionableStep()
                if (singleStep) {
                    // Auto-trigger onayla modal
                    handleActionClick('onayla', singleStep.stepId)
                }
            }
        }
    }, [stepData, currentUsername])

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
            const title = feragatTuru === 'Onaysız AY Feragati' ? 'Alt_Yüklenici_Feragat_Formu' : 'Uyarlama_Feragat_Formu'
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
        const signatureAttr = data.find(d => d.name === signatureKey)
        
        if (!signatureAttr) {
            return ''
        }
        
        const signatureValue = extractValue(signatureAttr.value)
        const jobStepId = signatureAttr.job_step_instance_id
        
        if (!jobStepId) {
            return signatureValue
        }
        
        // Find explanation attribute with same job_step_instance_id
        let explanation = ''
        for (const attr of data) {
            if (attr.job_step_instance_id === jobStepId && 
                (attr.name === 'Şerh Açıklaması' || attr.name === 'Açıklama')) {
                explanation = extractValue(attr.value)
                break
            }
        }
        
        // Format signature with explanation if exists
        if (explanation) {
            if (signatureValue === 'Onaylanmıştır') {
                return `${signatureValue}\nAçıklama: ${explanation}`
            } else {
                return `${signatureValue}\nŞerh Açıklaması: ${explanation}`
            }
        }
        
        return signatureValue
    }
    
    const getRiskData = (attributeName: string) => {
        const field = data.find(d => d.name === attributeName)
        if (!field || !field.value) return []
        
        try {
            let riskList = []
            if (typeof field.value === 'string') {
                riskList = parsePythonStyleJSON(field.value)
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
                parsedValue = parsePythonStyleJSON(field.value)
            } else if (Array.isArray(field.value)) {
                parsedValue = field.value
            }
            
            // Each item is a dict with one key:value, extract the value
            for (const item of parsedValue) {
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    // Get the first value from the object
                    const values = Object.values(item)
                    if (values.length > 0) {
                        gerekceList.push(String(values[0]))
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
                        parsedValue = parsePythonStyleJSON(attr.value)
                    } else if (Array.isArray(attr.value)) {
                        parsedValue = attr.value
                    }
                    
                    const gerekceList: string[] = []
                    for (const item of parsedValue) {
                        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                            // Get the first value from the object using Object.values
                            const values = Object.values(item)
                            if (values.length > 0) {
                                const value = String(values[0]).trim()
                                // Only add non-empty values
                                if (value) {
                                    gerekceList.push(value)
                                }
                            }
                        } else if (typeof item === 'string') {
                            const value = item.trim()
                            if (value) {
                                gerekceList.push(value)
                            }
                        }
                    }
                    
                    // Only add to gerekceItems if there are actual values
                    if (gerekceList.length > 0) {
                        gerekceItems[feragatName] = gerekceList
                    }
                } catch (err) {
                    console.error(`Failed to parse ${attr.name}:`, err)
                    // Don't add empty entries on error
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
                riskList = parsePythonStyleJSON(field.value)
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
    
    const getprojeBilgileri = () => {
        const field = data.find(d => d.name === 'Proje Bilgileri')
        if (!field || !field.value) return []
        
        try {
            let projeList: any[] = []
            
            if (typeof field.value === 'string') {
                projeList = parsePythonStyleJSON(field.value)
            } else if (Array.isArray(field.value)) {
                projeList = field.value
            }
            
            return projeList.map((item: any) => ({
                proje_tipi: item.proje_tipi || '',
                proje_kodu_xxxx: item.proje_kodu_xxxx || '',
                proje_tanimi_proje_adi: item.proje_tanimi_proje_adi || '',
                proje_no_u_p_li_kod_xxxx_pyyyyyy: item.proje_no_u_p_li_kod_xxxx_pyyyyyy || '',
                musteri_proje_ana_sozlesmesi_nin_imza_makami: item.musteri_proje_ana_sozlesmesi_nin_imza_makami || ''
            }))
        } catch (err) {
            console.error('Failed to parse Proje Bilgileri:', err)
            return []
        }
    }
    
    const getMalzemeBilgileri = () => {
        const field = data.find(d => d.name === 'Malzeme Bilgileri')
        if (!field || !field.value) return []
        
        try {
            let malzemeList: any[] = []
            
            if (typeof field.value === 'string') {
                malzemeList = parsePythonStyleJSON(field.value)
            } else if (Array.isArray(field.value)) {
                malzemeList = field.value
            }
            
            return malzemeList.map((item: any) => ({
                malzeme_no: item.malzeme_no || '',
                malzeme_tanimi: item.malzeme_tanimi || '',
                alim_adedi: item.alim_adedi || ''
            }))
        } catch (err) {
            console.error('Failed to parse Malzeme Bilgileri:', err)
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

    const handleActionClick = (type: 'onayla' | 'serh', stepId: string) => {
        setActionType(type)
        setActionStepId(stepId)
        setExplanation('')
        setShowActionModal(true)
    }

    const handleSubmitAction = async () => {
        if (!explanation.trim()) {
            alert('Lütfen açıklama giriniz.')
            return
        }

        if (!actionStepId) {
            alert('Adım bilgisi bulunamadı.')
            return
        }

        // Find the step info to get attributes
        const stepInfo = Object.values(stepData).find(step => step.id === actionStepId)
        if (!stepInfo || !stepInfo.attributes || stepInfo.attributes.length === 0) {
            alert('Adım için attribute bilgisi bulunamadı.')
            return
        }

        // Find the attribute definition IDs for "%Onayı" and "Açıklama"
        const onayAttr = stepInfo.attributes.find(attr => attr.attribute_name.includes('Onayı'))
        const aciklamaAttr = stepInfo.attributes.find(attr => 
            attr.attribute_name === 'Açıklama' || attr.attribute_name === 'Şerh Açıklaması'
        )

        if (!onayAttr) {
            alert('Onay attribute\'u bulunamadı.')
            return
        }

        // Prepare attributes to update
        const attributes = []
        
        // Add %Onayı attribute
        attributes.push({
            attribute_definition_id: String(onayAttr.attribute_definition_id),
            value: actionType === 'onayla' ? 'Onaylanmıştır' : 'Şerh Edilmiştir'
        })
        
        // Add Açıklama attribute if found
        if (aciklamaAttr) {
            attributes.push({
                attribute_definition_id: String(aciklamaAttr.attribute_definition_id),
                value: explanation.trim()
            })
        }

        setSubmitting(true)
        try {
            const endpoint = actionType === 'onayla' ? '/feragat-formu/onayla' : '/feragat-formu/serh-koy'
            await api.post(endpoint, {
                job_instance_id: String(jobInstanceId),
                step_instance_id: String(actionStepId),
                explanation: explanation.trim(),
                attributes: attributes,
                status: stepInfo.status || ''
            })
            
            alert(`${actionType === 'onayla' ? 'Onay' : 'Şerh'} başarıyla kaydedildi.`)
            setShowActionModal(false)
            setExplanation('')
            setActionStepId('')
            
            // Reload data
            window.location.reload()
        } catch (err: any) {
            console.error('Action submit error:', err)
            alert(err?.message || 'İşlem sırasında hata oluştu.')
        } finally {
            setSubmitting(false)
        }
    }

    const canUserActOnStep = (gorev: string): boolean => {
        if (!currentUsername) return false
        const stepInfo = stepData[gorev]
        if (!stepInfo || !stepInfo.status) return false
        
        const allowedStatuses = ['waiting_for_acceptance', 'task_accepted', 'working']
        return stepInfo.assignee === currentUsername && allowedStatuses.includes(stepInfo.status)
    }

    const getActionableStepsCount = (): number => {
        let count = 0
        for (const gorev of Object.keys(stepData)) {
            if (canUserActOnStep(gorev)) {
                count++
            }
        }
        return count
    }

    const getSingleActionableStep = (): { gorev: string, stepId: string } | null => {
        for (const [gorev, stepInfo] of Object.entries(stepData)) {
            if (canUserActOnStep(gorev) && stepInfo.id) {
                return { gorev, stepId: stepInfo.id }
            }
        }
        return null
    }

    const shouldShowTopButtons = (): boolean => {
        return getActionableStepsCount() === 1
    }

    const shouldShowTableButtons = (): boolean => {
        return getActionableStepsCount() > 1
    }

    const renderImzaCell = (gorev: string, imza: string) => {
        const stepInfo = stepData[gorev]
        const canAct = canUserActOnStep(gorev)
        const showInTable = shouldShowTableButtons()
        
        if (canAct && stepInfo?.id && showInTable) {
            return (
                <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                        <button
                            onClick={() => handleActionClick('onayla', stepInfo.id)}
                            className="px-2 py-1 bg-green-600 text-white text-[9px] rounded hover:bg-green-700 transition-colors"
                        >
                            Onayla
                        </button>
                        <button
                            onClick={() => handleActionClick('serh', stepInfo.id)}
                            className="px-2 py-1 bg-orange-600 text-white text-[9px] rounded hover:bg-orange-700 transition-colors"
                        >
                            Şerh Koy
                        </button>
                    </div>
                </div>
            )
        }
        
        return <span className="whitespace-pre-line">{imza}</span>
    }

    const feragatTuru = getFieldValue('Feragat Türü')
    const projeTuru = getFieldValue('Proje Türü')
    
    const getTitle = (): string => {
        return feragatTuru === 'Onaysız AY Feragati' ? 'Onaysız AY Feragat Formu' : 'Uyarlama Feragat Formu'
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
        return feragatTuru === 'Onaysız AY Feragati' ? 'AY Sorumlusu' : 'Feragat Sorumlusu'
    }
    
    const getSorumluValue = (): string => {
        const field = data.find(d => d.name === 'İşin Sorumlusu')
        if (!field || !field.value) return ''
        
        try {
            let isinList = []
            if (typeof field.value === 'string') {
                isinList = parsePythonStyleJSON(field.value)
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
                value = parsePythonStyleJSON(value)
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
        <>
            <div className="w-full h-full p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col gap-3 overflow-auto">
                {/* Header with Download Button */}
                <div className="flex items-center justify-between flex-shrink-0 pb-2 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800">{getTitle()}</h3>
                    <div className="flex items-center gap-2">
                        {shouldShowTopButtons() && (() => {
                            const singleStep = getSingleActionableStep()
                            if (singleStep) {
                                return (
                                    <>
                                        <button
                                            onClick={() => handleActionClick('onayla', singleStep.stepId)}
                                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                                        >
                                            Onayla
                                        </button>
                                        <button
                                            onClick={() => handleActionClick('serh', singleStep.stepId)}
                                            className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition-colors"
                                        >
                                            Şerh Koy
                                        </button>
                                    </>
                                )
                            }
                            return null
                        })()}
                        <button
                            onClick={handleDownloadPdf}
                            disabled={downloading || data.length === 0}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            {downloading ? 'İndiriliyor...' : 'PDF İndir'}
                        </button>
                    </div>
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
                            
                            {feragatTuru === 'Onaysız AY Feragati' ? (
                                <>
                                    {/* Alt Yüklenici Layout */}
                                    {/* Row 1: Three columns */}
                                    <div className="border border-black">
                                        <table className="w-full text-[10px]">
                                            <tbody>
                                                <tr>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '37.5%' }}>
                                                        <div className="font-bold text-blue-900">1. Firma Adı/Satıcı No</div>
                                                        <div className="mt-1">{getFieldValue('Firma Adı/ Satıcı No')}</div>
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
                                    
                                    {/* Row 2: Alım Türü, İşin Sorumlusu, Bildirim No */}
                                    <div className="border-l border-r border-b border-black">
                                        <table className="w-full text-[10px]">
                                            <tbody>
                                                <tr>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">4. Alım Türü</div>
                                                        <div className="mt-1">{getFieldValue('Alım Türü')}</div>
                                                    </td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50" style={{ width: '37.5%' }}>
                                                        <div className="font-bold text-blue-900">5. İşin Sorumlusu/Bölümü</div>
                                                        <div className="mt-1">{getSorumluValue()}</div>
                                                    </td>
                                                    <td className="border-t border-black p-2 bg-blue-50" style={{ width: '37.5%' }}>
                                                        <div className="font-bold text-blue-900">6. Bildirim No</div>
                                                        <div className="mt-1">{getFieldValue('Feragat Bildirim Numarası')}</div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Uyarlama Layout (Radar/EH) */}
                                    {/* Row 1: Other fields */}
                                    <div className="border border-black">
                                        <table className="w-full text-[10px]">
                                            <tbody>
                                                <tr>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">1. Proje Aşaması</div>
                                                        <div className="mt-1">{getFieldValue('Proje Aşaması')}</div>
                                                    </td>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">2. Proje Süresi (ay)</div>
                                                        <div className="mt-1">{getFieldValue('Proje Süresi (ay)')}</div>
                                                    </td>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '12.5%' }}>
                                                        <div className="font-bold text-blue-900">3. İlgili Süreçler</div>
                                                        <div className="mt-1">{getFieldValue('İlgili Süreçler')}</div>
                                                    </td>
                                                    <td className="border-r border-black p-2 bg-blue-50" style={{ width: '12.5%' }}>
                                                        <div className="font-bold text-blue-900">4. {getSorumluLabel()}</div>
                                                        <div className="mt-1">{getFeragatSorumlusuValue()}</div>
                                                    </td>
                                                    <td className="border-black p-2 bg-blue-50" style={{ width: '25%' }}>
                                                        <div className="font-bold text-blue-900">5. Feragat Bildirim Numarası</div>
                                                        <div className="mt-1">{getFieldValue('Feragat Bildirim Numarası')}</div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* MALZEME BİLGİLERİ - Only for Onaysız AY, placed BEFORE Proje Bilgileri */}
                        {feragatTuru === 'Onaysız AY Feragati' && (
                            <div>
                                <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                    MALZEME BİLGİLERİ
                                </div>
                                <div className="border border-black border-t-0">
                                    <table className="w-full text-[10px]">
                                        <thead>
                                            <tr className="bg-gray-200 border-t border-b border-black">
                                                <th className="border-r border-black p-2 font-bold text-center" style={{ width: '5%' }}></th>
                                                <th className="border-r border-black p-2 font-bold text-center" style={{ width: '20%' }}>Malzeme No</th>
                                                <th className="border-r border-black p-2 font-bold text-center" style={{ width: '55%' }}>Malzeme Tanımı</th>
                                                <th className="border-black p-2 font-bold text-center" style={{ width: '20%' }}>Alım Adedi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const malzemeBilgileri = getMalzemeBilgileri()
                                                
                                                if (malzemeBilgileri.length === 0) {
                                                    return (
                                                        <tr>
                                                            <td className="border-r border-t border-black p-2 bg-gray-100 text-center font-bold">1</td>
                                                            <td className="border-r border-t border-black p-2 bg-blue-50"></td>
                                                            <td className="border-r border-t border-black p-2 bg-blue-50"></td>
                                                            <td className="border-t border-black p-2 bg-blue-50"></td>
                                                        </tr>
                                                    )
                                                }
                                                
                                                return malzemeBilgileri.map((item: any, idx: number) => (
                                                    <tr key={idx}>
                                                        <td className="border-r border-t border-black p-2 bg-gray-100 text-center font-bold">{idx + 1}</td>
                                                        <td className="border-r border-t border-black p-2 bg-blue-50">{item.malzeme_no}</td>
                                                        <td className="border-r border-t border-black p-2 bg-blue-50">{item.malzeme_tanimi}</td>
                                                        <td className="border-t border-black p-2 bg-blue-50">{item.alim_adedi}</td>
                                                    </tr>
                                                ))
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* PROJE BİLGİLERİ */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                PROJE BİLGİLERİ
                            </div>
                            <div className="border border-black border-t-0">
                                <table className="w-full text-[10px]">
                                    <thead>
                                        <tr className="bg-gray-200 border-t border-b border-black">
                                            <th className="border-r border-black p-2 font-bold text-center" style={{ width: '5%' }}></th>
                                            <th className="border-r border-black p-2 font-bold text-center" style={{ width: '12%' }}>Proje Kodu</th>
                                            <th className="border-r border-black p-2 font-bold text-center" style={{ width: '18%' }}>Proje No</th>
                                            <th className="border-r border-black p-2 font-bold text-center" style={{ width: '28%' }}>Proje Tanımı</th>
                                            <th className="border-r border-black p-2 font-bold text-center" style={{ width: '12%' }}>Proje Tipi</th>
                                            <th className="border-black p-2 font-bold text-center" style={{ width: '25%' }}>Müşteri</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const projeBilgileri = getprojeBilgileri()
                                            
                                            if (projeBilgileri.length === 0) {
                                                return (
                                                    <tr>
                                                        <td className="border-r border-t border-black p-2 bg-gray-100 text-center font-bold">1</td>
                                                        <td className="border-r border-t border-black p-2 bg-blue-50"></td>
                                                        <td className="border-r border-t border-black p-2 bg-blue-50"></td>
                                                        <td className="border-r border-t border-black p-2 bg-blue-50"></td>
                                                        <td className="border-r border-t border-black p-2 bg-blue-50"></td>
                                                        <td className="border-t border-black p-2 bg-blue-50"></td>
                                                    </tr>
                                                )
                                            }
                                            
                                            return projeBilgileri.map((item: any, idx: number) => (
                                                <tr key={idx}>
                                                    <td className="border-r border-t border-black p-2 bg-gray-100 text-center font-bold">{idx + 1}</td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50">{item.proje_kodu_xxxx}</td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50">{item.proje_no_u_p_li_kod_xxxx_pyyyyyy}</td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50">{item.proje_tanimi_proje_adi}</td>
                                                    <td className="border-r border-t border-black p-2 bg-blue-50">{item.proje_tipi}</td>
                                                    <td className="border-t border-black p-2 bg-blue-50">{item.musteri_proje_ana_sozlesmesi_nin_imza_makami}</td>
                                                </tr>
                                            ))
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* B. TALEP EDİLEN FERAGAT / DEĞERLENDİRMELER */}
                        <div>
                            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold border border-black">
                                {feragatTuru === 'Onaysız AY Feragati' ? 'B. FERAGATE AİT DEĞERLENDİRMELER' : 'B. TALEP EDİLEN FERAGAT'}
                            </div>
                            {feragatTuru === 'Onaysız AY Feragati' ? (
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
                            {feragatTuru === 'Onaysız AY Feragati' ? (
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
                                                
                                                // Sort the entries by feragat name (Feragat-1, Feragat-2, etc.)
                                                const sortedEntries = Object.entries(hakkindaData).sort((a, b) => {
                                                    // Extract numbers from names like "Talep Edilen Feragat-1"
                                                    const numA = parseInt(a[0].match(/\d+$/)?.[0] || '0')
                                                    const numB = parseInt(b[0].match(/\d+$/)?.[0] || '0')
                                                    return numA - numB
                                                })
                                                
                                                sortedEntries.forEach(([feragatName, gerekceList]) => {
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
                            {feragatTuru === 'Onaysız AY Feragati' ? (
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
                                        {['Proje Yönetici', getSorumluLabel(), 'Sorumlu Yönetici'].map((gorev, idx) => {
                                            const stepInfo = stepData[gorev] || {}
                                            // Only show completed steps (status = 'done')
                                            if (stepInfo.status !== 'done') return null
                                            
                                            const fullName = stepInfo.fullName || ''
                                            const completedAt = stepInfo.completed_at || ''
                                            const tarih = completedAt ? formatDate(completedAt) : ''
                                            const imza = getSignature(gorev)
                                            
                                            return (
                                                <tr key={idx} className="border-b border-gray-300">
                                                    <td className="border-r border-gray-400 p-1 font-bold bg-gray-100">{gorev}</td>
                                                    <td className="border-r border-gray-400 p-1">{fullName}</td>
                                                    <td className="border-r border-gray-400 p-1">{tarih}</td>
                                                    <td className="p-1">{renderImzaCell(gorev, imza)}</td>
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
                                                // Only show completed steps (status = 'done')
                                                if (stepInfo.status !== 'done') return null
                                                
                                                const fullName = stepInfo.fullName || ''
                                                const completedAt = stepInfo.completed_at || ''
                                                const tarih = completedAt ? formatDate(completedAt) : ''
                                                const imza = getSignature(gorev)
                                                
                                                return (
                                                    <tr key={idx} className="border-b border-black last:border-b-0">
                                                        <td className="border-r border-black p-2 align-top">{gorev}</td>
                                                        <td className="border-r border-black p-2 align-top bg-gray-50">{fullName}</td>
                                                        <td className="border-r border-black p-2 align-top bg-gray-50">{tarih}</td>
                                                        <td className="p-2 align-top bg-gray-50">{renderImzaCell(gorev, imza)}</td>
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
                                            // Only show completed steps (status = 'done')
                                            if (stepInfo.status !== 'done') {
                                                return (
                                                    <tr className="border-b border-black">
                                                        <td className="border-r border-black p-2 align-top font-bold">{gorev}</td>
                                                        <td className="border-r border-black p-2 align-top bg-gray-50"></td>
                                                        <td className="border-r border-black p-2 align-top bg-gray-50"></td>
                                                        <td className="p-2 align-top bg-gray-50"></td>
                                                    </tr>
                                                )
                                            }
                                            
                                            const fullName = stepInfo.fullName || ''
                                            const completedAt = stepInfo.completed_at || ''
                                            const tarih = completedAt ? formatDate(completedAt) : ''
                                            const imza = getSignature(gorev)
                                            
                                            return (
                                                <tr className="border-b border-black">
                                                    <td className="border-r border-black p-2 align-top font-bold">{gorev}</td>
                                                    <td className="border-r border-black p-2 align-top bg-gray-50">{fullName}</td>
                                                    <td className="border-r border-black p-2 align-top bg-gray-50">{tarih}</td>
                                                    <td className="p-2 align-top bg-gray-50">{renderImzaCell(gorev, imza)}</td>
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

        {/* Action Modal */}
        {showActionModal && typeof window !== 'undefined' && createPortal(
            <div className="fixed inset-0 backdrop-blur-sm bg-white/50 flex items-center justify-center z-[9999]">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">
                        {actionType === 'onayla' ? 'Onay' : 'Şerh'} Açıklaması
                    </h3>
                    <textarea
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        placeholder="Açıklama giriniz..."
                        className="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        disabled={submitting}
                    />
                    <div className="flex justify-end gap-2 mt-4">
                        <button
                            onClick={() => setShowActionModal(false)}
                            disabled={submitting}
                            className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleSubmitAction}
                            disabled={submitting}
                            className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Gönderiliyor...' : 'Gönder'}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}
    </>
    )
}
