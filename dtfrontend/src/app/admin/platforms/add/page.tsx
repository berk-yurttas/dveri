"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Database,
  Code,
  FileText,
  Globe,
  Palette,
  Layout,
  Image as ImageIcon
} from "lucide-react";
import { platformService } from "@/services/platform";
import { PlatformCreate, DatabaseType } from "@/types/platform";

export default function AddPlatformPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<PlatformCreate>({
    code: "",
    name: "",
    display_name: "",
    description: "",
    db_type: "clickhouse",
    db_config: {
      host: "",
      port: 8123,
      database: "",
      user: "",
      password: "",
      settings: {}
    },
    logo_url: "",
    theme_config: {
      primaryColor: "#3B82F6",
      secondaryColor: "#6366F1",
      accentColor: "#8B5CF6",
      headerColor: "#1E40AF",
      leftLogo: "",
      order: 0,
      underConstruction: false,
      features: [
        {
          title: "Test Analizi",
          description: "Test sonuçlarınızı detaylı olarak analiz edin ve raporlayın.",
          icon: "BarChart3",
          iconColor: "#3B82F6",
          backgroundColor: "#EFF6FF",
          imageUrl: "",
          useImage: false,
          url: ""
        },
        {
          title: "Verimlilik",
          description: "Test süreçlerinizin verimliliğini takip edin.",
          icon: "TrendingUp",
          iconColor: "#10B981",
          backgroundColor: "#ECFDF5",
          imageUrl: "",
          useImage: false,
          url: ""
        },
        {
          title: "Gerçek Zamanlı",
          description: "Test verilerinizi gerçek zamanlı olarak izleyin.",
          icon: "Gauge",
          iconColor: "#8B5CF6",
          backgroundColor: "#F3E8FF",
          imageUrl: "",
          useImage: false,
          url: ""
        },
        {
          title: "Test Süresi",
          description: "Test sürelerinizi optimize edin ve takip edin.",
          icon: "Clock",
          iconColor: "#F59E0B",
          backgroundColor: "#FFFBEB",
          imageUrl: "",
          useImage: false,
          url: ""
        }
      ]
    },
    is_active: true
  });

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
        ...prev.db_config,
        [field]: value
      }
    }));
  };

  const handleThemeConfigChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      theme_config: {
        ...prev.theme_config,
        [field]: value
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.code || !formData.name || !formData.display_name) {
        setError("Lütfen tüm zorunlu alanları doldurun");
        setLoading(false);
        return;
      }

      await platformService.createPlatform(formData);
      router.push('/admin/platforms');
    } catch (err: any) {
      console.error("Failed to create platform:", err);
      setError(err.message || "Platform oluşturulurken bir hata oluştu");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Geri Dön
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Yeni Platform Ekle</h1>
          <p className="text-gray-600">Sisteme yeni bir platform ekleyin</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">Temel Bilgiler</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Platform Kodu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => handleInputChange('code', e.target.value.toLowerCase())}
                  placeholder="ornek: deriniz, karel, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Sadece küçük harf ve tire kullanın (örn: deriniz, karel-test)
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

          {/* Database Configuration */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Database className="h-5 w-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">Veritabanı Yapılandırması</h2>
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

          {/* Features Configuration */}
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
                      <input
                        type="url"
                        value={feature.url || ""}
                        onChange={(e) => {
                          const newFeatures = [...(formData.theme_config as any)?.features || []];
                          newFeatures[index].url = e.target.value;
                          handleThemeConfigChange('features', newFeatures);
                        }}
                        placeholder="https://example.com"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
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

          {/* Theme Configuration */}
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
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading}
              className="px-6 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Oluşturuluyor...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Platform Oluştur
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

