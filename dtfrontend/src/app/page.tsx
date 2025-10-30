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
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [navigatingPlatform, setNavigatingPlatform] = useState<{ name: string; logo: string; code: string } | null>(null);

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

  const handlePlatformSelect = (platformCode: string, isUnderConstruction: boolean, displayName: string, logoUrl: string) => {
    if (isUnderConstruction) {
      // Show modal instead of navigating
      setUnderConstructionPlatform(displayName);
      setShowUnderConstructionModal(true);
    } else {
      // Show navigation modal
      setNavigatingPlatform({ name: displayName, logo: logoUrl, code: platformCode });
      setShowNavigationModal(true);

      // Store selected platform in localStorage
      localStorage.setItem('platform_code', platformCode);

      // Navigate after 1 second
      setTimeout(() => {
        router.push(`/${platformCode}`);
      }, 2000);
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
    <div className="min-h-screen relative">
      {/* Background Image with Opacity */}
      <div className="absolute inset-0 top-[-400px] opacity-20" style={{ backgroundImage: 'url(/wave_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}></div>

      {/* Content */}
      <div className="relative z-10">

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl text-center font-bold text-gray-900 mb-2" style={{"color": "rgb(69,81,89)"}}>
            Hoş Geldiniz{user?.name ? `, ${user.name}` : ''}
          </h1>
          <p className="text-sm text-gray-600 text-center">Çalışmak istediğiniz platformu seçin</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Platform Selection Section */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold mb-2" style={{"color": "rgb(69,81,89)"}}>Platformlar</h3>
          <div className="w-[100px] h-[5px] bg-red-600 mb-10"></div>
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
                    onClick={() => handlePlatformSelect(platform.code, isUnderConstruction, platform.display_name, platform.logo_url || '')}
                    className={`
                      bg-white rounded-lg shadow-xl shadow-slate-200 py-6 px-2
                      hover:shadow-2xl transition-all duration-300 cursor-pointer group
                      transform hover:scale-105 relative
                      ${isHovered ? 'ring-2 ring-[#FF5620]' : ''}
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
                        <p className="text-xs" style={{ color: platform.theme_config?.textColor || '#4B5563', fontWeight: 400}}>
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
      </div>

      {/* Full-width Duyurular Section */}
      <div className="w-full py-12 mb-8 relative overflow-hidden">


        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="mb-8">
            <h3 className="text-2xl font-bold mb-2" style={{"color": "rgb(69,81,89)"}}>Duyurular</h3>
            <div className="w-[100px] h-[5px] bg-red-600"></div>
          </div>

          {/* Carousel Container */}
          <div className="relative flex justify-center">
            {/* Navigation Arrows */}
            <button className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Carousel Cards */}
            <div className="flex gap-6 justify-center items-center max-w-4xl mx-auto">
              {/* Card 1 */}
              <div className="flex-shrink-0 w-80">
                <div className="relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl">
                  {/* Glow Effect */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-300 to-transparent rounded-full opacity-30 blur-xl"></div>

                  {/* Logo */}
                  <div className="absolute top-4 right-4 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 bg-white rounded-full"></div>
                    </div>
                  </div>

                  {/* Date Banner */}
                  <div className="absolute top-20 left-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg">
                    <span className="text-sm font-bold uppercase">27 EKİM - 31 EKİM HAFTASI</span>
                  </div>

                  {/* Main Title */}
                  <div className="absolute bottom-4 left-4 right-4 bg-blue-800 bg-opacity-90 backdrop-blur-sm rounded-lg p-4">
                    <div className="text-white font-bold text-lg leading-tight">
                      <div>MIRAS'TA</div>
                      <div>BU HAFTA NELER OLDU?</div>
                    </div>
                  </div>
                </div>

                {/* Card Description */}
                <div className="mt-3">
                  <div className="h-1 w-12 bg-red-600 mb-2"></div>
                  <h4 className="text-gray-900 font-semibold mb-1">Miras'ta bu hafta neler oldu?</h4>
                  <p className="text-gray-600 text-sm">29.10.2025</p>
                </div>
              </div>

              {/* Card 2 */}
              <div className="flex-shrink-0 w-80">
                <div className="relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl">
                  {/* Glow Effect */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-300 to-transparent rounded-full opacity-30 blur-xl"></div>

                  {/* Logo */}
                  <div className="absolute top-4 right-4 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 bg-white rounded-full"></div>
                    </div>
                  </div>

                  {/* Date Banner */}
                  <div className="absolute top-20 left-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg">
                    <span className="text-sm font-bold uppercase">EKİM AYI</span>
                  </div>

                  {/* Main Title */}
                  <div className="absolute bottom-4 left-4 right-4 bg-blue-800 bg-opacity-90 backdrop-blur-sm rounded-lg p-4">
                    <div className="text-white font-bold text-lg leading-tight">
                      <div>ROM'da</div>
                      <div>BU AY NELER OLDU?</div>
                    </div>
                  </div>
                </div>

                {/* Card Description */}
                <div className="mt-3">
                  <div className="h-1 w-12 bg-red-600 mb-2"></div>
                  <h4 className="text-gray-900 font-semibold mb-1">ROM'da bu ay neler oldu?</h4>
                  <p className="text-gray-600 text-sm">31.10.2025</p>
                </div>
              </div>

              {/* Card 3 */}
              <div className="flex-shrink-0 w-80">
                <div className="relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl">
                  {/* Glow Effect */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-300 to-transparent rounded-full opacity-30 blur-xl"></div>

                  {/* Logo */}
                  <div className="absolute top-4 right-4 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 bg-white rounded-full"></div>
                    </div>
                  </div>

                  {/* Date Banner */}
                  <div className="absolute top-20 left-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg">
                    <span className="text-sm font-bold uppercase">EKİM AYI</span>
                  </div>

                  {/* Main Title */}
                  <div className="absolute bottom-4 left-4 right-4 bg-blue-800 bg-opacity-90 backdrop-blur-sm rounded-lg p-4">
                    <div className="text-white font-bold text-lg leading-tight">
                      <div>REHİS'de bu ay Dijital Dönüşüm Müdürlükleri ile</div>
                      <div>NELER YAPILDI?</div>
                    </div>
                  </div>
                </div>

                {/* Card Description */}
                <div className="mt-3">
                  <div className="h-1 w-12 bg-red-600 mb-2"></div>
                  <h4 className="text-gray-900 font-semibold mb-1">REHİS'de bu ay neler yapıldı?</h4>
                  <p className="text-gray-600 text-sm">31.10.2025</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-gray-100 py-8 mt-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2">
            <Cpu className="w-4 h-4 text-gray-400" />
            <p className="text-gray-500 text-sm tracking-wide">
              Robotik Otomasyon Müdürlüğü tarafından geliştirilmiştir.
            </p>
          </div>
        </div>
      </footer>

      {/* Navigation Loading Modal */}
      {showNavigationModal && navigatingPlatform && (
        <div className="fixed top-[-400px] inset-0 z-50 flex items-center justify-center backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-fade-in">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-blue-800 to-orange-500 px-8 py-6">
              <div className="flex items-center justify-center gap-4">
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                <h3 className="text-2xl font-bold text-white">Yönlendiriliyor...</h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-8 flex flex-col items-center">
              {navigatingPlatform.logo ? (
                <div className="w-32 h-32 mb-6 flex items-center justify-center">
                  <img
                    src={navigatingPlatform.logo}
                    alt={navigatingPlatform.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                  <Database className="w-16 h-16 text-blue-600" />
                </div>
              )}

              <p className="text-gray-700 text-xl text-center mb-2">
                <span className="font-bold text-2xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {navigatingPlatform.name}
                </span>
              </p>
              <p className="text-gray-600 text-center">
                platformuna yönlendiriliyorsunuz
              </p>

              {/* Progress bar */}
              <div className="w-full mt-6 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-progress"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Under Construction Modal */}
      {showUnderConstructionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-orange-500 px-6 py-4">
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
    </div>
  );
}
