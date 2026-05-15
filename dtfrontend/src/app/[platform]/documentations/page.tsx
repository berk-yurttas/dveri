"use client"

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  FileText,
  Video,
  Image as ImageIcon,
  Download,
  Eye,
  Search,
  Play,
  ExternalLink,
} from "lucide-react";
import { documentationService } from "@/services/documentation";
import { usePlatform } from "@/contexts/platform-context";
import type { Documentation } from "@/types/documentation";

export default function PlatformDocumentationsPage() {
  const params = useParams();
  const platformCode = params.platform as string;
  const { platform } = usePlatform();
  
  const [documentations, setDocumentations] = useState<Documentation[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Preview modal
  const [previewDoc, setPreviewDoc] = useState<Documentation | null>(null);

  useEffect(() => {
    if (platform?.id) {
      loadData();
    }
  }, [platform?.id, selectedCategory, searchQuery]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [docsResponse, categoriesResponse] = await Promise.all([
        documentationService.getDocumentations({
          platform_id: platform?.id,
          category: selectedCategory || undefined,
          search: searchQuery || undefined,
          limit: 100,
        }),
        documentationService.getCategories(),
      ]);

      setDocumentations(docsResponse.items);
      setCategories(categoriesResponse);
    } catch (err: any) {
      console.error("Failed to load documentations:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (doc: Documentation) => {
    try {
      await documentationService.incrementViewCount(doc.id);
      setPreviewDoc(doc);
    } catch (err) {
      console.error("Failed to track view:", err);
      setPreviewDoc(doc);
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

  // Separate docs by type
  const videos = documentations.filter(doc => doc.file_type === "video");
  const images = documentations.filter(doc => doc.file_type === "image");
  const documents = documentations.filter(doc => doc.file_type === "document");

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const renderDocumentCard = (doc: Documentation) => (
    <div
      key={doc.id}
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all duration-300"
    >
      {/* Thumbnail for images and videos */}
      {(doc.file_type === "image" || doc.file_type === "video") && (
        <div className="relative w-full h-48 bg-gray-100 overflow-hidden group cursor-pointer"
          onClick={() => handleView(doc)}
        >
          {doc.file_type === "image" ? (
            <img
              src={doc.file_url}
              alt={doc.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-200"><svg class="w-16 h-16 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg></div>';
                }
              }}
            />
          ) : (
            <div className="relative w-full h-full">
              <video
                src={doc.file_url}
                className="w-full h-full object-cover"
                preload="metadata"
                onError={(e) => {
                  const target = e.target as HTMLVideoElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-900"><svg class="w-16 h-16 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/></svg></div>';
                  }
                }}
              />
              {/* Play button overlay for videos */}
              <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center group-hover:bg-opacity-40 transition-all">
                <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play className="h-8 w-8 text-purple-600 ml-1" />
                </div>
              </div>
            </div>
          )}
          
          {/* Type badge overlay */}
          <div className="absolute top-3 right-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold shadow-lg ${
              doc.file_type === "video" 
                ? "bg-purple-600 text-white" 
                : "bg-green-600 text-white"
            }`}>
              {doc.file_type === "video" ? "Video" : "Görsel"}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {/* Only show icon header for documents (no thumbnail) */}
        {doc.file_type === "document" && (
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100 text-blue-700">
              {getFileIcon(doc.file_type)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 mb-1">
                {doc.title}
              </h3>
              {doc.category && (
                <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                  {doc.category}
                </span>
              )}
            </div>
          </div>
        )}

        {/* For images and videos, show title and category without icon */}
        {(doc.file_type === "image" || doc.file_type === "video") && (
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 mb-2">
              {doc.title}
            </h3>
            {doc.category && (
              <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                {doc.category}
              </span>
            )}
          </div>
        )}

        {doc.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {doc.description}
          </p>
        )}

        {/* Tags */}
        {doc.tags && doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {doc.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs"
              >
                #{tag}
              </span>
            ))}
            {doc.tags.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                +{doc.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            <span>{doc.view_count}</span>
          </div>
          <div className="flex items-center gap-1">
            <Download className="h-4 w-4" />
            <span>{doc.download_count}</span>
          </div>
          <div className="ml-auto text-xs">
            {formatDate(doc.created_at)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => handleView(doc)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          >
            {doc.file_type === "video" ? (
              <>
                <Play className="h-4 w-4" />
                İzle
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Görüntüle
              </>
            )}
          </button>
          <button
            onClick={() => handleDownload(doc)}
            className="px-4 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderSection = (title: string, docs: Documentation[], emptyMessage: string) => {
    if (loading) return null;
    if (docs.length === 0 && !searchQuery && !selectedCategory) return null;

    return (
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          {title === "Videolar" && <Video className="h-7 w-7 text-purple-600" />}
          {title === "Görseller" && <ImageIcon className="h-7 w-7 text-green-600" />}
          {title === "Dökümanlar" && <FileText className="h-7 w-7 text-blue-600" />}
          {title}
          <span className="text-lg font-normal text-gray-500">({docs.length})</span>
        </h2>

        {docs.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center border-2 border-dashed border-gray-300">
            <p className="text-gray-600">{emptyMessage}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {docs.map(renderDocumentCard)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {platform?.display_name} Dokümantasyonu
          </h1>
          <p className="text-gray-600">
            {platform?.display_name} platformu hakkında videolar, dökümanlar ve görseller
          </p>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Dokümanlarda ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Category Filter */}
            <div className="lg:w-64">
              <select
                value={selectedCategory || ""}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Tüm Kategoriler</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : documentations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-16 text-center">
            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">Döküman bulunamadı</h3>
            <p className="text-gray-600">
              {searchQuery || selectedCategory
                ? "Farklı filtreler deneyebilirsiniz"
                : "Bu platform için henüz döküman eklenmemiş"}
            </p>
          </div>
        ) : (
          <>
            {/* Sections */}
            {renderSection("Videolar", videos, "Bu platform için video bulunamadı")}
            {renderSection("Görseller", images, "Bu platform için görsel bulunamadı")}
            {renderSection("Dökümanlar", documents, "Bu platform için döküman bulunamadı")}
          </>
        )}
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{previewDoc.title}</h2>
                {previewDoc.description && (
                  <p className="text-gray-600 mt-1">{previewDoc.description}</p>
                )}
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="text-gray-400 hover:text-gray-600 p-2"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>

            <div className="p-6 bg-gray-50 max-h-[70vh] overflow-auto">
              {previewDoc.file_type === "video" ? (
                <video controls className="w-full rounded-lg shadow-lg">
                  <source src={previewDoc.file_url} />
                  Your browser does not support the video tag.
                </video>
              ) : previewDoc.file_type === "image" ? (
                <img
                  src={previewDoc.file_url}
                  alt={previewDoc.title}
                  className="w-full rounded-lg shadow-lg"
                />
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-6">Dökümanı görüntülemek için indirin</p>
                  <button
                    onClick={() => handleDownload(previewDoc)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                  >
                    <Download className="h-5 w-5" />
                    Dosyayı İndir
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  <span>{previewDoc.view_count} görüntülenme</span>
                </div>
                <div className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  <span>{previewDoc.download_count} indirme</span>
                </div>
              </div>
              <button
                onClick={() => handleDownload(previewDoc)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Yeni Sekmede Aç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
