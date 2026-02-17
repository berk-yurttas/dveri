"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";

type Mode = "entrance" | "exit" | null;

interface QRCodeData {
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
}

interface WorkOrder {
  id: number;
  station_id: number;
  user_id: number;
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
  company_from: string;
  main_customer: string;
  sector: string;
  aselsan_order_number: string;
  order_item_number: string;
  total_quantity: number;
  total_packages: number;
  priority: number;
  target_date: string | null;
  entries: WorkOrderDetail[];
}

interface WorkOrderCreateResponse {
  work_order: WorkOrder;
  packages_scanned: number;
  total_packages: number;
  all_scanned: boolean;
  message: string;
}

interface WorkOrderExitResponse {
  work_order: WorkOrder;
  packages_exited: number;
  total_packages: number;
  all_exited: boolean;
  message: string;
}

// Map QR code data to API payload
const mapQRCodeToApi = (qrCodeData: any, stationId: number): any => {
  if (!qrCodeData || typeof qrCodeData !== "object") {
    throw new Error("QR kod verisi geçersiz veya boş");
  }

  const errors: string[] = [];

  const workOrderGroupId = qrCodeData.work_order_group_id;
  const mainCustomer = qrCodeData.main_customer;
  const sector = qrCodeData.sector;
  const companyFrom = qrCodeData.company_from;
  const aselsanOrderNumber = qrCodeData.aselsan_order_number;
  const orderItemNumber = qrCodeData.order_item_number;
  const partNumber = qrCodeData.part_number;
  const quantity = qrCodeData.quantity;
  const totalQuantity = qrCodeData.total_quantity;
  const packageIndex = qrCodeData.package_index;
  const totalPackages = qrCodeData.total_packages;
  const targetDate = qrCodeData.target_date;

  if (!workOrderGroupId) errors.push("İş Emri Grup ID eksik");
  if (!mainCustomer) errors.push("Ana Müşteri eksik");
  if (!sector) errors.push("Sektör eksik");
  if (!companyFrom) errors.push("Gönderen Firma eksik");
  if (!aselsanOrderNumber) errors.push("ASELSAN Sipariş Numarası eksik");
  if (!orderItemNumber) errors.push("Sipariş Kalem Numarası eksik");
  if (!partNumber) errors.push("Parça Numarası eksik");

  const quantityNum = typeof quantity === "number" ? quantity : Number(quantity);
  if (!quantity || isNaN(quantityNum) || quantityNum <= 0) {
    errors.push("Parça sayısı eksik veya geçersiz");
  }

  const totalQuantityNum = typeof totalQuantity === "number" ? totalQuantity : Number(totalQuantity);
  const packageIndexNum = typeof packageIndex === "number" ? packageIndex : Number(packageIndex);
  const totalPackagesNum = typeof totalPackages === "number" ? totalPackages : Number(totalPackages);

  if (!packageIndexNum || packageIndexNum <= 0) errors.push("Paket sırası geçersiz");
  if (!totalPackagesNum || totalPackagesNum <= 0) errors.push("Toplam paket sayısı geçersiz");

  if (errors.length > 0) {
    console.error("QR code validation errors:", errors);
    throw new Error(errors.join(", "));
  }

  return {
    station_id: stationId,
    work_order_group_id: String(workOrderGroupId).trim(),
    main_customer: String(mainCustomer).trim(),
    sector: String(sector).trim(),
    company_from: String(companyFrom).trim(),
    aselsan_order_number: String(aselsanOrderNumber).trim(),
    order_item_number: String(orderItemNumber).trim(),
    part_number: String(partNumber).trim(),
    quantity: quantityNum,
    total_quantity: totalQuantityNum,
    package_index: packageIndexNum,
    total_packages: totalPackagesNum,
    target_date: targetDate || null,
  };
};

// Map QR code data to exit payload
const mapQRCodeToExitApi = (qrCodeData: any, stationId: number): any => {
  if (!qrCodeData || typeof qrCodeData !== "object") {
    throw new Error("QR kod verisi geçersiz veya boş");
  }

  const workOrderGroupId = qrCodeData.work_order_group_id;
  const packageIndex = qrCodeData.package_index;

  if (!workOrderGroupId) throw new Error("İş Emri Grup ID eksik");
  if (!packageIndex) throw new Error("Paket sırası eksik");

  return {
    station_id: stationId,
    work_order_group_id: String(workOrderGroupId).trim(),
    package_index: typeof packageIndex === "number" ? packageIndex : Number(packageIndex),
  };
};

export default function OperatorPage() {
  const { user } = useUser();
  const [isOperator, setIsOperator] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [stationId, setStationId] = useState<number | null>(null);
  const [stationName, setStationName] = useState<string>("");
  const [qrCodeInput, setQRCodeInput] = useState("");
  const qrCodeBufferRef = useRef<string>("");
  const qrCodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Package scan progress state
  const [scanProgress, setScanProgress] = useState<{
    groupId: string;
    scanned: number;
    total: number;
    allDone: boolean;
    message: string;
  } | null>(null);

  // Simplified work order table state
  const [groupedWorkOrders, setGroupedWorkOrders] = useState<GroupedWorkOrder[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  // Check user roles and fetch station
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const operatorRole = user.role.find(
        (role) => typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":operator")
      );
      if (operatorRole) {
        setIsOperator(true);
        const fetchOperatorStation = async () => {
          try {
            const stationData = await api.get<{ station_id: number; name: string; company: string }>(
              "/romiot/station/stations/my-station"
            );
            setStationId(stationData.station_id);
            setStationName(stationData.name);
          } catch (err: any) {
            console.error("Error fetching operator station:", err);
            setError("Atölye bilgisi alınamadı. Lütfen yönetici ile iletişime geçin.");
          }
        };
        fetchOperatorStation();
      }
    }
  }, [user]);

  // Fetch work orders filtered to operator's station
  const fetchWorkOrders = useCallback(async () => {
    if (!isOperator || !stationName) return;
    try {
      setTableLoading(true);
      const timestamp = new Date().getTime();
      const data = await api.get<PaginatedResponse>(
        `/romiot/station/work-orders/all?page=${currentPage}&page_size=20&search_station=${encodeURIComponent(stationName)}&_t=${timestamp}`,
        undefined,
        { useCache: false }
      );

      setTotalPages(data.total_pages);

      // Group by work_order_group_id, only include entries at our station
      const grouped = new Map<string, GroupedWorkOrder>();
      (data.items || []).forEach(order => {
        const key = order.work_order_group_id;
        if (!grouped.has(key)) {
          grouped.set(key, {
            work_order_group_id: order.work_order_group_id,
            part_number: order.part_number,
            company_from: order.company_from,
            main_customer: order.main_customer,
            sector: order.sector,
            aselsan_order_number: order.aselsan_order_number,
            order_item_number: order.order_item_number,
            total_quantity: order.total_quantity,
            total_packages: order.total_packages,
            priority: order.priority,
            target_date: order.target_date,
            entries: [],
          });
        }
        grouped.get(key)!.entries.push(order);
      });

      // Sort by priority descending
      setGroupedWorkOrders(Array.from(grouped.values()).sort((a, b) => b.priority - a.priority));
    } catch (err: any) {
      console.error("Error fetching work orders:", err);
    } finally {
      setTableLoading(false);
    }
  }, [isOperator, stationName, currentPage]);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (!stationName) return;
    const interval = setInterval(() => {
      fetchWorkOrders();
    }, 10000);
    return () => clearInterval(interval);
  }, [stationName, fetchWorkOrders]);

  const handleQRCodeScan = useCallback(
    async (qrCodeData: string) => {
      if (!stationId) {
        setError("Atölye ID bulunamadı");
        return;
      }

      setError(null);
      setSuccessMessage(null);

      console.log("QR Kod Okundu (Raw):", qrCodeData);

      try {
        let parsedData: QRCodeData;
        const code = qrCodeData.trim();

        try {
          let resolvedCode = code;

          // If input is all digits and length is a multiple of 5, decode from numeric format
          // (physical scanners output charCode as 5-digit numbers, e.g. "00080" = char 80 = "P")
          if (/^\d+$/.test(code) && code.length % 5 === 0) {
            const chunks = code.match(/.{1,5}/g) || [];
            resolvedCode = chunks.map((chunk) => String.fromCharCode(parseInt(chunk, 10))).join("");
            console.log("QR Kod (numeric decode):", resolvedCode);
          }

          console.log("QR Kod Kodu:", resolvedCode, "Uzunluk:", resolvedCode.length);
          const response = await api.get<{ data: QRCodeData }>(
            `/romiot/station/qr-code/retrieve/${encodeURIComponent(resolvedCode)}`
          );
          parsedData = response.data;
          console.log("QR Kod Verisi Alındı:", parsedData);
        } catch (decodeError: any) {
          console.error("Decode Hatası:", decodeError);
          const detail = decodeError?.message || "";
          if (detail.includes("404") || detail.includes("bulunamadı")) {
            setError(`QR kod bulunamadı: "${code}"`);
          } else {
            setError(`QR kod decode edilemedi: ${detail || "Bilinmeyen hata"} (kod: "${code}")`);
          }
          return;
        }

        if (mode === "entrance") {
          let payload;
          try {
            payload = mapQRCodeToApi(parsedData, stationId);
          } catch (mappingError: any) {
            console.error("Mapping error:", mappingError);
            setError(mappingError.message || "QR kod verisi işlenirken hata oluştu");
            return;
          }

          const response = await api.post<WorkOrderCreateResponse>("/romiot/station/work-orders/", payload);

          setError(null);
          setScanProgress({
            groupId: response.work_order.work_order_group_id,
            scanned: response.packages_scanned,
            total: response.total_packages,
            allDone: response.all_scanned,
            message: response.message,
          });

          if (response.all_scanned) {
            setSuccessMessage(response.message);
            setTimeout(() => setScanProgress(null), 5000);
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
          await fetchWorkOrders();
          setQRCodeInput("");
        } else if (mode === "exit") {
          let payload;
          try {
            payload = mapQRCodeToExitApi(parsedData, stationId);
          } catch (mappingError: any) {
            console.error("Mapping error:", mappingError);
            setError(mappingError.message || "QR kod verisi işlenirken hata oluştu");
            return;
          }

          const response = await api.post<WorkOrderExitResponse>(
            "/romiot/station/work-orders/update-exit-date",
            payload
          );

          setError(null);
          setScanProgress({
            groupId: response.work_order.work_order_group_id,
            scanned: response.packages_exited,
            total: response.total_packages,
            allDone: response.all_exited,
            message: response.message,
          });

          if (response.all_exited) {
            setSuccessMessage(response.message);
            setTimeout(() => setScanProgress(null), 5000);
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
          await fetchWorkOrders();
          setQRCodeInput("");
        }
      } catch (err: any) {
        console.error("QR code processing error:", err);

        let errorMessage = "İşlem sırasında bir hata oluştu";

        try {
          if (err.status && err.message) {
            try {
              const errorData = JSON.parse(err.message);
              if (errorData.detail) {
                if (Array.isArray(errorData.detail)) {
                  const fieldTranslations: Record<string, string> = {
                    main_customer: "Ana Müşteri",
                    sector: "Sektör",
                    company_from: "Gönderen Firma",
                    aselsan_order_number: "ASELSAN Sipariş Numarası",
                    order_item_number: "Sipariş Kalem Numarası",
                    part_number: "Parça Numarası",
                    quantity: "Toplam Sipariş Miktarı",
                    station_id: "Atölye ID",
                    work_order_group_id: "İş Emri Grup ID",
                    package_index: "Parti Sırası",
                  };

                  const errorMessages = errorData.detail.map((error: any) => {
                    const fieldName =
                      fieldTranslations[error.loc?.[error.loc.length - 1]] || error.loc?.join(".") || "Bilinmeyen alan";
                    if (error.type === "missing") {
                      return `• ${fieldName} zorunludur`;
                    } else {
                      return `• ${fieldName}: ${error.msg || error.type}`;
                    }
                  });

                  errorMessage = "Form Hataları:\n" + errorMessages.join("\n");
                } else if (typeof errorData.detail === "string") {
                  errorMessage = errorData.detail;
                }
              }
            } catch (parseError) {
              if (typeof err.message === "string") {
                errorMessage = err.message;
              }
            }
          } else if (err.message) {
            try {
              const errorData = JSON.parse(err.message);
              if (errorData.detail) {
                if (typeof errorData.detail === "string") {
                  errorMessage = errorData.detail;
                }
              }
            } catch {
              errorMessage = err.message;
            }
          }
        } catch (parseError) {
          errorMessage = err.message || "Bilinmeyen bir hata oluştu";
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [mode, stationId, fetchWorkOrders]
  );

  // Expose test function to window for console testing
  useEffect(() => {
    (window as any).testQRCodeScan = (qrCodeData: string | object) => {
      if (typeof qrCodeData === "object") {
        qrCodeData = JSON.stringify(qrCodeData);
      }
      if (mode === null) {
        console.warn("Please select a mode first (entrance or exit)");
        return;
      }
      handleQRCodeScan(qrCodeData);
    };

    return () => {
      delete (window as any).testQRCodeScan;
    };
  }, [mode, handleQRCodeScan]);

  // QR code scanner handler - listens for rapid keyboard input
  useEffect(() => {
    if (mode === null) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (qrCodeTimeoutRef.current) {
        clearTimeout(qrCodeTimeoutRef.current);
      }

      if (e.key.length === 1) {
        if (qrCodeBufferRef.current.length === 0) {
          setLoading(true);
        }
        qrCodeBufferRef.current += e.key;
      }

      if (e.key === "Enter" && qrCodeBufferRef.current.length > 0) {
        e.preventDefault();
        setLoading(false);
        handleQRCodeScan(qrCodeBufferRef.current);
        qrCodeBufferRef.current = "";
        return;
      }

      qrCodeTimeoutRef.current = setTimeout(() => {
        if (qrCodeBufferRef.current.length > 5) {
          setLoading(false);
          handleQRCodeScan(qrCodeBufferRef.current);
        } else {
          setLoading(false);
        }
        qrCodeBufferRef.current = "";
      }, 200);
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
      if (qrCodeTimeoutRef.current) {
        clearTimeout(qrCodeTimeoutRef.current);
      }
    };
  }, [mode, handleQRCodeScan]);

  // Helper: get days in current station for a work order group
  const getDaysInStation = (entries: WorkOrderDetail[]): number => {
    const activeEntries = entries.filter(e => !e.exit_date && e.station_id === stationId);
    if (activeEntries.length === 0) return 0;

    const earliest = activeEntries.reduce((min, e) => {
      const d = new Date(e.entrance_date || "");
      return d < min ? d : min;
    }, new Date());

    return Math.floor((new Date().getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Helper: check if work order has active entries at operator's station
  const hasActiveAtMyStation = (entries: WorkOrderDetail[]): boolean => {
    return entries.some(e => e.station_id === stationId && !e.exit_date);
  };

  // Helper: get status text for the station column
  const getStationStatus = (entries: WorkOrderDetail[]): { text: string; active: boolean } => {
    const myEntries = entries.filter(e => e.station_id === stationId);
    const activeAtMine = myEntries.some(e => !e.exit_date);
    if (activeAtMine) {
      return { text: stationName, active: true };
    }
    const allExited = myEntries.length > 0 && myEntries.every(e => e.exit_date);
    if (allExited) {
      return { text: `${stationName} (Çıkış yapıldı)`, active: false };
    }
    return { text: stationName, active: false };
  };

  if (!isOperator) {
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Atölye İşlemleri</h1>
            {stationName && (
              <p className="text-gray-600 mt-1">Atölye: <span className="font-semibold">{stationName}</span></p>
            )}
          </div>
        </div>

        {/* Mode Selection Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => {
              setMode(mode === "entrance" ? null : "entrance");
              setScanProgress(null);
              setSuccessMessage(null);
            }}
            className={`flex flex-col items-center justify-center p-4 rounded-lg shadow-lg transition-all h-28 text-white ${
              mode === "entrance" ? "hover:opacity-90" : "hover:opacity-80"
            }`}
            style={{ backgroundColor: mode === "entrance" ? "#0f4c3a" : "#94A3B8" }}
          >
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-lg font-bold">İş Emri Giriş</span>
          </button>

          <button
            onClick={() => {
              setMode(mode === "exit" ? null : "exit");
              setScanProgress(null);
              setSuccessMessage(null);
            }}
            className={`flex flex-col items-center justify-center p-4 rounded-lg shadow-lg transition-all h-28 text-white ${
              mode === "exit" ? "hover:opacity-90" : "hover:opacity-80"
            }`}
            style={{ backgroundColor: mode === "exit" ? "#C53030" : "#94A3B8" }}
          >
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-lg font-bold">İş Emri Çıkış</span>
          </button>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">{successMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Scan Progress */}
        {scanProgress && !scanProgress.allDone && (
          <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-blue-800">{scanProgress.message}</p>
                <div className="mt-2 w-full bg-blue-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all"
                    style={{ width: `${(scanProgress.scanned / scanProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-2">Hata</h3>
                <div className="text-sm text-red-700 whitespace-pre-line">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator for QR processing */}
        {mode && loading && (
          <div className="mb-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg
                  className="w-12 h-12 text-green-600 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-900 mb-2">QR Kod İşleniyor...</h3>
                <p className="text-green-800 text-sm leading-relaxed">
                  Lütfen bekleyin, QR kod verisi işleniyor ve kaydediliyor.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Work Orders Table */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Atölyemdeki İş Emirleri</h2>
          {tableLoading && groupedWorkOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0f4c3a] mx-auto mb-3"></div>
              Yükleniyor...
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Parça Numarası</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Öncelik</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Müşteri Bilgisi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Durum</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kaç Gündür Atölyede</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Adet</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupedWorkOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        Bu atölyede henüz iş emri bulunmamaktadır.
                      </td>
                    </tr>
                  ) : (
                    groupedWorkOrders.map((wo) => {
                      const key = wo.work_order_group_id;
                      const isExpanded = expandedRows.has(key);
                      const daysInStation = getDaysInStation(wo.entries);
                      const isActive = hasActiveAtMyStation(wo.entries);
                      const stationStatus = getStationStatus(wo.entries);

                      // Count scanned/exited packages at my station
                      const myEntries = wo.entries.filter(e => e.station_id === stationId);
                      const scannedCount = myEntries.length;
                      const exitedCount = myEntries.filter(e => e.exit_date).length;

                      // Priority circle colors: light blue -> dark blue (levels 1-5)
                      const priorityCircleColors = [
                        { bg: "bg-sky-300", border: "border-sky-400" },
                        { bg: "bg-sky-400", border: "border-sky-500" },
                        { bg: "bg-blue-400", border: "border-blue-500" },
                        { bg: "bg-blue-600", border: "border-blue-700" },
                        { bg: "bg-blue-800", border: "border-blue-900" },
                      ];
                      // Prioritized rows: uniform transparent red background
                      const rowBg = wo.priority > 0 ? "bg-red-50/70 hover:bg-red-100/70" : "hover:bg-gray-50";

                      return (
                        <>
                          <tr
                            key={key}
                            className={`cursor-pointer transition-colors ${rowBg}`}
                            onClick={() => {
                              const newExpanded = new Set(expandedRows);
                              if (newExpanded.has(key)) newExpanded.delete(key); else newExpanded.add(key);
                              setExpandedRows(newExpanded);
                            }}
                          >
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{wo.part_number}</div>
                              <div className="text-xs text-gray-500">{wo.aselsan_order_number}</div>
                            </td>
                            <td className="px-4 py-3">
                              {wo.priority > 0 ? (
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: wo.priority }, (_, i) => (
                                    <span
                                      key={i}
                                      className={`w-6 h-6 rounded-full border-2 ${priorityCircleColors[i].bg} ${priorityCircleColors[i].border}`}
                                    />
                                  ))}
                                </div>
                              ) : <span className="text-gray-400 text-sm">-</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">{wo.company_from}</div>
                              <div className="text-xs text-gray-500">{wo.main_customer} - {wo.sector}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                {isActive ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 w-fit">
                                    Atölyede ({scannedCount - exitedCount}/{wo.total_packages} paket)
                                  </span>
                                ) : exitedCount > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 w-fit">
                                    Çıkış yapıldı ({exitedCount}/{wo.total_packages} paket)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 w-fit">
                                    Giriş: {scannedCount}/{wo.total_packages} paket
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-sm font-medium ${daysInStation > 7 ? "text-red-600" : daysInStation > 3 ? "text-yellow-600" : "text-gray-900"}`}>
                                {isActive ? `${daysInStation} gün` : "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-900">{wo.total_quantity}</span>
                            </td>
                            <td className="px-4 py-3">
                              <svg
                                className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                                <div className="bg-gray-50 border-t border-b border-gray-200 p-4">
                                  {/* Summary info */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
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
                                        <p className="font-medium text-gray-900">{new Date(wo.target_date).toLocaleDateString("tr-TR")}</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Package progress bar */}
                                  <div className="mb-4 bg-white rounded p-3 border border-gray-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      {Array.from({ length: wo.total_packages }, (_, i) => {
                                        const pkg = myEntries.find(e => e.package_index === i + 1);
                                        const isExited = pkg?.exit_date;
                                        return (
                                          <div
                                            key={i}
                                            className={`h-3 flex-1 rounded-full ${
                                              isExited ? "bg-blue-500" : pkg ? "bg-[#0f4c3a]" : "bg-gray-300"
                                            }`}
                                            title={
                                              isExited ? `Paket ${i + 1}: Çıkış yapıldı`
                                              : pkg ? `Paket ${i + 1}: Atölyede`
                                              : `Paket ${i + 1}: Bekleniyor`
                                            }
                                          />
                                        );
                                      })}
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500">
                                      <span>{scannedCount} paket girildi</span>
                                      <span>{exitedCount} paket çıkış yapıldı</span>
                                    </div>
                                  </div>

                                  {/* Entries at my station */}
                                  <h4 className="text-xs font-semibold text-gray-700 mb-2">Paket Detayları</h4>
                                  <div className="space-y-2">
                                    {myEntries.map((entry, idx) => (
                                      <div key={entry.id} className="bg-white rounded p-3 border border-gray-200 text-xs">
                                        <div className="flex items-center justify-between mb-1">
                                          <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 bg-[#0f4c3a] text-white rounded-full flex items-center justify-center text-xs font-bold">{entry.package_index}</span>
                                            <span className="text-gray-500">Paket {entry.package_index}/{entry.total_packages} ({entry.quantity} parça)</span>
                                          </div>
                                          {entry.exit_date ? (
                                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs">Çıkış Yapıldı</span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs">Atölyede</span>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-gray-600">
                                          <div>Giriş: {entry.entrance_date ? new Date(entry.entrance_date).toLocaleString("tr-TR") : "-"}</div>
                                          <div>Çıkış: {entry.exit_date ? new Date(entry.exit_date).toLocaleString("tr-TR") : "-"}</div>
                                          <div>Operatör: {entry.user_name || "Bilinmiyor"}</div>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm text-gray-700">
                    Sayfa {currentPage} / {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Önceki
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
