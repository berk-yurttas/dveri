"use client"

import { AppShell } from "./appShell";
import { Home, Users, Settings, BarChart3, Plus, Receipt, Layout, Star } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useCallback, useEffect } from "react";
import { useDashboards } from "@/contexts/dashboard-context";
import { useUser } from "@/contexts/user-context";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout, isAuthenticated } = useUser();


  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Optionally redirect to login page or show login modal
      console.log('User not authenticated');
    }
  }, [loading, isAuthenticated]);

  // Create navigation items (static to prevent hydration issues)
  const navigationItems = useMemo(() => [
    {
      title: "Anasayfa",
      icon: Home,
      href: "/",
    },
    {
      title: "Ekranlarım",
      icon: Layout,
      href: "/dashboard",
    },
    {
      title: "Raporlar",
      icon: BarChart3,
      href: "/reports",
    }
  ], []); // No dependencies to ensure consistent rendering

  const handleNavigationClick = useCallback((item: any) => {
    console.log("Navigation clicked:", item);
    if (item.href) {
      router.push(item.href);
    }
  }, [router]);

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
      title="AHTAPOT"
      subtitle="DerinIZ"
      navigationItems={navigationItems}
      currentPathname={pathname}
      onNavigationItemClick={handleNavigationClick}
      onPreferencesClick={handlePreferencesClick}
      onLogoutClick={handleLogoutClick}
      onClickBildirim={handleNotificationClick}
      notificationCount={3}
      userInfo={userInfo}
    >
      {children}
    </AppShell>
  );
}