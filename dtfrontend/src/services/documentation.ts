import { api } from '@/lib/api';
import type {
  Documentation,
  DocumentationList,
  DocumentationStats,
  DocumentationCreate,
  DocumentationUpdate,
  DocumentationUploadResponse,
} from '@/types/documentation';

export const documentationService = {
  /**
   * Get list of documentations with filters
   */
  async getDocumentations(params: {
    skip?: number;
    limit?: number;
    platform_id?: number;
    category?: string;
    file_type?: string;
    search?: string;
    tags?: string[];
    include_inactive?: boolean;
  } = {}): Promise<DocumentationList> {
    const searchParams = new URLSearchParams();
    
    if (params.skip !== undefined) searchParams.append('skip', params.skip.toString());
    if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());
    if (params.platform_id) searchParams.append('platform_id', params.platform_id.toString());
    if (params.category) searchParams.append('category', params.category);
    if (params.file_type) searchParams.append('file_type', params.file_type);
    if (params.search) searchParams.append('search', params.search);
    if (params.tags && params.tags.length > 0) searchParams.append('tags', params.tags.join(','));
    if (params.include_inactive) searchParams.append('include_inactive', 'true');

    return api.get<DocumentationList>(`/documentations/?${searchParams.toString()}`);
  },

  /**
   * Get documentation statistics
   */
  async getStats(): Promise<DocumentationStats> {
    return api.get<DocumentationStats>('/documentations/stats');
  },

  /**
   * Get all categories
   */
  async getCategories(): Promise<string[]> {
    return api.get<string[]>('/documentations/categories');
  },

  /**
   * Get all tags
   */
  async getTags(): Promise<string[]> {
    return api.get<string[]>('/documentations/tags');
  },

  /**
   * Get documentation by ID
   */
  async getDocumentationById(id: number): Promise<Documentation> {
    return api.get<Documentation>(`/documentations/${id}`);
  },

  /**
   * Create new documentation
   */
  async createDocumentation(data: DocumentationCreate): Promise<Documentation> {
    return api.post<Documentation>('/documentations/', data);
  },

  /**
   * Upload file and create documentation
   */
  async uploadDocumentation(
    file: File,
    data: {
      title: string;
      description?: string;
      platform_id?: number | null;
      category?: string;
      tags?: string[];
      order_index?: number;
    }
  ): Promise<DocumentationUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', data.title);
    
    if (data.description) formData.append('description', data.description);
    if (data.platform_id) formData.append('platform_id', data.platform_id.toString());
    if (data.category) formData.append('category', data.category);
    if (data.tags && data.tags.length > 0) formData.append('tags', data.tags.join(','));
    if (data.order_index !== undefined) formData.append('order_index', data.order_index.toString());

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/documentations/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || 'Upload failed');
    }

    return response.json();
  },

  /**
   * Update documentation
   */
  async updateDocumentation(id: number, data: DocumentationUpdate): Promise<Documentation> {
    return api.put<Documentation>(`/documentations/${id}`, data);
  },

  /**
   * Delete documentation
   */
  async deleteDocumentation(id: number, hardDelete: boolean = false): Promise<{ success: boolean; message: string }> {
    const params = new URLSearchParams();
    params.append('hard_delete', hardDelete.toString());
    
    return api.delete(`/documentations/${id}?${params.toString()}`);
  },

  /**
   * Increment view count
   */
  async incrementViewCount(id: number): Promise<{ success: boolean; message: string }> {
    return api.post(`/documentations/${id}/view`, {});
  },

  /**
   * Increment download count
   */
  async incrementDownloadCount(id: number): Promise<{ success: boolean; message: string }> {
    return api.post(`/documentations/${id}/download`, {});
  },

  /**
   * Activate documentation
   */
  async activateDocumentation(id: number): Promise<Documentation> {
    return api.patch<Documentation>(`/documentations/${id}/activate`, {});
  },

  /**
   * Deactivate documentation
   */
  async deactivateDocumentation(id: number): Promise<Documentation> {
    return api.patch<Documentation>(`/documentations/${id}/deactivate`, {});
  },
};
