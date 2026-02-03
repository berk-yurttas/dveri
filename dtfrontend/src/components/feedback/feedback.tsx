"use client"

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Send, AlertCircle, CheckCircle } from "lucide-react";
import { feedbackService } from "@/services/feedback";
import { usePlatform } from "@/contexts/platform-context";
import { useUser } from "@/contexts/user-context";
import { platformService } from "@/services/platform";
import type { Platform } from "@/types/platform";

export function Feedback() {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  const { platform: currentPlatform } = usePlatform();
  const { user } = useUser();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch platforms when modal opens
  useEffect(() => {
    if (showFeedbackModal) {
      const fetchPlatforms = async () => {
        setPlatformsLoading(true);
        try {
          const platformsData = await platformService.getPlatforms(0, 100, false);
          setPlatforms(platformsData);

          // Set initial platform to current platform if available
          if (currentPlatform) {
            setSelectedPlatform(currentPlatform.code);
          } else if (platformsData.length > 0) {
            setSelectedPlatform(platformsData[0].code);
          }
        } catch (error) {
          console.error("Failed to fetch platforms:", error);
        } finally {
          setPlatformsLoading(false);
        }
      };

      fetchPlatforms();
    }
  }, [showFeedbackModal, currentPlatform]);

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim() || !selectedPlatform) {
      setSubmitStatus("error");
      setStatusMessage("Lütfen tüm alanları doldurun.");
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);
    setStatusMessage("");

    try {
      // Get selected platform name
      const selectedPlatformData = platforms.find(p => p.code === selectedPlatform);
      const platformName = selectedPlatformData?.display_name || selectedPlatform;

      // Get user info
      const userName = user?.name || "Bilinmiyor";
      const userEmail = user?.email || "Bilinmiyor";
      const userDepartment = user?.department || "Bilinmiyor";


      // Append user info to description
      const userInfoStr = `${userName} - ${userEmail}`;

      const response = await feedbackService.sendFeedback({
        subject: subject.trim(),
        platform: platformName,
        talep_sahibi: userInfoStr,
        birim: userDepartment,
        description: description.trim(),
      });

      if (response.success) {
        setSubmitStatus("success");
        setStatusMessage(response.message || "Feedback başarıyla gönderildi!");
        setSubject("");
        setDescription("");
        setSelectedPlatform(currentPlatform?.code || "");

        // Close modal after 2 seconds
        setTimeout(() => {
          handleCloseModal();
        }, 2000);
      } else {
        setSubmitStatus("error");
        setStatusMessage(response.message || "Bir hata oluştu.");
      }
    } catch (error) {
      setSubmitStatus("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Feedback gönderilirken bir hata oluştu."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setShowFeedbackModal(false);
    setSubject("");
    setDescription("");
    setSelectedPlatform(currentPlatform?.code || "");
    setSubmitStatus(null);
    setStatusMessage("");
  };

  if (!isMounted) return null;

  return (
    <>
      {/* Floating Feedback Button - Fixed to viewport using Portal */}
      {createPortal(
        <button
          onClick={() => setShowFeedbackModal(true)}
          className="w-18 h-18 rounded-full shadow-2xl hover:scale-110 transition-transform overflow-hidden bg-white"
          style={{
            position: 'fixed',
            bottom: '32px',
            right: '136px', // MirasAssistant butonunun solunda (48px + 72px buton genişliği + 16px boşluk)
            zIndex: 9999
          }}
          title="Geri Bildirim Gönder"
        >
          <img
            src="/ticket.png"
            alt="Feedback"
            className="w-full h-full object-contain"
          />
        </button>,
        document.body
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20"
            style={{ zIndex: 9998 }}
            onClick={handleCloseModal}
          />

          {/* Modal */}
          <div
            className="w-96 h-[580px] bg-white rounded-xl shadow-2xl flex flex-col"
            style={{
              position: 'fixed',
              bottom: '108px',
              right: '48px',
              zIndex: 9999
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-800 to-orange-500 p-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                  <Send className="w-6 h-6 text-blue-800" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Geri Bildirim Gönder</h3>
                  <p className="text-blue-100 text-xs">Talep ve Öneri Bildirimi</p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Status Message */}
              {submitStatus && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg ${submitStatus === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                >
                  {submitStatus === "success" ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                  <p className="text-sm">{statusMessage}</p>
                </div>
              )}

              {/* Subject Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Başlık <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Talep veya öneriniz için başlık giriniz"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-500 text-gray-900"
                  disabled={isSubmitting}
                />
              </div>

              {/* Platform Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Platform <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedPlatform}
                  onChange={(e) => setSelectedPlatform(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  disabled={isSubmitting || platformsLoading}
                >
                  {platformsLoading ? (
                    <option value="">Yükleniyor...</option>
                  ) : (
                    <>
                      <option value="">Platform seçiniz</option>
                      {platforms.map((platform) => (
                        <option key={platform.code} value={platform.code}>
                          {platform.display_name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Detay <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Talep veya önerinizi detaylı bir şekilde açıklayınız"
                  rows={5}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-500 text-gray-900"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <button
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  İptal
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !subject.trim() || !description.trim() || !selectedPlatform}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Gönderiliyor...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Gönder</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

