"use client"

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Database,
  FileText,
  Palette,
  Layout,
  Loader2,
  TestTube,
  Settings,
  Image as ImageIcon,
  Shield,
  Users
} from "lucide-react";
import { platformService } from "@/services/platform";
import { Platform, PlatformUpdate } from "@/types/platform";
import { DepartmentSelectModal } from "@/components/reports/department-select-modal";

export default function EditPlatformPage() {
  const router = useRouter();
  const params = useParams();
  const platformId = parseInt(params.id as string);

  const [platform, setPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [featurePermissionIndex, setFeaturePermissionIndex] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState<PlatformUpdate>({
    name: "",
    display_name: "",
    description: "",
    db_type: "clickhouse",
    db_config: {},
    logo_url: "",
    theme_config: {},
    is_active: true,
    allowed_departments: [],
    allowed_users: []
  });

  useEffect(() => {
    fetchPlatform();
  }, [platformId]);

  const fetchPlatform = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await platformService.getPlatformById(platformId);
      setPlatform(data);
      
      // Initialize form data
      setFormData({
        name: data.name,
        display_name: data.display_name,
        description: data.description,
        db_type: data.db_type,
        db_config: data.db_config || {},
        logo_url: data.logo_url,
        theme_config: data.theme_config || {},
        is_active: data.is_active,
        allowed_departments: data.allowed_departments || [],
        allowed_users: data.allowed_users || []
      });
    } catch (err) {
      console.error("Failed to fetch platform:", err);
      setError("Platform yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDbConfigChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      db_config: {
        ...(prev.db_config || {}),
        [field]: value
      }
    }));
  };

  const handleThemeConfigChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      theme_config: {
        ...(prev.theme_config || {}),
        [field]: value
      }
    }));
  };

  const handlePermissionSave = (departments: string[], users: string[]) => {
    if (featurePermissionIndex !== null) {
      // Updating feature card permissions
      const newFeatures = [...(formData.theme_config as any)?.features || []];
      if (newFeatures[featurePermissionIndex]) {
        newFeatures[featurePermissionIndex].allowed_departments = departments;
        newFeatures[featurePermissionIndex].allowed_users = users;
        handleThemeConfigChange('features', newFeatures);
      }
      setFeaturePermissionIndex(null);
    } else {
      // Updating platform-wide permissions
      setFormData(prev => ({
        ...prev,
        allowed_departments: departments,
        allowed_users: users
      }));
    }
  };

  const openPermissionModal = (index: number | null = null) => {
    setFeaturePermissionIndex(index);
    setShowPermissionModal(true);
  };

  const getInitialDepartments = () => {
    if (featurePermissionIndex !== null) {
      return (formData.theme_config as any)?.features?.[featurePermissionIndex]?.allowed_departments || [];
    }
    return formData.allowed_departments || [];
  };

  const getInitialUsers = () => {
    if (featurePermissionIndex !== null) {
      return (formData.theme_config as any)?.features?.[featurePermissionIndex]?.allowed_users || [];
    }
    return formData.allowed_users || [];
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const result = await platformService.testConnection(platformId);
      if (result.success) {
        setSuccessMessage(`Bağlantı başarılı! (${result.connection_time_ms}ms)`);
      } else {
        setError(`Bağlantı hatası: ${result.message}`);
      }
    } catch (err: any) {
      setError(`Bağlantı test edilemedi: ${err.message}`);
    } finally {
      setTesting(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.name || !formData.display_name) {
        setError("Lütfen tüm zorunlu alanları doldurun");
        setSaving(false);
        return;
      }

      await platformService.updatePlatform(platformId, formData);
      setSuccessMessage("Platform başarıyla güncellendi!");
      
      setTimeout(() => {
        router.push('/admin/platforms');
      }, 1500);
    } catch (err: any) {
      console.error("Failed to update platform:", err);
      setError(err.message || "Platform güncellenirken bir hata oluştu");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Platform yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (!platform) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Platform bulunamadı</h2>
          <button
            onClick={() => router.push('/admin/platforms')}
            className="text-blue-600 hover:text-blue-700"
          >
            Platformlar sayfasına dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Geri Dön
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Platform Düzenle: {platform.display_name}
          </h1>
          <p className="text-gray-600">Platform bilgilerini güncelleyin</p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-700 text-sm">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Tab Navigation and Content */}
        <div className="flex gap-6">
          {/* Vertical Tabs Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Ayarları</h3>
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveTab('basic')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                    activeTab === 'basic'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <FileText className="h-5 w-5" />
                  Temel Bilgiler
                </button>
                <button
                  onClick={() => setActiveTab('database')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                    activeTab === 'database'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Database className="h-5 w-5" />
                  Veritabanı
                </button>
                <button
                  onClick={() => setActiveTab('features')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                    activeTab === 'features'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Layout className="h-5 w-5" />
                  Özellik Kartları
                </button>
                <button
                  onClick={() => setActiveTab('theme')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                    activeTab === 'theme'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Palette className="h-5 w-5" />
                  Tema Ayarları
                </button>
                <button
                  onClick={() => setActiveTab('permissions')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
                    activeTab === 'permissions'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Shield className="h-5 w-5" />
                  Yetkilendirme
                </button>
              </nav>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information Tab */}
              {activeTab === 'basic' && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="h-5 w-5 text-gray-600" />
                    <h2 className="text-xl font-semibold text-gray-900">Temel Bilgiler</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Platform Kodu
                      </label>
                      <input
                        type="text"
                        value={platform.code}
                        disabled
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Platform kodu değiştirilemez
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Platform Adı <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="Platform'un teknik adı"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Görünen Ad <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.display_name}
                        onChange={(e) => handleInputChange('display_name', e.target.value)}
                        placeholder="Kullanıcılara gösterilecek ad"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Açıklama
                      </label>
                      <textarea
                        value={formData.description || ""}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="Platform hakkında kısa açıklama"
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sıralama
                      </label>
                      <input
                        type="number"
                        value={(formData.theme_config as any)?.order || 0}
                        onChange={(e) => handleThemeConfigChange('order', parseInt(e.target.value) || 0)}
                        placeholder="0"
                        min="0"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Platformların görüntülenme sırası (küçükten büyüğe)
                      </p>
                    </div>

                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => handleInputChange('is_active', e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Platform aktif</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(formData.theme_config as any)?.underConstruction || false}
                          onChange={(e) => handleThemeConfigChange('underConstruction', e.target.checked)}
                          className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Yapım Aşamasında</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Database Configuration Tab */}
              {activeTab === 'database' && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-gray-600" />
                      <h2 className="text-xl font-semibold text-gray-900">Veritabanı Yapılandırması</h2>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {testing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Test Ediliyor...
                        </>
                      ) : (
                        <>
                          <TestTube className="h-4 w-4" />
                          Bağlantıyı Test Et
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Veritabanı Tipi
                      </label>
                      <select
                        value={formData.db_type}
                        onChange={(e) => handleInputChange('db_type', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="clickhouse">ClickHouse</option>
                        <option value="mssql">Microsoft SQL Server</option>
                        <option value="postgresql">PostgreSQL</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Host
                        </label>
                        <input
                          type="text"
                          value={(formData.db_config as any)?.host || ""}
                          onChange={(e) => handleDbConfigChange('host', e.target.value)}
                          placeholder="localhost"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Port
                        </label>
                        <input
                          type="number"
                          value={(formData.db_config as any)?.port || ""}
                          onChange={(e) => handleDbConfigChange('port', parseInt(e.target.value))}
                          placeholder="8123"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Veritabanı Adı
                      </label>
                      <input
                        type="text"
                        value={(formData.db_config as any)?.database || ""}
                        onChange={(e) => handleDbConfigChange('database', e.target.value)}
                        placeholder="database_name"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Kullanıcı Adı
                        </label>
                        <input
                          type="text"
                          value={(formData.db_config as any)?.user || ""}
                          onChange={(e) => handleDbConfigChange('user', e.target.value)}
                          placeholder="username"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Şifre
                        </label>
                        <input
                          type="password"
                          value={(formData.db_config as any)?.password || ""}
                          onChange={(e) => handleDbConfigChange('password', e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Features Configuration Tab */}
              {activeTab === 'features' && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Layout className="h-5 w-5 text-gray-600" />
                    <h2 className="text-xl font-semibold text-gray-900">Özellik Kartları</h2>
                  </div>

                  <div className="space-y-6">
                    {(formData.theme_config as any)?.features?.map((feature: any, index: number) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-medium text-gray-900">Kart {index + 1}</h3>
                          <button
                            type="button"
                            onClick={() => {
                              const newFeatures = [...(formData.theme_config as any)?.features || []];
                              newFeatures.splice(index, 1);
                              handleThemeConfigChange('features', newFeatures);
                            }}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Kaldır
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Başlık
                            </label>
                            <input
                              type="text"
                              value={feature.title}
                              onChange={(e) => {
                                const newFeatures = [...(formData.theme_config as any)?.features || []];
                                newFeatures[index].title = e.target.value;
                                handleThemeConfigChange('features', newFeatures);
                              }}
                              placeholder="Kart başlığı"
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Açıklama
                            </label>
                            <input
                              type="text"
                              value={feature.description}
                              onChange={(e) => {
                                const newFeatures = [...(formData.theme_config as any)?.features || []];
                                newFeatures[index].description = e.target.value;
                                handleThemeConfigChange('features', newFeatures);
                              }}
                              placeholder="Kart açıklaması"
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Görsel Tipi
                            </label>
                            <div className="flex gap-2 mb-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`visualType-${index}`}
                                  checked={!feature.useImage}
                                  onChange={() => {
                                    const newFeatures = [...(formData.theme_config as any)?.features || []];
                                    newFeatures[index].useImage = false;
                                    handleThemeConfigChange('features', newFeatures);
                                  }}
                                  className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm">İkon</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`visualType-${index}`}
                                  checked={feature.useImage}
                                  onChange={() => {
                                    const newFeatures = [...(formData.theme_config as any)?.features || []];
                                    newFeatures[index].useImage = true;
                                    handleThemeConfigChange('features', newFeatures);
                                  }}
                                  className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm">Resim</span>
                              </label>
                            </div>
                            
                            {!feature.useImage ? (
                              <select
                                value={feature.icon}
                                onChange={(e) => {
                                  const newFeatures = [...(formData.theme_config as any)?.features || []];
                                  newFeatures[index].icon = e.target.value;
                                  handleThemeConfigChange('features', newFeatures);
                                }}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                <option value="BarChart3">BarChart3</option>
                                <option value="TrendingUp">TrendingUp</option>
                                <option value="Gauge">Gauge</option>
                                <option value="Clock">Clock</option>
                                <option value="Activity">Activity</option>
                                <option value="Database">Database</option>
                                <option value="Users">Users</option>
                                <option value="Settings">Settings</option>
                                <option value="Calendar">Calendar</option>
                                <option value="FileText">FileText</option>
                                <option value="PieChart">PieChart</option>
                                <option value="Target">Target</option>
                                <option value="Monitor">Monitor</option>
                                <option value="Zap">Zap</option>
                                <option value="Shield">Shield</option>
                              </select>
                            ) : (
                              <div>
                                <input
                                  type="url"
                                  value={feature.imageUrl || ""}
                                  onChange={(e) => {
                                    const newFeatures = [...(formData.theme_config as any)?.features || []];
                                    newFeatures[index].imageUrl = e.target.value;
                                    handleThemeConfigChange('features', newFeatures);
                                  }}
                                  placeholder="https://example.com/image.png"
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                {feature.imageUrl && (
                                  <div className="mt-2">
                                    <p className="text-xs text-gray-500 mb-1">Önizleme:</p>
                                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
                                      <img
                                        src={feature.imageUrl}
                                        alt="Preview"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.style.display = 'none';
                                          const parent = target.parentElement;
                                          if (parent) {
                                            parent.innerHTML = '<div class="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">Resim yüklenemedi</div>';
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              URL (Opsiyonel)
                            </label>
                            <div className="flex gap-2">
                              <input
                                value={feature.url || ""}
                                onChange={(e) => {
                                  const newFeatures = [...(formData.theme_config as any)?.features || []];
                                  newFeatures[index].url = e.target.value;
                                  handleThemeConfigChange('features', newFeatures);
                                }}
                                placeholder="https://example.com"
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              {feature.url && (
                                <button
                                  type="button"
                                  onClick={() => openPermissionModal(index)}
                                  className={`p-2 rounded-lg border ${
                                    (feature.allowed_departments?.length > 0 || feature.allowed_users?.length > 0)
                                      ? 'bg-blue-50 border-blue-200 text-blue-600'
                                      : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                                  }`}
                                  title="Erişim Yetkileri"
                                >
                                  <Shield className="h-5 w-5" />
                                </button>
                              )}
                            </div>
                            {feature.url && (feature.allowed_departments?.length > 0 || feature.allowed_users?.length > 0) && (
                              <div className="mt-1 text-xs text-blue-600 flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                {feature.allowed_departments?.length || 0} departman, {feature.allowed_users?.length || 0} kullanıcı yetkili
                              </div>
                            )}
                          </div>

                          {!feature.useImage && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                İkon Rengi
                              </label>
                              <input
                                type="color"
                                value={feature.iconColor}
                                onChange={(e) => {
                                  const newFeatures = [...(formData.theme_config as any)?.features || []];
                                  newFeatures[index].iconColor = e.target.value;
                                  handleThemeConfigChange('features', newFeatures);
                                }}
                                className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Arka Plan Rengi
                            </label>
                            <input
                              type="color"
                              value={feature.backgroundColor}
                              onChange={(e) => {
                                const newFeatures = [...(formData.theme_config as any)?.features || []];
                                newFeatures[index].backgroundColor = e.target.value;
                                handleThemeConfigChange('features', newFeatures);
                              }}
                              className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        const newFeatures = [...(formData.theme_config as any)?.features || []];
                        newFeatures.push({
                          title: "Yeni Özellik",
                          description: "Özellik açıklaması",
                          icon: "Activity",
                          iconColor: "#3B82F6",
                          backgroundColor: "#EFF6FF",
                          imageUrl: "",
                          useImage: false,
                          url: ""
                        });
                        handleThemeConfigChange('features', newFeatures);
                      }}
                      className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
                    >
                      + Yeni Özellik Kartı Ekle
                    </button>
                  </div>
                </div>
              )}

              {/* Theme Configuration Tab */}
              {activeTab === 'theme' && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Palette className="h-5 w-5 text-gray-600" />
                    <h2 className="text-xl font-semibold text-gray-900">Tema Yapılandırması</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Logo URL
                      </label>
                      <input
                        type="url"
                        value={formData.logo_url || ""}
                        onChange={(e) => handleInputChange('logo_url', e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sol Logo URL (Ana Sayfada Gösterilir)
                      </label>
                      <input
                        type="url"
                        value={(formData.theme_config as any)?.leftLogo || ""}
                        onChange={(e) => handleThemeConfigChange('leftLogo', e.target.value)}
                        placeholder="https://example.com/left-logo.png"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Primary Color
                        </label>
                        <input
                          type="color"
                          value={(formData.theme_config as any)?.primaryColor || "#3B82F6"}
                          onChange={(e) => handleThemeConfigChange('primaryColor', e.target.value)}
                          className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Secondary Color
                        </label>
                        <input
                          type="color"
                          value={(formData.theme_config as any)?.secondaryColor || "#6366F1"}
                          onChange={(e) => handleThemeConfigChange('secondaryColor', e.target.value)}
                          className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Accent Color
                        </label>
                        <input
                          type="color"
                          value={(formData.theme_config as any)?.accentColor || "#8B5CF6"}
                          onChange={(e) => handleThemeConfigChange('accentColor', e.target.value)}
                          className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Header Color
                        </label>
                        <input
                          type="color"
                          value={(formData.theme_config as any)?.headerColor || "#1E40AF"}
                          onChange={(e) => handleThemeConfigChange('headerColor', e.target.value)}
                          className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Text Color (Platform Kartları İçin)
                      </label>
                      <input
                        type="color"
                        value={(formData.theme_config as any)?.textColor || "#374151"}
                        onChange={(e) => handleThemeConfigChange('textColor', e.target.value)}
                        className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Platform anasayfasındaki özellik kartlarının metin rengi
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Permissions Configuration Tab */}
              {activeTab === 'permissions' && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="h-5 w-5 text-gray-600" />
                    <h2 className="text-xl font-semibold text-gray-900">Yetkilendirme</h2>
                  </div>

                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Bu platforma erişebilecek departmanları ve kullanıcıları seçin. Hiçbir seçim yapılmazsa platform herkese açık olacaktır.
                    </p>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {formData.allowed_departments && formData.allowed_departments.length > 0 && (
                        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                          <Database className="h-4 w-4" />
                          <span>{formData.allowed_departments.length} Departman</span>
                        </div>
                      )}
                      {formData.allowed_users && formData.allowed_users.length > 0 && (
                        <div className="flex items-center gap-2 bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-sm">
                          <Users className="h-4 w-4" />
                          <span>{formData.allowed_users.length} Kullanıcı</span>
                        </div>
                      )}
                      {(!formData.allowed_departments?.length && !formData.allowed_users?.length) && (
                        <span className="text-sm text-gray-500 italic">Herkese açık</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => openPermissionModal(null)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm flex items-center gap-2"
                    >
                      <Shield className="h-4 w-4" />
                      Yetkileri Düzenle
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-4 justify-end">
                <button
                  type="button"
                  onClick={() => router.back()}
                  disabled={saving}
                  className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
                >
                  {saving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Save className="h-5 w-5" />
                      Değişiklikleri Kaydet
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Permission Modal */}
      <DepartmentSelectModal
        isOpen={showPermissionModal}
        onClose={() => {
          setShowPermissionModal(false);
          setFeaturePermissionIndex(null);
        }}
        onSave={handlePermissionSave}
        initialSelectedDepartments={getInitialDepartments()}
        initialSelectedUsers={getInitialUsers()}
      />
    </div>
  );
}