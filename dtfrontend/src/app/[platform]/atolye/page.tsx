"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function AtolyePage() {
  const { user } = useUser();
  const router = useRouter();
  const params = useParams();
  const platform = params.platform as string;

  const [isOperator, setIsOperator] = useState(false);
  const [isYonetici, setIsYonetici] = useState(false);
  const [isMusteri, setIsMusteri] = useState(false);
  const [isSatinalma, setIsSatinalma] = useState(false);
  const [hasAtolyeRole, setHasAtolyeRole] = useState(false);
  const [showAccessDeniedModal, setShowAccessDeniedModal] = useState(false);

  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const operatorRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":operator")
      );
      setIsOperator(!!operatorRole);

      const yoneticiRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":yonetici")
      );
      setIsYonetici(!!yoneticiRole);

      const musteriRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":musteri")
      );
      setIsMusteri(!!musteriRole);

      const satinalmaRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":satinalma")
      );
      setIsSatinalma(!!satinalmaRole);

      const anyAtolyeRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:")
      );
      setHasAtolyeRole(!!anyAtolyeRole);
    }
  }, [user]);

  if (!hasAtolyeRole) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Erişim Yetkisi Yok</h1>
          <p className="text-gray-600">Bu sayfayı görüntüleme yetkisine sahip değilsiniz.</p>
        </div>
      </div>
    );
  }

  const cards = [
    {
      title: "Yönetici",
      description: "Atölye ve kullanıcı yönetimi",
      href: `/${platform}/atolye/yonetici`,
      allowed: isYonetici,
      color: "#0f4c3a",
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      title: "Müşteri",
      description: "Barkod oluşturma ve yazdırma",
      href: `/${platform}/atolye/musteri`,
      allowed: isMusteri,
      color: "#fe9526",
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
      ),
    },
    {
      title: "Operatör",
      description: "İş emri giriş ve çıkış işlemleri",
      href: `/${platform}/atolye/operator`,
      allowed: isOperator,
      color: "#0f4c3a",
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      ),
    },
    {
      title: "İş Emirleri",
      description: "Tüm iş emirlerinin detaylı görünümü",
      href: `/${platform}/atolye/is-emirleri`,
      allowed: isOperator || isYonetici || isSatinalma,
      color: "#0f4c3a",
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
  ];

  const handleCardClick = (card: typeof cards[0]) => {
    if (card.allowed) {
      router.push(card.href);
    } else {
      setShowAccessDeniedModal(true);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Atölye</h1>
          <p className="text-gray-600">Yapmak istediğiniz işlemi seçiniz</p>
        </div>

        <div
          className={`grid grid-cols-1 md:grid-cols-2 ${
            cards.length >= 3 ? "lg:grid-cols-3" : ""
          } gap-6`}
        >
          {cards.map((card) => (
            <div
              key={card.title}
              onClick={() => handleCardClick(card)}
              className={`bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden group ${
                !card.allowed ? "opacity-60" : ""
              }`}
            >
              <div className="h-2" style={{ backgroundColor: card.color }} />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: card.color + "15",
                      color: card.color,
                    }}
                  >
                    {card.icon}
                  </div>
                  {!card.allowed && (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:opacity-80 transition-opacity">
                  {card.title}
                </h3>
                <p className="text-sm text-gray-600">{card.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Access Denied Modal */}
      {showAccessDeniedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 className="text-xl font-bold text-white">Yetkisiz Erişim</h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-gray-700 text-lg mb-2">
                Bu sayfa için yetkiniz bulunmamaktadır.
              </p>
              <p className="text-gray-600">
                Erişim izni almak için lütfen sistem yöneticisi ile iletişime geçiniz.
              </p>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowAccessDeniedModal(false)}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
