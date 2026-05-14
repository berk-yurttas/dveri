"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { ExitStationBadge } from "@/components/atolye/ExitStationBadge";

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Şifre en az 8 karakter olmalıdır";
  if (!/[A-Z]/.test(password)) return "Şifre en az 1 büyük harf içermelidir";
  if (!/[a-z]/.test(password)) return "Şifre en az 1 küçük harf içermelidir";
  if (!/[^a-zA-Z0-9]/.test(password)) return "Şifre en az 1 özel karakter içermelidir";
  for (let i = 0; i <= password.length - 4; i++) {
    const d = [0, 1, 2, 3].map((j) => password.charCodeAt(i + j));
    if (d.every((c) => c >= 48 && c <= 57)) {
      if (d[1] === d[0] + 1 && d[2] === d[1] + 1 && d[3] === d[2] + 1)
        return "Şifre 4 veya daha fazla ardışık artan rakam içeremez";
      if (d[1] === d[0] - 1 && d[2] === d[1] - 1 && d[3] === d[2] - 1)
        return "Şifre 4 veya daha fazla ardışık azalan rakam içeremez";
    }
  }
  return null;
}

interface Station {
  id: number;
  name: string;
  company: string;
  is_exit_station: boolean;
  station_order_code: number | null;
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
  });
  const [yoneticiLoading, setYoneticiLoading] = useState(false);
  const [yoneticiError, setYoneticiError] = useState<string | null>(null);
  const [yoneticiSuccess, setYoneticiSuccess] = useState<string | null>(null);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [editFormData, setEditFormData] = useState<{ name: string; is_exit_station: boolean }>({ name: "", is_exit_station: false });
  const [editModalLoading, setEditModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deletingStation, setDeletingStation] = useState<Station | null>(null);
  const [deleteModalLoading, setDeleteModalLoading] = useState(false);

  // Check user roles and extract company
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const yoneticiRole = user.role.find((role) =>
        typeof role === "string" && role === "atolye:yonetici"
      );
      if (yoneticiRole) {
        setIsYonetici(true);
        setUserCompany(user.department || user.company || null);
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
      const pwError = validatePassword(userFormData.password);
      if (pwError) {
        setYoneticiError(pwError);
        setYoneticiLoading(false);
        return;
      }
      if (userFormData.password !== userFormData.password_confirm) {
        setYoneticiError("Şifreler eşleşmiyor");
        setYoneticiLoading(false);
        return;
      }
      const stationIdNum = parseInt(userFormData.station_id, 10);
      if (isNaN(stationIdNum)) {
        setYoneticiError("Geçerli bir atölye seçiniz");
        setYoneticiLoading(false);
        return;
      }

      await api.post("/romiot/station/stations/user", {
        username: userFormData.username,
        name: userFormData.name,
        email: userFormData.email,
        password: userFormData.password,
        password_confirm: userFormData.password_confirm,
        role: "operator",
        station_id: stationIdNum,
      });

      setYoneticiSuccess("Kullanıcı başarıyla oluşturuldu");
      setUserFormData({
        username: "",
        name: "",
        email: "",
        password: "",
        password_confirm: "",
        station_id: "",
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

  const openEditModal = (station: Station) => {
    setEditingStation(station);
    setEditFormData({ name: station.name, is_exit_station: station.is_exit_station });
    setModalError(null);
  };

  const closeEditModal = () => {
    setEditingStation(null);
    setEditFormData({ name: "", is_exit_station: false });
    setModalError(null);
  };

  const handleUpdateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStation) return;
    setEditModalLoading(true);
    setModalError(null);

    try {
      await api.put(`/romiot/station/stations/${editingStation.id}`, {
        name: editFormData.name,
        company: editingStation.company,
        is_exit_station: editFormData.is_exit_station,
        station_order_code: editingStation.station_order_code,
      });
      setYoneticiSuccess("Atölye güncellendi");
      closeEditModal();
      await fetchStations();
    } catch (err: any) {
      let errorMessage = "Atölye güncellenirken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setModalError(errorMessage);
    } finally {
      setEditModalLoading(false);
    }
  };

  const openDeleteModal = (station: Station) => {
    setDeletingStation(station);
    setModalError(null);
  };

  const closeDeleteModal = () => {
    setDeletingStation(null);
    setModalError(null);
  };

  const handleDeleteStation = async () => {
    if (!deletingStation) return;
    setDeleteModalLoading(true);
    setModalError(null);

    try {
      await api.delete(`/romiot/station/stations/${deletingStation.id}`);
      setYoneticiSuccess("Atölye silindi");
      closeDeleteModal();
      await fetchStations();
    } catch (err: any) {
      let errorMessage = "Atölye silinirken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setModalError(errorMessage);
    } finally {
      setDeleteModalLoading(false);
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
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Atölye Yönetimi</h1>
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
          <div className="space-y-8">
            {/* Create Workshop Form */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Yeni Atölye Oluştur</h2>
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

            {/* Existing Workshops List */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Mevcut Atölyeler</h2>
              {stations.length === 0 ? (
                <p className="text-sm text-gray-500">Henüz atölye bulunmamaktadır</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">İsim</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tip</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {[...stations].sort((a, b) => a.id - b.id).map((station) => (
                        <tr key={station.id}>
                          <td className="px-3 py-2 text-sm text-gray-900 font-medium">{station.name}</td>
                          <td className="px-3 py-2">
                            {station.is_exit_station ? (
                              <ExitStationBadge isExit={true} size="sm" />
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(station)}
                                className="px-2 py-1 text-xs font-medium text-[#0f4c3a] hover:bg-[#0f4c3a]/10 rounded transition-colors"
                                title="Düzenle"
                              >
                                Düzenle
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteModal(station)}
                                className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded transition-colors"
                                title="Sil"
                              >
                                Sil
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Create User Form */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Yeni Operatör Oluştur</h2>
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
                    minLength={8}
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
                    minLength={8}
                  />
                </div>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şirket</label>
                  <input
                    type="text"
                    value={userCompany || ""}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                    readOnly
                    disabled
                  />
                  <p className="mt-1 text-xs text-gray-500">Operatör otomatik olarak şirketinize atanacaktır</p>
                </div>
                <button
                  type="submit"
                  disabled={yoneticiLoading || stations.length === 0}
                  className="w-full px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {yoneticiLoading ? "Oluşturuluyor..." : "Operatör Oluştur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Edit Station Modal */}
      {editingStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Atölye Düzenle</h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateStation}>
              <div className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded text-sm text-red-700 whitespace-pre-line">
                    {modalError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                    disabled={editModalLoading}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şirket</label>
                  <input
                    type="text"
                    value={editingStation.company}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                    readOnly
                    disabled
                  />
                  <p className="mt-1 text-xs text-gray-500">Şirket bilgisi düzenlenemez</p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="edit_is_exit_station"
                    checked={editFormData.is_exit_station}
                    onChange={(e) => setEditFormData({ ...editFormData, is_exit_station: e.target.checked })}
                    className="h-4 w-4 text-[#0f4c3a] border-gray-300 rounded focus:ring-[#0f4c3a]"
                    disabled={editModalLoading}
                  />
                  <label htmlFor="edit_is_exit_station" className="text-sm font-medium text-gray-700">
                    Çıkış Atölyesi
                  </label>
                  <span className="text-xs text-gray-500">(Bu atölyeden çıkan iş emirleri teslim edilmiş sayılır)</span>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={editModalLoading}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={editModalLoading}
                  className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editModalLoading ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Station Modal */}
      {deletingStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Atölyeyi Sil</h3>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded text-sm text-red-700 whitespace-pre-line">
                  {modalError}
                </div>
              )}
              <p className="text-sm text-gray-700">
                <span className="font-semibold">'{deletingStation.name}'</span> atölyesini silmek istediğinize emin misiniz?
              </p>
              <p className="text-xs text-gray-500">Bu işlem geri alınamaz.</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteModalLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleDeleteStation}
                disabled={deleteModalLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteModalLoading ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
