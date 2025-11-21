"use client"

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { dashboardService } from "@/services/dashboard";
import { Dashboard } from "@/types/dashboard";
import { useDashboards } from "@/contexts/dashboard-context";
import { useFilters } from "@/contexts/filter-context";

import { Calendar, User, Eye, EyeOff, 
  BarChart3, PieChart, Activity, TrendingUp, Users, Settings,
  Clock, Database, FileText, MessageSquare, Bell,
  ShoppingCart, DollarSign, Globe, Zap, Shield, Monitor,
  Map as MapIcon, Camera, Music, Heart, Star, Target, Gauge, Cpu,
  Wifi, Battery, HardDrive, Smartphone, Plus, Layout, Edit, Trash2, X
} from "lucide-react";
import { EfficiencyWidget, GaugeWidget, ProductTestWidget, SerialNoComparisonWidget, TestAnalysisWidget, TestDurationWidget, ExcelExportWidget, MeasurementWidget, TestDurationAnalysisWidget, CapacityAnalysisWidget, MachineOeeWidget, KablajDuruslarWidget, MekanikHatalarWidget, EmployeeCountWidget, AverageTenureWidget, EducationDistributionWidget, AverageSalaryWidget, AbsenteeismWidget, PendingWorkWidget, KablajUretimRateWidget } from "@/components/widgets";
import { DateInput } from "@/components/ui/date-input";
import { DeleteModal } from "@/components/ui/delete-modal";
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

// Widget renderer function
const renderWidgetContent = (widget: any, index: number, dateFrom: string, dateTo: string) => {
  const baseId = widget.id?.split('-')[0] || widget.widget_type;
  
  // Create unique key for each widget instance
  const widgetKey = `${widget.id || `widget-${index}`}-${baseId}`;
  
  // Create date filter props for widgets that need them
  const dateFilterProps = {
    dateFrom: `${dateFrom} 00:00:00`,
    dateTo: `${dateTo} 23:59:59`
  };
  
  switch (baseId) {
    case 'efficiency':
      return <EfficiencyWidget widgetId={widget.id || `widget-${index}`} {...dateFilterProps} />;
    case 'gauge':
      return <GaugeWidget {...dateFilterProps} />;
    case 'product':
      return <ProductTestWidget widgetId={widget.id || `widget-${index}`} {...dateFilterProps} />;
    case 'test':
      return <TestAnalysisWidget widgetId={widget.id || `widget-${index}`} {...dateFilterProps} />;
    case 'test_duration':
      return <TestDurationWidget widgetId={widget.id || `widget-${index}`} {...dateFilterProps} />;
    case 'excel':
      return <ExcelExportWidget widgetId={widget.id || `widget-${index}`} {...dateFilterProps} />;
    case 'measurement':
      return <MeasurementWidget widgetId={widget.id || `widget-${index}`} {...dateFilterProps} />;
    case 'serialno_comparison':
      return <SerialNoComparisonWidget widgetId={widget.id || `widget-${index}`} {...dateFilterProps} />;
    case 'test_duration_analysis':
      return <TestDurationAnalysisWidget widgetId={widget.id || `widget-${index}`} {...dateFilterProps} />;
    case 'capacity_analysis':
      return <CapacityAnalysisWidget widgetId={widget.id || `widget-${index}`} />;
    case 'machine_oee':
      return <MachineOeeWidget widgetId={widget.id || `widget-${index}`} />;
    case 'kablaj_duruslar':
      return <KablajDuruslarWidget widgetId={widget.id || `widget-${index}`} />;
    case 'mekanik_hatalar':
      return <MekanikHatalarWidget widgetId={widget.id || `widget-${index}`} />;
    case 'employee_count':
      return <EmployeeCountWidget widgetId={widget.id || `widget-${index}`} />;
    case 'average_tenure':
      return <AverageTenureWidget widgetId={widget.id || `widget-${index}`} />;
    case 'education_distribution':
      return <EducationDistributionWidget widgetId={widget.id || `widget-${index}`} />;
    case 'average_salary':
      return <AverageSalaryWidget widgetId={widget.id || `widget-${index}`} />;
    case 'absenteeism':
      return <AbsenteeismWidget widgetId={widget.id || `widget-${index}`} />;
    case 'pending_work':
      return <PendingWorkWidget widgetId={widget.id || `widget-${index}`} />;
    case 'kablaj_uretim_rate':
      return <KablajUretimRateWidget widgetId={widget.id || `widget-${index}`} />;
    default:
      // Fallback widget display
      const config = widget.config || {};
      const IconComponent = iconMap[config.iconName] || Layout;
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className={`p-3 rounded-lg ${config.color || 'bg-gray-500'} text-white mb-2`}>
            <IconComponent className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-medium text-gray-700">{widget.title}</h4>
        </div>
      );
  }
};

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const subplatform = searchParams.get('subplatform');
  const platformCode = params.platform as string;
  const dashboardId = parseInt(params.id as string);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { updateDashboardInList, removeDashboardFromList } = useDashboards();
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useFilters();

  // Modal states
  const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Favorite state
  const [isFavorite, setIsFavorite] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const dashboardData = await dashboardService.getDashboardById(dashboardId);
        setDashboard(dashboardData);
        setIsFavorite(dashboardData.is_favorite || false);
      } catch (error) {
        console.error("Failed to fetch dashboard:", error);
        setError("Dashboard yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    if (dashboardId) {
      fetchDashboard();
    }
  }, [dashboardId]);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handler functions
  const handleEditName = () => {
    setNewDashboardName(dashboard?.title || "");
    setIsEditNameModalOpen(true);
  };

  const handleUpdateName = async () => {
    if (!dashboard || !newDashboardName.trim()) return;
    
    setIsUpdating(true);
    try {
      const updatedDashboard = await dashboardService.updateDashboard(dashboard.id, {
        title: newDashboardName.trim()
      });
      setDashboard(updatedDashboard);
      setIsEditNameModalOpen(false);
      setNewDashboardName("");
      setError(null); // Clear any previous errors
      
      // Update dashboard in the context
      updateDashboardInList(updatedDashboard);
    } catch (error) {
      console.error("Failed to update dashboard name:", error);
      setError("Dashboard adı güncellenemedi");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!dashboard) return;
    
    setIsDeleting(true);
    try {
      await dashboardService.deleteDashboard(dashboard.id);
      setIsDeleteDialogOpen(false);
      
      // Remove dashboard from the context
      removeDashboardFromList(dashboard.id);
      
      if (subplatform) {
        router.push(`/${platformCode}/dashboard?subplatform=${subplatform}`);
      } else {
        router.push(`/${platformCode}/dashboard`);
      }
    } catch (error) {
      console.error("Failed to delete dashboard:", error);
      setError("Dashboard silinemedi");
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!dashboard || isTogglingFavorite) return;
    
    setIsTogglingFavorite(true);
    try {
      if (isFavorite) {
        await dashboardService.removeFromFavorites(dashboard.id);
        setIsFavorite(false);
      } else {
        await dashboardService.addToFavorites(dashboard.id);
        setIsFavorite(true);
      }
      
      // Update dashboard in the context if needed
      if (dashboard) {
        const updatedDashboard = { ...dashboard, is_favorite: !isFavorite };
        updateDashboardInList(updatedDashboard);
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
      setError("Favori durumu güncellenemedi");
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Dashboard yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg text-red-600">{error || "Dashboard bulunamadı"}</div>
      </div>
    );
  }

  // Get grid size from layout config or default to 6x6
  const gridSize = dashboard.layout_config?.grid_size || { width: 6, height: 6 };
  
  // Calculate maximum occupied row + 1
  const getMaxOccupiedRowPlusOne = () => {
    if (!dashboard.widgets || dashboard.widgets.length === 0) {
      return 3; // Default to 3 rows for empty dashboard
    }
    
    let maxRow = 0;
    dashboard.widgets.forEach(widget => {
      const row = (widget.position_y || 0) + (widget.height || 1);
      maxRow = Math.max(maxRow, row);
    });
    
    return maxRow + 1; // Add 1 extra row
  };
  
  const dynamicRowCount = getMaxOccupiedRowPlusOne();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold">{dashboard.title}</h2>
          <button
            onClick={handleToggleFavorite}
            disabled={isTogglingFavorite}
            className="p-1 rounded-md hover:bg-gray-100 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          >
            {isTogglingFavorite ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
            ) : (
              <Star 
                className={`h-5 w-5 transition-colors ${
                  isFavorite 
                    ? "text-yellow-500 fill-yellow-500" 
                    : "text-gray-400 hover:text-yellow-500"
                }`} 
              />
            )}
          </button>
          <div className="relative" ref={dropdownRef}>
            <button 
              className="h-8 w-8 p-0 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700"
              onClick={() => setIsSettingsDropdownOpen(!isSettingsDropdownOpen)}
            >
              <Settings className="h-4 w-4" />
            </button>
            
            {/* Settings Dropdown */}
            {isSettingsDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsSettingsDropdownOpen(false);
                      if (subplatform) {
                        router.push(`/${platformCode}/dashboard/${dashboard.id}/edit?subplatform=${subplatform}`);
                      } else {
                        router.push(`/${platformCode}/dashboard/${dashboard.id}/edit`);
                      }
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Düzenle
                  </button>
                  <button
                    onClick={() => {
                      setIsSettingsDropdownOpen(false);
                      setIsDeleteDialogOpen(true);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Sil
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dashboard.owner_name && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span>Oluşturan: {dashboard.owner_name}</span>
            </div>
          )}
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
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

      {/* Date Filter Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Tarih Filtresi:</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="dateFrom" className="text-sm text-gray-600">Başlangıç:</label>
              <DateInput
                value={dateFrom}
                onChange={setDateFrom}
                className="px-3 py-1 text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label htmlFor="dateTo" className="text-sm text-gray-600">Bitiş:</label>
              <DateInput
                value={dateTo}
                onChange={setDateTo}
                className="px-3 py-1 text-sm"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Bu tarih aralığı tüm widget'lar için filtre olarak kullanılacaktır
        </p>
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


      {/* Widgets Grid */}
      {dashboard.widgets && dashboard.widgets.length > 0 ? (
        <div className="space-y-4">
          <div 
            className="grid grid-cols-6 gap-4 bg-gray-50 p-4 rounded-lg"
            style={{
              gridTemplateRows: `repeat(${dynamicRowCount}, 1fr)`
            }}
          >
            {/* Background grid cells to establish aspect ratio */}
            {Array.from({ length: 6 * dynamicRowCount }, (_, index) => {
              const row = Math.floor(index / 6)
              const col = index % 6
              return (
                <div
                  key={`bg-cell-${index}`}
                  className="aspect-square border border-gray-200 rounded opacity-20"
                  style={{
                    gridColumn: col + 1,
                    gridRow: row + 1,
                    zIndex: 1
                  }}
                />
              )
            })}

            {dashboard.widgets.map((widget, index) => {
              const row = widget.position_y || 0;
              const col = widget.position_x || 0;
              const width = widget.width || 1;
              const height = widget.height || 1;
              
              // Skip rendering if the widget would be outside grid bounds
              if (row < 0 || row >= dynamicRowCount || col < 0 || col >= 6 || 
                  col + width > 6 || row + height > dynamicRowCount) {
                return null;
              }
              
              return (
              <div
                key={`${widget.id || `widget-${index}`}-${widget.widget_type || 'default'}`}
                className="bg-white rounded-lg"
                style={{
                  gridColumn: `${col + 1} / span ${width}`,
                  gridRow: `${row + 1} / span ${height}`,
                  zIndex: 10
                }}
              >
                  {renderWidgetContent(widget, index, dateFrom, dateTo)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-[300px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-center">
            <Layout className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Bu dashboard'da widget bulunmuyor</h3>
            <p className="text-gray-500">Widget'lar eklendiğinde burada görünecekler.</p>
          </div>
        </div>
      )}

      {/* Edit Name Modal */}
      {isEditNameModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{backdropFilter: 'blur(3px)'}}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 pointer-events-auto shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Dashboard Adını Düzenle</h2>
              <button
                onClick={() => setIsEditNameModalOpen(false)}
                disabled={isUpdating}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <label htmlFor="dashboard-name" className="block text-sm font-medium text-gray-700 mb-2">
                Dashboard Adı
              </label>
              <input
                id="dashboard-name"
                type="text"
                value={newDashboardName}
                onChange={(e) => setNewDashboardName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newDashboardName.trim() && !isUpdating) {
                    handleUpdateName()
                  }
                }}
                placeholder="Dashboard adını girin..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors disabled:bg-gray-100"
                disabled={isUpdating}
                autoFocus
              />
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsEditNameModalOpen(false)}
                disabled={isUpdating}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İptal
              </button>
              <button
                onClick={handleUpdateName}
                disabled={!newDashboardName.trim() || isUpdating}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isUpdating && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {isUpdating ? "Güncelleniyor..." : "Güncelle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Dashboard'u Sil"
        description="Bu işlem geri alınamaz. Dashboard'u ve tüm widget'ları kalıcı olarak silinecek."
        itemName={dashboard?.title}
        isDeleting={isDeleting}
      />

      {/* MIRAS Assistant Chatbot */}
      <MirasAssistant />
      
      {/* Feedback Button */}
      <Feedback />
    </div>
  );
}

