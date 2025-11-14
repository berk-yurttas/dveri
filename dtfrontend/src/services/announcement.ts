import { Announcement, AnnouncementCreate, AnnouncementUpdate } from "@/types/announcement";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const announcementService = {
  async getAnnouncements(
    skip: number = 0,
    limit: number = 100,
    platformId?: number | null,
    activeOnly: boolean = true,
    allPlatforms: boolean = false,
    includeGeneral: boolean = true
  ): Promise<Announcement[]> {
    const params = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
      active_only: activeOnly.toString(),
      all_platforms: allPlatforms.toString(),
      include_general: includeGeneral.toString(),
    });

    if (platformId !== undefined && platformId !== null) {
      params.append("platform_id", platformId.toString());
    }

    const response = await fetch(`${API_BASE_URL}/announcements/?${params}`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch announcements");
    }

    return response.json();
  },

  async getAnnouncementById(id: number): Promise<Announcement> {
    const response = await fetch(`${API_BASE_URL}/announcements/${id}/`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch announcement");
    }

    return response.json();
  },

  async createAnnouncement(data: AnnouncementCreate): Promise<Announcement> {
    const response = await fetch(`${API_BASE_URL}/announcements/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Failed to create announcement");
    }

    return response.json();
  },

  async updateAnnouncement(id: number, data: AnnouncementUpdate): Promise<Announcement> {
    const response = await fetch(`${API_BASE_URL}/announcements/${id}/`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Failed to update announcement");
    }

    return response.json();
  },

  async deleteAnnouncement(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/announcements/${id}/`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to delete announcement");
    }
  },

  async getAnnouncementCount(
    platformId?: number | null,
    activeOnly: boolean = true
  ): Promise<{ total: number; platform_id?: number | null; active_only: boolean }> {
    const params = new URLSearchParams({
      active_only: activeOnly.toString(),
    });

    if (platformId !== undefined && platformId !== null) {
      params.append("platform_id", platformId.toString());
    }

    const response = await fetch(`${API_BASE_URL}/announcements/count/?${params}`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch announcement count");
    }

    return response.json();
  },

  async uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/announcements/upload-image/`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Image upload failed: ${error}`);
    }
    
    const data = await response.json();
    return data.url; // PocketBase URL'i döner
  },
};

