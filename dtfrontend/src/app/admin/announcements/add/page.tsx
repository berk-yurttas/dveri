"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  X,
  Upload,
  Calendar,
  MessageSquare,
  Globe,
  Image as ImageIcon
} from "lucide-react";
import { announcementService } from "@/services/announcement";
import { platformService } from "@/services/platform";
import { Platform } from "@/types/platform";
import { AnnouncementCreate } from "@/types/announcement";

export default function AddAnnouncementPage() {
  const router = useRouter();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<AnnouncementCreate>({
    title: "",
    month_title: "",
    content_summary: "",
    content_detail: "",
    content_image: "",
    creation_date: new Date().toISOString().slice(0, 16),
    expire_date: "",
    platform_id: null,
  });

  useEffect(() => {
    fetchPlatforms();
  }, []);

  const fetchPlatforms = async () => {
    try {
      const data = await platformService.getPlatforms(0, 100, false);
      setPlatforms(data);
    } catch (err) {
      console.error("Failed to fetch platforms:", err);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, content_image: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      setError("Başlık zorunludur");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Clean up form data
      const submitData: AnnouncementCreate = {
        title: formData.title,
        month_title: formData.month_title || null,
        content_summary: formData.content_summary || null,
        content_detail: formData.content_detail || null,
        content_image: formData.content_image || null,
        creation_date: formData.creation_date || null,
        expire_date: formData.expire_date || null,
        platform_id: formData.platform_id === 0 ? null : formData.platform_id,
      };

      await announcementService.createAnnouncement(submitData);
      router.push('/admin/announcements');
    } catch (err) {
      console.error("Failed to create announcement:", err);
      setError("Duyuru oluşturulurken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Yeni Duyuru Ekle</h1>
          <p className="text-gray-600">Sisteme yeni bir duyuru ekleyin</p>
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  value={formData.platform_id === null ? "0" : formData.platform_id.toString()}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    platform_id: e.target.value === "0" ? null : parseInt(e.target.value)
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                >
                  <option value="0">Genel Duyuru (Tüm Platformlar)</option>
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
              <p className="mt-1 text-sm text-gray-500">
                Genel duyuru seçilirse, tüm platformlarda ve ana sayfada görünür
              </p>
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Duyuru özeti"
              />
            </div>

            {/* Content Detail */}
            <div>
              <label htmlFor="content_detail" className="block text-sm font-medium text-gray-700 mb-2">
                Detaylı İçerik
              </label>
              <textarea
                id="content_detail"
                value={formData.content_detail || ""}
                onChange={(e) => setFormData({ ...formData, content_detail: e.target.value })}
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Duyurunun detaylı içeriği"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Görsel
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
              <p className="mt-1 text-sm text-gray-500">
                Görseli base64 formatında kaydeder
              </p>
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Gelecek bir tarih seçerseniz, o tarihe kadar duyuru görünmez
                </p>
              </div>

              <div>
                <label htmlFor="expire_date" className="block text-sm font-medium text-gray-700 mb-2">
                  Bitiş Tarihi
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                  <input
                    type="datetime-local"
                    id="expire_date"
                    value={formData.expire_date || ""}
                    onChange={(e) => setFormData({ ...formData, expire_date: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Boş bırakırsanız duyuru süresiz olarak yayında kalır
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-5 w-5" />
              {loading ? "Kaydediliyor..." : "Kaydet"}
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

