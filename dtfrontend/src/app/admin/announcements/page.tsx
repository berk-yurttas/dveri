"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  CheckCircle,
  XCircle,
  Calendar,
  Eye,
  MessageSquare,
  Globe
} from "lucide-react";
import { announcementService } from "@/services/announcement";
import { platformService } from "@/services/platform";
import { Announcement } from "@/types/announcement";
import { Platform } from "@/types/platform";
import { DeleteModal } from "@/components/ui/delete-modal";

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlatformId, setFilterPlatformId] = useState<string>("all");
  const [includeExpired, setIncludeExpired] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatforms();
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [filterPlatformId, includeExpired]);

  const fetchPlatforms = async () => {
    try {
      const data = await platformService.getPlatforms(0, 100, false);
      setPlatforms(data);
    } catch (err) {
      console.error("Failed to fetch platforms:", err);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      setError(null);
      const platformId = filterPlatformId === "all" ? undefined : filterPlatformId === "general" ? null : parseInt(filterPlatformId);
      const data = await announcementService.getAnnouncements(0, 100, platformId, !includeExpired);
      setAnnouncements(data);
    } catch (err) {
      console.error("Failed to fetch announcements:", err);
      setError("Duyurular yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchAnnouncements();
  };

  const handleDeleteClick = (announcement: Announcement) => {
    setAnnouncementToDelete(announcement);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!announcementToDelete) return;

    setIsDeleting(true);
    try {
      await announcementService.deleteAnnouncement(announcementToDelete.id);
      setSuccessMessage(`Duyuru "${announcementToDelete.title}" başarıyla silindi`);
      setDeleteModalOpen(false);
      setAnnouncementToDelete(null);
      fetchAnnouncements();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to delete announcement:", err);
      setError("Duyuru silinirken bir hata oluştu");
    } finally {
      setIsDeleting(false);
    }
  };

  const getPlatformName = (platformId: number | null | undefined) => {
    if (platformId === null || platformId === undefined) return "Genel Duyuru";
    const platform = platforms.find(p => p.id === platformId);
    return platform?.display_name || "Bilinmeyen Platform";
  };

  const isExpired = (expireDate: string | null | undefined) => {
    if (!expireDate) return false;
    return new Date(expireDate) < new Date();
  };

  const isScheduled = (creationDate: string) => {
    return new Date(creationDate) > new Date();
  };

  const filteredAnnouncements = announcements.filter(announcement =>
    announcement.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (announcement.content_summary && announcement.content_summary.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading && announcements.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Duyurular yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Duyuru Yönetimi</h1>
          <p className="text-gray-600">Sistemdeki tüm duyuruları görüntüleyin ve yönetin</p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-green-700 text-sm">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex-1 w-full md:max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Duyuru ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <button
                onClick={() => router.push('/admin/announcements/add')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="h-5 w-5" />
                Yeni Duyuru
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <select
                value={filterPlatformId}
                onChange={(e) => setFilterPlatformId(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Tüm Duyurular</option>
                <option value="general">Genel Duyurular</option>
                {platforms.map((platform) => (
                  <option key={platform.id} value={platform.id.toString()}>
                    {platform.display_name}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeExpired}
                  onChange={(e) => setIncludeExpired(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Süresi geçmiş duyuruları göster
              </label>
            </div>
          </div>
        </div>

        {/* Announcements Grid */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredAnnouncements.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {filteredAnnouncements.map((announcement) => (
                <div key={announcement.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {announcement.title}
                        </h3>
                        {isScheduled(announcement.creation_date) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Calendar className="h-3 w-3" />
                            Zamanlanmış
                          </span>
                        )}
                        {isExpired(announcement.expire_date) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircle className="h-3 w-3" />
                            Süresi Geçmiş
                          </span>
                        )}
                      </div>

                      {announcement.month_title && (
                        <div className="mb-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {announcement.month_title}
                          </span>
                        </div>
                      )}

                      {announcement.content_summary && (
                        <p className="text-sm text-gray-600 mb-3">
                          {announcement.content_summary}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          {announcement.platform_id ? (
                            <>
                              <MessageSquare className="h-4 w-4" />
                              {getPlatformName(announcement.platform_id)}
                            </>
                          ) : (
                            <>
                              <Globe className="h-4 w-4" />
                              Genel Duyuru
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(announcement.creation_date).toLocaleDateString('tr-TR')}
                        </div>
                        {announcement.expire_date && (
                          <div className="flex items-center gap-1">
                            <XCircle className="h-4 w-4" />
                            {new Date(announcement.expire_date).toLocaleDateString('tr-TR')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/admin/announcements/${announcement.id}/edit`)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Düzenle"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(announcement)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Duyuru bulunamadı
              </h3>
              <p className="text-gray-500 mb-6">
                {searchTerm
                  ? "Arama kriterlerinize uygun duyuru bulunamadı."
                  : "Henüz hiç duyuru eklenmemiş."}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => router.push('/admin/announcements/add')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  İlk Duyuruyu Ekle
                </button>
              )}
            </div>
          )}
        </div>

        {/* Announcement Count */}
        {filteredAnnouncements.length > 0 && (
          <div className="mt-4 text-sm text-gray-600 text-center">
            Toplam {filteredAnnouncements.length} duyuru gösteriliyor
          </div>
        )}
      </div>

      {/* Delete Modal */}
      <DeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setAnnouncementToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Duyuruyu Sil"
        description="Bu duyuruyu silmek istediğinizden emin misiniz?"
        itemName={announcementToDelete?.title}
        isDeleting={isDeleting}
      />
    </div>
  );
}

