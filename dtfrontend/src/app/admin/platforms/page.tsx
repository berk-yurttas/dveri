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
  Activity,
  Database,
  Users,
  LayoutDashboard,
  FileText,
  Eye,
  EyeOff
} from "lucide-react";
import { platformService } from "@/services/platform";
import { Platform } from "@/types/platform";
import { DeleteModal } from "@/components/ui/delete-modal";
import AdminSidebar from "@/components/AdminSidebar";

export default function AdminPlatformsPage() {
  const router = useRouter();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [platformToDelete, setPlatformToDelete] = useState<Platform | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchPlatforms();
  }, [includeInactive]);

  const fetchPlatforms = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await platformService.getPlatforms(0, 100, includeInactive, searchTerm);
      setPlatforms(data);
    } catch (err) {
      console.error("Failed to fetch platforms:", err);
      setError("Platformlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchPlatforms();
  };

  const handleDeleteClick = (platform: Platform) => {
    setPlatformToDelete(platform);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!platformToDelete) return;

    setIsDeleting(true);
    try {
      await platformService.deletePlatform(platformToDelete.id, false);
      setSuccessMessage(`Platform "${platformToDelete.display_name}" başarıyla silindi`);
      setDeleteModalOpen(false);
      setPlatformToDelete(null);
      fetchPlatforms();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to delete platform:", err);
      setError("Platform silinirken bir hata oluştu");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (platform: Platform) => {
    try {
      if (platform.is_active) {
        await platformService.deactivatePlatform(platform.id);
        setSuccessMessage(`Platform "${platform.display_name}" devre dışı bırakıldı`);
      } else {
        await platformService.activatePlatform(platform.id);
        setSuccessMessage(`Platform "${platform.display_name}" aktif edildi`);
      }
      fetchPlatforms();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to toggle platform status:", err);
      setError("Platform durumu değiştirilemedi");
    }
  };

  const filteredPlatforms = platforms.filter(platform =>
    platform.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    platform.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    platform.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && platforms.length === 0) {
    return (
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="text-lg text-gray-600">Platformlar yükleniyor...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Platform Yönetimi</h1>
          <p className="text-gray-600">Sistemdeki tüm platformları görüntüleyin ve yönetin</p>
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
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1 w-full md:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Platform ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Pasif platformları göster
              </label>

              <button
                onClick={() => router.push('/admin/platforms/add')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="h-5 w-5" />
                Yeni Platform
              </button>
            </div>
          </div>
        </div>

        {/* Platforms Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {filteredPlatforms.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Platform
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kod
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Veritabanı
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Durum
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      İşlemler
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPlatforms.map((platform) => (
                    <tr key={platform.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {platform.logo_url ? (
                            <img
                              src={platform.logo_url}
                              alt={platform.display_name}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                              {platform.display_name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">
                              {platform.display_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {platform.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {platform.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-900 uppercase">
                            {platform.db_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleToggleActive(platform)}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            platform.is_active
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-red-100 text-red-800 hover:bg-red-200'
                          }`}
                        >
                          {platform.is_active ? (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              Aktif
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" />
                              Pasif
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => router.push(`/admin/platforms/${platform.id}/edit`)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Düzenle"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(platform)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Activity className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Platform bulunamadı
              </h3>
              <p className="text-gray-500 mb-6">
                {searchTerm
                  ? "Arama kriterlerinize uygun platform bulunamadı."
                  : "Henüz hiç platform eklenmemiş."}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => router.push('/admin/platforms/add')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  İlk Platformu Ekle
                </button>
              )}
            </div>
          )}
        </div>

        {/* Platform Count */}
        {filteredPlatforms.length > 0 && (
          <div className="mt-4 text-sm text-gray-600 text-center">
            Toplam {filteredPlatforms.length} platform gösteriliyor
          </div>
        )}

        {/* Delete Modal */}
        <DeleteModal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setPlatformToDelete(null);
          }}
          onConfirm={handleDeleteConfirm}
          title="Platformu Sil"
          description="Bu platformu silmek istediğinizden emin misiniz?"
          itemName={platformToDelete?.display_name}
          isDeleting={isDeleting}
        />
      </div>
      </div>
    </div>
  );
}

