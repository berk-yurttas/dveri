"use client"

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, FileText } from "lucide-react";
import { documentationService } from "@/services/documentation";
import { platformService } from "@/services/platform";
import type { Documentation, DocumentationUpdate } from "@/types/documentation";
import type { Platform } from "@/types/platform";
import AdminSidebar from "@/components/AdminSidebar";

export default function EditDocumentationPage() {
  const router = useRouter();
  const params = useParams();
  const documentationId = Number(params.id);

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [documentation, setDocumentation] = useState<Documentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<DocumentationUpdate>({
    title: "",
    description: "",
    platform_id: null,
    category: "",
    tags: [],
    is_active: true,
    order_index: 0,
  });

  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    loadData();
  }, [documentationId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [docResponse, platformsResponse] = await Promise.all([
        documentationService.getDocumentationById(documentationId),
        platformService.getPlatforms(),
      ]);

      setDocumentation(docResponse);
      setPlatforms(platformsResponse);

      setFormData({
        title: docResponse.title,
        description: docResponse.description || "",
        platform_id: docResponse.platform_id,
        category: docResponse.category || "",
        tags: docResponse.tags || [],
        is_active: docResponse.is_active,
        order_index: docResponse.order_index,
      });

      setTagInput(docResponse.tags?.join(", ") || "");
    } catch (err: any) {
      console.error("Failed to load documentation:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (!formData.title) {
        setError("Başlık gereklidir");
        setSaving(false);
        return;
      }

      await documentationService.updateDocumentation(documentationId, formData);
      router.push("/admin/documentations");
    } catch (err: any) {
      console.error("Failed to update documentation:", err);
      setError(err.message || "Güncelleme başarısız oldu");
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof DocumentationUpdate, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTagsChange = (value: string) => {
    setTagInput(value);
    const tags = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    handleInputChange("tags", tags);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <AdminSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error && !documentation) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <AdminSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-sm border border-red-200 p-8 max-w-md">
            <h2 className="text-xl font-bold text-red-900 mb-2">Hata</h2>
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => router.back()}
              className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              Geri Dön
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Geri Dön
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dokümantasyonu Düzenle</h1>
          <p className="text-gray-600">Dokümantasyon bilgilerini güncelleyin</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">Temel Bilgiler</h2>
            </div>

            <div className="space-y-4">
              {/* File Info (Read-only) */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Dosya Adı:</span>
                    <p className="text-gray-600 mt-1">{documentation?.file_name}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Dosya Tipi:</span>
                    <p className="text-gray-600 mt-1 capitalize">{documentation?.file_type}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Yükleyen:</span>
                    <p className="text-gray-600 mt-1">{documentation?.uploaded_by}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Yüklenme Tarihi:</span>
                    <p className="text-gray-600 mt-1">
                      {documentation?.created_at
                        ? new Date(documentation.created_at).toLocaleDateString("tr-TR")
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Başlık <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="Döküman başlığı"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Döküman açıklaması"
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Platform */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select
                  value={formData.platform_id || ""}
                  onChange={(e) =>
                    handleInputChange("platform_id", e.target.value ? Number(e.target.value) : null)
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
                  value={formData.category}
                  onChange={(e) => handleInputChange("category", e.target.value)}
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
                  value={tagInput}
                  onChange={(e) => handleTagsChange(e.target.value)}
                  placeholder="Örn: tutorial, başlangıç, kurulum"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {formData.tags && formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Order Index */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sıralama İndeksi
                </label>
                <input
                  type="number"
                  value={formData.order_index}
                  onChange={(e) => handleInputChange("order_index", parseInt(e.target.value) || 0)}
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Daha düşük değerler önce gösterilir
                </p>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange("is_active", e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Döküman aktif
                </label>
              </div>
            </div>
          </div>

          {/* Statistics (Read-only) */}
          {documentation && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">İstatistikler</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Görüntülenme</p>
                  <p className="text-2xl font-bold text-gray-900">{documentation.view_count}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">İndirme</p>
                  <p className="text-2xl font-bold text-gray-900">{documentation.download_count}</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={saving}
              className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Değişiklikleri Kaydet
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
