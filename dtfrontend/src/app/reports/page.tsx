"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  PieChart,
  Calendar,
  Database,
  FileText,
  Star,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  Search,
  Filter,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Table,
  LineChart,
  AreaChart,
  ScatterChart,
  Edit,
  User
} from "lucide-react";
import { reportsService } from "@/services/reports";
import { SavedReport } from "@/types/reports";
import { DeleteModal } from "@/components/ui/delete-modal";

// Icon mapping for visualization types
const visualizationIconMap: { [key: string]: any } = {
  table: Table,
  bar: BarChart3,
  line: LineChart,
  pie: PieChart,
  area: AreaChart,
  scatter: ScatterChart,
  pareto: BarChart3,
  boxplot: BarChart3,
  histogram: BarChart3,
};

type ViewMode = 'grid' | 'list';
type SortOption = 'name' | 'created' | 'updated' | 'queries';
type SortDirection = 'asc' | 'desc';
type FilterOption = 'all' | 'public' | 'private' | 'favorites';

export default function ReportsPage() {
  const router = useRouter();

  const [reports, setReports] = useState<SavedReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<SavedReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const fetchReports = async () => {
      try {
        const data = await reportsService.getReports();
        setReports(data);
      } catch (error) {
        console.error("Failed to fetch reports:", error);
        setError("Raporlar yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [mounted]);

  // Filter and sort reports
  useEffect(() => {
    let filtered = [...reports];

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(report =>
        report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    switch (filterBy) {
      case 'public':
        filtered = filtered.filter(report => report.is_public);
        break;
      case 'private':
        filtered = filtered.filter(report => !report.is_public);
        break;
      case 'favorites':
        filtered = filtered.filter(report => favorites.has(report.id));
        break;
      // 'all' case doesn't need filtering
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'updated':
          const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : new Date(a.created_at).getTime();
          const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : new Date(b.created_at).getTime();
          comparison = aUpdated - bUpdated;
          break;
        case 'queries':
          comparison = (a.queries?.length || 0) - (b.queries?.length || 0);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    setFilteredReports(filtered);
  }, [reports, searchQuery, filterBy, sortBy, sortDirection, favorites]);

  const handleCreateReport = () => {
    router.push("/reports/add");
  };

  const handleReportClick = (id: number) => {
    router.push(`/reports/${id}`);
  };

  const handleToggleFavorite = async (report: SavedReport, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    
    const newFavorites = new Set(favorites);
    if (favorites.has(report.id)) {
      newFavorites.delete(report.id);
    } else {
      newFavorites.add(report.id);
    }
    setFavorites(newFavorites);
  };

  const handleEditReport = (report: SavedReport, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    router.push(`/reports/${report.id}/edit`);
  };

  const handleDeleteReport = async (report: SavedReport, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    setReportToDelete(report);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!reportToDelete) return;

    setIsDeleting(true);
    try {
      await reportsService.deleteReport(reportToDelete.id.toString());
      setReports(prev => prev.filter(r => r.id !== reportToDelete.id));
      setDeleteModalOpen(false);
      setReportToDelete(null);
    } catch (error) {
      console.error("Failed to delete report:", error);
      setError("Rapor silinemedi");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(option);
      setSortDirection('desc');
    }
  };

  const getMainVisualizationType = (report: SavedReport) => {
    if (!report.queries || report.queries.length === 0) return 'table';
    return report.queries[0].visualization?.type || 'table';
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-xl font-medium text-gray-700">Raporlar yükleniyor...</div>
          <div className="text-sm text-gray-500">Lütfen bekleyiniz...</div>
        </div>
      </div>
    );
  }

    return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Raporlar</h1>
          <p className="text-gray-600 mt-1">Tüm raporlarınızı görüntüleyin ve yönetin</p>
        </div>
        <button
          onClick={handleCreateReport}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Yeni Rapor
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="mt-2 text-red-600 hover:text-red-700 text-sm underline"
          >
            Kapat
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-lg shadow-slate-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rapor ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-blue-100 text-blue-600' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list' 
                  ? 'bg-blue-100 text-blue-600' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              showFilters 
                ? 'bg-blue-100 text-blue-600' 
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filtreler
          </button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-4">
              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Kategori:</span>
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="all">Tümü</option>
                  <option value="public">Herkese Açık</option>
                  <option value="private">Özel</option>
                  <option value="favorites">Favoriler</option>
                </select>
              </div>

              {/* Sort Options */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Sırala:</span>
                <div className="flex gap-1">
                  {[
                    { key: 'name', label: 'Ad' },
                    { key: 'created', label: 'Oluşturma' },
                    { key: 'updated', label: 'Güncelleme' },
                    { key: 'queries', label: 'Sorgu Sayısı' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleSort(key as SortOption)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                        sortBy === key
                          ? 'bg-blue-100 text-blue-600'
                          : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                      {sortBy === key && (
                        sortDirection === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {filteredReports.length} rapor gösteriliyor
          {searchQuery && ` "${searchQuery}" için`}
        </span>
      </div>

      {/* Reports Grid/List */}
      {filteredReports.length > 0 ? (
        <div className={
          viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            : "space-y-4"
        }>
          {filteredReports.map((report) => {
            const mainVisualizationType = getMainVisualizationType(report);
            const IconComponent = visualizationIconMap[mainVisualizationType] || FileText;
            
            if (viewMode === 'list') {
              return (
                <div
                  key={report.id}
                  onClick={() => handleReportClick(report.id)}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-blue-500 text-white flex-shrink-0">
                      <IconComponent className="h-6 w-6" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                          {report.name}
                        </h3>
                        {favorites.has(report.id) && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">{report.description}</p>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Database className="h-4 w-4" />
                          <span>{report.queries?.length || 0} Sorgu</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(report.created_at).toLocaleDateString('tr-TR')}</span>
                        </div>
                        {report.owner_name && (
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            <span>{report.owner_name}</span>
                          </div>
                        )}
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          report.is_public
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {report.is_public ? (
                            <>
                              <Eye className="h-3 w-3 mr-1" />
                              Herkese Açık
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3 mr-1" />
                              Özel
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleToggleFavorite(report, e)}
                        className="p-2 text-gray-400 hover:text-yellow-500 transition-colors"
                        title={favorites.has(report.id) ? "Favorilerden çıkar" : "Favorilere ekle"}
                      >
                        <Star className={`h-4 w-4 ${favorites.has(report.id) ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => handleEditReport(report, e)}
                        className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                        title="Düzenle"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteReport(report, e)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={report.id}
                onClick={() => handleReportClick(report.id)}
                className="bg-white rounded-lg shadow-lg shadow-slate-200 p-6 hover:shadow-lg transition-all cursor-pointer group relative"
              >
                {/* Favorite Star */}
                {favorites.has(report.id) && (
                  <div className="absolute top-3 right-3">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleToggleFavorite(report, e)}
                    className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-yellow-500 transition-colors"
                    title={favorites.has(report.id) ? "Favorilerden çıkar" : "Favorilere ekle"}
                  >
                    <Star className={`h-4 w-4 ${favorites.has(report.id) ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                  </button>
                  <button
                    onClick={(e) => handleEditReport(report, e)}
                    className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-blue-500 transition-colors"
                    title="Düzenle"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteReport(report, e)}
                    className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-red-500 transition-colors"
                    title="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-lg bg-blue-500 text-white">
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    report.is_public 
                      ? "bg-blue-100 text-blue-800" 
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {report.is_public ? (
                      <>
                        <Eye className="h-3 w-3 mr-1" />
                        Herkese Açık
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3 mr-1" />
                        Özel
                      </>
                    )}
                  </span>
                </div>
                
                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {report.name}
                </h3>
                
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{report.description}</p>
                
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(report.created_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                  {report.owner_name && (
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span>{report.owner_name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchQuery || filterBy !== 'all' 
              ? "Arama kriterlerinize uygun rapor bulunamadı" 
              : "Henüz rapor bulunmuyor"
            }
          </h3>
          <p className="text-gray-500 mb-6">
            {searchQuery || filterBy !== 'all'
              ? "Farklı arama terimleri veya filtreler deneyebilirsiniz."
              : "İlk raporunuzu oluşturmak için aşağıdaki butona tıklayın."
            }
          </p>
          {(!searchQuery && filterBy === 'all') && (
            <button
              onClick={handleCreateReport}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              İlk Raporu Oluştur
            </button>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setReportToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Raporu Sil"
        description="Bu işlem geri alınamaz. Rapor kalıcı olarak silinecek."
        itemName={reportToDelete?.name}
        isDeleting={isDeleting}
      />
    </div>
  );
}
