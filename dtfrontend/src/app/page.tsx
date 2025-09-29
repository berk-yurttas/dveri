"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  PieChart,
  Activity,
  TrendingUp,
  Users,
  Settings,
  Calendar,
  Clock,
  Database,
  FileText,
  MessageSquare,
  Bell,
  ShoppingCart,
  DollarSign,
  Globe,
  Zap,
  Shield,
  Monitor,
  Map as MapIcon,
  Camera,
  Music,
  Heart,
  Star,
  Target,
  Gauge,
  Cpu,
  Wifi,
  Battery,
  HardDrive,
  Smartphone,
  Plus,
  Layout,
  Eye,
  EyeOff,
  Edit,
  Trash2
} from "lucide-react";
import { dashboardService } from "@/services/dashboard";
import { reportsService } from "@/services/reports";
import { DashboardList } from "@/types/dashboard";
import { SavedReport } from "@/types/reports";
import { useUser } from "@/contexts/user-context";

// Icon mapping
const iconMap: { [key: string]: any } = {
  BarChart3,
  PieChart,
  Activity,
  TrendingUp,
  Users,
  Settings,
  Calendar,
  Clock,
  Database,
  FileText,
  MessageSquare,
  Bell,
  ShoppingCart,
  DollarSign,
  Globe,
  Zap,
  Shield,
  Monitor,
  Map: MapIcon,
  Camera,
  Music,
  Heart,
  Star,
  Target,
  Gauge,
  Cpu,
  Wifi,
  Battery,
  HardDrive,
  Smartphone,
  Plus,
  Layout
};

export default function Home() {
  const router = useRouter();
  const { user } = useUser();
  console.log("user", user);
  const hasDerinizAdmin = user?.role && Array.isArray(user.role) &&
    user.role.includes('deriniz:admin');
  const [dashboards, setDashboards] = useState<DashboardList[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardData, reportData] = await Promise.all([
          dashboardService.getDashboards(),
          reportsService.getReports(0, 3)
        ]);
        setDashboards(dashboardData);
        setReports(reportData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setError("Veriler yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCreateDashboard = () => {
    router.push("/dashboard/add");
  };

  const handleCreateReport = () => {
    router.push("/reports/add");
  };

  const handleDashboardClick = (id: number) => {
    router.push(`/dashboard/${id}`);
  };

  const handleReportClick = (id: number) => {
    router.push(`/reports/${id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Dashboard'lar yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
            <div
        className="fixed pointer-events-none z-10" 
        style={{
          width: '800px',
          height: '800px',
          backgroundImage: 'url(/deriniz-bg.png)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top left',
          opacity: 0.2,
          top: '-100px',
          left: '-250px',
        }}
      ></div>
          <div
        className="fixed pointer-events-none z-10" 
        style={{
          width: '800px',
          height: '800px',
          backgroundImage: 'url(/deriniz-bg.png)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top left',
          opacity: 0.2,
          bottom: '0',
          right: '-500px',
        }}
      ></div>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Hoş Geldiniz{user?.name ? `, ${user.name}` : ''}
          </h1>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Features Section */}
        <div className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Test Analizi</h4>
              <p className="text-sm text-gray-600">Test sonuçlarınızı detaylı olarak analiz edin ve raporlayın.</p>
            </div>

            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Verimlilik</h4>
              <p className="text-sm text-gray-600">Test süreçlerinizin verimliliğini takip edin.</p>
            </div>

            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Gauge className="h-6 w-6 text-purple-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Gerçek Zamanlı</h4>
              <p className="text-sm text-gray-600">Test verilerinizi gerçek zamanlı olarak izleyin.</p>
            </div>

            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Test Süresi</h4>
              <p className="text-sm text-gray-600">Test sürelerinizi optimize edin ve takip edin.</p>
            </div>
          </div>
        </div>

        {/* Dashboards Section */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <h3 className="text-xl font-semibold text-gray-900 mb-2 sm:mb-0">Oluşturduğum Ekranlar</h3>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
            >
              <Eye className="h-4 w-4" />
              Tüm Ekranlar
            </button>
          </div>
          <button
            onClick={handleCreateDashboard}
            className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors shadow-lg"
          >
            <Plus className="h-4 w-4" />
            Yeni Ekran
          </button>
        </div>

        {/* Dashboard Grid */}
        {dashboards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Sort dashboards: favorites first, then sort by creation date */}
            {[...dashboards]
              .sort((a, b) => {
                // First sort by favorite status
                if (a.is_favorite && !b.is_favorite) return -1;
                if (!a.is_favorite && b.is_favorite) return 1;
                // Then sort by creation date (newest first)
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })
              .slice(0, 3)
              .map((dashboard) => {
              const config = dashboard.layout_config || {};
              const IconComponent = iconMap[config.iconName] || Layout;
              
              return (
                <div
                  key={dashboard.id}
                  onClick={() => handleDashboardClick(dashboard.id)}
                  className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-xl transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg ${config.color || 'bg-gray-500'} text-white`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      {dashboard.is_favorite && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Star className="h-3 w-3 mr-1 fill-current" />
                          Favori
                        </span>
                      )}
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        dashboard.is_public 
                          ? "bg-blue-100 text-blue-800" 
                          : "bg-gray-100 text-gray-800"
                      }`}>
                        {dashboard.is_public ? (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            Herkese Açık
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3 mr-1" />
                            Özel
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {dashboard.title}
                  </h3>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Layout className="h-4 w-4" />
                      <span>{dashboard.widgets?.length || 0} Widget</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(dashboard.created_at).toLocaleDateString('tr-TR')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Layout className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz dashboard bulunmuyor</h3>
            <p className="text-gray-500 mb-6">İlk dashboard'ınızı oluşturmak için aşağıdaki butona tıklayın.</p>
            <button
              onClick={handleCreateDashboard}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              İlk Dashboard'ı Oluştur
            </button>
          </div>
        )}

        {/* Reports Section */}
        <div className="mt-16">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2 sm:mb-0">Oluşturduğum Raporlar</h3>
              <button
                onClick={() => router.push("/reports")}
                className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
              >
                <Eye className="h-4 w-4" />
                Tüm Raporlar
              </button>
            </div>
            {hasDerinizAdmin && (
              <button
                onClick={handleCreateReport}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors shadow-lg"
              >
                <Plus className="h-4 w-4" />
                Yeni Rapor
              </button>
            )}
          </div>

          {/* Reports Grid */}
          {reports.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => handleReportClick(report.id)}
                  className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-xl transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-lg bg-indigo-500 text-white">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        report.is_public 
                          ? "bg-blue-100 text-blue-800" 
                          : "bg-gray-100 text-gray-800"
                      }`}>
                        {report.is_public ? (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            Herkese Açık
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3 mr-1" />
                            Özel
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {report.name}
                  </h3>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Database className="h-4 w-4" />
                      <span>{report.queries?.length || 0} Sorgu</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(report.created_at).toLocaleDateString('tr-TR')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz rapor bulunmuyor</h3>
              <p className="text-gray-500 mb-6">İlk raporunuzu oluşturmak için aşağıdaki butona tıklayın.</p>
              {hasDerinizAdmin && (
                <button
                  onClick={handleCreateReport}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  İlk Raporu Oluştur
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
