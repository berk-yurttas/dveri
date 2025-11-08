"use client"

import { useState, useEffect, useLayoutEffect } from "react";
import { useRouter, useParams } from "next/navigation";
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
  User
} from "lucide-react";
import { dashboardService } from "@/services/dashboard";
import { reportsService } from "@/services/reports";
import { announcementService } from "@/services/announcement";
import { DashboardList } from "@/types/dashboard";
import { SavedReport } from "@/types/reports";
import { Announcement } from "@/types/announcement";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { api } from "@/lib/api";
import { MirasAssistant } from "@/components/chatbot/miras-assistant";

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

export default function PlatformHome() {
  const router = useRouter();
  const params = useParams();
  const platformCode = params.platform as string;
  const { user } = useUser();
  const { platform: platformData, setPlatformByCode } = usePlatform();
  console.log("user", user);
  const hasDerinizAdmin = user?.role && Array.isArray(user.role) &&
    user.role.includes('deriniz:admin');
  const [dashboards, setDashboards] = useState<DashboardList[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showIotApps, setShowIotApps] = useState(false);
  const isIvmePlatform = platformData?.code === 'ivme';
  const isRomiotPlatform = platformCode === 'romiot';

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

  // Carousel navigation for announcements
  const handleNextAnnouncement = () => {
    setCurrentAnnouncementIndex((prev) => 
      prev + 3 >= announcements.length ? 0 : prev + 3
    );
  };

  const handlePrevAnnouncement = () => {
    setCurrentAnnouncementIndex((prev) => 
      prev - 3 < 0 ? Math.max(0, announcements.length - 3) : prev - 3
    );
  };

  // Use useLayoutEffect to set platform BEFORE any effects run (including API calls)
  useLayoutEffect(() => {
    if (platformCode) {
      console.log('[Platform Page] Setting platform in context:', platformCode);
      
      // Set platform in context (this also sets localStorage and fetches platform data)
      setPlatformByCode(platformCode);
      
      // Clear cache to force fresh data fetch with new platform
      console.log('[Platform Page] Clearing API cache for platform switch');
      api.clearCache();
    }
  }, [platformCode, setPlatformByCode]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('[Platform Page] Fetching data for platform:', platformCode);
        console.log('[Platform Page] localStorage platform_code:', localStorage.getItem('platform_code'));

        const [dashboardData, reportData] = await Promise.all([
          dashboardService.getDashboards(),
          reportsService.getReports(0, 3)
        ]);
        setDashboards(dashboardData);
        setReports(reportData);
        
        // Fetch announcements if platform data is available
        if (platformData?.id) {
          const announcementData = await announcementService.getAnnouncements(0, 10, platformData.id, true);
          setAnnouncements(announcementData);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setError("Veriler yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [platformCode, platformData]);

  const handleCreateDashboard = () => {
    router.push(`/${platformCode}/dashboard/add`);
  };

  const handleCreateReport = () => {
    router.push(`/${platformCode}/reports/add`);
  };

  const handleDashboardClick = (id: number) => {
    router.push(`/${platformCode}/dashboard/${id}`);
  };

  const handleReportClick = (id: number) => {
    router.push(`/${platformCode}/reports/${id}`);
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
      {platformCode === 'ivme' && (
        <div className="fixed -z-10 inset-0 top-[-400px] opacity-20 pointer-events-none" style={{ backgroundImage: 'url(/wave_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
      )}
      {/* Only show DerinIZ branding elements when platform is deriniz */}
      {platformCode === 'deriniz' && (
        <>
          <div
            className="fixed pointer-events-auto z-10 cursor-pointer"
            style={{
              width: '450px',
              height: '500px',
              backgroundImage: 'url(/deriniz-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.2,
              top: '100px',
              left: '-200px',
            }}
            onMouseMove={handleDerinizMove}
            onMouseLeave={handleDerinizLeave}
          ></div>

          {/* Tooltip */}
          {showTooltip && (
            <div
              className="fixed z-50 pointer-events-none animate-fade-in"
              style={{
                bottom: '100px',
                left: '0px',
              }}
            >
              <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white rounded-xl py-4 px-6 shadow-2xl border border-blue-400/20 backdrop-blur-sm max-w-md">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-full"></div>
                  </div>
                  <div className="font-bold text-lg tracking-wide">{platformCode.toUpperCase()}</div>
                </div>

                <div className="text-blue-100 text-sm leading-relaxed mb-3">
                  <p className="mb-2">
                    Fener Balığı ışığı %90 verimlilik ile üreten nadir bi canlıdır. 1,500 metreyi bulan derinliklerde yaşar ve ışığı yansıtmayan özel kamuflajıyla "görünmez" hale gelir.
                  </p>
                  <p>
                    DerinİZ platformunda, görünmeyen test verilerini, kullanıcıya görünür kılmayı hedefliyoruz. Doğru veriyi ortaya çıkartarak ara yüz ekosistemimizi sürekli geliştiriyoruz.
                  </p>
                </div>
                {/* Glowing border effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/30 to-purple-600/30 rounded-xl blur-sm -z-10"></div>
              </div>
            </div>
          )}

          <div
            className="fixed pointer-events-none z-10"
            style={{
              width: '500px',
              height: '500px',
              backgroundImage: 'url(/deriniz-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.2,
              bottom: '100px',
              right: '-250px',
            }}
          >
            {/* Right top hover area */}
            <div
              className="absolute top-0 right-0 w-20 h-20 pointer-events-auto cursor-pointer"
              onMouseEnter={handleDerinizHover}
              onMouseLeave={handleDerinizLeave}
            ></div>
          </div>
        </>
      )}
      {/* Main Content */}
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${platformCode === 'deriniz' ? 'scale-90' : ''}`}>
        {/* Platform Logo - Show if exists */}
        {platformData?.theme_config?.leftLogo && (
          <div className="mb-6" style={{position: 'absolute', top: '100px', left: '50px'}}>
            <img
              src={platformData.theme_config.leftLogo}
              alt={`${platformData.display_name} Logo`}
              className="h-30 object-contain"
            />
          </div>
        )}

        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2" style={{"color": "rgb(69,81,89)"}}>
            Hoş Geldiniz{user?.name ? `, ${user.name}` : ''}
          </h1>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Romiot Platform Special Features */}
        {isRomiotPlatform && !showIotApps && (
          <div className="mb-16">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {/* Katalog Card */}
              <div
                onClick={() => window.open('https://www.aselsan.com.tr/tr/urun-ve-cozumlerimiz/katalog', '_blank', 'noopener,noreferrer')}
                className="bg-white rounded-lg shadow-xl shadow-slate-200 p-8 hover:shadow-2xl transition-all cursor-pointer hover:scale-105"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-lg flex items-center justify-center mb-4 bg-blue-500">
                    <FileText className="h-8 w-8 text-white" />
                  </div>
                  <h4 className="font-semibold text-gray-900 text-xl mb-2">Katalog</h4>
                  <p className="text-sm text-gray-600">ROM ürün kataloğuna göz atın</p>
                </div>
              </div>

              {/* IOT Uygulamaları Card */}
              <div
                onClick={() => setShowIotApps(true)}
                className="bg-white rounded-lg shadow-xl shadow-slate-200 p-8 hover:shadow-2xl transition-all cursor-pointer hover:scale-105"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-lg flex items-center justify-center mb-4 bg-green-500">
                    <Wifi className="h-8 w-8 text-white" />
                  </div>
                  <h4 className="font-semibold text-gray-900 text-xl mb-2">IOT Uygulamaları</h4>
                  <p className="text-sm text-gray-600">IOT çözümlerini keşfedin</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Romiot IOT Applications - 4 Category Cards */}
        {isRomiotPlatform && showIotApps && (
          <div className="mb-16">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-gray-900">IOT Uygulamaları</h3>
              <button
                onClick={() => setShowIotApps(false)}
                className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors flex items-center gap-2"
              >
                ← Geri Dön
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Card 1 - M2X */}
              <div
                onClick={() => window.open('https://www.aselsan.com.tr/tr/urun-ve-cozumlerimiz/katalog?category=akilli-sehir', '_blank', 'noopener,noreferrer')}
                className="bg-white rounded-lg shadow-xl shadow-slate-200 overflow-hidden hover:shadow-2xl transition-all cursor-pointer hover:scale-105"
              >
                <div className="flex flex-col">
                  <div className="w-full h-40 bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
                    <img 
                      src="https://via.placeholder.com/300x200/8b5cf6/ffffff?text=M2X+Software" 
                      alt="M2X Software"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6 text-center">
                    <h4 className="font-semibold text-gray-900 mb-2">M2X YAZILIM VE DONANIMLARI</h4>
                    <p className="text-sm text-gray-600">Kategoriye git</p>
                  </div>
                </div>
              </div>

              {/* Card 2 - Modelleme */}
              <div
                onClick={() => window.open('https://www.aselsan.com.tr/tr/urun-ve-cozumlerimiz/katalog?category=enerji', '_blank', 'noopener,noreferrer')}
                className="bg-white rounded-lg shadow-xl shadow-slate-200 overflow-hidden hover:shadow-2xl transition-all cursor-pointer hover:scale-105"
              >
                <div className="flex flex-col">
                  <div className="w-full h-40 bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center">
                    <img 
                      src="https://via.placeholder.com/300x200/eab308/ffffff?text=Simulation" 
                      alt="Simulation Solutions"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6 text-center">
                    <h4 className="font-semibold text-gray-900 mb-2">MODELLEME VE SİMÜLASYON ÇÖZÜMLERİ</h4>
                    <p className="text-sm text-gray-600">Kategoriye git</p>
                  </div>
                </div>
              </div>

              {/* Card 3 - Otomasyon */}
              <div
                onClick={() => window.open('https://www.aselsan.com.tr/tr/urun-ve-cozumlerimiz/katalog?category=ulasim', '_blank', 'noopener,noreferrer')}
                className="bg-white rounded-lg shadow-xl shadow-slate-200 overflow-hidden hover:shadow-2xl transition-all cursor-pointer hover:scale-105"
              >
                <div className="flex flex-col">
                  <div className="w-full h-40 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                    <img 
                      src="https://via.placeholder.com/300x200/3b82f6/ffffff?text=Automation" 
                      alt="Automation Systems"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6 text-center">
                    <h4 className="font-semibold text-gray-900 mb-2">OTOMASYON SİSTEMLERİ</h4>
                    <p className="text-sm text-gray-600">Kategoriye git</p>
                  </div>
                </div>
              </div>

              {/* Card 4 - Yazılım */}
              <div
                onClick={() => window.open('https://www.aselsan.com.tr/tr/urun-ve-cozumlerimiz/katalog?category=sanayi', '_blank', 'noopener,noreferrer')}
                className="bg-white rounded-lg shadow-xl shadow-slate-200 overflow-hidden hover:shadow-2xl transition-all cursor-pointer hover:scale-105"
              >
                <div className="flex flex-col">
                  <div className="w-full h-40 bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                    <img 
                      src="https://via.placeholder.com/300x200/ef4444/ffffff?text=Web+Services" 
                      alt="Software and Web Services"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6 text-center">
                    <h4 className="font-semibold text-gray-900 mb-2">YAZILIM VE WEB SERVİSLERİ</h4>
                    <p className="text-sm text-gray-600">Kategoriye git</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Features Section */}
        {platformData?.theme_config?.features && platformData.theme_config.features.length > 0 && !isRomiotPlatform && (
          <div className="mb-16">
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${
              platformData.theme_config.features.length === 4 
                ? 'lg:grid-cols-4' 
                : platformData.theme_config.features.length === 5 
                ? 'lg:grid-cols-5' 
                : 'lg:grid-cols-4'
            }`}>
              {platformData.theme_config.features.map((feature, index) => {
                const cardContent = feature.useImage && feature.imageUrl ? (
                  // Image-based card design
                  <div className="bg-white rounded-lg shadow-xl shadow-slate-200 overflow-hidden hover:shadow-2xl transition-all duration-300">
                    {feature.title && feature.title.trim() ? (
                      // Two column layout when title exists
                      <div className="flex">
                        {/* Left column - Image */}
                        <div className="w-40 h-40 flex-shrink-0">
                          <img
                            src={feature.imageUrl}
                            alt={feature.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to icon card if image fails to load
                              const target = e.target as HTMLImageElement;
                              const card = target.closest('.bg-white');
                              if (card) {
                                card.innerHTML = `
                                  <div class="p-6">
                                    <div class="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style="background-color: ${feature.backgroundColor}">
                                      <svg class="w-6 h-6" style="color: ${feature.iconColor}" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                      </svg>
                                    </div>
                                    <h4 class="font-semibold text-gray-900 mb-2">${feature.title}</h4>
                                    <p class="text-sm text-gray-600">${feature.description}</p>
                                  </div>
                                `;
                              }
                            }}
                          />
                        </div>
                        {/* Right column - Content */}
                        <div className="flex-1 p-4 flex flex-col justify-center">
                          <h4 className="font-semibold text-gray-900 mb-2">{feature.title}</h4>
                          <p className="text-sm text-gray-600">{feature.description}</p>
                        </div>
                      </div>
                    ) : (
                      // Image only when no title
                      <div className="w-full h-40 mt-5 mb-5">
                        <img
                          src={feature.imageUrl}
                          alt="Feature"
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            // Fallback to icon card if image fails to load
                            const target = e.target as HTMLImageElement;
                            const card = target.closest('.bg-white');
                            if (card) {
                              card.innerHTML = `
                                <div class="p-6">
                                  <div class="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style="background-color: ${feature.backgroundColor}">
                                    <svg class="w-6 h-6" style="color: ${feature.iconColor}" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                    </svg>
                                  </div>
                                  <h4 class="font-semibold text-gray-900 mb-2">${feature.title || 'Feature'}</h4>
                                  <p class="text-sm text-gray-600">${feature.description}</p>
                                </div>
                              `;
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  // Icon-based card design (original)
                  <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                      style={{ backgroundColor: feature.backgroundColor }}
                    >
                      {(() => {
                        const IconComponent = iconMap[feature.icon] || Activity;
                        return (
                          <IconComponent 
                            className="h-6 w-6" 
                            style={{ color: feature.iconColor }}
                          />
                        );
                      })()}
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2">{feature.title}</h4>
                    <p className="text-sm text-gray-600">{feature.description}</p>
                  </div>
                );

                // If feature has a URL, make it clickable
                if (feature.url) {
                  return (
                    <div
                      key={index}
                      onClick={() => {
                        if (feature.url && feature.url.startsWith('http')) {
                          window.open(feature.url, '_blank', 'noopener,noreferrer');
                        } else {
                          router.push(feature.url || '');
                        }
                      }}
                      className="block hover:scale-105 transition-transform cursor-pointer"
                    >
                      {cardContent}
                    </div>
                  );
                }

                return (
                  <div key={index}>
                    {cardContent}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Full-width Duyurular Section */}
      {announcements.length > 0 && (
        <div className="w-full py-12 mb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2" style={{"color": "rgb(69,81,89)"}}>Duyurular</h3>
              <div className="w-[100px] h-[5px] bg-red-600"></div>
            </div>
            
            {/* Carousel Container */}
            <div className="relative flex justify-center">
              {/* Navigation Arrows - Only show if more than 3 items */}
              {announcements.length > 3 && (
                <>
                  <button 
                    onClick={handlePrevAnnouncement}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button 
                    onClick={handleNextAnnouncement}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}

              {/* Carousel Cards */}
              <div className="flex gap-6 justify-center items-center max-w-4xl mx-auto">
                {announcements.slice(currentAnnouncementIndex, currentAnnouncementIndex + 3).map((announcement) => (
                  <div key={announcement.id} className="flex-shrink-0 w-80">
                    <div className="relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl">
                      {/* Glow Effect */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-300 to-transparent rounded-full opacity-30 blur-xl"></div>
                      
                      {/* Image Background */}
                      {announcement.content_image && (
                        <div 
                          className="absolute inset-0 bg-cover bg-center opacity-30"
                          style={{ backgroundImage: `url(${announcement.content_image})` }}
                        />
                      )}
                      
                      {/* Logo */}
                      <div className="absolute top-4 right-4 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                        <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                          <div className="w-4 h-4 bg-white rounded-full"></div>
                        </div>
                      </div>

                      {/* Date/Month Banner */}
                      {announcement.month_title && (
                        <div className="absolute top-20 left-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg">
                          <span className="text-sm font-bold uppercase">{announcement.month_title}</span>
                        </div>
                      )}

                      {/* Main Title */}
                      <div className={`absolute ${announcement.month_title ? 'bottom-4' : 'top-1/2 -translate-y-1/2'} left-4 right-4 bg-blue-800 bg-opacity-90 backdrop-blur-sm rounded-lg p-4`}>
                        <div className="text-white font-bold text-lg leading-tight">
                          {announcement.title.split('\n').map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Card Description */}
                    <div className="mt-3">
                      <div className="h-1 w-12 bg-red-600 mb-2"></div>
                      <h4 className="text-gray-900 font-semibold mb-1">{announcement.content_summary || announcement.title}</h4>
                      <p className="text-gray-600 text-sm">
                        {new Date(announcement.creation_date).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Continue Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 scale-90">
        {/* Dashboards Section */}
        {!isIvmePlatform && (
        <div className="mb-6 flex items-center justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <h3 className="text-xl font-semibold text-gray-900 mb-2 sm:mb-0">Ekranlarım</h3>
            <button
              onClick={() => router.push(`/${platformCode}/dashboard`)}
              className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
            >
              <Eye className="h-4 w-4" />
              Tüm Ekranlar
            </button>
          </div>
          <button
            onClick={handleCreateDashboard}
            className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors shadow-lg"
          >
            <Plus className="h-4 w-4" />
            Yeni Ekran
          </button>
        </div>
        )}
        {/* Dashboard Grid */}
        {dashboards.length > 0 && !isIvmePlatform ? (
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
          !isIvmePlatform && (
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
          )
        )}
        
        {!isIvmePlatform && (
        // Reports Section
        <div className="mt-16">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2 sm:mb-0">Raporlarım</h3>
              {reports.length > 3 && (
                <button
                  onClick={() => router.push(`/${platformCode}/reports`)}
                  className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
                >
                  <Eye className="h-4 w-4" />
                  {reports.length - 3} Rapor Daha
                </button>
              )}
            </div>
            {hasDerinizAdmin && (
              <button
                onClick={handleCreateReport}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors shadow-lg"
              >
                <Plus className="h-4 w-4" />
                Yeni Rapor
              </button>
            )}
          </div>

          {/* Reports Grid */}
          {reports.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.slice(0, 3).map((report) => (
                <div
                  key={report.id}
                  onClick={() => handleReportClick(report.id)}
                  className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-xl transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-lg bg-indigo-500 text-white">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
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
                  
                  <h3 className="text-base font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {report.name}
                  </h3>
                  
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      <span>{report.queries?.length || 0} Sorgu</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(report.created_at).toLocaleDateString('tr-TR')}</span>
                    </div>
                    {report.owner_name && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span className="max-w-[300px]">{report.owner_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz rapor bulunmuyor</h3>
              <p className="text-gray-500 mb-6">İlk raporunuzu oluşturmak için aşağıdaki butona tıklayın.</p>
              {hasDerinizAdmin && (
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
        </div>
        )}
      </div>

      {/* MIRAS Assistant Chatbot */}
      <MirasAssistant />
    </div>
  );
}

