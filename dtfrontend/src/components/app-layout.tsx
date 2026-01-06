"use client"

import { AppShell } from "./appShell";
import { Home, Users, Settings, BarChart3, Plus, Receipt, Layout, Star, Database, Server, Cloud, Workflow } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useCallback, useEffect, useState, Suspense } from "react";
import { useDashboards } from "@/contexts/dashboard-context";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { platformService } from "@/services/platform";
import { Platform as PlatformType } from "@/types/platform";
import { api } from "@/lib/api";

interface AppLayoutProps {
  children: ReactNode;
}

function AppLayoutContent({ children }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading, logout, isAuthenticated } = useUser();
  const { platform, setPlatformByCode, clearPlatform, loading: platformLoading, initialized: platformInitialized } = usePlatform();

  // Extract subplatform from URL (either from path or query parameter)
  const getSubplatformFromPath = () => {
    // First check query parameter
    const querySubplatform = searchParams.get('subplatform');
    if (querySubplatform) {
      return querySubplatform;
    }

    // Then check path
    const match = pathname.match(/\/[^\/]+\/([^\/]+)/);
    if (match && match[1] !== 'dashboard' && match[1] !== 'reports') {
      return match[1];
    }
    return null;
  };

  // Easter egg state
  const [keySequence, setKeySequence] = useState("");
  const [easterEggActive, setEasterEggActive] = useState(false);
  
  // Platform data for root page
  const [platforms, setPlatforms] = useState<PlatformType[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  
  // Under construction modal state
  const [showUnderConstructionModal, setShowUnderConstructionModal] = useState(false);
  const [underConstructionPlatform, setUnderConstructionPlatform] = useState<string>("");

  // Dynamic title based on platform and easter egg
  const getTitle = () => {
    if (easterEggActive) return "Biz de DERİNİZ ;)";
    if (platform) return `${platform.display_name}`;
    return "ODAK";
  };
  const title = getTitle();

  // Get header color from platform theme or use default
  const headerColor = platform?.theme_config?.headerColor || "#1e3a8a";

  // Easter egg keypress listener
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Only track alphabetic keys
      if (event.key.match(/^[a-zA-Z]$/)) {
        const newSequence = (keySequence + event.key.toUpperCase()).slice(-6); // Keep last 6 characters
        setKeySequence(newSequence);

        // Check for easter egg sequence
        if (newSequence === "ROMROM") {
          setEasterEggActive(true);
          // Reset after 5 seconds
          setTimeout(() => {
            setEasterEggActive(false);
            setKeySequence("");
          }, 5000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [keySequence]);

  // Fetch platforms when on root page
  useEffect(() => {
    if (pathname === '/') {
      const fetchPlatforms = async () => {
        setPlatformsLoading(true);
        try {
          const platformData = await platformService.getPlatforms(0, 100, false);
          setPlatforms(platformData);
        } catch (error) {
          console.error("Failed to fetch platforms:", error);
        } finally {
          setPlatformsLoading(false);
        }
      };
      fetchPlatforms();
    }
  }, [pathname]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Optionally redirect to login page or show login modal
      console.log('User not authenticated');
    }
  }, [loading, isAuthenticated]);

  // Default icon mapping by platform code
  const defaultPlatformIcons: Record<string, any> = {
    deriniz: Database,
    app2: Server,
    app3: Cloud,
    app4: Workflow,
  };

  // Create navigation items dynamically based on current platform
  const navigationItems = useMemo(() => {
    const platformCode = platform?.code;
    const platformPrefix = platformCode ? `/${platformCode}` : '';
    const subplatform = getSubplatformFromPath();
    const subplatformQuery = subplatform ? `?subplatform=${subplatform}` : '';

    // If we're on the root page, show platforms as menu items
    if (pathname === '/') {
      const platformItems = platforms.map((platform) => {
        const Icon = defaultPlatformIcons[platform.code] || Database;
        return {
          title: platform.display_name,
          icon: Icon,
          href: `/${platform.code}`,
          children: [
            {
              title: "Ekranlarım",
              icon: Layout,
              href: `/${platform.code}/dashboard`,
            },
            {
              title: "Raporlarım",
              icon: BarChart3,
              href: `/${platform.code}/reports`,
            }
          ]
        };
      });

      return [
        ...platformItems
      ];
    }

    // For platform-specific pages, show the standard navigation
    // Hide "Ekranlarım" and "Raporlar" on atolye page
    const isAtolyePage = pathname.includes('/atolye');
    const isRomiotPage = pathname.includes('/romiot');
    
    const baseItems = [
      {
        title: "Anasayfa",
        icon: Home,
        href: platformCode ? `/${platformCode}` : "/",
      }
    ];

    if (!isAtolyePage) {
      if (!isRomiotPage) {
        baseItems.push(
          {
            title: "Ekranlarım",
            icon: Layout,
            href: platformCode ? `${platformPrefix}/dashboard${subplatformQuery}` : "/dashboard",
          })
      }

      baseItems.push( 
        {
          title: "Raporlar",
          icon: BarChart3,
          href: platformCode ? `${platformPrefix}/reports${subplatformQuery}` : "/reports",
        })
    }

    return baseItems;
  }, [platform?.code, pathname, platforms]); // Update when platform, pathname, or platforms change

  const handleNavigationClick = useCallback(async (item: any) => {
    console.log("Navigation clicked:", item);
    if (item.href) {
      // Extract platform code from href if navigating to a platform page
      const platformMatch = item.href.match(/^\/([^\/]+)/);
      if (platformMatch && platformMatch[1] !== '') {
        const potentialPlatformCode = platformMatch[1];
        
        // Check if this is a platform-specific route (not root, dashboard, reports, etc.)
        const isRootOrStandardRoute = potentialPlatformCode === '' || 
                                      potentialPlatformCode === 'dashboard' || 
                                      potentialPlatformCode === 'reports' ||
                                      potentialPlatformCode === 'admin';
        
        if (!isRootOrStandardRoute) {
          // This is a platform-specific route, check if platform is under construction
          const platformCode = potentialPlatformCode;
          const targetPlatform = platforms.find(p => p.code === platformCode);
          const isUnderConstruction = targetPlatform?.theme_config?.underConstruction || false;
          
          if (isUnderConstruction) {
            // Show under construction modal instead of navigating
            setUnderConstructionPlatform(targetPlatform?.display_name || platformCode);
            setShowUnderConstructionModal(true);
            return; // Don't navigate - exit early
          }
          
          console.log('[Navigation] Setting platform code:', platformCode);
          api.clearCache();
          // Update platform context immediately to set headerColor
          await setPlatformByCode(platformCode);
          router.push(item.href);
        } else if (item.href === '/') {
          // Navigating to root, clear platform
          console.log('[Navigation] Clearing platform code');
          api.clearCache();
          clearPlatform();
          router.push(item.href);
        } else {
          // Standard route, just navigate
          router.push(item.href);
        }
      } else {
        // No platform match, just navigate
        router.push(item.href);
      }
    }
  }, [router, setPlatformByCode, clearPlatform, platforms]);

  const handlePreferencesClick = () => {
    console.log("Preferences clicked");
  };

  const handleLogoutClick = async () => {
    console.log("Logout clicked");
    await logout();
  };

  const handleNotificationClick = () => {
    console.log("Notification clicked");
  };

  // Transform user data for AppShell format (memoized to prevent hydration issues)
  const userInfo = useMemo(() => {
    if (loading) {
      return {
        id: "",
        name: "Loading...",
        email: "",
        avatarUrl: "/placeholder.svg?height=40&width=40",
      };
    }
    
    return user ? {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url || "/placeholder.svg?height=40&width=40",
    } : {
      id: "",
      name: "Guest",
      email: "",
      avatarUrl: "/placeholder.svg?height=40&width=40",
    };
  }, [user, loading]);

  // Show loading state while platform is being fetched (only for platform-specific pages)
  const isPlatformPage = pathname !== '/' && pathname.split('/').filter(Boolean).length > 0;
  
  // Wait for platform to be initialized before showing the layout
  if (isPlatformPage && !platformInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Platform yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell
        title={title}
        subtitle="Ortak Data ile Akıllı Karar Sistemi"
        navigationItems={navigationItems}
        currentPathname={pathname}
        onNavigationItemClick={handleNavigationClick}
        onPreferencesClick={handlePreferencesClick}
        onLogoutClick={handleLogoutClick}
        onClickBildirim={handleNotificationClick}
        notificationCount={3}
        userInfo={userInfo}
        headerColor={headerColor}
      >
        {children}
      </AppShell>

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
    </>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <div className="text-lg text-gray-600">Yükleniyor...</div>
      </div>
    </div>}>
      <AppLayoutContent>{children}</AppLayoutContent>
    </Suspense>
  );
}