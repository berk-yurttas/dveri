"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface WorkOrderDetail {
  id: number;
  station_id: number;
  station_name: string;
  user_id: number;
  user_name: string | null;
  work_order_group_id: string;
  main_customer: string;
  sector: string;
  company_from: string;
  aselsan_order_number: string;
  order_item_number: string;
  quantity: number;
  total_quantity: number;
  package_index: number;
  total_packages: number;
  target_date: string | null;
  entrance_date: string | null;
  exit_date: string | null;
}

interface PaginatedResponse {
  items: WorkOrderDetail[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface GroupedWorkOrder {
  work_order_group_id: string;
  main_customer: string;
  sector: string;
  company_from: string;
  aselsan_order_number: string;
  order_item_number: string;
  total_quantity: number;
  total_packages: number;
  target_date: string | null;
  entries: WorkOrderDetail[];
}

export default function WorkOrdersPage() {
  const { user } = useUser();
  const [workOrders, setWorkOrders] = useState<WorkOrderDetail[]>([]);
  const [groupedWorkOrders, setGroupedWorkOrders] = useState<GroupedWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAtolyeRole, setHasAtolyeRole] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<string>>(new Set());
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Check user roles
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const atolyeRole = user.role.find((role) => 
        typeof role === "string" && role.startsWith("atolye:")
      );
      setHasAtolyeRole(!!atolyeRole);
    }
  }, [user]);

  // Fetch work orders
  useEffect(() => {
    const fetchWorkOrders = async () => {
      if (!hasAtolyeRole) return;

      try {
        setLoading(true);
        setError(null);
        
        const timestamp = new Date().getTime();
        const data = await api.get<PaginatedResponse>(
          `/romiot/station/work-orders/all?page=${currentPage}&page_size=${pageSize}&_t=${timestamp}`,
          undefined,
          { useCache: false }
        );
        
        setWorkOrders(data.items || []);
        setTotalItems(data.total);
        setTotalPages(data.total_pages);
        
        const grouped = groupWorkOrdersByGroup(data.items || []);
        setGroupedWorkOrders(grouped);
      } catch (err: any) {
        console.error("Error fetching work orders:", err);
        setError("İş emirleri yüklenirken hata oluştu");
      } finally {
        setLoading(false);
      }
    };

    fetchWorkOrders();
  }, [hasAtolyeRole, currentPage, pageSize]);

  // Group work orders by work_order_group_id
  const groupWorkOrdersByGroup = (orders: WorkOrderDetail[]): GroupedWorkOrder[] => {
    const grouped = new Map<string, GroupedWorkOrder>();

    orders.forEach(order => {
      const key = order.work_order_group_id;
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          work_order_group_id: order.work_order_group_id,
          main_customer: order.main_customer,
          sector: order.sector,
          company_from: order.company_from,
          aselsan_order_number: order.aselsan_order_number,
          order_item_number: order.order_item_number,
          total_quantity: order.total_quantity,
          total_packages: order.total_packages,
          target_date: order.target_date,
          entries: []
        });
      }
      
      grouped.get(key)!.entries.push(order);
    });

    // Sort entries within each group by entrance_date (most recent first)
    grouped.forEach(group => {
      group.entries.sort((a, b) => {
        if (!a.entrance_date) return 1;
        if (!b.entrance_date) return -1;
        return new Date(b.entrance_date).getTime() - new Date(a.entrance_date).getTime();
      });
    });

    return Array.from(grouped.values());
  };

  // Filter work orders based on search term
  const filteredWorkOrders = groupedWorkOrders.filter(wo => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      wo.work_order_group_id.toLowerCase().includes(searchLower) ||
      wo.main_customer.toLowerCase().includes(searchLower) ||
      wo.sector.toLowerCase().includes(searchLower) ||
      wo.company_from.toLowerCase().includes(searchLower) ||
      wo.aselsan_order_number.toLowerCase().includes(searchLower) ||
      wo.order_item_number.toLowerCase().includes(searchLower)
    );
  });

  // Toggle work order expansion
  const toggleWorkOrder = (key: string) => {
    const newExpanded = new Set(expandedWorkOrders);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedWorkOrders(newExpanded);
  };

  // Calculate total time spent in station
  const calculateDuration = (entrance: string | null, exit: string | null): string => {
    if (!entrance) return "-";
    if (!exit) return "Devam ediyor";
    
    const entranceDate = new Date(entrance);
    const exitDate = new Date(exit);
    const diffMs = exitDate.getTime() - entranceDate.getTime();
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours} saat ${minutes} dakika`;
    }
    return `${minutes} dakika`;
  };

  // Get status badge
  const getStatusBadge = (exitDate: string | null) => {
    if (exitDate) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Tamamlandı
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        Devam Ediyor
      </span>
    );
  };

  // Get last action date from entries
  const getLastActionDate = (entries: WorkOrderDetail[]): string => {
    if (entries.length === 0) return "-";
    
    const dates: Date[] = [];
    
    entries.forEach(entry => {
      if (entry.exit_date) {
        dates.push(new Date(entry.exit_date));
      } else if (entry.entrance_date) {
        dates.push(new Date(entry.entrance_date));
      }
    });
    
    if (dates.length === 0) return "-";
    
    const lastDate = dates.reduce((latest, current) => 
      current > latest ? current : latest
    );
    
    return lastDate.toLocaleString("tr-TR");
  };

  // Get unique stations from entries
  const getUniqueStations = (entries: WorkOrderDetail[]): string[] => {
    const stations = new Set(entries.map(e => e.station_name));
    return Array.from(stations);
  };

  if (!hasAtolyeRole) {
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
          <p className="text-gray-600">İş emirleri yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            İş Emri Detayları
          </h1>
          <p className="text-gray-600">
            Tüm iş emirlerinin detaylı bilgilerini görüntüleyin
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Sipariş numarası, müşteri, sektör veya gönderen firma ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008080] focus:border-[#008080] text-gray-900 bg-white"
            />
            <svg
              className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-100 rounded-lg p-3">
                <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Toplam İş Emri</p>
                <p className="text-2xl font-bold text-gray-900">{groupedWorkOrders.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-yellow-100 rounded-lg p-3">
                <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Devam Eden</p>
                <p className="text-2xl font-bold text-gray-900">
                  {groupedWorkOrders.filter(wo => wo.entries.some(e => !e.exit_date)).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-100 rounded-lg p-3">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Tamamlanan</p>
                <p className="text-2xl font-bold text-gray-900">
                  {groupedWorkOrders.filter(wo => wo.entries.every(e => e.exit_date)).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Work Orders List */}
        <div className="space-y-6">
          <div className="space-y-4">
            {filteredWorkOrders.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">İş emri bulunamadı</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm ? "Arama kriterlerinize uygun iş emri bulunamadı." : "Henüz hiç iş emri kaydı bulunmamaktadır."}
                </p>
              </div>
            ) : (
            filteredWorkOrders.map((wo) => {
              const key = wo.work_order_group_id;
              const isExpanded = expandedWorkOrders.has(key);
              const hasActiveEntry = wo.entries.some(e => !e.exit_date);
              const uniqueStations = getUniqueStations(wo.entries);

              return (
                <div key={key} className="bg-white rounded-lg shadow overflow-hidden">
                  {/* Work Order Header */}
                  <div
                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleWorkOrder(key)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-gray-900">
                            {wo.aselsan_order_number}
                          </h3>
                          {hasActiveEntry && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Aktif
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                            {wo.total_packages} paket
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Ana Müşteri:</span>
                            <p className="font-medium text-gray-900">{wo.main_customer}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Sektör:</span>
                            <p className="font-medium text-gray-900">{wo.sector}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Gönderen Firma:</span>
                            <p className="font-medium text-gray-900">{wo.company_from}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Sipariş Kalem No:</span>
                            <p className="font-medium text-gray-900">{wo.order_item_number}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-4 text-sm flex-wrap">
                          <div className="text-gray-600">
                            <span className="font-medium">{wo.total_quantity}</span> toplam parça
                          </div>
                          <span className="text-gray-300">|</span>
                          <div className="text-gray-600">
                            <span className="font-medium">{wo.entries.length}</span> atölye geçişi
                          </div>
                          <span className="text-gray-300">|</span>
                          <div className="text-gray-600">
                            Atölyeler: {uniqueStations.join(", ")}
                          </div>
                          {wo.target_date && (
                            <>
                              <span className="text-gray-300">|</span>
                              <div className="text-gray-600">
                                Hedef: <span className="font-medium">{new Date(wo.target_date).toLocaleDateString("tr-TR")}</span>
                              </div>
                            </>
                          )}
                          <span className="text-gray-300">|</span>
                          <div className="flex items-center gap-2 text-gray-600">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-gray-500">Son İşlem:</span>
                            <span className="font-medium text-gray-900">{getLastActionDate(wo.entries)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="ml-4">
                        <svg
                          className={`h-6 w-6 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Work Order Details (Expanded) */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50 p-6">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4">Atölye Geçiş Geçmişi</h4>
                      
                      <div className="space-y-4">
                        {wo.entries.map((entry, index) => (
                          <div key={entry.id} className="bg-white rounded-lg p-4 border border-gray-200">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-8 h-8 bg-[#008080] text-white rounded-full flex items-center justify-center text-sm font-bold">
                                  {index + 1}
                                </div>
                                <div>
                                  <h5 className="font-semibold text-gray-900">{entry.station_name}</h5>
                                  <p className="text-sm text-gray-600">
                                    Operatör: {entry.user_name || "Bilinmiyor"} - Paket {entry.package_index}/{entry.total_packages} ({entry.quantity} parça)
                                  </p>
                                </div>
                              </div>
                              {getStatusBadge(entry.exit_date)}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">Giriş Tarihi:</span>
                                <p className="font-medium text-gray-900">
                                  {entry.entrance_date
                                    ? new Date(entry.entrance_date).toLocaleString("tr-TR")
                                    : "-"}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Çıkış Tarihi:</span>
                                <p className="font-medium text-gray-900">
                                  {entry.exit_date
                                    ? new Date(entry.exit_date).toLocaleString("tr-TR")
                                    : "-"}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Süre:</span>
                                <p className="font-medium text-gray-900">
                                  {calculateDuration(entry.entrance_date, entry.exit_date)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
            )}
          </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">
                    Toplam <span className="font-medium">{totalItems}</span> kayıt
                  </span>
                  <span className="text-gray-400">|</span>
                  <span className="text-sm text-gray-700">
                    Sayfa <span className="font-medium">{currentPage}</span> / <span className="font-medium">{totalPages}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#008080] focus:border-[#008080] text-gray-900 bg-white"
                  >
                    <option value={10}>10 / sayfa</option>
                    <option value={20}>20 / sayfa</option>
                    <option value={50}>50 / sayfa</option>
                    <option value={100}>100 / sayfa</option>
                  </select>

                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            currentPage === pageNum
                              ? 'bg-[#008080] text-white'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-sm text-gray-700">Git:</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const page = Number(e.target.value);
                        if (page >= 1 && page <= totalPages) {
                          setCurrentPage(page);
                        }
                      }}
                      className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-[#008080] focus:border-[#008080] text-gray-900 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
         
        </div>
      </div>
    </div>
  );
}
