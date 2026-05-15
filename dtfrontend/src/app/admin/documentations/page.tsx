"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Video,
  Image as ImageIcon,
  Download,
  Eye,
  Trash2,
  Edit,
  Plus,
  Search,
  Filter,
  ChevronDown,
  Upload,
  X,
} from "lucide-react";
import { documentationService } from "@/services/documentation";
import { platformService } from "@/services/platform";
import type { Documentation, DocumentationStats } from "@/types/documentation";
import type { Platform } from "@/types/platform";
import AdminSidebar from "@/components/AdminSidebar";

export default function DocumentationsPage() {
  const router = useRouter();
  const [documentations, setDocumentations] = useState<Documentation[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [stats, setStats] = useState<DocumentationStats | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState({
    title: "",
    description: "",
    platform_id: null as number | null,
    category: "",
    tags: [] as string[],
    order_index: 0,
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedPlatform, selectedCategory, selectedFileType, searchQuery]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [docsResponse, platformsResponse, statsResponse, categoriesResponse] = await Promise.all([
        documentationService.getDocumentations({
          platform_id: selectedPlatform || undefined,
          category: selectedCategory || undefined,
          file_type: selectedFileType || undefined,
          search: searchQuery || undefined,
          limit: 100,
        }),
        platformService.getPlatforms(),
        documentationService.getStats(),
        documentationService.getCategories(),
      ]);

      setDocumentations(docsResponse.items);
      setPlatforms(platformsResponse);
      setStats(statsResponse);
      setCategories(categoriesResponse);
    } catch (err: any) {
      console.error("Failed to load documentations:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadData.title) {
      alert("Lütfen dosya ve başlık giriniz");
      return;
    }

    try {
      setUploading(true);
      await documentationService.uploadDocumentation(uploadFile, uploadData);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadData({
        title: "",
        description: "",
        platform_id: null,
        category: "",
        tags: [],
        order_index: 0,
      });
      loadData();
    } catch (err: any) {
      console.error("Upload failed:", err);
      alert(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bu dokümantasyonu silmek istediğinizden emin misiniz?")) return;

    try {
      await documentationService.deleteDocumentation(id);
      loadData();
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert(err.message || "Delete failed");
    }
  };

  const handleDownload = async (doc: Documentation) => {
    try {
      await documentationService.incrementDownloadCount(doc.id);
      window.open(doc.file_url, "_blank");
    } catch (err) {
      console.error("Failed to track download:", err);
      window.open(doc.file_url, "_blank");
    }
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case "video":
        return <Video className="h-6 w-6" />;
      case "image":
        return <ImageIcon className="h-6 w-6" />;
      default:
        return <FileText className="h-6 w-6" />;
    }
  };

  const getFileTypeColor = (fileType: string) => {
    switch (fileType) {
      case "video":
        return "bg-purple-100 text-purple-700";
      case "image":
        return "bg-green-100 text-green-700";
      default:
        return "bg-blue-100 text-blue-700";
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dokümantasyon Yönetimi</h1>
          <p className="text-gray-600">Platform dokümantasyonlarını yönetin</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Toplam Döküman</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_documents}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Videolar</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_videos}</p>
                </div>
                <Video className="h-8 w-8 text-purple-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Görseller</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_images}</p>
                </div>
                <ImageIcon className="h-8 w-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Toplam Görüntülenme</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_views}</p>
                </div>
                <Eye className="h-8 w-8 text-orange-500" />
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Dokümanlarda ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Filter className="h-5 w-5" />
              Filtrele
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </button>

            {/* Upload Button */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="h-5 w-5" />
              Yeni Döküman
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select
                  value={selectedPlatform || ""}
                  onChange={(e) => setSelectedPlatform(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Tüm Platformlar</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <select
                  value={selectedCategory || ""}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Tüm Kategoriler</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dosya Tipi</label>
                <select
                  value={selectedFileType || ""}
                  onChange={(e) => setSelectedFileType(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Tüm Tipler</option>
                  <option value="video">Video</option>
                  <option value="image">Görsel</option>
                  <option value="document">Döküman</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Documentation Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : documentations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Döküman bulunamadı</h3>
            <p className="text-gray-600 mb-4">Yeni döküman eklemek için yukarıdaki butonu kullanın</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documentations.map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* File Type Badge */}
                <div className={`px-4 py-3 ${getFileTypeColor(doc.file_type)} flex items-center gap-2`}>
                  {getFileIcon(doc.file_type)}
                  <span className="font-medium text-sm">{doc.file_type.toUpperCase()}</span>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">{doc.title}</h3>
                  
                  {doc.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{doc.description}</p>
                  )}

                  <div className="space-y-2 mb-4">
                    {doc.category && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="font-medium">Kategori:</span>
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">{doc.category}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        <span>{doc.view_count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Download className="h-4 w-4" />
                        <span>{doc.download_count}</span>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      <div>Yükleyen: {doc.uploaded_by}</div>
                      <div>{formatDate(doc.created_at)}</div>
                      <div>Boyut: {formatFileSize(doc.file_size)}</div>
                    </div>

                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {doc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center justify-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      İndir
                    </button>
                    <button
                      onClick={() => router.push(`/admin/documentations/${doc.id}/edit`)}
                      className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Yeni Döküman Yükle</h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dosya Seç <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="file-upload"
                    accept="video/*,image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Upload className="h-12 w-12 text-gray-400 mb-2" />
                    {uploadFile ? (
                      <span className="text-sm text-gray-900 font-medium">{uploadFile.name}</span>
                    ) : (
                      <span className="text-sm text-gray-600">Dosya seçmek için tıklayın</span>
                    )}
                  </label>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Başlık <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={uploadData.title}
                  onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
                  placeholder="Döküman başlığı"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  placeholder="Döküman açıklaması"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Platform */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select
                  value={uploadData.platform_id || ""}
                  onChange={(e) =>
                    setUploadData({
                      ...uploadData,
                      platform_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Platform seçin</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <input
                  type="text"
                  value={uploadData.category}
                  onChange={(e) => setUploadData({ ...uploadData, category: e.target.value })}
                  placeholder="Örn: Kullanım Kılavuzu, Eğitim Videosu"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Etiketler (virgülle ayırın)
                </label>
                <input
                  type="text"
                  placeholder="Örn: tutorial, başlangıç, kurulum"
                  onChange={(e) =>
                    setUploadData({
                      ...uploadData,
                      tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                İptal
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadFile || !uploadData.title}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Yükleniyor...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Yükle
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
