"use client"

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BarChart3,
  PieChart,
  Activity,
  TrendingUp,
  Users,
  Settings,
  Calendar,
  Clock,
  Database,
  FileText,
  MessageSquare,
  Bell,
  ShoppingCart,
  DollarSign,
  Globe,
  Zap,
  Shield,
  Monitor,
  Map as MapIcon,
  Camera,
  Music,
  Heart,
  Star,
  Target,
  Gauge,
  Cpu,
  Wifi,
  Battery,
  HardDrive,
  Smartphone,
  Plus,
  Layout,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  Search,
  Filter,
  Grid3X3,
  List,
  SortAsc,
  SortDesc
} from "lucide-react";
import { dashboardService } from "@/services/dashboard";
import { DashboardList } from "@/types/dashboard";
import { useUser } from "@/contexts/user-context";
import { useDashboards } from "@/contexts/dashboard-context";
import { MirasAssistant } from "@/components/chatbot/miras-assistant";
import { Feedback } from "@/components/feedback/feedback";

// Icon mapping
const iconMap: { [key: string]: any } = {
  BarChart3,
  PieChart,
  Activity,
  TrendingUp,
  Users,
  Settings,
  Calendar,
  Clock,
  Database,
  FileText,
  MessageSquare,
  Bell,
  ShoppingCart,
  DollarSign,
  Globe,
  Zap,
  Shield,
  Monitor,
  Map: MapIcon,
  Camera,
  Music,
  Heart,
  Star,
  Target,
  Gauge,
  Cpu,
  Wifi,
  Battery,
  HardDrive,
  Smartphone,
  Plus,
  Layout
};

type ViewMode = 'grid' | 'list';
type SortOption = 'name' | 'created' | 'updated' | 'widgets';
type SortDirection = 'asc' | 'desc';
type FilterOption = 'all' | 'public' | 'private' | 'favorites';

export default function DashboardsPage() {
  const router = useRouter();
  const { user } = useUser();
  const { dashboards: contextDashboards, updateDashboardInList, removeDashboardFromList } = useDashboards();
  const params = useParams()
  const platformCode = params.platform as string
  const [dashboards, setDashboards] = useState<DashboardList[]>([]);
  const [filteredDashboards, setFilteredDashboards] = useState<DashboardList[]>([]);
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const fetchDashboards = async () => {
      try {
        const data = await dashboardService.getDashboards(0, 100, subplatform || undefined);
        setDashboards(data);
      } catch (error) {
        console.error("Failed to fetch dashboards:", error);
        setError("Ekranlar yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboards();
  }, [mounted, subplatform]);

  // Filter and sort dashboards
  useEffect(() => {
    let filtered = [...dashboards];

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(dashboard =>
        dashboard.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    switch (filterBy) {
      case 'public':
        filtered = filtered.filter(dashboard => dashboard.is_public);
        break;
      case 'private':
        filtered = filtered.filter(dashboard => !dashboard.is_public);
        break;
      case 'favorites':
        filtered = filtered.filter(dashboard => dashboard.is_favorite);
        break;
      // 'all' case doesn't need filtering
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'created':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'updated':
          const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : new Date(a.created_at).getTime();
          const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : new Date(b.created_at).getTime();
          comparison = aUpdated - bUpdated;
          break;
        case 'widgets':
          comparison = (a.widgets?.length || 0) - (b.widgets?.length || 0);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    setFilteredDashboards(filtered);
  }, [dashboards, searchQuery, filterBy, sortBy, sortDirection]);

  const handleCreateDashboard = () => {
    if (subplatform) {
      router.push(`/${platformCode}/dashboard/add?subplatform=${subplatform}`);
    } else {
      router.push(`/${platformCode}/dashboard/add`);
    }
  };

  const handleDashboardClick = (id: number) => {
    if (subplatform) {
      router.push(`/${platformCode}/dashboard/${id}?subplatform=${subplatform}`);
    } else {
      router.push(`/${platformCode}/dashboard/${id}`);
    }
  };

  const handleToggleFavorite = async (dashboard: DashboardList, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    
    try {
      if (dashboard.is_favorite) {
        await dashboardService.removeFromFavorites(dashboard.id);
      } else {
        await dashboardService.addToFavorites(dashboard.id);
      }
      
      // Update local state
      const updatedDashboard = { ...dashboard, is_favorite: !dashboard.is_favorite };
      setDashboards(prev => prev.map(d => d.id === dashboard.id ? updatedDashboard : d));
      updateDashboardInList(updatedDashboard);
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  const handleDeleteDashboard = async (dashboard: DashboardList, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    
    if (window.confirm(`"${dashboard.title}" dashboard'unu silmek istediğinizden emin misiniz?`)) {
      try {
        await dashboardService.deleteDashboard(dashboard.id);
        setDashboards(prev => prev.filter(d => d.id !== dashboard.id));
        removeDashboardFromList(dashboard.id);
      } catch (error) {
        console.error("Failed to delete dashboard:", error);
        setError("Dashboard silinemedi");
      }
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

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-xl font-medium text-gray-700">Ekranlar yükleniyor...</div>
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
          <h1 className="text-3xl font-bold text-gray-900">Ekranlarım - {subplatform ? subplatform.charAt(0).toUpperCase() + subplatform.slice(1) : ''}</h1>
          <p className="text-gray-600 mt-1">Tüm ekranlarınızı görüntüleyin ve yönetin</p>
        </div>
        <button
          onClick={handleCreateDashboard}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Yeni Ekran
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
                placeholder="Ekran ara..."
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
                    { key: 'widgets', label: 'Widget Sayısı' }
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
          {filteredDashboards.length} ekran{filteredDashboards.length !== 1 ? '' : ''} gösteriliyor
          {searchQuery && ` "${searchQuery}" için`}
        </span>
      </div>

      {/* Dashboard Grid/List */}
      {filteredDashboards.length > 0 ? (
        <div className={
          viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            : "space-y-4"
        }>
          {filteredDashboards.map((dashboard) => {
            const config = dashboard.layout_config || {};
            const IconComponent = iconMap[config.iconName] || Layout;
            
            if (viewMode === 'list') {
              return (
                <div
                  key={dashboard.id}
                  onClick={() => handleDashboardClick(dashboard.id)}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${config.color || 'bg-gray-500'} text-white flex-shrink-0`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                          {dashboard.title}
                        </h3>
                        {dashboard.is_favorite && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Layout className="h-4 w-4" />
                          <span>{dashboard.widgets?.length || 0} Widget</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(dashboard.created_at).toLocaleDateString('tr-TR')}</span>
                        </div>
                        {dashboard.owner_name && (
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{dashboard.owner_name}</span>
                          </div>
                        )}
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          dashboard.is_public
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {dashboard.is_public ? (
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
                        onClick={(e) => handleToggleFavorite(dashboard, e)}
                        className="p-2 text-gray-400 hover:text-yellow-500 transition-colors"
                        title={dashboard.is_favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
                      >
                        <Star className={`h-4 w-4 ${dashboard.is_favorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteDashboard(dashboard, e)}
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
                key={dashboard.id}
                onClick={() => handleDashboardClick(dashboard.id)}
                className="bg-white rounded-lg shadow-lg shadow-slate-200 p-6 hover:shadow-lg transition-all cursor-pointer group relative"
              >
                {/* Favorite Star */}
                {dashboard.is_favorite && (
                  <div className="absolute top-3 right-3">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleToggleFavorite(dashboard, e)}
                    className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-yellow-500 transition-colors"
                    title={dashboard.is_favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
                  >
                    <Star className={`h-4 w-4 ${dashboard.is_favorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteDashboard(dashboard, e)}
                    className="p-1 bg-white rounded-full shadow-md text-gray-400 hover:text-red-500 transition-colors"
                    title="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg ${config.color || 'bg-gray-500'} text-white`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    dashboard.is_public 
                      ? "bg-blue-100 text-blue-800" 
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {dashboard.is_public ? (
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
                  {dashboard.title}
                </h3>
                
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Layout className="h-4 w-4" />
                    <span>{dashboard.widgets?.length || 0} Widget</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(dashboard.created_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                  {dashboard.owner_name && (
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{dashboard.owner_name}</span>
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
            <Layout className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchQuery || filterBy !== 'all' 
              ? "Arama kriterlerinize uygun dashboard bulunamadı" 
              : "Henüz dashboard bulunmuyor"
            }
          </h3>
          <p className="text-gray-500 mb-6">
            {searchQuery || filterBy !== 'all'
              ? "Farklı arama terimleri veya filtreler deneyebilirsiniz."
              : "İlk dashboard'ınızı oluşturmak için aşağıdaki butona tıklayın."
            }
          </p>
          {(!searchQuery && filterBy === 'all') && (
            <button
              onClick={handleCreateDashboard}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              İlk Dashboard'ı Oluştur
            </button>
          )}
        </div>
      )}

      {/* MIRAS Assistant Chatbot */}
      <MirasAssistant />
      
      {/* Feedback Button */}
      <Feedback />
    </div>
  );
}
