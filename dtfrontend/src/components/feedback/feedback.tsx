"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { OpenProjectFeedbackWidgetReact } from "./OpenProjectFeedbackWidgetReact";
import { usePlatform } from "@/contexts/platform-context";
import { useUser } from "@/contexts/user-context";
import { platformService } from "@/services/platform";
import type { Platform } from "@/types/platform";

export function Feedback() {
  const [isMounted, setIsMounted] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [platformOptions, setPlatformOptions] = useState<Platform[]>([]);

  const { platform: currentPlatform } = usePlatform();
  const { user } = useUser();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!showFeedbackModal) return;
    const fetchPlatforms = async () => {
      try {
        const data = await platformService.getPlatforms(0, 100, false);
        setPlatformOptions(data);
      } catch (error) {
        console.error("Failed to fetch platforms for feedback widget:", error);
      }
    };
    fetchPlatforms();
  }, [showFeedbackModal]);

  const platformOptionString = useMemo(() => {
    if (!platformOptions.length) return "DerinİZ,İVME,rom-IoT,a-MOM";
    return platformOptions.map((platform) => platform.display_name || platform.code).join(",");
  }, [platformOptions]);

  if (!isMounted) return null;

  return (
    <>
      {createPortal(
        <button
          onClick={() => setShowFeedbackModal(true)}
          className="w-18 h-18 rounded-full shadow-2xl hover:scale-110 transition-transform overflow-hidden bg-white"
          style={{
            position: "fixed",
            bottom: "32px",
            right: "136px",
            zIndex: 9999,
          }}
          title="Geri Bildirim Gönder"
        >
          <img src="/ticket.png" alt="Feedback" className="w-full h-full object-contain" />
        </button>,
        document.body
      )}

      {showFeedbackModal &&
        createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/20"
              style={{ zIndex: 9998 }}
              onClick={() => setShowFeedbackModal(false)}
            />

            <div
              style={{
                position: "fixed",
                bottom: "108px",
                right: "48px",
                zIndex: 9999,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <OpenProjectFeedbackWidgetReact
                backendBaseUrl={process.env.NEXT_PUBLIC_OPENPROJECT_WIDGET_BACKEND_BASE_URL}
                title="Geri Bildirim Gönder"
                subtitle="Talep ve Öneri Bildirimi"
                platformOptions={platformOptionString}
                defaultPlatform={currentPlatform?.display_name || currentPlatform?.code || undefined}
                defaultOwner={user?.name || user?.username || "Bilinmiyor"}
                defaultBirim={user?.department || "Bilinmiyor"}
                openprojectUrl={process.env.NEXT_PUBLIC_OPENPROJECT_URL}
                openprojectApiToken={process.env.NEXT_PUBLIC_OPENPROJECT_API_TOKEN}
                openprojectProjectId={
                  process.env.NEXT_PUBLIC_OPENPROJECT_PROJECT_ID
                    ? Number(process.env.NEXT_PUBLIC_OPENPROJECT_PROJECT_ID)
                    : undefined
                }
                openprojectColumnQueryId={
                  process.env.NEXT_PUBLIC_OPENPROJECT_COLUMN_QUERY_ID
                    ? Number(process.env.NEXT_PUBLIC_OPENPROJECT_COLUMN_QUERY_ID)
                    : undefined
                }
                openprojectPlatformCustomFieldId={
                  process.env.NEXT_PUBLIC_OPENPROJECT_PLATFORM_CUSTOM_FIELD_ID
                    ? Number(process.env.NEXT_PUBLIC_OPENPROJECT_PLATFORM_CUSTOM_FIELD_ID)
                    : undefined
                }
                openprojectTalepSahibiCustomFieldId={
                  process.env.NEXT_PUBLIC_OPENPROJECT_TALEP_SAHIBI_CUSTOM_FIELD_ID
                    ? Number(process.env.NEXT_PUBLIC_OPENPROJECT_TALEP_SAHIBI_CUSTOM_FIELD_ID)
                    : undefined
                }
                openprojectBirimCustomFieldId={
                  process.env.NEXT_PUBLIC_OPENPROJECT_BIRIM_CUSTOM_FIELD_ID
                    ? Number(process.env.NEXT_PUBLIC_OPENPROJECT_BIRIM_CUSTOM_FIELD_ID)
                    : undefined
                }
                openprojectTypeId={
                  process.env.NEXT_PUBLIC_OPENPROJECT_TYPE_ID
                    ? Number(process.env.NEXT_PUBLIC_OPENPROJECT_TYPE_ID)
                    : undefined
                }
                openprojectVerifySsl={
                  process.env.NEXT_PUBLIC_OPENPROJECT_VERIFY_SSL
                    ? process.env.NEXT_PUBLIC_OPENPROJECT_VERIFY_SSL === "true"
                    : undefined
                }
                onClose={() => setShowFeedbackModal(false)}
                onCancel={() => setShowFeedbackModal(false)}
                onSuccess={() => {
                  setTimeout(() => setShowFeedbackModal(false), 900);
                }}
              />
            </div>
          </>,
          document.body
        )}
    </>
  );
}

