"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface Station {
  id: number;
  name: string;
  company: string;
  is_exit_station: boolean;
}

export default function YoneticiPage() {
  const { user } = useUser();
  const [isYonetici, setIsYonetici] = useState(false);
  const [userCompany, setUserCompany] = useState<string | null>(null);

  // Station & user form state
  const [stations, setStations] = useState<Station[]>([]);
  const [stationFormData, setStationFormData] = useState({ name: "", company: "", is_exit_station: false });
  const [userFormData, setUserFormData] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    password_confirm: "",
    station_id: "",
    role: "operator" as "musteri" | "operator" | "satinalma",
  });
  const [yoneticiLoading, setYoneticiLoading] = useState(false);
  const [yoneticiError, setYoneticiError] = useState<string | null>(null);
  const [yoneticiSuccess, setYoneticiSuccess] = useState<string | null>(null);

  // Check user roles and extract company
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const yoneticiRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":yonetici")
      );
      if (yoneticiRole) {
        setIsYonetici(true);
        const parts = yoneticiRole.split(":");
        if (parts.length === 3) {
          setUserCompany(parts[1]);
        }
      }
    }
  }, [user]);

  // Fetch stations
  const fetchStations = useCallback(async () => {
    if (!isYonetici) return;
    try {
      api.clearCachePattern(/\/romiot\/station\/stations\//);
      const timestamp = new Date().getTime();
      const data = await api.get<Station[]>(
        `/romiot/station/stations/?_t=${timestamp}`,
        undefined,
        { useCache: false }
      );
      setStations(data || []);
    } catch (err: any) {
      console.error("Error fetching stations:", err);
      setYoneticiError("Atölyeler yüklenirken hata oluştu");
    }
  }, [isYonetici]);

  useEffect(() => {
    if (isYonetici && userCompany) {
      fetchStations();
      setStationFormData({ name: "", company: userCompany, is_exit_station: false });
    }
  }, [isYonetici, userCompany, fetchStations]);

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setYoneticiLoading(true);
    setYoneticiError(null);
    setYoneticiSuccess(null);

    try {
      await api.post("/romiot/station/stations/", stationFormData);
      setYoneticiSuccess("Atölye başarıyla oluşturuldu");
      setStationFormData({ name: "", company: userCompany || "", is_exit_station: false });
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchStations();
    } catch (err: any) {
      let errorMessage = "Atölye oluşturulurken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setYoneticiError(errorMessage);
    } finally {
      setYoneticiLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setYoneticiLoading(true);
    setYoneticiError(null);
    setYoneticiSuccess(null);

    try {
      if (userFormData.password !== userFormData.password_confirm) {
        setYoneticiError("Şifreler eşleşmiyor");
        setYoneticiLoading(false);
        return;
      }

      const payload: any = {
        username: userFormData.username,
        name: userFormData.name,
        email: userFormData.email,
        password: userFormData.password,
        password_confirm: userFormData.password_confirm,
        role: userFormData.role,
      };

      if (userFormData.role === "operator") {
        const stationIdNum = parseInt(userFormData.station_id, 10);
        if (isNaN(stationIdNum)) {
          setYoneticiError("Geçerli bir atölye seçiniz");
          setYoneticiLoading(false);
          return;
        }
        payload.station_id = stationIdNum;
      }

      await api.post("/romiot/station/stations/user", payload);

      setYoneticiSuccess("Kullanıcı başarıyla oluşturuldu");
      setUserFormData({
        username: "",
        name: "",
        email: "",
        password: "",
        password_confirm: "",
        station_id: "",
        role: "operator" as "musteri" | "operator" | "satinalma",
      });
    } catch (err: any) {
      let errorMessage = "Kullanıcı oluşturulurken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setYoneticiError(errorMessage);
    } finally {
      setYoneticiLoading(false);
    }
  };

  if (!isYonetici) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Erişim Yetkisi Yok</h1>
          <p className="text-gray-600">Bu sayfayı görüntüleme yetkisine sahip değilsiniz.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Atölye Yönetimi</h1>
        </div>

        {yoneticiSuccess && (
          <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
            {yoneticiSuccess}
          </div>
        )}

        {yoneticiError && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-2">Hata</h3>
                <div className="text-sm text-red-700 whitespace-pre-line">{yoneticiError}</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create Workshop Form */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Yeni Atölye Oluştur</h2>
            <form onSubmit={handleCreateStation}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                  <input
                    type="text"
                    value={stationFormData.name}
                    onChange={(e) => setStationFormData({ ...stationFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şirket *</label>
                  <input
                    type="text"
                    value={stationFormData.company}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                    readOnly
                    disabled
                  />
                  <p className="mt-1 text-xs text-gray-500">Şirket bilgisi otomatik olarak doldurulmuştur</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_exit_station"
                    checked={stationFormData.is_exit_station}
                    onChange={(e) => setStationFormData({ ...stationFormData, is_exit_station: e.target.checked })}
                    className="h-4 w-4 text-[#0f4c3a] border-gray-300 rounded focus:ring-[#0f4c3a]"
                    disabled={yoneticiLoading}
                  />
                  <label htmlFor="is_exit_station" className="text-sm font-medium text-gray-700">
                    Çıkış Atölyesi
                  </label>
                  <span className="text-xs text-gray-500">(Bu atölyeden çıkan iş emirleri teslim edilmiş sayılır)</span>
                </div>
                <button
                  type="submit"
                  disabled={yoneticiLoading}
                  className="w-full px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {yoneticiLoading ? "Oluşturuluyor..." : "Atölye Oluştur"}
                </button>
              </div>
            </form>
          </div>

          {/* Create User Form */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Yeni Kullanıcı Oluştur</h2>
            <form onSubmit={handleCreateUser}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı *</label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                  <input
                    type="text"
                    value={userFormData.name}
                    onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">E-posta *</label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre *</label>
                  <input
                    type="password"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre Tekrar *</label>
                  <input
                    type="password"
                    value={userFormData.password_confirm}
                    onChange={(e) => setUserFormData({ ...userFormData, password_confirm: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as "musteri" | "operator" | "satinalma" })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={yoneticiLoading}
                  >
                    <option value="operator">Operatör</option>
                    <option value="musteri">Müşteri</option>
                    <option value="satinalma">Satınalma</option>
                  </select>
                </div>
                {userFormData.role === "operator" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Atölye *</label>
                    <select
                      value={userFormData.station_id}
                      onChange={(e) => setUserFormData({ ...userFormData, station_id: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading || stations.length === 0}
                    >
                      <option value="">Atölye Seçiniz</option>
                      {stations.map((station) => (
                        <option key={station.id} value={station.id}>{station.name}{station.is_exit_station ? " (Çıkış)" : ""}</option>
                      ))}
                    </select>
                    {stations.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">Henüz atölye bulunmamaktadır</p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şirket</label>
                  <input
                    type="text"
                    value={userCompany || ""}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                    readOnly
                    disabled
                  />
                  <p className="mt-1 text-xs text-gray-500">Kullanıcı otomatik olarak şirketinize atanacaktır</p>
                </div>
                <button
                  type="submit"
                  disabled={yoneticiLoading || stations.length === 0}
                  className="w-full px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {yoneticiLoading ? "Oluşturuluyor..." : "Kullanıcı Oluştur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
