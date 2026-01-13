"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface Station {
  id: number;
  name: string;
  company: string;
}

interface Operator {
  id: number;
  username: string;
  name: string;
  station_id: number | null;
}

export default function AtolyelerPage() {
  const { user } = useUser();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isYonetici, setIsYonetici] = useState(false);
  const [userCompany, setUserCompany] = useState<string | null>(null);

  // Station editing state
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [editStationName, setEditStationName] = useState("");

  // Operators state
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingOperators, setLoadingOperators] = useState(false);

  // Operator editing state
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [editOperatorName, setEditOperatorName] = useState("");
  const [editOperatorStationId, setEditOperatorStationId] = useState<number | null>(null);

  // Check user roles
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
  const fetchStations = async () => {
    if (!isYonetici) return;

    try {
      setLoading(true);
      setError(null);
      
      const timestamp = new Date().getTime();
      const data = await api.get<Station[]>(
        `/romiot/station/stations/?_t=${timestamp}`,
        undefined,
        { useCache: false }
      );
      
      setStations(data || []);
    } catch (err: any) {
      console.error("Error fetching stations:", err);
      setError("Atölyeler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [isYonetici]);

  // Fetch operators for a station
  const fetchOperators = async (station: Station) => {
    try {
      setLoadingOperators(true);
      setError(null);
      
      const timestamp = new Date().getTime();
      const data = await api.get<Operator[]>(
        `/romiot/station/stations/${station.id}/operators?_t=${timestamp}`,
        undefined,
        { useCache: false }
      );
      
      setOperators(data || []);
      setSelectedStation(station);
    } catch (err: any) {
      console.error("Error fetching operators:", err);
      setError("Operatörler yüklenirken hata oluştu");
    } finally {
      setLoadingOperators(false);
    }
  };

  // Update station
  const handleUpdateStation = async () => {
    if (!editingStation || !editStationName.trim()) return;

    try {
      setError(null);
      await api.put(`/romiot/station/stations/${editingStation.id}`, {
        name: editStationName,
        company: userCompany
      });
      
      setSuccess("Atölye başarıyla güncellendi");
      setEditingStation(null);
      setEditStationName("");
      await fetchStations();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("Error updating station:", err);
      setError(err.message || "Atölye güncellenirken hata oluştu");
    }
  };

  // Delete station
  const handleDeleteStation = async (station: Station) => {
    if (!confirm(`"${station.name}" atölyesini silmek istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      setError(null);
      await api.delete(`/romiot/station/stations/${station.id}`);
      
      setSuccess("Atölye başarıyla silindi");
      await fetchStations();
      
      if (selectedStation?.id === station.id) {
        setSelectedStation(null);
        setOperators([]);
      }
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("Error deleting station:", err);
      setError(err.message || "Atölye silinirken hata oluştu");
    }
  };

  // Update operator
  const handleUpdateOperator = async () => {
    if (!editingOperator || !editOperatorName.trim()) return;

    try {
      setError(null);
      await api.put(`/romiot/station/stations/operators/${editingOperator.id}`, {
        name: editOperatorName,
        station_id: editOperatorStationId
      });
      
      setSuccess("Operatör başarıyla güncellendi");
      setEditingOperator(null);
      setEditOperatorName("");
      setEditOperatorStationId(null);
      
      if (selectedStation) {
        await fetchOperators(selectedStation);
      }
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("Error updating operator:", err);
      setError(err.message || "Operatör güncellenirken hata oluştu");
    }
  };

  // Delete operator
  const handleDeleteOperator = async (operator: Operator) => {
    if (!confirm(`"${operator.name}" operatörünü silmek istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      setError(null);
      await api.delete(`/romiot/station/stations/operators/${operator.id}`);
      
      setSuccess("Operatör başarıyla silindi");
      
      if (selectedStation) {
        await fetchOperators(selectedStation);
      }
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("Error deleting operator:", err);
      setError(err.message || "Operatör silinirken hata oluştu");
    }
  };

  if (!isYonetici) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Erişim Yetkisi Yok
          </h1>
          <p className="text-gray-600">
            Bu sayfayı görüntüleme yetkisine sahip değilsiniz.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#008080] mx-auto mb-4"></div>
          <p className="text-gray-600">Atölyeler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Atölye Yönetimi
              </h1>
              <p className="text-gray-600">
                Atölyeleri ve operatörleri yönetin
              </p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg shadow-sm">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-700">{success}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-red-500 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Stations List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Atölyeler</h2>
              <a
                href={`${window.location.pathname.replace('/atolyeler', '')}`}
                className="px-3 py-1.5 bg-[#008080] hover:bg-[#006666] text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Atölye Ekle
              </a>
            </div>
            
            <div className="p-6">
              {stations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Henüz atölye bulunmamaktadır.
                </div>
              ) : (
                <div className="space-y-3">
                  {stations.map((station) => (
                    <div
                      key={station.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-[#008080] transition-colors"
                    >
                      {editingStation?.id === station.id ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editStationName}
                            onChange={(e) => setEditStationName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008080] focus:border-[#008080] text-gray-900 bg-white"
                            placeholder="Atölye adı"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleUpdateStation}
                              className="px-4 py-2 bg-[#008080] text-white rounded-lg hover:bg-[#006666] transition-colors text-sm"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => {
                                setEditingStation(null);
                                setEditStationName("");
                              }}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                            >
                              İptal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{station.name}</h3>
                            <p className="text-sm text-gray-600">{station.company}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => fetchOperators(station)}
                              className="p-2 text-[#008080] hover:bg-[#008080] hover:text-white rounded-lg transition-colors"
                              title="Operatörleri Görüntüle"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                setEditingStation(station);
                                setEditStationName(station.name);
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteStation(station)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Sil"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Operators List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {selectedStation ? `${selectedStation.name} - Operatörler` : "Operatörler"}
              </h2>
              <a
                href={`${window.location.pathname.replace('/atolyeler', '')}`}
                className="px-3 py-1.5 bg-[#008080] hover:bg-[#006666] text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Operatör Ekle
              </a>
            </div>
            
            <div className="p-6">
              {!selectedStation ? (
                <div className="text-center py-8 text-gray-500">
                  Operatörleri görüntülemek için bir atölye seçin
                </div>
              ) : loadingOperators ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#008080] mx-auto"></div>
                </div>
              ) : operators.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Bu atölyede henüz operatör bulunmamaktadır.
                </div>
              ) : (
                <div className="space-y-3">
                  {operators.map((operator) => (
                    <div
                      key={operator.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-[#008080] transition-colors"
                    >
                      {editingOperator?.id === operator.id ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editOperatorName}
                            onChange={(e) => setEditOperatorName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008080] focus:border-[#008080] text-gray-900 bg-white"
                            placeholder="Operatör adı"
                          />
                          <select
                            value={editOperatorStationId || ""}
                            onChange={(e) => setEditOperatorStationId(e.target.value ? Number(e.target.value) : null)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008080] focus:border-[#008080] text-gray-900 bg-white"
                          >
                            <option value="">Atölye Seçin</option>
                            {stations.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={handleUpdateOperator}
                              className="px-4 py-2 bg-[#008080] text-white rounded-lg hover:bg-[#006666] transition-colors text-sm"
                            >
                              Kaydet
                            </button>
                            <button
                              onClick={() => {
                                setEditingOperator(null);
                                setEditOperatorName("");
                                setEditOperatorStationId(null);
                              }}
                              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                            >
                              İptal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{operator.name}</h3>
                            <p className="text-sm text-gray-600">@{operator.username}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingOperator(operator);
                                setEditOperatorName(operator.name);
                                setEditOperatorStationId(operator.station_id);
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteOperator(operator)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Sil"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

