"use client"

import { useState, useEffect, useLayoutEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  BarChart3,
  FileText,
  Plus,
  Layout,
  Eye,
  EyeOff,
  Calendar,
  Database,
  User,
  Star,
  TrendingUp,
  Activity
} from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { dashboardService } from "@/services/dashboard";
import { reportsService } from "@/services/reports";
import { DashboardList } from "@/types/dashboard";
import { SavedReport } from "@/types/reports";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { api } from "@/lib/api";
import { MirasAssistant } from "@/components/chatbot/miras-assistant";

interface PreviewResponse {
  data?: any[] | null;
}

// Icon mapping
const iconMap: { [key: string]: any } = {
  BarChart3,
  Activity,
  TrendingUp,
  Layout
};

export default function SubPlatformPage() {
  const router = useRouter();
  const params = useParams();
  const platformCode = params.platform as string;
  const subPlatformCode = params.subplatform as string;
  const { user } = useUser();
  const { platform: platformData, setPlatformByCode } = usePlatform();
  
  const hasDerinizAdmin = user?.role && Array.isArray(user.role) &&
    user.role.includes('deriniz:admin');
  
  const [dashboards, setDashboards] = useState<DashboardList[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [rawMachineData, setRawMachineData] = useState<any[]>([]); // Store raw machine data for verimlilik
  const [rawVerimlilikData, setRawVerimlilikData] = useState<any[]>([]); // Store all time-series data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFirma, setSelectedFirma] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [firmaOptions, setFirmaOptions] = useState<string[]>([]);
  const [machineOptions, setMachineOptions] = useState<string[]>([]);
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false);
  const [verimlilikStartDate, setVerimlilikStartDate] = useState<string>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return start.toISOString().split('T')[0];
  });
  const [verimlilikEndDate, setVerimlilikEndDate] = useState<string>(() => {
    const end = new Date();
    return end.toISOString().split('T')[0];
  });

  // Kapasite subplatform filters
  const [selectedKapasitePeriod, setSelectedKapasitePeriod] = useState<'weekly' | 'monthly' | 'day60' | 'day90'>('monthly');
  const [showKapasitePeriodDropdown, setShowKapasitePeriodDropdown] = useState(false);
  const [selectedKapasiteDataType, setSelectedKapasiteDataType] = useState<'mekanik' | 'kablaj'>('mekanik');
  const [mekanikKapasiteData, setMekanikKapasiteData] = useState<any[]>([]);
  const [kablajKapasiteData, setKablajKapasiteData] = useState<any[]>([]);

  // Idari subplatform filters
  const [selectedIdariDepartman, setSelectedIdariDepartman] = useState<string | null>(null);
  const [departmanOptions, setDepartmanOptions] = useState<string[]>([]);
  const [showDepartmanDropdown, setShowDepartmanDropdown] = useState(false);

  // Use useLayoutEffect to set platform BEFORE any effects run
  useLayoutEffect(() => {
    if (platformCode) {
      console.log('[SubPlatform Page] Setting platform in context:', platformCode);
      setPlatformByCode(platformCode);
      api.clearCache();
    }
  }, [platformCode, setPlatformByCode]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('[SubPlatform Page] Fetching data for:', platformCode, subPlatformCode);
        
        const [dashboardData, reportData] = await Promise.all([
          dashboardService.getDashboards(),
          reportsService.getReports(0, 100)
        ]);
        console.log(reportData)
        // Filter by subplatform tags
        const filteredDashboards = dashboardData.filter(d =>
          d.tags && d.tags.includes(subPlatformCode)
        );
        const filteredReports = reportData.filter(r =>
          r.tags && r.tags.includes(subPlatformCode)
        );

        setDashboards(filteredDashboards);
        setReports(filteredReports);

        // Fetch real chart data for kapasite subplatform
        if (subPlatformCode === 'kapasite') {
          try {
            const [mekanikResponse, kablajResponse] = await Promise.all([
              api.post<PreviewResponse>('/reports/preview', {
                sql_query: 'SELECT "Firma Adı", "Haftalık Planlanan Doluluk Oranı", "Aylık Planlanan Doluluk Oranı", 0 as "60 Günlük Planlanan Doluluk Oranı", 0 as "90 Günlük Planlanan Doluluk Oranı" FROM mes_production.get_firma_makina_planlanan_doluluk'
              }),
              api.post<PreviewResponse>('/reports/preview', {
                sql_query: 'SELECT "Firma Adı", "7 Günlük Doluluk", "30 Günlük Doluluk", "60 Günlük Doluluk", "90 Günlük Doluluk" FROM mes_production.kablaj_firma_doluluk_bitmeyen_siparis_sayilari'
              })
            ]);

            // Store mekanik data
            if (mekanikResponse?.data && Array.isArray(mekanikResponse.data)) {
              const transformedMekanik = mekanikResponse.data.map((row: any[]) => ({
                name: row[0], // Firma Adı
                weekly: parseFloat(row[1]) || 0,
                monthly: parseFloat(row[2]) || 0,
                day60: parseFloat(row[3]) || 0,
                day90: parseFloat(row[4]) || 0
              }));
              setMekanikKapasiteData(transformedMekanik);
            }

            // Store kablaj data
            if (kablajResponse?.data && Array.isArray(kablajResponse.data)) {
              const transformedKablaj = kablajResponse.data.map((row: any[]) => ({
                name: row[0], // Firma Adı
                day7: parseFloat(row[1]) || 0,
                day30: parseFloat(row[2]) || 0,
                day60: parseFloat(row[3]) || 0,
                day90: parseFloat(row[4]) || 0
              }));
              setKablajKapasiteData(transformedKablaj);
            }

            // Set initial chart data based on selected type
            const initialData = selectedKapasiteDataType === 'mekanik' ? mekanikKapasiteData : kablajKapasiteData;
            if (initialData.length === 0 && mekanikResponse?.data) {
              // Use mekanik data for initial render
              const transformedMekanik = mekanikResponse.data.map((row: any[]) => ({
                name: row[0],
                weekly: parseFloat(row[1]) || 0,
                monthly: parseFloat(row[2]) || 0,
                day60: parseFloat(row[3]) || 0,
                day90: parseFloat(row[4]) || 0,
                value: selectedKapasitePeriod === 'weekly' ? (parseFloat(row[1]) || 0) :
                       selectedKapasitePeriod === 'monthly' ? (parseFloat(row[2]) || 0) :
                       selectedKapasitePeriod === 'day60' ? (parseFloat(row[3]) || 0) : (parseFloat(row[4]) || 0)
              }));
              setChartData(transformedMekanik);
            }
          } catch (chartError) {
            console.error("Failed to fetch chart data:", chartError);
            setChartData([]);
          }
        } else if (subPlatformCode === 'verimlilik') {
          // Fetch time-series data from tarih_bazli_oee table
          try {
            const chartResponse = await api.post<PreviewResponse>('/reports/preview', {
              sql_query: 'SELECT "Firma Adı", "Makina Kodu", "Üretim Tarihi", "OEE" FROM mes_production.tarih_bazli_oee ORDER BY "Üretim Tarihi" DESC'
            });

            if (chartResponse?.data && Array.isArray(chartResponse.data)) {
              const transformedData = chartResponse.data.map((row: any[]) => ({
                firma: row[0],
                machinecode: row[1],
                date: row[2],
                oee: (parseFloat(row[3]) || 0) * 100
              }));
              setRawVerimlilikData(transformedData);

              // Extract unique firma options
              const uniqueFirmas = Array.from(new Set(transformedData.map((item: any) => item.firma))).sort() as string[];
              setFirmaOptions(uniqueFirmas);

              // Calculate average OEE per firma
              const firmaAverages = uniqueFirmas.map(firma => {
                const firmaData = transformedData.filter((item: any) => item.firma === firma);
                const avgOee = firmaData.reduce((sum: number, item: any) => sum + item.oee, 0) / firmaData.length;
                return {
                  name: firma,
                  firma: firma,
                  value: avgOee
                };
              });

              setChartData(firmaAverages);
            } else {
              setChartData([]);
              setRawVerimlilikData([]);
            }
          } catch (chartError) {
            console.error("Failed to fetch chart data:", chartError);
            setChartData([]);
            setRawVerimlilikData([]);
          }
        } else if (subPlatformCode === 'idari') {
          // Fetch real chart data for idari subplatform
          try {
            const chartResponse = await api.post<PreviewResponse>('/reports/preview', {
              sql_query: 'SELECT "Firma", "Departman", "Toplam Çalışan Sayısı" FROM mes_production.get_firma_departman_bazli_calisan_sayisi ORDER BY "Firma", "Toplam Çalışan Sayısı" DESC'
            });

            if (chartResponse?.data && Array.isArray(chartResponse.data)) {
              const transformedData = chartResponse.data.map((row: any[]) => ({
                name: `${row[0]} - ${row[1]}`, // Firma - Departman
                firma: row[0], // Firma
                departman: row[1], // Departman
                value: Number(row[2]) || 0 // Toplam Çalışan Sayısı
              }));
              setChartData(transformedData);

              // Extract unique firma and department options
              const uniqueFirmas = Array.from(new Set(chartResponse.data.map((row: any[]) => row[0]))).sort() as string[];
              const uniqueDepartments = Array.from(new Set(chartResponse.data.map((row: any[]) => row[1]))).sort() as string[];
              setFirmaOptions(uniqueFirmas);
              setDepartmanOptions(uniqueDepartments);
            } else {
              setChartData([]);
            }
          } catch (chartError) {
            console.error("Failed to fetch chart data:", chartError);
            setChartData([]);
          }
        } else {
          // Generate sample chart data for other subplatforms
          const sampleChartData = [
            { name: 'Ocak', dashboards: filteredDashboards.length > 0 ? 4 : 0, reports: filteredReports.length > 0 ? 2 : 0 },
            { name: 'Şubat', dashboards: filteredDashboards.length > 0 ? 3 : 0, reports: filteredReports.length > 0 ? 1 : 0 },
            { name: 'Mart', dashboards: filteredDashboards.length > 0 ? 5 : 0, reports: filteredReports.length > 0 ? 3 : 0 },
            { name: 'Nisan', dashboards: filteredDashboards.length > 0 ? 6 : 0, reports: filteredReports.length > 0 ? 4 : 0 },
            { name: 'Mayıs', dashboards: filteredDashboards.length > 0 ? 4 : 0, reports: filteredReports.length > 0 ? 2 : 0 },
            { name: 'Haziran', dashboards: filteredDashboards.length, reports: filteredReports.length },
          ];
          setChartData(sampleChartData);
        }
        
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setError("Veriler yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [platformCode, subPlatformCode]);

  // Update chart data when period or data type selection changes for kapasite
  useEffect(() => {
    if (subPlatformCode === 'kapasite') {
      const sourceData = selectedKapasiteDataType === 'mekanik' ? mekanikKapasiteData : kablajKapasiteData;

      if (sourceData.length > 0) {
        if (selectedKapasiteDataType === 'mekanik') {
          const updatedData = sourceData.map(item => ({
            ...item,
            value: selectedKapasitePeriod === 'weekly' ? item.weekly :
                   selectedKapasitePeriod === 'monthly' ? item.monthly :
                   selectedKapasitePeriod === 'day60' ? item.day60 : item.day90
          }));
          setChartData(updatedData);
        } else {
          // Kablaj data - map periods differently
          const updatedData = sourceData.map(item => ({
            ...item,
            value: selectedKapasitePeriod === 'weekly' ? item.day7 :
                   selectedKapasitePeriod === 'monthly' ? item.day30 :
                   selectedKapasitePeriod === 'day60' ? item.day60 : item.day90
          }));
          setChartData(updatedData);
        }
      }
    }
  }, [selectedKapasitePeriod, selectedKapasiteDataType, mekanikKapasiteData, kablajKapasiteData, subPlatformCode]);

  // Clear machine selection when firma changes for verimlilik
  useEffect(() => {
    if (subPlatformCode === 'verimlilik' && selectedFirma) {
      setSelectedMachine(null);
    }
  }, [selectedFirma, subPlatformCode]);

  // Fetch verimlilik data when filters change
  useEffect(() => {
    const fetchVerimlilikData = async () => {
      if (subPlatformCode === 'verimlilik') {
        try {
          // Build SQL query with date filter
          let sqlQuery = `SELECT "Firma Adı", "Makina Kodu", "Üretim Tarihi", "OEE" FROM mes_production.tarih_bazli_oee WHERE DATE("Üretim Tarihi") BETWEEN DATE('${verimlilikStartDate}') AND DATE('${verimlilikEndDate}') ORDER BY "Üretim Tarihi" DESC`;

          const chartResponse = await api.post<PreviewResponse>('/reports/preview', {
            sql_query: sqlQuery
          });

          if (chartResponse?.data && Array.isArray(chartResponse.data)) {
            const transformedData = chartResponse.data.map((row: any[]) => ({
              firma: row[0],
              machinecode: row[1],
              date: row[2],
              oee: (parseFloat(row[3]) || 0) * 100
            }));
            setRawVerimlilikData(transformedData);

            // Extract unique firma options
            const uniqueFirmas = Array.from(new Set(transformedData.map((item: any) => item.firma))).sort() as string[];
            setFirmaOptions(uniqueFirmas);

            if (selectedMachine && selectedFirma) {
              // Time-series view: show daily OEE for specific machine
              const machineData = transformedData
                .filter((item: any) => item.firma === selectedFirma && item.machinecode === selectedMachine)
                .map((item: any) => ({
                  date: item.date,
                  OEE: item.oee
                }))
                .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
              setChartData(machineData);
            } else if (selectedFirma) {
              // Machine averages view: show average OEE per machine for selected firma
              const firmaData = transformedData.filter((item: any) => item.firma === selectedFirma);
              const machines = Array.from(new Set(firmaData.map((item: any) => item.machinecode)));
              setMachineOptions(machines as string[]);

              const machineAverages = machines.map(machine => {
                const machineData = firmaData.filter((item: any) => item.machinecode === machine);
                const avgOee = machineData.reduce((sum: number, item: any) => sum + item.oee, 0) / machineData.length;
                return {
                  name: machine,
                  machinecode: machine,
                  firma: selectedFirma,
                  value: avgOee
                };
              });
              setChartData(machineAverages);
            } else {
              // Firma averages view: show average OEE per firma
              const firmaAverages = uniqueFirmas.map(firma => {
                const firmaData = transformedData.filter((item: any) => item.firma === firma);
                const avgOee = firmaData.reduce((sum: number, item: any) => sum + item.oee, 0) / firmaData.length;
                return {
                  name: firma,
                  firma: firma,
                  value: avgOee
                };
              });
              setChartData(firmaAverages);
            }
          } else {
            setChartData([]);
            setRawVerimlilikData([]);
          }
        } catch (error) {
          console.error("Failed to fetch verimlilik data:", error);
          setChartData([]);
          setRawVerimlilikData([]);
        }
      }
    };

    fetchVerimlilikData();
  }, [subPlatformCode, selectedFirma, selectedMachine, verimlilikStartDate, verimlilikEndDate]);

  const handleCreateDashboard = () => {
    router.push(`/${platformCode}/dashboard/add?subplatform=${subPlatformCode}`);
  };

  const handleCreateReport = () => {
    router.push(`/${platformCode}/reports/add?subplatform=${subPlatformCode}`);
  };

  const handleDashboardClick = (id: number) => {
    router.push(`/${platformCode}/dashboard/${id}?subplatform=${subPlatformCode}`);
  };

  const handleReportClick = (id: number) => {
    router.push(`/${platformCode}/reports/${id}?subplatform=${subPlatformCode}`);
  };

  // Handle bar click for verimlilik chart
  const handleBarClick = (data: any) => {
    if (subPlatformCode === 'verimlilik') {
      if (!selectedFirma && data.firma) {
        // Click on firma bar -> show machines for that firma
        setSelectedFirma(data.firma);
      } else if (selectedFirma && !selectedMachine && data.machinecode) {
        // Click on machine bar -> show time-series for that machine
        setSelectedMachine(data.machinecode);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <img 
            src="/ivme-aselsan.png" 
            alt="IVME ASELSAN" 
            className="w-48 h-auto"
            style={{
              animation: 'scaleUpDownFade 1.5s ease-in-out infinite'
            }}
          />
          <style jsx>{`
            @keyframes scaleUpDownFade {
              0%, 100% {
                transform: scale(1);
                opacity: 0.3;
              }
              50% {
                transform: scale(1.1);
                opacity: 1;
              }
            }
          `}</style>
          <div className="text-lg font-medium text-gray-700">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'rgb(69, 81, 89)' }}>{subPlatformCode.charAt(0).toUpperCase() + subPlatformCode.slice(1)}</h1>
        </div>

        {/* Chart Section - Kapasite */}
        {subPlatformCode === 'kapasite' && (
          <div className="mb-12">
            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-blue-500 text-white">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold" style={{ color: 'rgb(69, 81, 89)' }}>Talaşlı İmalat: Firma Bazlı Kapasite Değerleri</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Data Type Toggle */}
                  {/* <div className="flex border border-gray-300 rounded overflow-hidden">
                    <button
                      onClick={() => setSelectedKapasiteDataType('mekanik')}
                      className={`px-3 py-1.5 text-sm ${selectedKapasiteDataType === 'mekanik' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      Mekanik
                    </button>
                    <button
                      onClick={() => setSelectedKapasiteDataType('kablaj')}
                      className={`px-3 py-1.5 text-sm ${selectedKapasiteDataType === 'kablaj' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      Kablaj
                    </button>
                  </div> */}
                  {/* Period Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowKapasitePeriodDropdown(!showKapasitePeriodDropdown)}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px] text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <span className="truncate">
                        {selectedKapasitePeriod === 'weekly' ? 'Haftalık' :
                         selectedKapasitePeriod === 'monthly' ? 'Aylık':
                         selectedKapasitePeriod === 'day60' ? '60 Gün' : '90 Gün'}
                      </span>
                      <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showKapasitePeriodDropdown && (
                      <div className="absolute z-10 mt-2 w-40 bg-white border border-gray-300 rounded-lg shadow-lg right-0">
                        <div
                          onClick={() => {
                            setSelectedKapasitePeriod('weekly');
                            setShowKapasitePeriodDropdown(false);
                          }}
                          className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedKapasitePeriod === 'weekly' ? 'bg-blue-100 font-medium' : ''}`}
                        >
                          {selectedKapasiteDataType === 'kablaj' ? '7 Gün' : 'Haftalık'}
                        </div>
                        <div
                          onClick={() => {
                            setSelectedKapasitePeriod('monthly');
                            setShowKapasitePeriodDropdown(false);
                          }}
                          className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedKapasitePeriod === 'monthly' ? 'bg-blue-100 font-medium' : ''}`}
                        >
                          {selectedKapasiteDataType === 'kablaj' ? '30 Gün' : 'Aylık'}
                        </div>
                        <div
                          onClick={() => {
                            setSelectedKapasitePeriod('day60');
                            setShowKapasitePeriodDropdown(false);
                          }}
                          className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedKapasitePeriod === 'day60' ? 'bg-blue-100 font-medium' : ''}`}
                        >
                          60 Gün
                        </div>
                        <div
                          onClick={() => {
                            setSelectedKapasitePeriod('day90');
                            setShowKapasitePeriodDropdown(false);
                          }}
                          className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedKapasitePeriod === 'day90' ? 'bg-blue-100 font-medium' : ''}`}
                        >
                          90 Gün
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    {[0,1,2,3,4,5,6,7].map(i => (
                      <linearGradient key={i} id={`colorBar${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'][i]} stopOpacity={0.9}/>
                        <stop offset="100%" stopColor={['#1d4ed8','#6d28d9','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d'][i]} stopOpacity={0.9}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: '13px', fontWeight: 500 }} tickLine={false} />
                  <YAxis stroke="#6b7280" style={{ fontSize: '13px', fontWeight: 500 }} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                  <Bar dataKey="value" name="Doluluk Oranı (%)" radius={[8, 8, 0, 0]} maxBarSize={60}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`url(#colorBar${index % 8})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Chart Section - Verimlilik */}
        {subPlatformCode === 'verimlilik' && (
          <div className="mb-12">
            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-blue-500 text-white">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold" style={{ color: 'rgb(69, 81, 89)' }}>
                      {!selectedFirma ? 'Talaşlı İmalat: Firma Bazlı OEE Değerleri' :
                       !selectedMachine ? `${selectedFirma} - Makine OEE Ortalamaları` :
                       `${selectedFirma} - ${selectedMachine} OEE Trendi`}
                    </h2>
                    {selectedFirma && (
                      <button
                        onClick={() => {
                          if (selectedMachine) {
                            setSelectedMachine(null);
                          } else {
                            setSelectedFirma(null);
                          }
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800 mt-1"
                      >
                        ← Geri
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {/* Date Range Filters */}
                  <input
                    type="date"
                    value={verimlilikStartDate}
                    onChange={(e) => setVerimlilikStartDate(e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="date"
                    value={verimlilikEndDate}
                    onChange={(e) => setVerimlilikEndDate(e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <ResponsiveContainer width="100%" height={400}>
                {selectedFirma && selectedMachine ? (
                  // Line chart for time-series when both firma and machine are selected
                  <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <defs>
                      <linearGradient id="colorVerimlilikOee" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      stroke="#6b7280"
                      style={{ fontSize: '11px', fontWeight: 500 }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#6b7280"
                      style={{ fontSize: '13px', fontWeight: 500 }}
                      tickLine={false}
                      label={{ value: 'OEE (%)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '12px',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        padding: '12px'
                      }}
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                    />
                    <Line
                      type="monotone"
                      dataKey="OEE"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#8b5cf6' }}
                      activeDot={{ r: 6 }}
                      fill="url(#colorVerimlilikOee)"
                    />
                  </LineChart>
                ) : (
                  // Bar chart for aggregated views
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                    onClick={(data) => {
                      if (data && data.activePayload && data.activePayload[0]) {
                        handleBarClick(data.activePayload[0].payload);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <defs>
                      {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19].map(i => (
                        <linearGradient key={i} id={`colorOee${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16','#6366f1','#f43f5e','#14b8a6','#a855f7','#f97316','#22c55e','#eab308','#d946ef','#0ea5e9','#facc15','#fb923c','#a3e635'][i]} stopOpacity={0.9}/>
                          <stop offset="100%" stopColor={['#1d4ed8','#6d28d9','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d','#4f46e5','#e11d48','#0d9488','#9333ea','#ea580c','#16a34a','#ca8a04','#c026d3','#0284c7','#eab308','#f97316','#84cc16'][i]} stopOpacity={0.9}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="name"
                      stroke="#6b7280"
                      style={{ fontSize: '13px', fontWeight: 500 }}
                      tickLine={false}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      stroke="#6b7280"
                      style={{ fontSize: '13px', fontWeight: 500 }}
                      tickLine={false}
                      label={{ value: 'OEE (%)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '12px',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        padding: '12px'
                      }}
                      cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                      labelFormatter={(label: string) => {
                        if (!selectedFirma) {
                          return `${label} (Tıklayın - Makineleri Görün)`;
                        } else {
                          return `${label} (Tıklayın - Trend Görün)`;
                        }
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                    <Bar dataKey="value" name="Ortalama OEE (%)" radius={[8, 8, 0, 0]} maxBarSize={60}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#colorOee${index % 20})`} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Chart Section - Idari */}
        {subPlatformCode === 'idari' && (
          <div className="mb-12">
            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-blue-500 text-white">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold" style={{ color: 'rgb(69, 81, 89)' }}>Firma ve Departman Bazlı Çalışan Sayıları</h2>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Firma Filter */}
                  {firmaOptions.length > 0 && (
                    <div className="relative">
                      <button 
                        onClick={() => {
                          setShowFirmaDropdown(!showFirmaDropdown)
                          setShowDepartmanDropdown(false)
                        }} 
                        className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[160px] text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <span className="truncate">{selectedFirma || 'Tüm Firmalar'}</span>
                        <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showFirmaDropdown && (
                        <div className="absolute z-10 mt-2 w-48 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                          <div 
                            onClick={() => { 
                              setSelectedFirma(null); 
                              setSelectedIdariDepartman(null);
                              setShowFirmaDropdown(false); 
                            }} 
                            className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer font-medium"
                          >
                            Tüm Firmalar
                          </div>
                          {firmaOptions.map((firma) => (
                            <div 
                              key={firma} 
                              onClick={() => { 
                                setSelectedFirma(firma); 
                                setSelectedIdariDepartman(null);
                                setShowFirmaDropdown(false); 
                              }} 
                              className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedFirma === firma ? 'bg-blue-100 font-medium' : ''}`}
                            >
                              {firma}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Department Filter */}
                  {departmanOptions.length > 0 && (
                    <div className="relative">
                      <button 
                        onClick={() => {
                          setShowDepartmanDropdown(!showDepartmanDropdown)
                          setShowFirmaDropdown(false)
                        }} 
                        className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[160px] text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <span className="truncate">{selectedIdariDepartman || 'Tüm Departmanlar'}</span>
                        <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showDepartmanDropdown && (
                        <div className="absolute z-10 mt-2 w-48 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                          <div 
                            onClick={() => { 
                              setSelectedIdariDepartman(null); 
                              setShowDepartmanDropdown(false); 
                            }} 
                            className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer font-medium"
                          >
                            Tüm Departmanlar
                          </div>
                          {departmanOptions
                            .filter(dept => {
                              // If a firma is selected, only show departments from that firma
                              if (selectedFirma) {
                                return chartData.some(item => 
                                  item.firma === selectedFirma && item.departman === dept
                                )
                              }
                              return true
                            })
                            .map((departman) => (
                              <div 
                                key={departman} 
                                onClick={() => { 
                                  setSelectedIdariDepartman(departman); 
                                  setShowDepartmanDropdown(false); 
                                }} 
                                className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedIdariDepartman === departman ? 'bg-blue-100 font-medium' : ''}`}
                              >
                                {departman}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={400}>
                <BarChart 
                  data={chartData.filter(item => {
                    const firmaMatch = !selectedFirma || item.firma === selectedFirma
                    const departmanMatch = !selectedIdariDepartman || item.departman === selectedIdariDepartman
                    return firmaMatch && departmanMatch
                  })} 
                  margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                >
                  <defs>
                    {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19].map(i => (
                      <linearGradient key={i} id={`colorIdari${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16','#6366f1','#f43f5e','#14b8a6','#a855f7','#f97316','#22c55e','#eab308','#d946ef','#0ea5e9','#facc15','#fb923c','#a3e635'][i]} stopOpacity={0.9}/>
                        <stop offset="100%" stopColor={['#1d4ed8','#6d28d9','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d','#4f46e5','#e11d48','#0d9488','#9333ea','#ea580c','#16a34a','#ca8a04','#c026d3','#0284c7','#eab308','#f97316','#84cc16'][i]} stopOpacity={0.9}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey={selectedFirma ? "departman" : "name"}
                    stroke="#6b7280" 
                    style={{ fontSize: '12px', fontWeight: 500 }} 
                    tickLine={false} 
                    angle={-45} 
                    textAnchor="end" 
                    height={100} 
                  />
                  <YAxis 
                    stroke="#6b7280" 
                    style={{ fontSize: '13px', fontWeight: 500 }} 
                    tickLine={false}
                    label={{ value: 'Çalışan Sayısı', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '12px', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                      padding: '12px' 
                    }} 
                    cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                    formatter={(value: number) => [`${value} Çalışan`, 'Toplam']}
                    labelFormatter={(label: string, payload: any[]) => {
                      if (payload && payload.length > 0) {
                        return `${payload[0].payload.firma} - ${payload[0].payload.departman}`
                      }
                      return label
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                  <Bar 
                    dataKey="value" 
                    name="Çalışan Sayısı" 
                    radius={[8, 8, 0, 0]} 
                    maxBarSize={60}
                  >
                    {chartData
                      .filter(item => {
                        const firmaMatch = !selectedFirma || item.firma === selectedFirma
                        const departmanMatch = !selectedIdariDepartman || item.departman === selectedIdariDepartman
                        return firmaMatch && departmanMatch
                      })
                      .map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#colorIdari${index % 20})`} />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Chart Section - Other Subplatforms */}
        {subPlatformCode !== 'kapasite' && subPlatformCode !== 'verimlilik' && subPlatformCode !== 'idari' && (
          <div className="mb-12">
            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-blue-500 text-white"><BarChart3 className="h-6 w-6" /></div>
                  <div><h2 className="text-xl font-semibold" style={{ color: 'rgb(69, 81, 89)' }}>İstatistikler</h2></div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorBar0" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9}/><stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.9}/></linearGradient>
                    <linearGradient id="colorBar1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/><stop offset="100%" stopColor="#6d28d9" stopOpacity={0.9}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: '13px', fontWeight: 500 }} tickLine={false} />
                  <YAxis stroke="#6b7280" style={{ fontSize: '13px', fontWeight: 500 }} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                  <Bar dataKey="dashboards" fill="url(#colorBar0)" name="Ekranlar" radius={[8, 8, 0, 0]} maxBarSize={50} />
                  <Bar dataKey="reports" fill="url(#colorBar1)" name="Raporlar" radius={[8, 8, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Dashboards Section */}
        <div className="mb-12">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center">
              <h3 className="text-xl font-semibold" style={{ color: 'rgb(69, 81, 89)' }}>Ekranlarım</h3>
              {dashboards.length > 3 && (
                <button
                  onClick={() => router.push(`/${platformCode}/dashboard?subplatform=${subPlatformCode}`)}
                  className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
                >
                  <Eye className="h-4 w-4" />
                  Tüm Ekranlar ({dashboards.length})
                </button>
              )}
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
              {[...dashboards]
                .sort((a, b) => {
                  if (a.is_favorite && !b.is_favorite) return -1;
                  if (!a.is_favorite && b.is_favorite) return 1;
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
                      className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-2xl transition-all cursor-pointer group"
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
            <div className="text-center py-12 bg-white rounded-lg shadow-xl shadow-slate-200">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Layout className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz ekran bulunmuyor</h3>
              <p className="text-gray-500 mb-6">
                {subPlatformCode.charAt(0).toUpperCase() + subPlatformCode.slice(1)} platformu için ilk ekranınızı oluşturun.
              </p>
              <button
                onClick={handleCreateDashboard}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
                İlk Ekranı Oluştur
              </button>
            </div>
          )}
        </div>

        {/* Reports Section */}
        <div>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center">
              <h3 className="text-xl font-semibold" style={{ color: 'rgb(69, 81, 89)' }}>Raporlarım</h3>
              {reports.length > 3 && (
                <button
                  onClick={() => router.push(`/${platformCode}/reports?subplatform=${subPlatformCode}`)}
                  className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
                >
                  <Eye className="h-4 w-4" />
                  Tüm Raporlar ({reports.length})
                </button>
              )}
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
              {reports.slice(0, 3).map((report) => (
                <div
                  key={report.id}
                  onClick={() => handleReportClick(report.id)}
                  className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-2xl transition-all cursor-pointer group"
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
                  
                  <h3 className="text-base font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {report.name}
                  </h3>
                  
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      <span>{report.queries?.length || 0} Sorgu</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(report.created_at).toLocaleDateString('tr-TR')}</span>
                    </div>
                    {report.owner_name && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span className="max-w-[300px] truncate">{report.owner_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg shadow-xl shadow-slate-200">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz rapor bulunmuyor</h3>
              <p className="text-gray-500 mb-6">
                {subPlatformCode.charAt(0).toUpperCase() + subPlatformCode.slice(1)} platformu için ilk raporunuzu oluşturun.
              </p>
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

      {/* MIRAS Assistant Chatbot */}
      <MirasAssistant />
    </div>
  );
}

