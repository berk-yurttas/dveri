export interface Documentation {
  id: number;
  platform_id: number | null;
  title: string;
  description: string | null;
  file_url: string;
  file_type: "video" | "document" | "image";
  file_name: string;
  file_size: number | null;
  category: string | null;
  tags: string[];
  uploaded_by: string;
  is_active: boolean;
  order_index: number;
  view_count: number;
  download_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface DocumentationList {
  items: Documentation[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DocumentationStats {
  total_documents: number;
  total_videos: number;
  total_images: number;
  total_documents_count: number;
  total_views: number;
  total_downloads: number;
  documents_by_platform: Record<string, number>;
  documents_by_category: Record<string, number>;
  recent_uploads: Documentation[];
}

export interface DocumentationCreate {
  title: string;
  description?: string;
  platform_id?: number;
  file_url: string;
  file_type: "video" | "document" | "image";
  file_name: string;
  file_size?: number;
  category?: string;
  tags?: string[];
  uploaded_by: string;
  is_active?: boolean;
  order_index?: number;
}

export interface DocumentationUpdate {
  title?: string;
  description?: string;
  platform_id?: number | null;
  file_url?: string;
  file_type?: "video" | "document" | "image";
  file_name?: string;
  file_size?: number;
  category?: string;
  tags?: string[];
  is_active?: boolean;
  order_index?: number;
}

export interface DocumentationUploadResponse {
  documentation_id: number;
  file_url: string;
  message: string;
}
