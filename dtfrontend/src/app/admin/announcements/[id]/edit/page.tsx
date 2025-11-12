"use client"

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Save,
  X,
  Upload,
  Calendar,
  MessageSquare,
  Globe,
  ArrowLeft
} from "lucide-react";
import { announcementService } from "@/services/announcement";
import { platformService } from "@/services/platform";
import { Platform } from "@/types/platform";
import { Announcement, AnnouncementUpdate } from "@/types/announcement";
import RichTextEditor from "@/components/RichTextEditor";

export default function EditAnnouncementPage() {
  const router = useRouter();
  const params = useParams();
  const announcementId = parseInt(params.id as string);

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  
  const [formData, setFormData] = useState<AnnouncementUpdate>({
    title: "",
    month_title: "",
    content_summary: "",
    content_detail: "",
    content_image: "",
    creation_date: "",
    expire_date: "",
    platform_id: null,
  });

  // Convert ISO date to local datetime string format
  const convertToLocalDateTimeString = (isoString: string) => {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    fetchPlatforms();
    fetchAnnouncement();
  }, []);

  const fetchPlatforms = async () => {
    try {
      const data = await platformService.getPlatforms(0, 100, false);
      setPlatforms(data);
    } catch (err) {
      console.error("Failed to fetch platforms:", err);
    }
  };

  const fetchAnnouncement = async () => {
    try {
      setLoading(true);
      const data = await announcementService.getAnnouncementById(announcementId);
      setAnnouncement(data);
      
      // Convert dates to datetime-local format (using local timezone)
      const creationDate = data.creation_date ? convertToLocalDateTimeString(data.creation_date) : "";
      const expireDate = data.expire_date ? convertToLocalDateTimeString(data.expire_date) : "";
      
      setFormData({
        title: data.title,
        month_title: data.month_title || "",
        content_summary: data.content_summary || "",
        content_detail: data.content_detail || "",
        content_image: data.content_image || "",
        creation_date: creationDate,
        expire_date: expireDate,
        platform_id: data.platform_id,
      });
    } catch (err) {
      console.error("Failed to fetch announcement:", err);
      setError("Duyuru yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setSaving(true);
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          if (base64) {
            setFormData((prev) => ({
              ...prev,
              content_image: base64,
            }));
          }
        };
        reader.onerror = () => {
          console.error("Failed to read cover image file");
          setError("Kapak görseli işlenemedi");
        };
        reader.readAsDataURL(file);
        
      } catch (err) {
        console.error("Failed to upload image:", err);
        setError("Görsel yüklenirken bir hata oluştu");
      } finally {
        setSaving(false);
      }
    }
  };

  // Add Turkey timezone to datetime string for backend
  const addTimezoneToDateTimeString = (dateTimeString: string | null | undefined): string | null => {
    if (!dateTimeString) return null;
    // Add Turkey timezone (+03:00) and seconds to the datetime string
    return `${dateTimeString}:00+03:00`;
  };

  const dataUrlToFile = (dataUrl: string, defaultName: string) => {
    const arr = dataUrl.split(',');
    if (arr.length < 2) {
      throw new Error('Invalid data URL');
    }
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const byteString = atob(arr[1]);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const extension = mime.split('/')[1] || 'png';
    const filename = `${defaultName}.${extension}`;
    return new File([bytes], filename, { type: mime });
  };

  const uploadEmbeddedImages = async (html: string | null | undefined): Promise<string | null> => {
    if (!html) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const images = Array.from(doc.querySelectorAll('img'));

    if (images.length === 0) {
      return html;
    }

    const uploadedMap = new Map<string, string>();

    for (const img of images) {
      const src = img.getAttribute('src') || '';
      if (!src.startsWith('data:')) {
        continue;
      }

      if (!uploadedMap.has(src)) {
        const uniqueId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const file = dataUrlToFile(
          src,
          `announcement-content-${uniqueId}`
        );
        const uploadedUrl = await announcementService.uploadImage(file);
        uploadedMap.set(src, uploadedUrl);
      }

      const uploadedSrc = uploadedMap.get(src);
      if (uploadedSrc) {
        img.setAttribute('src', uploadedSrc);
        img.removeAttribute('data-url');
      }
    }

    return doc.body.innerHTML;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title?.trim()) {
      setError("Başlık zorunludur");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const processedContentDetail = await uploadEmbeddedImages(formData.content_detail);

      if (
        processedContentDetail !== null &&
        processedContentDetail !== undefined &&
        processedContentDetail !== formData.content_detail
      ) {
        setFormData((prev) => ({
          ...prev,
          content_detail: processedContentDetail,
        }));
      }

      let coverImageUrl: string | null = null;
      if (formData.content_image) {
        if (formData.content_image.startsWith("data:")) {
          const uniqueId =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const file = dataUrlToFile(formData.content_image, `announcement-cover-${uniqueId}`);
          coverImageUrl = await announcementService.uploadImage(file);
          setFormData((prev) => {
            if (prev.content_image === coverImageUrl) {
              return prev;
            }
            return {
              ...prev,
              content_image: coverImageUrl ?? prev.content_image,
            };
          });
        } else {
          coverImageUrl = formData.content_image;
        }
      }

      // Clean up form data and add timezone
      const submitData: AnnouncementUpdate = {
        title: formData.title,
        month_title: formData.month_title || null,
        content_summary: formData.content_summary || null,
        content_detail: processedContentDetail ?? null,
        content_image: coverImageUrl,
        creation_date: addTimezoneToDateTimeString(formData.creation_date),
        expire_date: addTimezoneToDateTimeString(formData.expire_date),
        platform_id: formData.platform_id === 0 ? null : formData.platform_id,
      };

      await announcementService.updateAnnouncement(announcementId, submitData);
      router.push('/admin/announcements');
    } catch (err) {
      console.error("Failed to update announcement:", err);
      setError("Duyuru güncellenirken bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Duyuru yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (!announcement) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Duyuru bulunamadı</h2>
          <button
            onClick={() => router.push('/admin/announcements')}
            className="text-blue-600 hover:text-blue-700"
          >
            Geri dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin/announcements')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Geri dön
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Duyuru Düzenle</h1>
          <p className="text-gray-600">Mevcut duyuruyu düzenleyin</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <X className="h-5 w-5 text-red-600" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Başlık <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="Duyuru başlığı"
                required
              />
            </div>

            {/* Month Title */}
            <div>
              <label htmlFor="month_title" className="block text-sm font-medium text-gray-700 mb-2">
                Ay Etiketi
              </label>
              <input
                type="text"
                id="month_title"
                value={formData.month_title || ""}
                onChange={(e) => setFormData({ ...formData, month_title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="Örn: Kasım, Aralık"
              />
            </div>

            {/* Platform Selection */}
            <div>
              <label htmlFor="platform_id" className="block text-sm font-medium text-gray-700 mb-2">
                Platform
              </label>
              <div className="relative">
                <select
                  id="platform_id"
                  value={formData.platform_id === null ? "0" : formData.platform_id?.toString()}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    platform_id: e.target.value === "0" ? null : parseInt(e.target.value)
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none text-gray-900"
                >
                  <option value="0">Genel Duyuru</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.display_name}
                    </option>
                  ))}
                </select>
                {formData.platform_id === null ? (
                  <Globe className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                ) : (
                  <MessageSquare className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                )}
              </div>
            </div>

            {/* Content Summary */}
            <div>
              <label htmlFor="content_summary" className="block text-sm font-medium text-gray-700 mb-2">
                Özet
              </label>
              <textarea
                id="content_summary"
                value={formData.content_summary || ""}
                onChange={(e) => setFormData({ ...formData, content_summary: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="Duyuru özeti"
              />
            </div>

            {/* Content Detail */}
            <div>
              <label htmlFor="content_detail" className="block text-sm font-medium text-gray-700 mb-2">
                Detaylı İçerik
              </label>
              <RichTextEditor
                value={formData.content_detail || ""}
                onChange={(value) => setFormData({ ...formData, content_detail: value })}
                placeholder="Duyurunun detaylı içeriği"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duyuru Görseli
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg cursor-pointer transition-colors">
                  <Upload className="h-5 w-5" />
                  Görsel Yükle
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {formData.content_image && (
                  <div className="relative">
                    <img
                      src={formData.content_image}
                      alt="Preview"
                      className="h-20 w-20 object-cover rounded-lg border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, content_image: "" })}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="creation_date" className="block text-sm font-medium text-gray-700 mb-2">
                  Yayınlanma Tarihi
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                  <input
                    type="datetime-local"
                    id="creation_date"
                    value={formData.creation_date || ""}
                    onChange={(e) => setFormData({ ...formData, creation_date: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="expire_date" className="block text-sm font-medium text-gray-700 mb-2">
                  Yayından Kalkma Tarihi
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                  <input
                    type="datetime-local"
                    id="expire_date"
                    value={formData.expire_date || ""}
                    onChange={(e) => setFormData({ ...formData, expire_date: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-5 w-5" />
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/announcements')}
              className="flex items-center gap-2 px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="h-5 w-5" />
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

