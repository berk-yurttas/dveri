"use client";

import { useUser } from "@/contexts/user-context";
import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";

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
  department: string | null;
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
  company: string;
  department: string;
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
  const [filterRole, setFilterRole] = useState("");
  const [filterAtolye, setFilterAtolye] = useState("");
  const [isFullAdmin, setIsFullAdmin] = useState(false);
  const [companies, setCompanies] = useState<string[]>([]);
  const [filterCompany, setFilterCompany] = useState("");

  useEffect(() => {
    const roles = (user?.role && Array.isArray(user.role)) ? user.role : [];
    setIsYonetici(roles.includes("atolye:yonetici"));
    setIsFullAdmin(roles.includes("fullAdmin:true"));
  }, [user]);

  const canAccess = isYonetici || isFullAdmin;

  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [formData, setFormData] = useState<EditFormData>({
    username: "",
    name: "",
    role: "musteri",
    station_id: "",
    password: "",
    password_confirm: "",
    company: "",
    department: "",
  });

  const fetchData = async () => {
    if (!canAccess) return;
    try {
      setLoading(true);
      setError(null);
      const requests: Promise<unknown>[] = [
        api.get<ManagedUser[]>("/romiot/station/stations/management/users", undefined, { useCache: false }),
        api.get<Station[]>("/romiot/station/stations/", undefined, { useCache: false }),
      ];
      if (isFullAdmin) {
        requests.push(api.get<string[]>("/romiot/station/stations/management/companies", undefined, { useCache: false }));
      }
      const [usersData, stationsData, companiesData] = await Promise.all(requests) as [
        ManagedUser[] | undefined,
        Station[] | undefined,
        string[] | undefined,
      ];
      setUsers(usersData || []);
      setStations(stationsData || []);
      setCompanies(companiesData || []);
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
  }, [canAccess]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (!isFullAdmin && u.role === "musteri") return false;
      const matchesSearch = !q || [u.username, u.name || "", u.email || "", u.station_name || "", u.company || ""].some((v) =>
        v.toLowerCase().includes(q)
      );
      const matchesRole = !filterRole || u.role === filterRole;
      const matchesAtolye = !filterAtolye || (u.station_name || "").toLowerCase().includes(filterAtolye.toLowerCase());
      const matchesCompany = !filterCompany || u.department === filterCompany;
      return matchesSearch && matchesRole && matchesAtolye && matchesCompany;
    });
  }, [users, search, filterRole, filterAtolye, filterCompany, isFullAdmin]);

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
      company: target.company || "",
      department: target.department || "",
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
      company: "",
      department: "",
    });
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    password_confirm: "",
    role: "musteri" as Exclude<RoleType, "operator">,
    department: "",
  });

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateForm({
      username: "",
      name: "",
      email: "",
      password: "",
      password_confirm: "",
      role: "musteri",
      department: "",
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (!createForm.username.trim()) throw new Error("Kullanıcı adı boş olamaz");
      if (!createForm.name.trim()) throw new Error("İsim boş olamaz");
      if (!createForm.email.trim()) throw new Error("E-posta boş olamaz");
      const pwError = validatePassword(createForm.password);
      if (pwError) throw new Error(pwError);
      if (createForm.password !== createForm.password_confirm) throw new Error("Şifreler eşleşmiyor");
      if (!createForm.department.trim()) throw new Error("Firma boş olamaz");
      if (createForm.department.includes(":")) throw new Error("Firma adında ':' karakteri kullanılamaz");

      const payload: any = {
        username: createForm.username.trim(),
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        password_confirm: createForm.password_confirm,
        role: createForm.role,
        department: createForm.department.trim(),
      };

      await api.post("/romiot/station/stations/management/users", payload);
      setSuccess("Kullanıcı başarıyla oluşturuldu");
      closeCreateModal();
      await fetchData();
    } catch (err: any) {
      let message = "Kullanıcı oluşturulamadı";
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

      const targetIsOperator = selectedUser?.role === "operator";

      if (formData.role === "operator" || targetIsOperator) {
        const stationId = parseInt(formData.station_id, 10);
        if (isNaN(stationId)) throw new Error("Operatör için atölye seçiniz");
        payload.station_id = stationId;
      }

      if (formData.password || formData.password_confirm) {
        if (!formData.password || !formData.password_confirm) {
          throw new Error("Şifre güncelleme için şifre ve tekrar alanlarını doldurun");
        }
        const pwError = validatePassword(formData.password);
        if (pwError) throw new Error(pwError);
        if (formData.password !== formData.password_confirm) {
          throw new Error("Şifreler eşleşmiyor");
        }
        payload.password = formData.password;
        payload.password_confirm = formData.password_confirm;
      }

      if (isFullAdmin) {
        if (!targetIsOperator) {
          if (!formData.department.trim()) throw new Error("Firma boş olamaz");
          if (formData.department.includes(":")) throw new Error("Firma adında ':' karakteri kullanılamaz");
          payload.department = formData.department.trim();
        }
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

  if (!canAccess) {
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Kullanıcı Yönetimi</h1>
            <p className="text-gray-600 mt-1">
              {isFullAdmin ? "Tüm firmalardaki kullanıcıları yönetin" : "Firmanızdaki kullanıcıları yönetin"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isFullAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg transition-colors"
              >
                Yeni Kullanıcı Oluştur
              </button>
            )}
            <button
              onClick={() => router.push(`/${platform}/atolye`)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
            >
              Geri Dön
            </button>
          </div>
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

        <div className="bg-white rounded-lg shadow-lg overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Yükleniyor...</div>
          ) : (
            <table className="min-w-[700px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kullanıcı Adı</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">İsim</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Atölye</th>
                  {isFullAdmin && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Firma</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">E-posta</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">İşlem</th>
                </tr>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">
                    <select
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="">Hepsi</option>
                      <option value="yonetici">Yönetici</option>
                      {isFullAdmin && <option value="musteri">Müşteri</option>}
                      <option value="operator">Operatör</option>
                      <option value="satinalma">Satınalma</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      placeholder="Filtrele..."
                      value={filterAtolye}
                      onChange={(e) => setFilterAtolye(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                    />
                  </td>
                  {isFullAdmin && (
                    <td className="px-4 py-2">
                      <select
                        value={filterCompany}
                        onChange={(e) => setFilterCompany(e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="">Hepsi</option>
                        {[...companies]
                          .sort((a, b) => a.localeCompare(b, "tr"))
                          .map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                      </select>
                    </td>
                  )}
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={isFullAdmin ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                      Kullanıcı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.pocketbase_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {u.username}
                        {u.is_self && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs">Siz</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.name || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.role ? ROLE_LABELS[u.role] : "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{u.station_name || "-"}</td>
                      {isFullAdmin && (
                        <td className="px-4 py-3 text-sm text-gray-800">{u.company || "-"}</td>
                      )}
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

      {selectedUser && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30 overflow-y-auto p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] overflow-y-auto">
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
                    onChange={(e) => {
                      const newRole = e.target.value as RoleType;
                      setFormData({
                        ...formData,
                        role: newRole,
                        station_id: newRole === "operator" ? formData.station_id : "",
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white disabled:bg-gray-100"
                    required
                    disabled={saving || selectedUser?.role === "operator"}
                  >
                    <option value="yonetici">Yönetici</option>
                    {isFullAdmin && <option value="musteri">Müşteri</option>}
                    <option value="operator">Operatör</option>
                    <option value="satinalma">Satınalma</option>
                  </select>
                </div>

                {(() => {
                  const firmaLocked = selectedUser?.role === "operator" || !isFullAdmin;
                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Firma {firmaLocked ? "" : "*"}
                      </label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        className={`w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 ${
                          firmaLocked ? "bg-gray-100 cursor-not-allowed" : "bg-white"
                        }`}
                        required={!firmaLocked}
                        disabled={saving}
                        readOnly={firmaLocked}
                      />
                      {formData.role === "musteri" && !firmaLocked && (
                        <p className="mt-1 text-xs text-gray-500">QR'da "Gönderen Firma" olarak basılır.</p>
                      )}
                      {selectedUser?.role === "operator" && (
                        <p className="mt-1 text-xs text-gray-500">Operatör için Firma düzenlenemez.</p>
                      )}
                      {!isFullAdmin && selectedUser?.role !== "operator" && (
                        <p className="mt-1 text-xs text-gray-500">Firma sadece fullAdmin tarafından düzenlenebilir.</p>
                      )}
                    </div>
                  );
                })()}

                {selectedUser?.role === "operator" && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Atölye *</label>
                    <select
                      value={formData.station_id}
                      onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                      required
                      disabled={saving}
                    >
                      <option value="">Atölye Seçiniz</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.is_exit_station ? " (Çıkış)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Yeni Şifre</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    minLength={8}
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
                    minLength={8}
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
        </div>,
        document.body
      )}

      {showCreateModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30 overflow-y-auto p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="bg-gradient-to-r from-[#0f4c3a] to-[#1a6a52] px-6 py-4">
              <h3 className="text-xl font-bold text-white">Yeni Kullanıcı Oluştur</h3>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı *</label>
                  <input
                    type="text"
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">E-posta *</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre *</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şifre Tekrar *</label>
                  <input
                    type="password"
                    value={createForm.password_confirm}
                    onChange={(e) => setCreateForm({ ...createForm, password_confirm: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => {
                      const newRole = e.target.value as Exclude<RoleType, "operator">;
                      setCreateForm({
                        ...createForm,
                        role: newRole,
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  >
                    <option value="yonetici">Yönetici</option>
                    <option value="musteri">Müşteri</option>
                    <option value="satinalma">Satınalma</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Firma *</label>
                  <input
                    type="text"
                    value={createForm.department}
                    onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    required
                    disabled={saving}
                  />
                  {createForm.role === "musteri" && (
                    <p className="mt-1 text-xs text-gray-500">QR'da "Gönderen Firma" olarak basılır.</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
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
                  {saving ? "Oluşturuluyor..." : "Oluştur"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

