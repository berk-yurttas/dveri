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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { dashboardService } from "@/services/dashboard";
import { reportsService } from "@/services/reports";
import { DashboardList } from "@/types/dashboard";
import { SavedReport } from "@/types/reports";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { api } from "@/lib/api";
import { MirasAssistant } from "@/components/chatbot/miras-assistant";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFirma, setSelectedFirma] = useState<string | null>(null);
  const [firmaOptions, setFirmaOptions] = useState<string[]>([]);
  const [showFirmaDropdown, setShowFirmaDropdown] = useState(false);
  const [selectedDayRange, setSelectedDayRange] = useState<'day7' | 'day30' | 'day60' | 'day90'>('day7');
  const [showDayDropdown, setShowDayDropdown] = useState(false);
  
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
1
        setDashboards(filteredDashboards);
        setReports(filteredReports);

        // Fetch real chart data for kapasite subplatform
        if (subPlatformCode === 'kapasite') {
          try {
            const chartResponse: any = await api.post('/reports/preview', {
              sql_query: 'SELECT "Firma Adı", "Aylık Planlanan Doluluk Oranı" FROM mes_production.get_firma_makina_planlanan_doluluk'
            });

            if (chartResponse && chartResponse.data && Array.isArray(chartResponse.data)) {
              const transformedData = chartResponse.data.map((row: any[]) => ({
                name: row[0], // Firma Adı
                value: parseFloat(row[1]) // Aylık Planlanan Doluluk Oranı
              }));
              setChartData(transformedData);
            } else {
              setChartData([]);
            }
          } catch (chartError) {
            console.error("Failed to fetch chart data:", chartError);
            setChartData([]);
          }
        } else if (subPlatformCode === 'verimlilik') {
          // Fetch real chart data for verimlilik subplatform
          try {
            const chartResponse: any = await api.post('/reports/preview', {
              sql_query: 'SELECT "NAME", "MachineCode", "AVG_OEE_7_Days", "AVG_OEE_30_Days", "AVG_OEE_60_Days", "AVG_OEE_90_Days" FROM mes_production.mes_production_firma_tezgah_oee'
            });

            if (chartResponse && chartResponse.data && Array.isArray(chartResponse.data)) {
              console.log('Verimlilik raw data:', chartResponse.data);

              // Extract unique firma options
              const uniqueFirmas = Array.from(new Set(chartResponse.data.map((row: any[]) => row[0]))).sort() as string[];
              setFirmaOptions(uniqueFirmas);

              const transformedData = chartResponse.data.map((row: any[]) => {
                const item = {
                  firma: row[0], // NAME
                  machinecode: row[1], // MachineCode
                  name: `${row[0]} - ${row[1]}`, // Combined name for display
                  displayName: String(row[1] || ''), // MachineCode only for filtered view
                  day7: parseFloat(row[2]) || 0,
                  day30: parseFloat(row[3]) || 0,
                  day60: parseFloat(row[4]) || 0,
                  day90: parseFloat(row[5]) || 0
                };
                console.log('Transformed item:', item);
                return item;
              });
              console.log('Final transformed data:', transformedData);
              
              // Store raw machine data
              setRawMachineData(transformedData);
              
              // Calculate average values per company for initial view
              const firmaAverages = uniqueFirmas.map(firma => {
                const firmaData = transformedData.filter((item: any) => item.firma === firma);
                const avgDay7 = firmaData.reduce((sum: number, item: any) => sum + item.day7, 0) / firmaData.length;
                const avgDay30 = firmaData.reduce((sum: number, item: any) => sum + item.day30, 0) / firmaData.length;
                const avgDay60 = firmaData.reduce((sum: number, item: any) => sum + item.day60, 0) / firmaData.length;
                const avgDay90 = firmaData.reduce((sum: number, item: any) => sum + item.day90, 0) / firmaData.length;
                
                return {
                  firma: firma,
                  name: firma,
                  day7: avgDay7,
                  day30: avgDay30,
                  day60: avgDay60,
                  day90: avgDay90
                };
              });
              
              setChartData(firmaAverages);
            } else {
              console.log('No data or invalid format:', chartResponse);
              setChartData([]);
              setRawMachineData([]);
            }
          } catch (chartError) {
            console.error("Failed to fetch chart data:", chartError);
            setChartData([]);
            setRawMachineData([]);
          }
        } else if (subPlatformCode === 'idari') {
          // Fetch real chart data for idari subplatform
          try {
            const chartResponse: any = await api.post('/reports/preview', {
              sql_query: 'SELECT "Firma", "Departman", "Toplam Çalışan Sayısı" FROM mes_production.get_firma_departman_bazli_calisan_sayisi ORDER BY "Firma", "Toplam Çalışan Sayısı" DESC'
            });

            if (chartResponse && chartResponse.data && Array.isArray(chartResponse.data)) {
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

  // Update chart data when firma selection changes for verimlilik
  useEffect(() => {
    if (subPlatformCode === 'verimlilik' && rawMachineData.length > 0) {
      if (selectedFirma) {
        // Show machine-level data for selected firma
        const firmaData = rawMachineData.filter(item => item.firma === selectedFirma);
        setChartData(firmaData);
      } else {
        // Show average values per company
        const uniqueFirmas = Array.from(new Set(rawMachineData.map((item: any) => item.firma))).sort() as string[];
        const firmaAverages = uniqueFirmas.map(firma => {
          const firmaData = rawMachineData.filter((item: any) => item.firma === firma);
          const avgDay7 = firmaData.reduce((sum: number, item: any) => sum + item.day7, 0) / firmaData.length;
          const avgDay30 = firmaData.reduce((sum: number, item: any) => sum + item.day30, 0) / firmaData.length;
          const avgDay60 = firmaData.reduce((sum: number, item: any) => sum + item.day60, 0) / firmaData.length;
          const avgDay90 = firmaData.reduce((sum: number, item: any) => sum + item.day90, 0) / firmaData.length;
          
          return {
            firma: firma,
            name: firma,
            day7: avgDay7,
            day30: avgDay30,
            day60: avgDay60,
            day90: avgDay90
          };
        });
        setChartData(firmaAverages);
      }
    }
  }, [selectedFirma, rawMachineData, subPlatformCode]);

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
    if (subPlatformCode === 'verimlilik' && data && data.firma && !selectedFirma) {
      // Only set filter if clicking on company average bars (when no filter is active)
      setSelectedFirma(data.firma);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Yükleniyor...</div>
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
                    <h2 className="text-xl font-semibold" style={{ color: 'rgb(69, 81, 89)' }}>Firma Bazlı Kapasite Değerleri</h2>
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
                    <h2 className="text-xl font-semibold" style={{ color: 'rgb(69, 81, 89)' }}>Firma Bazlı OEE Değerleri</h2>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {firmaOptions.length > 0 && (
                    <div className="relative">
                      <button onClick={() => setShowFirmaDropdown(!showFirmaDropdown)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[160px] text-left flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <span className="truncate">{selectedFirma || 'Tüm Firmalar'}</span>
                        <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {showFirmaDropdown && (
                        <div className="absolute z-10 mt-2 w-48 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto right-0">
                          <div onClick={() => { setSelectedFirma(null); setShowFirmaDropdown(false); }} className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer font-medium">Tüm Firmalar</div>
                          {firmaOptions.map((firma) => (
                            <div key={firma} onClick={() => { setSelectedFirma(firma); setShowFirmaDropdown(false); }} className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedFirma === firma ? 'bg-blue-100 font-medium' : ''}`}>{firma}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="relative">
                    <button onClick={() => setShowDayDropdown(!showDayDropdown)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px] text-left flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <span className="truncate">
                        {selectedDayRange === 'day7' && '7 Gün'}
                        {selectedDayRange === 'day30' && '30 Gün'}
                        {selectedDayRange === 'day60' && '60 Gün'}
                        {selectedDayRange === 'day90' && '90 Gün'}
                      </span>
                      <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {showDayDropdown && (
                      <div className="absolute z-10 mt-2 w-40 bg-white border border-gray-300 rounded-lg shadow-lg right-0">
                        <div onClick={() => { setSelectedDayRange('day7'); setShowDayDropdown(false); }} className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedDayRange === 'day7' ? 'bg-blue-100 font-medium' : ''}`}>7 Gün</div>
                        <div onClick={() => { setSelectedDayRange('day30'); setShowDayDropdown(false); }} className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedDayRange === 'day30' ? 'bg-blue-100 font-medium' : ''}`}>30 Gün</div>
                        <div onClick={() => { setSelectedDayRange('day60'); setShowDayDropdown(false); }} className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedDayRange === 'day60' ? 'bg-blue-100 font-medium' : ''}`}>60 Gün</div>
                        <div onClick={() => { setSelectedDayRange('day90'); setShowDayDropdown(false); }} className={`px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer ${selectedDayRange === 'day90' ? 'bg-blue-100 font-medium' : ''}`}>90 Gün</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={400}>
                <BarChart 
                  key={selectedFirma || 'all'} 
                  data={chartData} 
                  margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                  onClick={(data) => {
                    if (data && data.activePayload && data.activePayload[0]) {
                      handleBarClick(data.activePayload[0].payload);
                    }
                  }}
                  style={{ cursor: !selectedFirma ? 'pointer' : 'default' }}
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
                  <XAxis dataKey={selectedFirma ? "machinecode" : "name"} stroke="#6b7280" style={{ fontSize: '13px', fontWeight: 500 }} tickLine={false} angle={-45} textAnchor="end" height={80} />
                  <YAxis stroke="#6b7280" style={{ fontSize: '13px', fontWeight: 500 }} tickLine={false} label={{ value: 'OEE (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }} 
                    cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} 
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    labelFormatter={(label: string, payload: any[]) => {
                      if (!selectedFirma && payload && payload.length > 0) {
                        return `${label} (Ortalama - Detay için tıklayın)`;
                      }
                      return label;
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                  <Bar dataKey={selectedDayRange} name={
                    selectedDayRange === 'day7' ? '7 Gün' :
                    selectedDayRange === 'day30' ? '30 Gün' :
                    selectedDayRange === 'day60' ? '60 Gün' : '90 Gün'
                  } radius={[8, 8, 0, 0]} maxBarSize={60}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`url(#colorOee${index % 20})`} />
                    ))}
                  </Bar>
                </BarChart>
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

