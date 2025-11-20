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
  ArrowRight,
  X
} from "lucide-react";
import { dashboardService } from "@/services/dashboard";
import { platformService } from "@/services/platform";
import { announcementService } from "@/services/announcement";
import { DashboardList } from "@/types/dashboard";
import { Platform as PlatformType } from "@/types/platform";
import { Announcement } from "@/types/announcement";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { api } from "@/lib/api";
import { MirasAssistant } from "@/components/chatbot/miras-assistant";
import { Feedback } from "@/components/feedback/feedback";
import DOMPurify from 'dompurify';

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoveredPlatform, setHoveredPlatform] = useState<string | null>(null);
  const [hoveredAnnouncement, setHoveredAnnouncement] = useState<number | null>(null);
  const [showUnderConstructionModal, setShowUnderConstructionModal] = useState(false);
  const [underConstructionPlatform, setUnderConstructionPlatform] = useState<string>("");
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [navigatingPlatform, setNavigatingPlatform] = useState<{ name: string; logo: string; code: string } | null>(null);
  const [showAllAnnouncementsModal, setShowAllAnnouncementsModal] = useState(false);

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
    setCurrentAnnouncementIndex((prev) => {
      const nextIndex = prev + 3;
      // Don't go beyond the last set of announcements
      return nextIndex < announcements.length ? nextIndex : prev;
    });
  };

  const handlePrevAnnouncement = () => {
    setCurrentAnnouncementIndex((prev) => {
      const prevIndex = prev - 3;
      // Don't go below 0
      return prevIndex >= 0 ? prevIndex : prev;
    });
  };

  // Check if navigation buttons should be disabled
  const announcementsPerPage = 3;
  const isFirstPage = currentAnnouncementIndex === 0;
  const isLastPage =
    currentAnnouncementIndex + announcementsPerPage >= announcements.length;

  // Handle announcement card click
  const handleAnnouncementClick = (announcement: Announcement) => {
    console.log("🔔 Clicked announcement:", {
      id: announcement.id,
      title: announcement.title,
      hasImage: !!announcement.content_image,
      imageLength: announcement.content_image?.length,
      hasDetail: !!announcement.content_detail,
      detailContent: announcement.content_detail,
      hasSummary: !!announcement.content_summary,
      summaryContent: announcement.content_summary
    });
    setSelectedAnnouncement(announcement);
    setShowAnnouncementModal(true);
  };

  const handleViewAllAnnouncements = () => {
    setShowAllAnnouncementsModal(true);
  };

  const closeAllAnnouncementsModal = () => {
    setShowAllAnnouncementsModal(false);
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
        const [platformData, dashboardData, announcementData] = await Promise.all([
          platformService.getPlatforms(0, 100, false), // Get active platforms only
          dashboardService.getDashboards(),
          announcementService.getAnnouncements(0, 10, null, true), // Get general announcements (platform_id = null)
        ]);
        setPlatforms(platformData);
        setDashboards(dashboardData);
        
        // Debug: Log announcement data
        console.log("📢 Fetched announcements:", announcementData);
        announcementData.forEach((ann, idx) => {
          console.log(`Announcement ${idx + 1}:`, {
            id: ann.id,
            title: ann.title,
            hasImage: !!ann.content_image,
            imagePrefix: ann.content_image?.substring(0, 30),
            hasDetail: !!ann.content_detail,
            detailLength: ann.content_detail?.length
          });
        });
        
        setAnnouncements(announcementData);
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
        <div className="mb-8 flex flex-col items-center justify-center w-full">
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

          {announcements.length > 0 ? (
            <>
              {/* Carousel Container */}
              <div className="relative flex justify-center">
                {/* Navigation Arrows - Only show if more than 3 items */}
                {announcements.length > 3 && (
                  <>
                    <button 
                      onClick={handlePrevAnnouncement}
                      disabled={isFirstPage}
                      className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors ${
                        isFirstPage 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button 
                      onClick={handleNextAnnouncement}
                      disabled={isLastPage}
                      className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors ${
                        isLastPage 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}

              {/* Carousel Cards */}
              <div className="flex gap-6 justify-center items-start max-w-4xl mx-auto">
                {announcements.slice(currentAnnouncementIndex, currentAnnouncementIndex + 3).map((announcement) => {
                  const isAnnouncementHovered = hoveredAnnouncement === announcement.id;
                  return (
                  <div 
                    key={announcement.id} 
                    className="flex-shrink-0 w-80 cursor-pointer transition-transform hover:scale-105"
                    onClick={() => handleAnnouncementClick(announcement)}
                    onMouseEnter={() => setHoveredAnnouncement(announcement.id)}
                    onMouseLeave={() => setHoveredAnnouncement(null)}
                  >
                    <div className={`relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl transition-all ${
                      isAnnouncementHovered ? 'ring-2 ring-[#FF5620]' : ''
                    }`}>
                      {/* Image Area - Full background with gradient overlay */}
                      {announcement.content_image && (
                        <div className="absolute top-0 left-0 right-0 bottom-0">
                          <img 
                            src={announcement.content_image} 
                            alt={announcement.title}
                            className="w-full h-full object-fill"
                          />
                          {/* Gradient overlay for text readability */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                        </div>
                      )}

                      {/* Glow Effect */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-300 to-transparent rounded-full opacity-20 blur-xl"></div>

                      {/* Main Title - Lower position for better image visibility */}
                      <div className="absolute bottom-16 left-4 right-4 z-10">
                        <div className="text-white font-bold text-xl leading-tight text-left">
                          {announcement.title.split('\n').map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </div>
                      </div>

                      {/* Month Badge - Bottom Left, Small */}
                      {announcement.month_title && (
                        <div className="absolute bottom-3 left-3 bg-red-600 text-white px-3 py-1 rounded-md shadow-lg z-10">
                          <span className="text-xs font-semibold uppercase">{announcement.month_title}</span>
                        </div>
                      )}

                      {/* Click Indicator */}
                      <div className="absolute bottom-3 right-3 bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs z-10">
                        Detaylar →
                      </div>
                    </div>

                    {/* Card Description */}
                    <div className="mt-3">
                      <div className="h-1 w-12 bg-red-600 mb-2"></div>
                      <h4 className="text-gray-900 font-semibold mb-1 line-clamp-2">{announcement.content_summary || announcement.title}</h4>
                      <p className="text-gray-600 text-sm">
                        {new Date(announcement.creation_date).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Tümünü Gör Button */}
            {announcements.length > 3 && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={handleViewAllAnnouncements}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-lg hover:shadow-xl"
                >
                  <Eye className="h-5 w-5" />
                  Tüm Duyuruları Gör ({announcements.length})
                </button>
              </div>
            )}
            </>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <MessageSquare className="h-8 w-8 text-gray-400" />
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">
                Şu anda aktif duyuru bulunmamaktadır
              </h4>
              <p className="text-gray-500 text-sm">
                Yeni duyurular eklendiğinde burada görünecektir
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-gray-100 py-8 mb-[-20px] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2">
            <Cpu className="w-4 h-4 text-gray-400" />
            <p className="text-gray-500 text-sm tracking-wide">
              Robotik Otomasyon Müdürlüğü tarafından geliştirilmiştir.
            </p>
          </div>
        </div>
      </footer>

      {/* Announcement Detail Modal */}
      {showAnnouncementModal && selectedAnnouncement && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowAnnouncementModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto animate-fade-in [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-gray-400"
            onClick={(e) => e.stopPropagation()}
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent' }}
          >
            {/* Modal Header */}
            <div className="relative">
              {selectedAnnouncement.content_image && (
                <div className="w-full h-[500px] bg-gradient-to-br from-blue-900 to-blue-800 relative overflow-hidden">
                  <img 
                    src={selectedAnnouncement.content_image} 
                    alt={selectedAnnouncement.title}
                    className="w-full h-full object-fill"
                  />
                  {selectedAnnouncement.month_title && (
                    <div className="absolute bottom-4 left-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-10">
                      <span className="text-sm font-bold uppercase">{selectedAnnouncement.month_title}</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Close Button */}
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors z-10"
              >
                <X className="h-5 w-5 text-gray-700" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Title */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {selectedAnnouncement.title}
              </h2>

              {/* Date */}
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Calendar className="h-4 w-4" />
                <span>{new Date(selectedAnnouncement.creation_date).toLocaleDateString('tr-TR', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</span>
              </div>

              {/* Summary */}
              {selectedAnnouncement.content_summary && (
                <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-600 rounded-r-lg">
                  <p className="text-gray-700 font-medium">{selectedAnnouncement.content_summary}</p>
                </div>
              )}

              {/* Divider */}
              {selectedAnnouncement.content_detail && (
                <div className="border-t border-gray-200 my-4"></div>
              )}

              {/* Detail Content - Main content of the announcement */}
              {selectedAnnouncement.content_detail && (
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Detaylı İçerik</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div 
                      className="text-gray-700 leading-relaxed [&>p]:mb-4 [&>p:last-child]:mb-0 [&>p:empty]:min-h-[1em]"
                      dangerouslySetInnerHTML={{ 
                        __html: DOMPurify.sanitize(selectedAnnouncement.content_detail) 
                      }}
                    />
                  </div>
                </div>
              )}

              {/* No Detail Message */}
              {!selectedAnnouncement.content_detail && !selectedAnnouncement.content_summary && (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>Bu duyuru için detaylı açıklama bulunmamaktadır.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* All Announcements Modal */}
      {showAllAnnouncementsModal && announcements.length > 0 && (
        <div 
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowAllAnnouncementsModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] animate-fade-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-6 w-6 text-white" />
                <h3 className="text-xl font-bold text-white">Tüm Duyurular</h3>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm text-white font-medium">
                  {announcements.length}
                </span>
              </div>
              <button
                onClick={closeAllAnnouncementsModal}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Modal Body - Grid */}
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[65vh] overflow-y-auto px-2 md:px-4 lg:px-6 py-4">
                {announcements.map((announcement) => {
                  const isAnnouncementHovered = hoveredAnnouncement === announcement.id;
                  return (
                    <div 
                      key={announcement.id} 
                      className="cursor-pointer transition-transform hover:scale-105"
                      onClick={() => handleAnnouncementClick(announcement)}
                      onMouseEnter={() => setHoveredAnnouncement(announcement.id)}
                      onMouseLeave={() => setHoveredAnnouncement(null)}
                    >
                      <div className={`relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl transition-all ${
                        isAnnouncementHovered ? 'ring-2 ring-[#FF5620]' : ''
                      }`}>
                        {announcement.content_image && (
                          <div className="absolute top-0 left-0 right-0 bottom-0">
                            <img 
                              src={announcement.content_image} 
                              alt={announcement.title}
                              className="w-full h-full object-fill"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                          </div>
                        )}

                        <div className="absolute bottom-16 left-4 right-4 z-10">
                          <div className="text-white font-bold text-xl leading-tight text-left">
                            {announcement.title.split('\n').map((line, i) => (
                              <div key={i}>{line}</div>
                            ))}
                          </div>
                        </div>

                        {announcement.month_title && (
                          <div className="absolute bottom-3 left-3 bg-red-600 text-white px-3 py-1 rounded-md shadow-lg z-10">
                            <span className="text-xs font-semibold uppercase">{announcement.month_title}</span>
                          </div>
                        )}

                        <div className="absolute bottom-3 right-3 bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs z-10">
                          Detaylar →
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="h-1 w-12 bg-red-600 mb-2"></div>
                        <h4 className="text-gray-900 font-semibold mb-1 line-clamp-2">{announcement.content_summary || announcement.title}</h4>
                        <p className="text-gray-600 text-sm">
                          {new Date(announcement.creation_date).toLocaleDateString('tr-TR')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-2xl flex justify-end">
              <button
                onClick={closeAllAnnouncementsModal}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      <MirasAssistant />
      
      {/* Feedback Button */}
      <Feedback />
    </div>
  );
}
