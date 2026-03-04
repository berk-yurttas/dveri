"use client";

import { useUser } from "@/contexts/user-context";
import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type RoleType = "yonetici" | "musteri" | "operator" | "satinalma";

interface ManagedUser {
  pocketbase_id: string;
  username: string;
  name: string | null;
  email: string | null;
  role: RoleType | null;
  station_id: number | null;
  station_name: string | null;
  company: string;
  is_self: boolean;
}

interface Station {
  id: number;
  name: string;
  company: string;
  is_exit_station: boolean;
}

interface EditFormData {
  username: string;
  name: string;
  role: RoleType;
  station_id: string;
  password: string;
  password_confirm: string;
}

const ROLE_LABELS: Record<RoleType, string> = {
  yonetici: "Yönetici",
  musteri: "Müşteri",
  operator: "Operatör",
  satinalma: "Satınalma",
};

export default function KullaniciYonetimiPage() {
  const { user } = useUser();
  const params = useParams();
  const router = useRouter();
  const platform = params.platform as string;

  const [isYonetici, setIsYonetici] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [formData, setFormData] = useState<EditFormData>({
    username: "",
    name: "",
    role: "musteri",
    station_id: "",
    password: "",
    password_confirm: "",
  });

  useEffect(() => {
    const hasYoneticiRole =
      user?.role && Array.isArray(user.role) && user.role.includes("atolye:yonetici");
    setIsYonetici(!!hasYoneticiRole);
  }, [user]);

  const fetchData = async () => {
    if (!isYonetici) return;
    try {
      setLoading(true);
      setError(null);
      const [usersData, stationsData] = await Promise.all([
        api.get<ManagedUser[]>("/romiot/station/stations/management/users", undefined, { useCache: false }),
        api.get<Station[]>("/romiot/station/stations/", undefined, { useCache: false }),
      ]);
      setUsers(usersData || []);
      setStations(stationsData || []);
    } catch (err: any) {
      let message = "Kullanıcı verileri alınamadı";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          message = parsed.detail || message;
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isYonetici]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.username, u.name || "", u.email || "", u.station_name || ""].some((v) =>
        v.toLowerCase().includes(q)
      )
    );
  }, [users, search]);

  const openEditModal = (target: ManagedUser) => {
    const role: RoleType = target.role || "musteri";
    setSelectedUser(target);
    setFormData({
      username: target.username,
      name: target.name || "",
      role,
      station_id: target.station_id ? String(target.station_id) : "",
      password: "",
      password_confirm: "",
    });
    setError(null);
    setSuccess(null);
  };

  const closeEditModal = () => {
    setSelectedUser(null);
    setFormData({
      username: "",
      name: "",
      role: "musteri",
      station_id: "",
      password: "",
      password_confirm: "",
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        username: formData.username.trim(),
        name: formData.name.trim(),
        role: formData.role,
      };

      if (!payload.username) throw new Error("Kullanıcı adı boş olamaz");
      if (!payload.name) throw new Error("İsim boş olamaz");

      if (formData.role === "operator") {
        const stationId = parseInt(formData.station_id, 10);
        if (isNaN(stationId)) throw new Error("Operatör için atölye seçiniz");
        payload.station_id = stationId;
      }

      if (formData.password || formData.password_confirm) {
        if (!formData.password || !formData.password_confirm) {
          throw new Error("Şifre güncelleme için şifre ve tekrar alanlarını doldurun");
        }
        if (formData.password !== formData.password_confirm) {
          throw new Error("Şifreler eşleşmiyor");
        }
        payload.password = formData.password;
        payload.password_confirm = formData.password_confirm;
      }

      await api.put<ManagedUser>(
        `/romiot/station/stations/management/users/${selectedUser.pocketbase_id}`,
        payload
      );

      setSuccess("Kullanıcı başarıyla güncellendi");
      closeEditModal();
      await fetchData();
    } catch (err: any) {
      let message = "Kullanıcı güncellenemedi";
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message);
          message = parsed.detail || message;
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setSaving(false);
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Kullanıcı Yönetimi</h1>
            <p className="text-gray-600 mt-1">Şirketinizdeki kullanıcıları yönetin</p>
          </div>
          <button
            onClick={() => router.push(`/${platform}/atolye`)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
          >
            Geri Dön
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg text-green-700">
            {success}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <input
            type="text"
            placeholder="Kullanıcı adı, isim, e-posta veya atölye ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white"
          />
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Yükleniyor...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kullanıcı Adı</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">İsim</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Atölye</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">E-posta</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">İşlem</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Kullanıcı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.pocketbase_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {u.username}
                        {u.is_self && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">
                            Siz
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.name || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">
                        {u.role ? ROLE_LABELS[u.role] : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.station_name || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.email || "-"}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openEditModal(u)}
                          className="px-3 py-1.5 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-md text-sm"
                        >
                          Düzenle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-[#0f4c3a] to-[#1a6a52] px-6 py-4">
              <h3 className="text-xl font-bold text-white">Kullanıcı Düzenle</h3>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as RoleType, station_id: e.target.value === "operator" ? formData.station_id : "" })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  >
                    <option value="yonetici">Yönetici</option>
                    <option value="musteri">Müşteri</option>
                    <option value="operator">Operatör</option>
                    <option value="satinalma">Satınalma</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Atölye {formData.role === "operator" ? "*" : ""}</label>
                  <select
                    value={formData.station_id}
                    onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    disabled={saving || formData.role !== "operator"}
                    required={formData.role === "operator"}
                  >
                    <option value="">Atölye Seçiniz</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.is_exit_station ? " (Çıkış)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Yeni Şifre</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    minLength={6}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Yeni Şifre Tekrar</label>
                  <input
                    type="password"
                    value={formData.password_confirm}
                    onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    minLength={6}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg"
                  disabled={saving}
                >
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

