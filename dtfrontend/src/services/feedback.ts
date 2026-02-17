import { api } from '@/lib/api'

export interface FeedbackCreate {
  subject: string
  platform: string
  talep_sahibi: string
  birim: string
  description: string
  attachments?: string[]
}

export interface FeedbackResponse {
  success: boolean
  message: string
  work_package_id?: number
}

export const feedbackService = {
  /**
   * Submit feedback to OpenProject
   */
  async sendFeedback(data: FeedbackCreate): Promise<FeedbackResponse> {
    return api.post<FeedbackResponse>('/feedback/', data, undefined, { useCache: false })
  },

  /**
   * Upload file for feedback
   */
  async uploadFile(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)

    // Note: We use fetch here because api wrapper might not handle FormData correctly 
    // or we want custom error handling similar to announcement service
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1"

    // Auth token handling should be improved, but assuming cookie auth or similar if needed.
    // Ideally use the api wrapper if it supports FormData. 
    // Let's use the same pattern as announcement service for now but with the correct endpoint.

    const response = await fetch(`${API_BASE_URL}/feedback/upload-file`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Dosya yükleme hatası: ${errorText}`)
    }

    const data = await response.json()
    return data.url
  },
}

