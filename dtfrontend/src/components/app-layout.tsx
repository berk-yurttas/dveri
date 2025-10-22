"use client"

import { AppShell } from "./appShell";
import { Home, Users, Settings, BarChart3, Plus, Receipt, Layout, Star, Database, Server, Cloud, Workflow } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useCallback, useEffect, useState } from "react";
import { useDashboards } from "@/contexts/dashboard-context";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { platformService } from "@/services/platform";
import { Platform as PlatformType } from "@/types/platform";
import { api } from "@/lib/api";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading, logout, isAuthenticated } = useUser();
  const { platform, setPlatformByCode, clearPlatform } = usePlatform();

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

  // Dynamic title based on platform and easter egg
  const getTitle = () => {
    if (easterEggActive) return "Biz de DERİNİZ ;)";
    if (platform) return `${platform.display_name}`;
    return "MİRAS";
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
    return [
      {
        title: "Anasayfa",
        icon: Home,
        href: platformCode ? `/${platformCode}` : "/",
      },
      {
        title: "Ekranlarım",
        icon: Layout,
        href: platformCode ? `${platformPrefix}/dashboard${subplatformQuery}` : "/dashboard",
      },
      {
        title: "Raporlar",
        icon: BarChart3,
        href: platformCode ? `${platformPrefix}/reports${subplatformQuery}` : "/reports",
      }
    ];
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
          // This is a platform-specific route, extract the platform code
          const platformCode = potentialPlatformCode;
          console.log('[Navigation] Setting platform code:', platformCode);
          localStorage.setItem('platform_code', platformCode);
          api.clearCache();
          // Update platform context immediately to set headerColor
          await setPlatformByCode(platformCode);
        } else if (item.href === '/') {
          // Navigating to root, clear platform
          console.log('[Navigation] Clearing platform code');
          localStorage.removeItem('platform_code');
          api.clearCache();
          clearPlatform();
        }
      }
      
      router.push(item.href);
    }
  }, [router, setPlatformByCode, clearPlatform]);

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

  return (
    <AppShell
      title={title}
      subtitle=""
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
  );
}