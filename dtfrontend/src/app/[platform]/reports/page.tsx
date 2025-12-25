"use client"

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
  User,
  Settings,
  Save,
  X,
  ExternalLink
} from "lucide-react";
import { reportsService } from "@/services/reports";
import { SavedReport } from "@/types/reports";
import { MirasAssistant } from "@/components/chatbot/miras-assistant";
import { Feedback } from "@/components/feedback/feedback";
import { DeleteModal } from "@/components/ui/delete-modal";
import configService, { ColorGroupsMapping } from "@/services/config";
import { useUser } from "@/contexts/user-context";
import { isAdmin } from "@/lib/utils";

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
type ColorFilter = string | null;

export default function ReportsPage() {
  const router = useRouter();
  const params = useParams();
  const platformCode = params.platform as string;
  const { user } = useUser();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Get subplatform from URL query
  const subplatform = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('subplatform')
    : null;
  
  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [colorFilter, setColorFilter] = useState<ColorFilter>(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<SavedReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Color groups config state
  const [colorGroups, setColorGroups] = useState<ColorGroupsMapping>({});
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingColorGroups, setEditingColorGroups] = useState<ColorGroupsMapping>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch color groups configuration
  useEffect(() => {
    if (!mounted) return;

    const fetchColorGroups = async () => {
      try {
        const groups = await configService.getColorGroups();
        console.log("Fetched color groups:", groups);
        setColorGroups(groups);
      } catch (err) {
        console.error("Failed to fetch color groups:", err);
        // Continue without color groups if fetch fails
      }
    };

    fetchColorGroups();
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    const fetchReports = async () => {
      try {
        const data = await reportsService.getReports(0, 100, subplatform || undefined);
        setReports(data);

        // Initialize favorites from API response
        const initialFavorites = new Set<number>();
        data.forEach((report: any) => {
          if (report.is_favorite) {
            initialFavorites.add(report.id);
          }
        });
        setFavorites(initialFavorites);
      } catch (error) {
        console.error("Failed to fetch reports:", error);
        setError("Raporlar yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [mounted, subplatform]);

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

    // Apply color filter
    if (colorFilter) {
      filtered = filtered.filter(report => (report.color || '#3B82F6') === colorFilter);
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
  }, [reports, searchQuery, filterBy, sortBy, sortDirection, favorites, colorFilter]);

  const handleCreateReport = () => {
    if (subplatform) {
      router.push(`/${platformCode}/reports/add?subplatform=${subplatform}`);
    } else {
      router.push(`/${platformCode}/reports/add`);
    }
  };

  const handleReportClick = (report: SavedReport) => {
    // If report is a direct link, open in new tab
    if (report.isDirectLink && report.directLink) {
      window.open(report.directLink, '_blank', 'noopener,noreferrer');
      return;
    }
    
    // Otherwise, navigate to report detail page
    if (subplatform) {
      router.push(`/${platformCode}/reports/${report.id}?subplatform=${subplatform}`);
    } else {
      router.push(`/${platformCode}/reports/${report.id}`);
    }
  };

  const handleToggleFavorite = async (report: SavedReport, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation

    try {
      const result = await reportsService.toggleFavorite(report.id.toString());

      // Update local state based on server response
      const newFavorites = new Set(favorites);
      if (result.is_favorite) {
        newFavorites.add(report.id);
      } else {
        newFavorites.delete(report.id);
      }
      setFavorites(newFavorites);
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  const handleEditReport = (report: SavedReport, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    if (subplatform) {
      router.push(`/${platformCode}/reports/${report.id}/edit?subplatform=${subplatform}`);
    } else {
      router.push(`/${platformCode}/reports/${report.id}/edit`);
    }
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

  const handleOpenSettings = () => {
    // Get distinct colors from current reports
    const distinctColors = Array.from(new Set(reports.map(r => r.color || '#3B82F6')));

    // Initialize editing state with current color groups
    const initialGroups: ColorGroupsMapping = {};
    distinctColors.forEach(color => {
      initialGroups[color] = colorGroups[color] || { name: '', description: '' };
    });

    setEditingColorGroups(initialGroups);
    setSettingsModalOpen(true);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await configService.updateColorGroups(editingColorGroups);
      // Refetch from DB to ensure we have the latest saved data
      const updatedGroups = await configService.getColorGroups();
      setColorGroups(updatedGroups);
      setSettingsModalOpen(false);
    } catch (err) {
      console.error("Failed to save color groups:", err);
      setError("Renk grupları kaydedilemedi");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleColorGroupChange = (color: string, field: 'name' | 'description', value: string) => {
    setEditingColorGroups(prev => ({
      ...prev,
      [color]: {
        ...prev[color],
        [field]: value
      }
    }));
  };

  const handleColorFilterClick = (color: string) => {
    // Toggle color filter - if same color is clicked, remove filter
    setColorFilter(prevColor => prevColor === color ? null : color);
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Raporlar - {subplatform ? subplatform.charAt(0).toUpperCase() + subplatform.slice(1) : ''}</h1>
            <p className="text-gray-600 mt-1 text-sm">Tüm raporlarınızı görüntüleyin ve yönetin</p>
          </div>
          {isAdmin(user) && (
            <button
              onClick={handleOpenSettings}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Renk Gruplarını Ayarla"
            >
              <Settings className="h-5 w-5" />
            </button>
          )}
        </div>
        {isAdmin(user) && (
          <button
            onClick={handleCreateReport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Yeni Rapor
          </button>
        )}
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
      <div className="bg-white rounded-lg shadow-lg p-2">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rapor ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="all">Tümü</option>
                <option value="public">Herkese Açık</option>
                <option value="private">Özel</option>
                <option value="favorites">Favoriler</option>
              </select>
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-1">
              {[
                { key: 'name', label: 'Ad' },
                { key: 'created', label: 'Tarih' },
                { key: 'updated', label: 'Güncelleme' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleSort(key as SortOption)}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
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

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Color Legend - Inline */}
          {reports.length > 0 && (() => {
            // Get reports without color filter applied (to show accurate counts)
            let reportsForCounting = [...reports];

            // Apply search filter
            if (searchQuery.trim()) {
              reportsForCounting = reportsForCounting.filter(report =>
                report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                report.description.toLowerCase().includes(searchQuery.toLowerCase())
              );
            }

            // Apply category filter
            switch (filterBy) {
              case 'public':
                reportsForCounting = reportsForCounting.filter(report => report.is_public);
                break;
              case 'private':
                reportsForCounting = reportsForCounting.filter(report => !report.is_public);
                break;
              case 'favorites':
                reportsForCounting = reportsForCounting.filter(report => favorites.has(report.id));
                break;
            }

            const distinctColors = Array.from(new Set(reportsForCounting.map(r => r.color || '#3B82F6')));
            const colorCounts = distinctColors.map(color => {
              console.log(`Color ${color} mapping:`, colorGroups[color]);
              return {
                color,
                count: reportsForCounting.filter(r => (r.color || '#3B82F6') === color).length,
                groupName: colorGroups[color]?.name,
                groupDescription: colorGroups[color]?.description
              };
            });

            return (
              <div className="flex items-center gap-2 flex-wrap border-t border-gray-200 pt-2">
                <span className="text-xs font-medium text-gray-700">Rapor Grupları:</span>
                {colorCounts.map(({ color, count, groupName, groupDescription }) => (
                  <button
                    key={color}
                    onClick={() => handleColorFilterClick(color)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                      colorFilter === color
                        ? 'bg-blue-50 ring-2 ring-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                    style={{ borderLeft: `4px solid ${color}` }}
                    title={`${groupDescription || `${count} rapor`}${colorFilter === color ? ' (Filtreleniyor)' : ' - Filtrelemek için tıklayın'}`}
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {groupName ? (
                      <>
                        <span className="text-xs font-medium text-gray-700">{groupName}</span>
                        <span className="text-xs text-gray-500">({count})</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-600">{count} rapor</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Reports Grid/List */}
      {filteredReports.length > 0 ? (
        <div className="space-y-8">
          {/* Favorited Reports Section - Only show when not filtering by favorites */}
          {filterBy !== 'favorites' && filteredReports.filter(r => favorites.has(r.id)).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                <h2 className="text-xl font-semibold text-gray-900">Favori Raporlar</h2>
                <span className="text-sm text-gray-500">
                  ({filteredReports.filter(r => favorites.has(r.id)).length})
                </span>
              </div>
              <div className={
                viewMode === 'grid'
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                  : "space-y-4"
              }>
                {filteredReports.filter(r => favorites.has(r.id)).map((report) => {
                  const mainVisualizationType = getMainVisualizationType(report);
                  const IconComponent = visualizationIconMap[mainVisualizationType] || FileText;

                  if (viewMode === 'list') {
                    return (
                      <div
                        key={report.id}
                        onClick={() => handleReportClick(report)}
                        className="bg-white rounded-lg p-4 hover:shadow-md transition-all cursor-pointer group border-l-4"
                        style={{ borderLeftColor: report.color || '#3B82F6' }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-3 rounded-lg text-white flex-shrink-0" style={{ backgroundColor: report.color || '#3B82F6' }}>
                            <IconComponent className="h-6 w-6" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate flex items-center gap-2">
                                {report.name}
                                {report.isDirectLink && (
                                  <ExternalLink className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                )}
                              </h3>
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
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
                              title="Favorilerden çıkar"
                            >
                              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                            </button>
                            {isAdmin(user) && (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={report.id}
                      onClick={() => handleReportClick(report)}
                      className="bg-white rounded-lg shadow-lg shadow-slate-200 p-4 hover:shadow-lg hover:scale-105 transition-all cursor-pointer group relative border-l-4 overflow-hidden"
                      style={{ borderLeftColor: report.color || '#3B82F6' }}
                    >
                      {/* Background Pattern */}
                      <div
                        className="absolute inset-0 opacity-[0.03]"
                        style={{
                          backgroundImage: `repeating-linear-gradient(45deg, #000000 0, #000000 0.2px, transparent 0, transparent 50%)`,
                          backgroundSize: '10px 10px'
                        }}
                      />
                      <div className="absolute top-2 right-2 z-10">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      </div>

                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                        <button
                          onClick={(e) => handleToggleFavorite(report, e)}
                          className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-yellow-500 transition-colors"
                          title="Favorilerden çıkar"
                        >
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                        </button>
                        {isAdmin(user) && (
                          <>
                            <button
                              onClick={(e) => handleEditReport(report, e)}
                              className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-blue-500 transition-colors"
                              title="Düzenle"
                            >
                              <Edit className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteReport(report, e)}
                              className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-red-500 transition-colors"
                              title="Sil"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex items-start justify-between mb-3 relative z-10">
                        <div className="p-2 rounded-lg text-white" style={{ backgroundColor: report.color || '#3B82F6' }}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                      </div>

                      <span className={`absolute top-2 right-2 z-20 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium group-hover:opacity-0 transition-opacity ${
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

                      <h3 className="text-base font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors relative z-10 flex items-center gap-2">
                        {report.name}
                        {report.isDirectLink && (
                          <ExternalLink className="h-3 w-3 text-gray-400" />
                        )}
                      </h3>

                      <p className="text-sm text-gray-600 mb-3 line-clamp-2 relative z-10">{report.description}</p>

                      <div className="flex items-center gap-3 text-xs text-gray-500 relative z-10">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(report.created_at).toLocaleDateString('tr-TR')}</span>
                        </div>
                        {report.owner_name && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{report.owner_name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Other Reports Section */}
          {(filterBy !== 'favorites' ? filteredReports.filter(r => !favorites.has(r.id)) : filteredReports).length > 0 && (
            <div className="space-y-4">
              {filterBy !== 'favorites' && filteredReports.filter(r => favorites.has(r.id)).length > 0 && (
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Diğer Raporlar</h2>
                  <span className="text-sm text-gray-500">
                    ({filteredReports.filter(r => !favorites.has(r.id)).length})
                  </span>
                </div>
              )}
              <div className={
                viewMode === 'grid'
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                  : "space-y-4"
              }>
                {(filterBy !== 'favorites' ? filteredReports.filter(r => !favorites.has(r.id)) : filteredReports).map((report) => {
            const mainVisualizationType = getMainVisualizationType(report);
            const IconComponent = visualizationIconMap[mainVisualizationType] || FileText;
            
            if (viewMode === 'list') {
              return (
                <div
                  key={report.id}
                  onClick={() => handleReportClick(report)}
                  className="bg-white rounded-lg p-4 hover:shadow-md transition-all cursor-pointer group border-l-4"
                  style={{ borderLeftColor: report.color || '#3B82F6' }}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg text-white flex-shrink-0" style={{ backgroundColor: report.color || '#3B82F6' }}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate flex items-center gap-2">
                          {report.name}
                          {report.isDirectLink && (
                            <ExternalLink className="h-3 w-3 text-gray-400 flex-shrink-0" />
                          )}
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
                      {isAdmin(user) && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={report.id}
                onClick={() => handleReportClick(report)}
                className="bg-white rounded-lg shadow-lg shadow-slate-200 p-4 hover:shadow-lg hover:scale-105 transition-all cursor-pointer group relative border-l-4 overflow-hidden"
                style={{ borderLeftColor: report.color || '#3B82F6' }}
              >
                {/* Background Pattern */}
                <div
                  className="absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage: `repeating-linear-gradient(45deg, #000000 0, #000000 0.2px, transparent 0, transparent 50%)`,
                    backgroundSize: '10px 10px'
                  }}
                />
                {/* Favorite Star */}
                {favorites.has(report.id) && (
                  <div className="absolute top-2 right-2 z-10">
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                  <button
                    onClick={(e) => handleToggleFavorite(report, e)}
                    className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-yellow-500 transition-colors"
                    title={favorites.has(report.id) ? "Favorilerden çıkar" : "Favorilere ekle"}
                  >
                    <Star className={`h-3 w-3 ${favorites.has(report.id) ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                  </button>
                  {isAdmin(user) && (
                    <>
                      <button
                        onClick={(e) => handleEditReport(report, e)}
                        className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-blue-500 transition-colors"
                        title="Düzenle"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteReport(report, e)}
                        className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-red-500 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-start justify-between mb-3 relative z-10">
                  <div className="p-2 rounded-lg text-white" style={{ backgroundColor: report.color || '#3B82F6' }}>
                    <IconComponent className="h-5 w-5" />
                  </div>
                </div>

                <span className={`absolute top-2 right-2 z-20 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium group-hover:opacity-0 transition-opacity ${
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

                <h3 className="text-base font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors relative z-10 flex items-center gap-2">
                  {report.name}
                  {report.isDirectLink && (
                    <ExternalLink className="h-3 w-3 text-gray-400" />
                  )}
                </h3>

                <p className="text-sm text-gray-600 mb-3 line-clamp-2 relative z-10">{report.description}</p>

                <div className="flex items-center gap-3 text-xs text-gray-500 relative z-10">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(report.created_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                  {report.owner_name && (
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>{report.owner_name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
              </div>
            </div>
          )}
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
          {(!searchQuery && filterBy === 'all' && isAdmin(user)) && (
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

      {/* Color Groups Settings Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <Settings className="h-6 w-6 text-blue-600" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Renk Grupları Ayarları</h2>
                  <p className="text-sm text-gray-600 mt-1">Her renk için bir grup adı belirleyin</p>
                </div>
              </div>
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {Object.keys(editingColorGroups).map(color => (
                  <div
                    key={color}
                    className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {/* Color Preview */}
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <div
                        className="w-12 h-12 rounded-lg shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs text-gray-500 font-mono">{color}</span>
                    </div>

                    {/* Input Fields */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Grup Adı *
                        </label>
                        <input
                          type="text"
                          value={editingColorGroups[color]?.name || ''}
                          onChange={(e) => handleColorGroupChange(color, 'name', e.target.value)}
                          placeholder="Örn: Şirket, Kişisel, Finansal..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Açıklama (Opsiyonel)
                        </label>
                        <input
                          type="text"
                          value={editingColorGroups[color]?.description || ''}
                          onChange={(e) => handleColorGroupChange(color, 'description', e.target.value)}
                          placeholder="Bu rengin ne için kullanıldığını açıklayın..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {Object.keys(editingColorGroups).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Settings className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <p>Henüz renk kullanılmamış. Rapor oluştururken renk seçtiğinizde buraya gelecektir.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setSettingsModalOpen(false)}
                disabled={isSavingSettings}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                İptal
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingSettings ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Kaydediliyor...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Kaydet
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MIRAS Assistant Chatbot */}
      <MirasAssistant />
      
      {/* Feedback Button */}
      <Feedback />
    </div>
  );
}
