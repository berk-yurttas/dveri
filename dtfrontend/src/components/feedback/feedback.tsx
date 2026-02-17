"use client"

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Send, AlertCircle, CheckCircle, Paperclip } from "lucide-react";
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
  const [files, setFiles] = useState<File[]>([]);

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
      // 1. Upload files first
      let uploadedUrls: string[] = [];
      if (files.length > 0) {
        setStatusMessage(`Dosyalar yükleniyor... (0/${files.length})`);

        for (let i = 0; i < files.length; i++) {
          try {
            const url = await feedbackService.uploadFile(files[i]);
            uploadedUrls.push(url);
            setStatusMessage(`Dosyalar yükleniyor... (${i + 1}/${files.length})`);
          } catch (error) {
            console.error(`File upload failed for ${files[i].name}:`, error);
            throw new Error(`"${files[i].name}" yüklenemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`);
          }
        }
      }

      setStatusMessage("Feedback gönderiliyor...");

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
        attachments: uploadedUrls,
      });

      if (response.success) {
        setSubmitStatus("success");
        setStatusMessage(response.message || "Feedback başarıyla gönderildi!");
        setSubject("");
        setDescription("");
        setFiles([]);
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
            className="w-96 h-[620px] bg-white rounded-xl shadow-2xl flex flex-col"
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
            <div className="flex-1 overflow-y-auto p-4 space-y-3">


              {/* Subject Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dosya Ekle <span className="text-gray-400 font-normal text-xs ml-1">(İsteğe bağlı)</span>
                </label>
                <div className="flex flex-col gap-2">
                  <label
                    className={`
                      flex items-center justify-center gap-3 px-4 py-3
                      border-2 border-dashed border-gray-300 rounded-xl
                      cursor-pointer hover:border-blue-500 hover:bg-blue-50 
                      transition-all duration-200 group
                      ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const selectedFiles = Array.from(e.target.files || []);
                        const currentFiles = files;
                        const newFiles = [...currentFiles, ...selectedFiles];

                        // Calculate total size
                        const totalSize = newFiles.reduce((acc, file) => acc + file.size, 0);
                        const maxSize = 25 * 1024 * 1024; // 25MB

                        if (totalSize > maxSize) {
                          setSubmitStatus("error");
                          setStatusMessage("Toplam dosya boyutu 25MB'ı geçemez.");
                          return;
                        }

                        setFiles(newFiles);
                        setSubmitStatus(null);
                        setStatusMessage("");

                        // Reset input
                        e.target.value = "";
                      }}
                      disabled={isSubmitting}
                    />
                    <div className="w-10 h-10 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                      <Paperclip className="w-5 h-5 text-blue-600 group-hover:text-blue-700" />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">
                        Dosya seçmek için tıklayın
                      </span>
                      <span className="text-xs text-gray-500">
                        Birden fazla dosya seçebilirsiniz (Maks. 25MB)
                      </span>
                    </div>
                  </label>
                </div>

                {/* Selected Files List */}
                {files.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <span className="text-sm text-gray-700 truncate max-w-[200px]">{file.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                          <button
                            onClick={() => {
                              const newFiles = files.filter((_, i) => i !== index);
                              setFiles(newFiles);
                            }}
                            className="text-red-500 hover:text-red-700 disabled:opacity-50"
                            disabled={isSubmitting}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="text-right text-xs text-gray-600">
                      Toplam: {(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} / 25 MB
                    </div>
                  </div>
                )}
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <div className="p-4 border-t border-gray-200 space-y-3">
              {/* Status Message */}
              {submitStatus && (
                <div
                  className={`flex items-center gap-2 p-2 rounded-lg ${submitStatus === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                >
                  {submitStatus === "success" ? (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <p className="text-sm">{statusMessage}</p>
                </div>
              )}
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

