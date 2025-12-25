export interface Announcement {
  id: number;
  title: string;
  month_title?: string | null;
  content_summary?: string | null;
  content_detail?: string | null;
  content_image?: string | null;
  creation_date: string;
  expire_date?: string | null;
  platform_id?: number | null;
}

export interface AnnouncementCreate {
  title: string;
  month_title?: string | null;
  content_summary?: string | null;
  content_detail?: string | null;
  content_image?: string | null;
  creation_date?: string | null;
  expire_date?: string | null;
  platform_id?: number | null;
}

export interface AnnouncementUpdate {
  title?: string;
  month_title?: string | null;
  content_summary?: string | null;
  content_detail?: string | null;
  content_image?: string | null;
  creation_date?: string | null;
  expire_date?: string | null;
  platform_id?: number | null;
}

