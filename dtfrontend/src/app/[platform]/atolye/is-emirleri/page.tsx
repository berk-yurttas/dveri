"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import QRCodeSVG from "react-qr-code";
import { OrderFilesViewer } from "@/components/atolye/OrderFilesViewer";

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
  teklif_number: string;
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
  teklif_number: string;
  aselsan_order_number: string;
  order_item_number: string;
  total_quantity: number;
  total_packages: number;
  priority: number;
  target_date: string | null;
  entries: WorkOrderDetail[];
}

interface WorkOrderQrCode {
  code: string;
  package_index: number;
  quantity: number;
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
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isYonetici, setIsYonetici] = useState(false);
  const [isOperator, setIsOperator] = useState(false);
  const [isMusteri, setIsMusteri] = useState(false);
  const [isSatinalma, setIsSatinalma] = useState(false);
  const [isAselsanSatinalma, setIsAselsanSatinalma] = useState(false);
  const [userCompany, setUserCompany] = useState<string>("");
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<string>>(new Set());

  // Company tabs state (for ASELSAN satinalma)
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

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
  const [qrCodesByGroup, setQrCodesByGroup] = useState<Record<string, WorkOrderQrCode[]>>({});
  const [qrModalGroupId, setQrModalGroupId] = useState<string | null>(null);
  const [selectedQrIndexByGroup, setSelectedQrIndexByGroup] = useState<Record<string, number>>({});

  // Check user roles
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      const yoneticiRole = user.role.find((role) =>
        typeof role === "string" && role === "atolye:yonetici"
      );
      setIsYonetici(!!yoneticiRole);

      const operatorRole = user.role.find((role) =>
        typeof role === "string" && role === "atolye:operator"
      );
      setIsOperator(!!operatorRole);

      const musteriRole = user.role.find((role) =>
        typeof role === "string" && role === "atolye:musteri"
      );
      setIsMusteri(!!musteriRole);

      const satinalmaRole = user.role.find((role) =>
        typeof role === "string" && role === "atolye:satinalma"
      );
      setIsSatinalma(!!satinalmaRole);

      // Extract company from any atolye role
      const anyAtolyeRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:")
      );
      if (anyAtolyeRole && typeof anyAtolyeRole === "string") {
        setUserCompany(user.department || user.company || "");
      }

      // Check if ASELSAN satinalma
      if (satinalmaRole && typeof satinalmaRole === "string") {
        const companyFromDepartment = (user.department || user.company || "").toUpperCase();
        if (companyFromDepartment === "ASELSAN") {
          setIsAselsanSatinalma(true);
        }
      }
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
    if (isYonetici || isOperator || isSatinalma || isMusteri) {
      fetchStations();
    }
  }, [isYonetici, isOperator, isSatinalma, isMusteri]);

  // Fetch companies for ASELSAN satinalma
  useEffect(() => {
    if (!isAselsanSatinalma) return;
    const fetchCompanies = async () => {
      try {
        const data = await api.get<string[]>("/romiot/station/work-orders/companies");
        setCompanies(data || []);
        if (data && data.length > 0 && !selectedCompany) {
          // Default to ASELSAN if available, otherwise first
          const aselsan = data.find(c => c.toUpperCase() === "ASELSAN");
          setSelectedCompany(aselsan || data[0]);
        }
      } catch (err: any) {
        console.error("Error fetching companies:", err);
      }
    };
    fetchCompanies();
  }, [isAselsanSatinalma]);

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
    if (!isYonetici && !isOperator && !isSatinalma && !isMusteri) return;

    try {
      setLoading(true);
      setError(null);

      const timestamp = new Date().getTime();
      let url = `/romiot/station/work-orders/all?page=${currentPage}&page_size=${pageSize}&_t=${timestamp}`;
      if (debouncedSearch) {
        url += `&search_part_number=${encodeURIComponent(debouncedSearch)}`;
        url += `&search_order_number=${encodeURIComponent(debouncedSearch)}`;
      }
      if (isAselsanSatinalma && selectedCompany) url += `&filter_company=${encodeURIComponent(selectedCompany)}`;

      const data = await api.get<PaginatedResponse>(url, undefined, { useCache: false });

      setTotalPages(data.total_pages);

      const grouped = groupWorkOrdersByGroup(data.items || []);
      setGroupedWorkOrders(grouped);
    } catch (err: any) {
      console.error("Error fetching work orders:", err);
      setError("İş emirleri yüklenirken hata oluştu");
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, [isYonetici, isOperator, isSatinalma, isMusteri, isAselsanSatinalma, selectedCompany, currentPage, pageSize, debouncedSearch]);

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
          teklif_number: order.teklif_number,
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

  // Priority color scale: light blue -> dark blue (levels 1-5)
  const priorityColors = [
    { bg: "bg-sky-300", border: "border-sky-400", hoverBg: "hover:bg-sky-50", hoverBorder: "hover:border-sky-300" },
    { bg: "bg-sky-400", border: "border-sky-500", hoverBg: "hover:bg-sky-50", hoverBorder: "hover:border-sky-400" },
    { bg: "bg-blue-400", border: "border-blue-500", hoverBg: "hover:bg-blue-50", hoverBorder: "hover:border-blue-400" },
    { bg: "bg-blue-600", border: "border-blue-700", hoverBg: "hover:bg-blue-50", hoverBorder: "hover:border-blue-600" },
    { bg: "bg-blue-800", border: "border-blue-900", hoverBg: "hover:bg-blue-50", hoverBorder: "hover:border-blue-700" },
  ];

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
              const color = priorityColors[level - 1];
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
                  className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
                    isActive
                      ? `${color.bg} ${color.border} shadow-sm`
                      : `bg-gray-100 border-gray-300 ${color.hoverBorder} ${color.hoverBg}`
                  }`}
                  title={`${level} jeton ata (tıklayarak seç/kaldır)`}
                />
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

    // For operator/yonetici, display filled color circles up to the priority value
    if (wo.priority > 0) {
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: wo.priority }, (_, i) => (
            <span
              key={i}
              className={`w-6 h-6 rounded-full border-2 ${priorityColors[i].bg} ${priorityColors[i].border}`}
            />
          ))}
        </div>
      );
    }
    return <span className="text-gray-400 text-sm">-</span>;
  };

  const fetchGroupQrCodes = useCallback(async (groupId: string) => {
    if (qrCodesByGroup[groupId]) return;
    const codes = await api.get<WorkOrderQrCode[]>(
      `/romiot/station/qr-code/group/${encodeURIComponent(groupId)}`,
      undefined,
      { useCache: false }
    );
    setQrCodesByGroup((prev) => ({ ...prev, [groupId]: (codes || []).sort((a, b) => a.package_index - b.package_index) }));
    setSelectedQrIndexByGroup((prev) => ({ ...prev, [groupId]: 0 }));
  }, [qrCodesByGroup]);

  const renderQRToPng = (elementId: string, qrSize: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const qrEl = document.getElementById(elementId);
      if (!qrEl) { reject(new Error(`QR element not found: ${elementId}`)); return; }
      const svgElement = qrEl.querySelector("svg");
      if (!svgElement) { reject(new Error(`SVG not found in: ${elementId}`)); return; }

      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      clonedSvg.setAttribute("width", qrSize.toString());
      clonedSvg.setAttribute("height", qrSize.toString());

      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        canvas.width = qrSize;
        canvas.height = qrSize;
        if (ctx) {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, qrSize, qrSize);
          URL.revokeObjectURL(svgUrl);
          resolve(canvas.toDataURL("image/png"));
        }
      };
      img.onerror = () => { URL.revokeObjectURL(svgUrl); reject(new Error("Image load failed")); };
      img.src = svgUrl;
    });
  };

  const printPageStyles = `
    @page { margin: 10mm; size: A4; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; display: flex; flex-direction: column; align-items: center; }
    .package-card {
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
      page-break-inside: avoid;
      page-break-after: always;
      max-width: 500px;
      width: 100%;
    }
    .package-card:last-child { page-break-after: auto; }
    @media print {
      .package-card { page-break-inside: avoid; page-break-after: always; }
      .package-card:last-child { page-break-after: auto; }
    }
  `;

  const buildPackageCardHtml = (wo: GroupedWorkOrder, imageData: string, pkg: WorkOrderQrCode, qrSize: number) => `
    <div class="package-card">
      <div style="text-align: center; margin-bottom: 16px;">
        <img src="${imageData}" alt="QR Code" style="width: ${qrSize}px; height: ${qrSize}px;" />
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <tbody>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600; width: 45%;">Ana Müşteri</td><td style="border: 1px solid #d1d5db; padding: 6px;">${wo.main_customer}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Sektör</td><td style="border: 1px solid #d1d5db; padding: 6px;">${wo.sector}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Gönderen Firma</td><td style="border: 1px solid #d1d5db; padding: 6px;">${wo.company_from}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Teklif Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${wo.teklif_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">${wo.main_customer} Sipariş Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${wo.total_packages > 1 ? wo.aselsan_order_number + "_" + pkg.package_index : wo.aselsan_order_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Sipariş Kalem Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${wo.order_item_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Parça Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${wo.part_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Toplam Sipariş Miktarı</td><td style="border: 1px solid #d1d5db; padding: 6px;">${pkg.quantity}/${wo.total_quantity}</td></tr>
          ${wo.target_date ? `<tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Hedef Bitirme Tarihi</td><td style="border: 1px solid #d1d5db; padding: 6px;">${new Date(wo.target_date).toLocaleDateString("tr-TR")}</td></tr>` : ""}
        </tbody>
      </table>
    </div>
  `;

  const handlePrintSingleQr = async (wo: GroupedWorkOrder, pkg: WorkOrderQrCode, index: number) => {
    const qrSize = 200;
    const elementId = `is-emri-qr-${wo.work_order_group_id}-${index}`;
    try {
      const imageData = await renderQRToPng(elementId, qrSize);
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>QR Kod - Paket ${pkg.package_index}</title>
            <style>${printPageStyles}</style>
          </head>
          <body>${buildPackageCardHtml(wo, imageData, pkg, qrSize)}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
    } catch (err) {
      console.error("Error printing QR code:", err);
    }
  };

  const handlePrintAllQrs = async (wo: GroupedWorkOrder, packages: WorkOrderQrCode[]) => {
    const qrSize = 200;
    try {
      const imageDataList = await Promise.all(
        packages.map((pkg, idx) =>
          renderQRToPng(`is-emri-qr-${wo.work_order_group_id}-${idx}`, qrSize).then((img) => ({ pkg, img }))
        )
      );
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      const html = imageDataList.map(({ pkg, img }) => buildPackageCardHtml(wo, img, pkg, qrSize)).join("");
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>QR Kodlar - ${wo.work_order_group_id}</title>
            <style>${printPageStyles}</style>
          </head>
          <body>${html}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    } catch (err) {
      console.error("Error printing all QR codes:", err);
    }
  };

  // Access check
  if (!isYonetici && !isOperator && !isSatinalma && !isMusteri) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Erişim Yetkisi Yok</h1>
          <p className="text-gray-600">Bu sayfayı görüntüleme yetkisine sahip değilsiniz.</p>
        </div>
      </div>
    );
  }

  if (loading && !initialLoadDone) {
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
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">İş Emirleri</h1>
          <p className="text-gray-600">
            {isSatinalma
              ? "İş emirlerinin öncelik sıralamasını belirleyin"
              : "Tüm iş emirlerinin detaylı bilgilerini görüntüleyin"}
          </p>
          </div>
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

        {/* Company Tabs for ASELSAN satinalma */}
        {isAselsanSatinalma && companies.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1">
              {companies.map((company) => (
                <button
                  key={company}
                  onClick={() => {
                    setSelectedCompany(company);
                    setCurrentPage(1);
                    setPriorityEdits(new Map());
                  }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedCompany === company
                      ? "bg-[#0f4c3a] text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {company}
                </button>
              ))}
            </div>
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

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Sipariş numarası veya parça numarası ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white text-sm"
            />
            {loading && initialLoadDone && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-[#0f4c3a]"></div>
              </div>
            )}
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
                {!isMusteri && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Parça Dökümanları</th>
                )}
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
                  <td colSpan={isMusteri ? 7 : 8} className="px-4 py-8 text-center text-gray-500">
                    {searchQuery
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
                          <div className="text-xs text-gray-500">{wo.teklif_number}</div>
                        </td>
                        {!isMusteri && (
                          <td className="px-4 py-3">
                            <OrderFilesViewer orderId={wo.part_number} />
                          </td>
                        )}
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
                          <td colSpan={isMusteri ? 7 : 8} className="px-0 py-0">
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
                                  <span className="text-gray-500">Teklif No:</span>
                                  <p className="font-medium text-gray-900">{wo.teklif_number}</p>
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

                              {isMusteri && (
                                <div className="mb-5">
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await fetchGroupQrCodes(wo.work_order_group_id);
                                        setQrModalGroupId(wo.work_order_group_id);
                                      } catch (err) {
                                        console.error("Error fetching group QR codes:", err);
                                        setError("QR kodları yüklenirken hata oluştu");
                                      }
                                    }}
                                    className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium transition-colors"
                                  >
                                    QR Kodları Gör / Yazdır
                                  </button>
                                </div>
                              )}

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

      {qrModalGroupId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">QR Kodları</h3>
              <button
                onClick={() => setQrModalGroupId(null)}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              {(() => {
                const wo = groupedWorkOrders.find((g) => g.work_order_group_id === qrModalGroupId);
                const packages = qrCodesByGroup[qrModalGroupId] || [];
                const selectedIndex = selectedQrIndexByGroup[qrModalGroupId] || 0;
                const selectedPkg = packages[selectedIndex];
                if (!wo || packages.length === 0) {
                  return <p className="text-sm text-gray-600">Bu iş emri için QR kod bulunamadı.</p>;
                }

                return (
                  <div>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {packages.map((pkg, idx) => (
                        <button
                          key={`${pkg.package_index}-${idx}`}
                          onClick={() =>
                            setSelectedQrIndexByGroup((prev) => ({ ...prev, [qrModalGroupId]: idx }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            selectedIndex === idx
                              ? "bg-[#0f4c3a] text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          Paket {pkg.package_index}
                        </button>
                      ))}
                    </div>

                    {selectedPkg && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex justify-center">
                          <div id={`is-emri-qr-${wo.work_order_group_id}-${selectedIndex}`} className="bg-white p-4 rounded-lg border border-gray-200">
                            <QRCodeSVG value={selectedPkg.code} size={220} />
                          </div>
                        </div>
                        <div className="text-sm">
                          <div className="space-y-2">
                            <p><span className="font-medium text-gray-600">Parça:</span> <span className="text-gray-900">{wo.part_number}</span></p>
                            <p><span className="font-medium text-gray-600">Teklif:</span> <span className="text-gray-900">{wo.teklif_number}</span></p>
                            <p><span className="font-medium text-gray-600">Sipariş:</span> <span className="text-gray-900">{wo.aselsan_order_number}</span></p>
                            <p><span className="font-medium text-gray-600">Paket:</span> <span className="text-gray-900">{selectedPkg.package_index}/{wo.total_packages}</span></p>
                            <p><span className="font-medium text-gray-600">Miktar:</span> <span className="text-gray-900">{selectedPkg.quantity}/{wo.total_quantity}</span></p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex gap-3 justify-end">
                      {selectedPkg && (
                        <button
                          onClick={() => handlePrintSingleQr(wo, selectedPkg, selectedIndex)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Seçili QR Yazdır
                        </button>
                      )}
                      <button
                        onClick={() => handlePrintAllQrs(wo, packages)}
                        className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Tümünü Yazdır
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

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
