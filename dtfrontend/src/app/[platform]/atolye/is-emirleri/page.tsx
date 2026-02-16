"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface WorkOrderDetail {
  id: number;
  station_id: number;
  station_name: string;
  is_exit_station: boolean;
  user_id: number;
  user_name: string | null;
  work_order_group_id: string;
  main_customer: string;
  sector: string;
  company_from: string;
  aselsan_order_number: string;
  order_item_number: string;
  part_number: string;
  quantity: number;
  total_quantity: number;
  package_index: number;
  total_packages: number;
  priority: number;
  prioritized_by: number | null;
  delivered: boolean;
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
  part_number: string;
  main_customer: string;
  sector: string;
  company_from: string;
  aselsan_order_number: string;
  order_item_number: string;
  total_quantity: number;
  total_packages: number;
  priority: number;
  target_date: string | null;
  entries: WorkOrderDetail[];
}

interface StationInfo {
  id: number;
  name: string;
  company: string;
  is_exit_station: boolean;
}

interface PriorityTokenInfo {
  total_tokens: number;
  used_tokens: number;
  remaining_tokens: number;
}

export default function WorkOrdersPage() {
  const { user } = useUser();
  const [groupedWorkOrders, setGroupedWorkOrders] = useState<GroupedWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isYonetici, setIsYonetici] = useState(false);
  const [isOperator, setIsOperator] = useState(false);
  const [isSatinalma, setIsSatinalma] = useState(false);
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<string>>(new Set());

  // Search state
  const [searchStation, setSearchStation] = useState("");
  const [searchPartNumber, setSearchPartNumber] = useState("");
  const [searchOrderNumber, setSearchOrderNumber] = useState("");

  // Station list
  const [stations, setStations] = useState<StationInfo[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);

  // Satinalma token state
  const [tokenInfo, setTokenInfo] = useState<PriorityTokenInfo | null>(null);
  const [priorityEdits, setPriorityEdits] = useState<Map<string, number>>(new Map());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  // Check user roles
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const yoneticiRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":yonetici")
      );
      setIsYonetici(!!yoneticiRole);

      const operatorRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":operator")
      );
      setIsOperator(!!operatorRole);

      const satinalmaRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":satinalma")
      );
      setIsSatinalma(!!satinalmaRole);
    }
  }, [user]);

  // Fetch stations
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const data = await api.get<StationInfo[]>("/romiot/station/stations/");
        setStations(data || []);
      } catch (err: any) {
        console.error("Error fetching stations:", err);
      }
    };
    if (isYonetici || isOperator || isSatinalma) {
      fetchStations();
    }
  }, [isYonetici, isOperator, isSatinalma]);

  // Fetch satinalma tokens
  const fetchTokens = useCallback(async () => {
    if (!isSatinalma) return;
    try {
      const data = await api.get<PriorityTokenInfo>("/romiot/station/priority/tokens");
      setTokenInfo(data);
    } catch (err: any) {
      console.error("Error fetching tokens:", err);
    }
  }, [isSatinalma]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // Fetch work orders with search
  const fetchWorkOrders = useCallback(async () => {
    if (!isYonetici && !isOperator && !isSatinalma) return;

    try {
      setLoading(true);
      setError(null);

      const timestamp = new Date().getTime();
      let url = `/romiot/station/work-orders/all?page=${currentPage}&page_size=${pageSize}&_t=${timestamp}`;
      if (searchStation) url += `&search_station=${encodeURIComponent(searchStation)}`;
      if (searchPartNumber) url += `&search_part_number=${encodeURIComponent(searchPartNumber)}`;
      if (searchOrderNumber) url += `&search_order_number=${encodeURIComponent(searchOrderNumber)}`;

      const data = await api.get<PaginatedResponse>(url, undefined, { useCache: false });

      setTotalPages(data.total_pages);

      const grouped = groupWorkOrdersByGroup(data.items || []);
      setGroupedWorkOrders(grouped);
    } catch (err: any) {
      console.error("Error fetching work orders:", err);
      setError("İş emirleri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [isYonetici, isOperator, isSatinalma, currentPage, pageSize, searchStation, searchPartNumber, searchOrderNumber]);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  // Group work orders by work_order_group_id
  const groupWorkOrdersByGroup = (orders: WorkOrderDetail[]): GroupedWorkOrder[] => {
    const grouped = new Map<string, GroupedWorkOrder>();

    orders.forEach(order => {
      const key = order.work_order_group_id;

      if (!grouped.has(key)) {
        grouped.set(key, {
          work_order_group_id: order.work_order_group_id,
          part_number: order.part_number,
          main_customer: order.main_customer,
          sector: order.sector,
          company_from: order.company_from,
          aselsan_order_number: order.aselsan_order_number,
          order_item_number: order.order_item_number,
          total_quantity: order.total_quantity,
          total_packages: order.total_packages,
          priority: order.priority,
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

    // Sort groups by priority descending
    return Array.from(grouped.values()).sort((a, b) => b.priority - a.priority);
  };

  // Get the latest station for a work order group (where it currently is)
  const getCurrentStation = (entries: WorkOrderDetail[]): string => {
    const activeEntries = entries.filter(e => !e.exit_date);
    if (activeEntries.length > 0) {
      return activeEntries[0].station_name;
    }
    // If all exited, show last station
    const sorted = [...entries].sort((a, b) => {
      const dateA = a.exit_date || a.entrance_date || "";
      const dateB = b.exit_date || b.entrance_date || "";
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
    return sorted.length > 0 ? sorted[0].station_name : "-";
  };

  // Calculate days in current station
  const getDaysInStation = (entries: WorkOrderDetail[]): number => {
    const activeEntries = entries.filter(e => !e.exit_date);
    if (activeEntries.length === 0) return 0;

    const earliest = activeEntries.reduce((min, e) => {
      const d = new Date(e.entrance_date || "");
      return d < min ? d : min;
    }, new Date());

    const now = new Date();
    const diffMs = now.getTime() - earliest.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

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

  // Calculate duration
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

  // Satinalma: handle priority change
  const handlePriorityChange = (groupId: string, value: number) => {
    const newEdits = new Map(priorityEdits);
    const wo = groupedWorkOrders.find(w => w.work_order_group_id === groupId);
    const currentPriority = wo?.priority || 0;

    // If the new value equals the current saved priority, remove the edit (no change)
    if (value === currentPriority) {
      newEdits.delete(groupId);
    } else {
      newEdits.set(groupId, value);
    }
    setPriorityEdits(newEdits);
  };

  // Calculate net token change for current edits (positive = spend, negative = refund)
  const calculateTokensNeeded = (): number => {
    let total = 0;
    priorityEdits.forEach((newPriority, groupId) => {
      const wo = groupedWorkOrders.find(w => w.work_order_group_id === groupId);
      const currentPriority = wo?.priority || 0;
      const delta = newPriority - currentPriority;
      total += delta;
    });
    return total;
  };

  // Submit priority assignments
  const handleSubmitPriorities = async () => {
    setAssignLoading(true);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      const assignments = Array.from(priorityEdits.entries()).map(([groupId, priority]) => ({
        work_order_group_id: groupId,
        priority,
      }));

      const result = await api.post<PriorityTokenInfo>("/romiot/station/priority/assign", {
        assignments,
      });

      setTokenInfo(result);
      setPriorityEdits(new Map());
      setShowConfirmModal(false);
      setAssignSuccess("Öncelikler başarıyla atandı");
      setTimeout(() => setAssignSuccess(null), 3000);

      // Refresh work orders
      await fetchWorkOrders();
    } catch (err: any) {
      let errorMessage = "Öncelik atanırken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setAssignError(errorMessage);
    } finally {
      setAssignLoading(false);
    }
  };

  // Render priority stars/tokens for a work order
  const renderPriorityDisplay = (wo: GroupedWorkOrder) => {
    const editValue = priorityEdits.get(wo.work_order_group_id);
    const displayPriority = editValue !== undefined ? editValue : wo.priority;
    const hasEdit = editValue !== undefined && editValue !== wo.priority;

    if (isSatinalma) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((level) => {
              const isActive = level <= displayPriority;
              return (
                <button
                  key={level}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePriorityChange(
                      wo.work_order_group_id,
                      level === displayPriority ? 0 : level
                    );
                  }}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-yellow-400 border-yellow-500 text-yellow-900 shadow-sm"
                      : "bg-gray-100 border-gray-300 text-gray-400 hover:border-yellow-400 hover:bg-yellow-50"
                  }`}
                  title={`${level} jeton ata (tıklayarak seç/kaldır)`}
                >
                  {level}
                </button>
              );
            })}
          </div>
          {hasEdit && (
            <span className={`text-xs font-medium ${(editValue ?? 0) - wo.priority > 0 ? "text-orange-600" : "text-green-600"}`}>
              {(editValue ?? 0) - wo.priority > 0
                ? `+${(editValue ?? 0) - wo.priority} jeton harcanacak`
                : `${Math.abs((editValue ?? 0) - wo.priority)} jeton iade edilecek`}
            </span>
          )}
          {!hasEdit && displayPriority === 0 && (
            <span className="text-[10px] text-gray-400">Öncelik atamak için tıklayın</span>
          )}
        </div>
      );
    }

    // For operator/yonetici, display filled coins up to the priority value
    if (wo.priority > 0) {
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: wo.priority }, (_, i) => (
            <span
              key={i}
              className="w-6 h-6 rounded-full bg-yellow-400 border-2 border-yellow-500 flex items-center justify-center text-xs font-bold text-yellow-900"
            >
              {i + 1}
            </span>
          ))}
        </div>
      );
    }
    return <span className="text-gray-400 text-sm">-</span>;
  };

  // Access check
  if (!isYonetici && !isOperator && !isSatinalma) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Erişim Yetkisi Yok</h1>
          <p className="text-gray-600">Bu sayfayı görüntüleme yetkisine sahip değilsiniz.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0f4c3a] mx-auto mb-4"></div>
          <p className="text-gray-600">İş emirleri yükleniyor...</p>
        </div>
      </div>
    );
  }

  const tokensNeeded = calculateTokensNeeded();
  const hasEdits = priorityEdits.size > 0;

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">İş Emirleri</h1>
          <p className="text-gray-600">
            {isSatinalma
              ? "İş emirlerinin öncelik sıralamasını belirleyin"
              : "Tüm iş emirlerinin detaylı bilgilerini görüntüleyin"}
          </p>
        </div>

        {/* Error / Success Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {assignError && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
            <p className="text-sm text-red-700">{assignError}</p>
          </div>
        )}
        {assignSuccess && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg shadow-sm">
            <p className="text-sm text-green-700">{assignSuccess}</p>
          </div>
        )}

        {/* Satinalma Token Info */}
        {isSatinalma && tokenInfo && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded-lg flex items-center gap-3">
            <span className="text-2xl">&#x1F7E1;</span>
            <span className="text-sm font-medium text-yellow-800">
              {tokenInfo.remaining_tokens}/{tokenInfo.total_tokens} jetonunuz kaldı.
            </span>
          </div>
        )}

        {/* Search Bars */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Atölye Ara</label>
            <input
              type="text"
              placeholder="Atölye adı..."
              value={searchStation}
              onChange={(e) => { setSearchStation(e.target.value); setCurrentPage(1); }}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Parça Numarası Ara</label>
            <input
              type="text"
              placeholder="Parça numarası..."
              value={searchPartNumber}
              onChange={(e) => { setSearchPartNumber(e.target.value); setCurrentPage(1); }}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sipariş Numarası Ara</label>
            <input
              type="text"
              placeholder="Sipariş numarası..."
              value={searchOrderNumber}
              onChange={(e) => { setSearchOrderNumber(e.target.value); setCurrentPage(1); }}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white text-sm"
            />
          </div>
        </div>

        {/* Satinalma: Submit Button */}
        {isSatinalma && hasEdits && (
          <div className="mb-6 flex justify-end">
            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-6 py-2.5 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <span>&#x1F7E1;</span>
              {tokensNeeded >= 0
                ? `Öncelikleri Ata (${tokensNeeded} jeton)`
                : `Öncelikleri Güncelle (+${Math.abs(tokensNeeded)} jeton iade)`}
            </button>
          </div>
        )}

        {/* Work Orders Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Parça Numarası</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Öncelik</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Müşteri Bilgisi</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Hangi Atölyede</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kaç Gündür Atölyede</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Adet</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-8"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupedWorkOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {searchStation || searchPartNumber || searchOrderNumber
                      ? "Arama kriterlerinize uygun iş emri bulunamadı."
                      : "Henüz hiç iş emri kaydı bulunmamaktadır."}
                  </td>
                </tr>
              ) : (
                groupedWorkOrders.map((wo) => {
                  const key = wo.work_order_group_id;
                  const isExpanded = expandedWorkOrders.has(key);
                  const currentStation = getCurrentStation(wo.entries);
                  const daysInStation = getDaysInStation(wo.entries);
                  const hasActiveEntry = wo.entries.some(e => !e.exit_date);

                  return (
                    <>
                      <tr
                        key={key}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => toggleWorkOrder(key)}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{wo.part_number}</div>
                          <div className="text-xs text-gray-500">{wo.aselsan_order_number}</div>
                        </td>
                        <td className="px-4 py-3">
                          {renderPriorityDisplay(wo)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{wo.company_from}</div>
                          <div className="text-xs text-gray-500">{wo.main_customer} - {wo.sector}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-900">{currentStation}</span>
                            {hasActiveEntry && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                Aktif
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium ${daysInStation > 7 ? "text-red-600" : daysInStation > 3 ? "text-yellow-600" : "text-gray-900"}`}>
                            {hasActiveEntry ? `${daysInStation} gün` : "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-900">{wo.total_quantity}</span>
                        </td>
                        <td className="px-4 py-3">
                          <svg
                            className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </td>
                      </tr>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <tr key={`${key}-details`}>
                          <td colSpan={7} className="px-0 py-0">
                            <div className="bg-gray-50 border-t border-b border-gray-200 p-6">
                              {/* Summary */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                                <div>
                                  <span className="text-gray-500">Sipariş No:</span>
                                  <p className="font-medium text-gray-900">{wo.aselsan_order_number}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Sipariş Kalem No:</span>
                                  <p className="font-medium text-gray-900">{wo.order_item_number}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Toplam Paket:</span>
                                  <p className="font-medium text-gray-900">{wo.total_packages} paket</p>
                                </div>
                                {wo.target_date && (
                                  <div>
                                    <span className="text-gray-500">Hedef Tarih:</span>
                                    <p className="font-medium text-gray-900">
                                      {new Date(wo.target_date).toLocaleDateString("tr-TR")}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Station History */}
                              <h4 className="text-sm font-semibold text-gray-900 mb-3">Atölye Geçiş Geçmişi</h4>
                              <div className="space-y-3">
                                {wo.entries.map((entry, index) => (
                                  <div key={entry.id} className="bg-white rounded-lg p-4 border border-gray-200">
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-7 h-7 bg-[#0f4c3a] text-white rounded-full flex items-center justify-center text-xs font-bold">
                                          {index + 1}
                                        </div>
                                        <div>
                                          <h5 className="font-semibold text-gray-900 text-sm">{entry.station_name}</h5>
                                          <p className="text-xs text-gray-600">
                                            Operatör: {entry.user_name || "Bilinmiyor"} - Paket {entry.package_index}/{entry.total_packages} ({entry.quantity}/{entry.total_quantity} parça)
                                          </p>
                                        </div>
                                      </div>
                                      {getStatusBadge(entry.exit_date)}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                      <div>
                                        <span className="text-gray-500">Giriş:</span>
                                        <p className="font-medium text-gray-900">
                                          {entry.entrance_date ? new Date(entry.entrance_date).toLocaleString("tr-TR") : "-"}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Çıkış:</span>
                                        <p className="font-medium text-gray-900">
                                          {entry.exit_date ? new Date(entry.exit_date).toLocaleString("tr-TR") : "-"}
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
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white"
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
                          ? 'bg-[#0f4c3a] text-white'
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
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-yellow-50 px-6 py-4 border-b border-yellow-200">
              <div className="flex items-center gap-3">
                <span className="text-3xl">&#x1F7E1;</span>
                <h3 className="text-lg font-bold text-gray-900">Öncelik Atama Onayı</h3>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-700 mb-4">
                Seçilen öncelikleri {tokensNeeded >= 0 ? "atamak" : "güncellemek"} istiyor musunuz?
              </p>
              {tokensNeeded > 0 ? (
                <p className="text-gray-600 text-sm mb-2">
                  Öncelik vermek <span className="font-bold text-yellow-700">{tokensNeeded}</span> jetonunuzu harcayacak.
                </p>
              ) : tokensNeeded < 0 ? (
                <p className="text-gray-600 text-sm mb-2">
                  Öncelik düşürme sonucu <span className="font-bold text-green-700">{Math.abs(tokensNeeded)}</span> jetonunuz iade edilecek.
                </p>
              ) : (
                <p className="text-gray-600 text-sm mb-2">
                  Jeton bakiyeniz değişmeyecek.
                </p>
              )}
              <p className="text-gray-600 text-sm">
                İşlem sonrası <span className="font-bold text-green-700">{(tokenInfo?.remaining_tokens || 0) - tokensNeeded}</span> jetonunuz kalacak.
              </p>

              {tokensNeeded > 0 && tokensNeeded > (tokenInfo?.remaining_tokens || 0) && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 font-medium">
                    Yeterli jetonunuz yok! Gerekli: {tokensNeeded}, Kalan: {tokenInfo?.remaining_tokens || 0}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                disabled={assignLoading}
              >
                İptal
              </button>
              <button
                onClick={handleSubmitPriorities}
                disabled={assignLoading || (tokensNeeded > 0 && tokensNeeded > (tokenInfo?.remaining_tokens || 0))}
                className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assignLoading ? "Atanıyor..." : "Onayla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
