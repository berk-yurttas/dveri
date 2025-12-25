"use client"

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { Lock } from "lucide-react";
import { checkAccess } from "@/lib/utils";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const platformCode = params.platform as string;
  
  const { user, loading: userLoading } = useUser();
  const { platform, setPlatformByCode, loading: platformLoading } = usePlatform();
  const [isAccessChecked, setIsAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  // Ensure platform data is loaded
  useEffect(() => {
    if (platformCode) {
      setPlatformByCode(platformCode);
    }
  }, [platformCode, setPlatformByCode]);

  // Check access when data is ready
  useEffect(() => {
    // Wait for initial loads
    if (userLoading || platformLoading) {
        return;
    }

    // If platform is not loaded yet (but not loading), it might be an error or just not ready.
    if (!platform) {
        return; 
    }

    if (platform.code !== platformCode) {
        // Mismatch, wait for correct platform
        return;
    }

    if (!user) {
        // Not authenticated
        setIsAccessChecked(true);
        setHasAccess(false);
        return;
    }

    // Access Check Logic using helper
    const allowed = checkAccess(platform, user);
    setHasAccess(allowed);
    setIsAccessChecked(true);

  }, [user, platform, userLoading, platformLoading, platformCode]);

  // Loading State
  if (userLoading || platformLoading || !isAccessChecked) {
      return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="text-lg text-gray-600">Yükleniyor...</div>
            </div>
        </div>
      );
  }

  // Access Denied State
  if (!hasAccess) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center animate-in fade-in zoom-in duration-200">
                <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <Lock className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Erişim Yetkiniz Bulunamadı</h2>
                <p className="text-gray-600 mb-6">
                    Bu platforma ({platform?.display_name || platformCode}) erişim yetkiniz bulunmamaktadır.
                </p>
                <button
                    onClick={() => router.push('/')}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                    Ana Sayfaya Dön
                </button>
            </div>
        </div>
      );
  }

  // Allowed
  return <>{children}</>;
}
