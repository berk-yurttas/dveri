"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect } from "react";

export default function AtolyePage() {
  const { user } = useUser();
  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const hasOperatorRole = user.role.some(role => role.includes(":operator"));
      setIsOperator(hasOperatorRole);
    }
  }, [user]);

  if (!isOperator) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Erisim Yetkisi Yok</h1>
          <p className="text-gray-600">Bu sayfayi goruntuleme yetkisine sahip degilsiniz.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Atolye Islemleri</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Is Emri Giris Button */}
          <button
            onClick={() => {
              // TODO: Is emri giris islemi
              console.log("Is emri giris");
            }}
            className="flex flex-col items-center justify-center p-8 bg-green-500 hover:bg-green-600 text-white rounded-lg shadow-lg transition-colors h-48"
          >
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-2xl font-bold">Is Emri Giris</span>
          </button>

          {/* Is Emri Cikis Button */}
          <button
            onClick={() => {
              // TODO: Is emri cikis islemi
              console.log("Is emri cikis");
            }}
            className="flex flex-col items-center justify-center p-8 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg transition-colors h-48"
          >
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-2xl font-bold">Is Emri Cikis</span>
          </button>
        </div>
      </div>
    </div>
  );
}
