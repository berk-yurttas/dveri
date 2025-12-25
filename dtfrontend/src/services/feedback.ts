import { api } from '@/lib/api'

export interface FeedbackCreate {
  subject: string
  description: string
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
}

