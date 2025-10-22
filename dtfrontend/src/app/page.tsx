"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Server,
  Cloud,
  Workflow,
  ArrowRight
} from "lucide-react";
import { dashboardService } from "@/services/dashboard";
import { platformService } from "@/services/platform";
import { DashboardList } from "@/types/dashboard";
import { Platform as PlatformType } from "@/types/platform";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { api } from "@/lib/api";

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

// Default icon mapping by platform code
const defaultPlatformIcons: Record<string, any> = {
  deriniz: Database,
  app2: Server,
  app3: Cloud,
  app4: Workflow,
};

// Default gradient mapping by platform code
const defaultPlatformGradients: Record<string, { gradient: string; iconBg: string; iconColor: string }> = {
  deriniz: {
    gradient: 'from-blue-500 to-purple-600',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  app2: {
    gradient: 'from-green-500 to-emerald-600',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
  },
  app3: {
    gradient: 'from-orange-500 to-red-600',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
  },
  app4: {
    gradient: 'from-purple-500 to-pink-600',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
};

export default function Home() {
  const router = useRouter();
  const { user } = useUser();
  const { clearPlatform } = usePlatform();
  console.log("user", user);
  const hasDerinizAdmin = user?.role && Array.isArray(user.role) &&
    user.role.includes('deriniz:admin');
  const [platforms, setPlatforms] = useState<PlatformType[]>([]);
  const [dashboards, setDashboards] = useState<DashboardList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoveredPlatform, setHoveredPlatform] = useState<string | null>(null);
  const [showUnderConstructionModal, setShowUnderConstructionModal] = useState(false);
  const [underConstructionPlatform, setUnderConstructionPlatform] = useState<string>("");

  const handleDerinizHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is in top right area (top 25% and right 25% of the div)
    const isTopRight = mouseX > rect.width * 0.75 && mouseY < rect.height * 0.25;

    setShowTooltip(isTopRight);
  };

  const handleDerinizMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is in top right area (top 25% and right 25% of the div)
    const isTopRight = mouseX > rect.width * 0.80 && mouseY < rect.height * 0.20;

    setShowTooltip(isTopRight);
  };

  const handleDerinizLeave = () => {
    setShowTooltip(false);
  };

  useEffect(() => {
    // Clear platform when visiting root home page
    // This ensures dashboards/reports from all platforms are shown
    console.log('[Root Page] Clearing platform from context');
    clearPlatform();
    
    // Clear API cache to force fresh data fetch
    console.log('[Root Page] Clearing API cache');
    api.clearCache();
    
    const fetchData = async () => {
      try {
        const [platformData, dashboardData] = await Promise.all([
          platformService.getPlatforms(0, 100, false), // Get active platforms only
          dashboardService.getDashboards(),
        ]);
        setPlatforms(platformData);
        setDashboards(dashboardData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setError("Veriler yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePlatformSelect = (platformCode: string, isUnderConstruction: boolean, displayName: string) => {
    if (isUnderConstruction) {
      // Show modal instead of navigating
      setUnderConstructionPlatform(displayName);
      setShowUnderConstructionModal(true);
    } else {
      // Store selected platform in localStorage
      localStorage.setItem('platform_code', platformCode);
      // Navigate to platform-specific home page
      router.push(`/${platformCode}`);
    }
  };

  const handleCreateDashboard = () => {
    router.push("/dashboard/add");
  };

  const handleDashboardClick = (id: number) => {
    router.push(`/dashboard/${id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Ekranlar yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{"color": "rgb(69,81,89)"}}>
            Hoş Geldiniz{user?.name ? `, ${user.name}` : ''}
          </h1>
          <p className="text-sm text-gray-600">Çalışmak istediğiniz platformu seçin</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Platform Selection Section */}
        <div className="mb-16">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Platformlar</h3>
          {platforms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {platforms
                .sort((a, b) => {
                  const orderA = a.theme_config?.order ?? 999;
                  const orderB = b.theme_config?.order ?? 999;
                  return orderA - orderB;
                })
                .map((platform) => {
                // Get default icon and styling or use from theme_config
                const Icon = defaultPlatformIcons[platform.code] || Database;
                const styling = defaultPlatformGradients[platform.code] || {
                  gradient: 'from-gray-500 to-gray-600',
                  iconBg: 'bg-gray-100',
                  iconColor: 'text-gray-600',
                };
                const isHovered = hoveredPlatform === platform.code;

                const isUnderConstruction = platform.theme_config?.underConstruction || false;

                return (
                  <div
                    key={platform.code}
                    onMouseEnter={() => setHoveredPlatform(platform.code)}
                    onMouseLeave={() => setHoveredPlatform(null)}
                    onClick={() => handlePlatformSelect(platform.code, isUnderConstruction, platform.display_name)}
                    className={`
                      bg-white rounded-lg shadow-xl shadow-slate-200 py-6 px-2
                      hover:shadow-2xl transition-all duration-300 cursor-pointer group
                      transform hover:scale-105 relative
                      ${isHovered ? 'ring-2 ring-blue-500/50' : ''}
                    `}
                  >

                    {/* Logo and Name Section - Two Columns */}
                    <div className="flex gap-2">
                      {/* Column 1: Logo */}
                      {platform.logo_url ? (
                        <div className="w-24 h-24 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform overflow-hidden">
                          <img 
                            src={platform.logo_url} 
                            alt={platform.display_name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              // Fallback to icon if image fails to load
                              e.currentTarget.style.display = 'none';
                              const iconContainer = e.currentTarget.parentElement;
                              if (iconContainer) {
                                iconContainer.className = `w-20 h-20 ${styling.iconBg} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`;
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className={`w-20 h-20 ${styling.iconBg} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                          <Icon className={`h-10 w-10 ${styling.iconColor}`} />
                        </div>
                      )}
                      
                      {/* Column 2: Name and Description */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-lg text-gray-900 mb-2 group-hover:text-blue-600 transition-colors border-b-2 border-slate-100 pb-1">
                          {platform.display_name}
                        </h4>
                        <p className="text-xs text-gray-600">
                          {platform.description || 'Platform açıklaması'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Database className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz platform bulunmuyor</h3>
              <p className="text-gray-500 mb-6">Sistem yöneticisi tarafından platform eklenmelidir.</p>
            </div>
          )}
        </div>

        {/* Dashboards Section */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <h3 className="text-xl font-semibold text-gray-900 mb-2 sm:mb-0">Ekranlarım</h3>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
            >
              <Eye className="h-4 w-4" />
              Tüm Ekranlar
            </button>
          </div>
        </div>

        {/* Dashboard Grid */}
        {dashboards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Sort dashboards: favorites first, then sort by creation date */}
            {[...dashboards]
              .sort((a, b) => {
                // First sort by favorite status
                if (a.is_favorite && !b.is_favorite) return -1;
                if (!a.is_favorite && b.is_favorite) return 1;
                // Then sort by creation date (newest first)
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })
              .slice(0, 3)
              .map((dashboard) => {
              const config = dashboard.layout_config || {};
              const IconComponent = iconMap[config.iconName] || Layout;
              
              return (
                <div
                  key={dashboard.id}
                  onClick={() => handleDashboardClick(dashboard.id)}
                  className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-xl transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg ${config.color || 'bg-gray-500'} text-white`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      {dashboard.is_favorite && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Star className="h-3 w-3 mr-1 fill-current" />
                          Favori
                        </span>
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz dashboard bulunmuyor</h3>
            <p className="text-gray-500 mb-6">İlk dashboard'ınızı oluşturmak için aşağıdaki butona tıklayın.</p>
            <button
              onClick={handleCreateDashboard}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              İlk Dashboard'ı Oluştur
            </button>
          </div>
        )}

      </div>

      {/* Under Construction Modal */}
      {showUnderConstructionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-yellow-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="text-4xl">🚧</div>
                <h3 className="text-xl font-bold text-white">Yapım Aşamasında</h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-gray-700 text-lg mb-2">
                <span className="font-semibold">{underConstructionPlatform}</span> platformu şu anda yapım aşamasındadır.
              </p>
              <p className="text-gray-600">
                Bu platform üzerinde çalışmalar devam etmektedir. Yakında hizmetinizde olacaktır.
              </p>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowUnderConstructionModal(false)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
