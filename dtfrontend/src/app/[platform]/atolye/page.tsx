"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import QRCodeSVG from "react-qr-code";

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
  if (!qrCodeData || typeof qrCodeData !== 'object') {
    throw new Error("QR kod verisi geçersiz veya boş");
  }
  
  const errors: string[] = [];
  
  const workOrderGroupId = qrCodeData.work_order_group_id;
  const mainCustomer = qrCodeData.main_customer;
  const sector = qrCodeData.sector;
  const companyFrom = qrCodeData.company_from;
  const aselsanOrderNumber = qrCodeData.aselsan_order_number;
  const orderItemNumber = qrCodeData.order_item_number;
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
  
  const quantityNum = typeof quantity === 'number' ? quantity : Number(quantity);
  if (!quantity || isNaN(quantityNum) || quantityNum <= 0) {
    errors.push("Parça sayısı eksik veya geçersiz");
  }
  
  const totalQuantityNum = typeof totalQuantity === 'number' ? totalQuantity : Number(totalQuantity);
  const packageIndexNum = typeof packageIndex === 'number' ? packageIndex : Number(packageIndex);
  const totalPackagesNum = typeof totalPackages === 'number' ? totalPackages : Number(totalPackages);
  
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
    quantity: quantityNum,
    total_quantity: totalQuantityNum,
    package_index: packageIndexNum,
    total_packages: totalPackagesNum,
    target_date: targetDate || null,
  };
};

// Map QR code data to exit payload
const mapQRCodeToExitApi = (qrCodeData: any, stationId: number): any => {
  if (!qrCodeData || typeof qrCodeData !== 'object') {
    throw new Error("QR kod verisi geçersiz veya boş");
  }
  
  const workOrderGroupId = qrCodeData.work_order_group_id;
  const packageIndex = qrCodeData.package_index;
  
  if (!workOrderGroupId) throw new Error("İş Emri Grup ID eksik");
  if (!packageIndex) throw new Error("Paket sırası eksik");
  
  return {
    station_id: stationId,
    work_order_group_id: String(workOrderGroupId).trim(),
    package_index: typeof packageIndex === 'number' ? packageIndex : Number(packageIndex),
  };
};


interface Station {
  id: number;
  name: string;
  company: string;
}

interface PackageInfo {
  code: string;
  package_index: number;
  quantity: number;
}

interface BatchQRResponse {
  work_order_group_id: string;
  total_packages: number;
  total_quantity: number;
  packages: PackageInfo[];
  expires_at: string | null;
}

interface BarcodeFormData {
  main_customer: string;
  sector: string;
  company_from: string;
  aselsan_order_number: string;
  order_item_number: string;
  part_number: string;
  quantity: number;
  package_quantity: number;
  target_date: string;
}

export default function AtolyePage() {
  const { user } = useUser();
  const [isOperator, setIsOperator] = useState(false);
  const [isYonetici, setIsYonetici] = useState(false);
  const [isMusteri, setIsMusteri] = useState(false);
  const [userCompany, setUserCompany] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [qrCodeInput, setQRCodeInput] = useState("");
  const [entranceWorkOrders, setEntranceWorkOrders] = useState<WorkOrder[]>([]);
  const [exitWorkOrders, setExitWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [stationId, setStationId] = useState<number | null>(null);
  const qrCodeInputRef = useRef<HTMLInputElement>(null);
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

  // Check user roles and extract company
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      // Check for operator role
      const operatorRole = user.role.find((role) => 
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":operator")
      );
      if (operatorRole) {
        setIsOperator(true);
        const parts = operatorRole.split(":");
        if (parts.length === 3) {
          setUserCompany(parts[1]);
        }
        const fetchOperatorStation = async () => {
          try {
            const stationData = await api.get<{ station_id: number; name: string; company: string }>(
              "/romiot/station/stations/my-station"
            );
            setStationId(stationData.station_id);
          } catch (err: any) {
            console.error("Error fetching operator station:", err);
            setError("Atölye bilgisi alınamadı. Lütfen yönetici ile iletişime geçin.");
          }
        };
        fetchOperatorStation();
      }

      // Check for yonetici role
      const yoneticiRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":yonetici")
      );
      if (yoneticiRole) {
        setIsYonetici(true);
        const parts = yoneticiRole.split(":");
        if (parts.length === 3) {
          setUserCompany(parts[1]);
        }
      }

      // Check for musteri role
      const musteriRole = user.role.find((role) =>
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":musteri")
      );
      if (musteriRole) {
        setIsMusteri(true);
        const parts = musteriRole.split(":");
        if (parts.length === 3) {
          setUserCompany(parts[1]);
        }
      }
    }
  }, [user]);

  const fetchEntranceWorkOrders = useCallback(async () => {
    if (!stationId) return;

    try {
      api.clearCachePattern(/\/romiot\/station\/work-orders\/list\//);
      const timestamp = new Date().getTime();
      const data = await api.get<WorkOrder[]>(
        `/romiot/station/work-orders/list/${stationId}?status_filter=Entrance&_t=${timestamp}`,
        undefined,
        { useCache: false }
      );
      setEntranceWorkOrders(data || []);
    } catch (err: any) {
      console.error("Error fetching entrance work orders:", err);
    }
  }, [stationId]);

  const fetchExitWorkOrders = useCallback(async () => {
    if (!stationId) return;

    try {
      api.clearCachePattern(/\/romiot\/station\/work-orders\/list\//);
      const timestamp = new Date().getTime();
      const data = await api.get<WorkOrder[]>(
        `/romiot/station/work-orders/list/${stationId}?status_filter=Exit&_t=${timestamp}`,
        undefined,
        { useCache: false }
      );
      setExitWorkOrders(data || []);
    } catch (err: any) {
      console.error("Error fetching exit work orders:", err);
    }
  }, [stationId]);

  const handleQRCodeScan = useCallback(async (qrCodeData: string) => {
    if (!stationId) {
      setError("Atölye ID bulunamadı");
      return;
    }

    setError(null);
    setSuccessMessage(null);

    console.log("QR Kod Okundu (Raw):", qrCodeData);

    try {
      let parsedData: QRCodeData;
      let decodedData = qrCodeData.trim();
      
      try {
        // Decode 5-digit chunks to ASCII and retrieve from API
        const chunks = decodedData.match(/.{1,5}/g) || [];
        decodedData = chunks
          .map(chunk => {
            const charCode = parseInt(chunk, 10);
            return String.fromCharCode(charCode);
          })
          .join('');
        
        const response = await api.get<{ data: QRCodeData }>(
          `/romiot/station/qr-code/retrieve/${decodedData}`
        );
        parsedData = response.data;
        console.log("QR Kod Verisi Alındı:", parsedData);
      } catch (decodeError) {
        console.error("Decode Hatası:", decodeError);
        setError("QR kod decode edilemedi");
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
          // Clear progress after showing success
          setTimeout(() => setScanProgress(null), 5000);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        await Promise.all([
          fetchEntranceWorkOrders(),
          fetchExitWorkOrders(),
        ]);
        
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

        const response = await api.post<WorkOrderExitResponse>("/romiot/station/work-orders/update-exit-date", payload);
        
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
        
        await new Promise(resolve => setTimeout(resolve, 100));
        await Promise.all([
          fetchEntranceWorkOrders(),
          fetchExitWorkOrders(),
        ]);
        
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
                  "main_customer": "Ana Müşteri",
                  "sector": "Sektör",
                  "company_from": "Gönderen Firma",
                  "aselsan_order_number": "ASELSAN Sipariş Numarası",
                  "order_item_number": "Sipariş Kalem Numarası",
                  "part_number": "Parça Numarası",
                  "quantity": "Toplam Sipariş Miktarı",
                  "station_id": "Atölye ID",
                  "work_order_group_id": "İş Emri Grup ID",
                  "package_index": "Parti Sırası",
                };
                
                const errorMessages = errorData.detail.map((error: any) => {
                  const fieldName = fieldTranslations[error.loc?.[error.loc.length - 1]] || error.loc?.join(".") || "Bilinmeyen alan";
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
  }, [mode, stationId, fetchEntranceWorkOrders, fetchExitWorkOrders]);

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
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
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

  // Fetch work orders when mode or workshop changes
  useEffect(() => {
    if (stationId) {
      if (mode === "entrance" || mode === null) {
        fetchEntranceWorkOrders();
      }
      if (mode === "exit" || mode === null) {
        fetchExitWorkOrders();
      }
    }
  }, [mode, stationId, fetchEntranceWorkOrders, fetchExitWorkOrders]);

  // Poll for updates every 5 seconds
  useEffect(() => {
    if (!stationId) return;

    const interval = setInterval(() => {
      if (mode === "entrance" || mode === null) {
        fetchEntranceWorkOrders();
      }
      if (mode === "exit" || mode === null) {
        fetchExitWorkOrders();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [mode, stationId, fetchEntranceWorkOrders, fetchExitWorkOrders]);

  // Yonetici UI state
  const [stations, setStations] = useState<Station[]>([]);
  const [stationFormData, setStationFormData] = useState({ name: "", company: "" });
  const [userFormData, setUserFormData] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    password_confirm: "",
    station_id: "",
    role: "operator" as "musteri" | "operator",
  });
  const [yoneticiLoading, setYoneticiLoading] = useState(false);
  const [yoneticiError, setYoneticiError] = useState<string | null>(null);
  const [yoneticiSuccess, setYoneticiSuccess] = useState<string | null>(null);

  // Fetch stations for yonetici
  const fetchStations = useCallback(async () => {
    if (!isYonetici) return;
    try {
      api.clearCachePattern(/\/romiot\/station\/stations\//);
      const timestamp = new Date().getTime();
      const data = await api.get<Station[]>(
        `/romiot/station/stations/?_t=${timestamp}`,
        undefined,
        { useCache: false }
      );
      setStations(data || []);
    } catch (err: any) {
      console.error("Error fetching stations:", err);
      setYoneticiError("Atölyeler yüklenirken hata oluştu");
    }
  }, [isYonetici]);

  useEffect(() => {
    if (isYonetici && userCompany) {
      fetchStations();
      setStationFormData({ name: "", company: userCompany });
    }
  }, [isYonetici, userCompany, fetchStations]);

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setYoneticiLoading(true);
    setYoneticiError(null);
    setYoneticiSuccess(null);

    try {
      await api.post("/romiot/station/stations/", stationFormData);
      setYoneticiSuccess("Atölye başarıyla oluşturuldu");
      setStationFormData({ name: "", company: userCompany || "" });
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchStations();
    } catch (err: any) {
      let errorMessage = "Atölye oluşturulurken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setYoneticiError(errorMessage);
    } finally {
      setYoneticiLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setYoneticiLoading(true);
    setYoneticiError(null);
    setYoneticiSuccess(null);

    try {
      if (userFormData.password !== userFormData.password_confirm) {
        setYoneticiError("Şifreler eşleşmiyor");
        setYoneticiLoading(false);
        return;
      }

      const payload: any = {
        username: userFormData.username,
        name: userFormData.name,
        email: userFormData.email,
        password: userFormData.password,
        password_confirm: userFormData.password_confirm,
        role: userFormData.role,
      };
      
      if (userFormData.role === "operator") {
        const stationIdNum = parseInt(userFormData.station_id, 10);
        if (isNaN(stationIdNum)) {
          setYoneticiError("Geçerli bir atölye seçiniz");
          setYoneticiLoading(false);
          return;
        }
        payload.station_id = stationIdNum;
      }

      await api.post("/romiot/station/stations/user", payload);

      setYoneticiSuccess("Kullanıcı başarıyla oluşturuldu");
      setUserFormData({
        username: "",
        name: "",
        email: "",
        password: "",
        password_confirm: "",
        station_id: "",
        role: "operator",
      });
    } catch (err: any) {
      let errorMessage = "Kullanıcı oluşturulurken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setYoneticiError(errorMessage);
    } finally {
      setYoneticiLoading(false);
    }
  };

  // Musteri UI state
  const [barcodeFormData, setBarcodeFormData] = useState<BarcodeFormData>({
    main_customer: "ASELSAN",
    sector: "",
    company_from: "",
    aselsan_order_number: "",
    order_item_number: "",
    part_number: "",
    quantity: 0,
    package_quantity: 0,
    target_date: "",
  });
  const [generatedBatch, setGeneratedBatch] = useState<BatchQRResponse | null>(null);

  // Prefill company_from with user's company
  useEffect(() => {
    if (userCompany && isMusteri) {
      setBarcodeFormData(prev => ({ ...prev, company_from: userCompany }));
    }
  }, [userCompany, isMusteri]);
  const [selectedPackageIndex, setSelectedPackageIndex] = useState<number>(0);
  const qrCodeRef = useRef<HTMLDivElement | null>(null);

  const handleGenerateBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeFormData.quantity <= 0) {
      setError("Toplam sipariş miktarı 0'dan büyük olmalıdır");
      return;
    }
    if (!barcodeFormData.target_date) {
      setError("Hedef Bitirme Tarihi zorunludur");
      return;
    }

    // Validate target_date is at least 7 days from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() + 7);
    const selectedDate = new Date(barcodeFormData.target_date);
    if (selectedDate < minDate) {
      setError(`Hedef Bitirme Tarihi en erken ${minDate.toLocaleDateString("tr-TR")} olabilir`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Default package_quantity to 1 if not provided or 0
      const effectivePackageQuantity = barcodeFormData.package_quantity > 0 ? barcodeFormData.package_quantity : 1;

      const payload: any = {
        main_customer: barcodeFormData.main_customer,
        sector: barcodeFormData.sector,
        company_from: barcodeFormData.company_from,
        aselsan_order_number: barcodeFormData.aselsan_order_number,
        order_item_number: barcodeFormData.order_item_number,
        part_number: barcodeFormData.part_number,
        quantity: barcodeFormData.quantity,
        package_quantity: effectivePackageQuantity,
        target_date: barcodeFormData.target_date,
      };

      const response = await api.post<BatchQRResponse>(
        "/romiot/station/qr-code/generate-batch",
        payload
      );

      setGeneratedBatch(response);
      setSelectedPackageIndex(0);
    } catch (err: any) {
      console.error("QR generation error:", err);
      let errorMessage = "QR kod oluşturulurken hata oluştu";
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          errorMessage = errorObj.detail || errorMessage;
        } catch {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Helper to render a single QR SVG to a PNG data URL
  const renderQRToPng = (elementId: string, qrSize: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const qrEl = document.getElementById(elementId);
      if (!qrEl) { reject(new Error(`QR element not found: ${elementId}`)); return; }
      const svgElement = qrEl.querySelector('svg');
      if (!svgElement) { reject(new Error(`SVG not found in: ${elementId}`)); return; }

      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      clonedSvg.setAttribute('width', qrSize.toString());
      clonedSvg.setAttribute('height', qrSize.toString());

      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = qrSize;
        canvas.height = qrSize;
        if (ctx) {
          ctx.fillStyle = 'white';
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

  // Build the print HTML for one package card (QR on top, info table below)
  const buildPackageCardHtml = (imageData: string, pkg: PackageInfo, qrSize: number, totalQuantity: number, totalPackages: number) => `
    <div class="package-card">
      <div style="text-align: center; margin-bottom: 16px;">
        <img src="${imageData}" alt="QR Code" style="width: ${qrSize}px; height: ${qrSize}px;" />
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <tbody>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600; width: 45%;">Ana Müşteri</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.main_customer}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Sektör</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.sector}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Gönderen Firma</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.company_from}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">ASELSAN Sipariş Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${totalPackages > 1 ? barcodeFormData.aselsan_order_number + '_' + pkg.package_index : barcodeFormData.aselsan_order_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Sipariş Kalem Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.order_item_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Parça Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.part_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Toplam Sipariş Miktarı</td><td style="border: 1px solid #d1d5db; padding: 6px;">${pkg.quantity}/${totalQuantity}</td></tr>
          ${barcodeFormData.target_date ? `<tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Hedef Bitirme Tarihi</td><td style="border: 1px solid #d1d5db; padding: 6px;">${new Date(barcodeFormData.target_date).toLocaleDateString("tr-TR")}</td></tr>` : ''}
        </tbody>
      </table>
    </div>
  `;

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

  // Print a single QR code
  const handlePrintSingleBarcode = (packageIndex: number) => {
    if (!generatedBatch) return;
    const pkg = generatedBatch.packages[packageIndex];
    if (!pkg) return;

    const qrSize = 200;

    renderQRToPng(`qr-package-${packageIndex}`, qrSize).then(imageData => {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>QR Kod - Paket ${pkg.package_index}</title>
            <style>${printPageStyles}</style>
          </head>
          <body>
            ${buildPackageCardHtml(imageData, pkg, qrSize, generatedBatch.total_quantity, generatedBatch.total_packages)}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
    }).catch(err => console.error("Error printing QR code:", err));
  };

  // Print all QR codes
  const handlePrintAllBarcodes = () => {
    if (!generatedBatch) return;

    const qrSize = 200;

    const renderPromises = generatedBatch.packages.map((pkg, index) =>
      renderQRToPng(`qr-package-${index}`, qrSize).then(imageData => ({ imageData, pkg }))
    );

    Promise.all(renderPromises).then(results => {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      const packagesHtml = results.map(({ imageData, pkg }) =>
        buildPackageCardHtml(imageData, pkg, qrSize, generatedBatch.total_quantity, generatedBatch.total_packages)
      ).join('');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>QR Kodlar - ${generatedBatch.work_order_group_id}</title>
            <style>${printPageStyles}</style>
          </head>
          <body>
            ${packagesHtml}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }).catch(err => console.error("Error rendering QR codes for print:", err));
  };

  if (!isOperator && !isYonetici && !isMusteri) {
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

  // Yonetici UI
  if (isYonetici) {
    return (
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Atölye Yönetimi
            </h1>
          </div>

          {yoneticiSuccess && (
            <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
              {yoneticiSuccess}
            </div>
          )}

          {yoneticiError && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-2">Hata</h3>
                  <div className="text-sm text-red-700 whitespace-pre-line">
                    {yoneticiError}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Create Workshop Form */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Yeni Atölye Oluştur
              </h2>
              <form onSubmit={handleCreateStation}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                    <input
                      type="text"
                      value={stationFormData.name}
                      onChange={(e) => setStationFormData({ ...stationFormData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Şirket *</label>
                    <input
                      type="text"
                      value={stationFormData.company}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                      readOnly
                      disabled
                    />
                    <p className="mt-1 text-xs text-gray-500">Şirket bilgisi otomatik olarak doldurulmuştur</p>
                  </div>
                  <button
                    type="submit"
                    disabled={yoneticiLoading}
                    className="w-full px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {yoneticiLoading ? "Oluşturuluyor..." : "Atölye Oluştur"}
                  </button>
                </div>
              </form>
            </div>

            {/* Create User Form */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Yeni Kullanıcı Oluştur
              </h2>
              <form onSubmit={handleCreateUser}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Kullanıcı Adı *</label>
                    <input
                      type="text"
                      value={userFormData.username}
                      onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">İsim *</label>
                    <input
                      type="text"
                      value={userFormData.name}
                      onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">E-posta *</label>
                    <input
                      type="email"
                      value={userFormData.email}
                      onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Şifre *</label>
                    <input
                      type="password"
                      value={userFormData.password}
                      onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Şifre Tekrar *</label>
                    <input
                      type="password"
                      value={userFormData.password_confirm}
                      onChange={(e) => setUserFormData({ ...userFormData, password_confirm: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Rol *</label>
                    <select
                      value={userFormData.role}
                      onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as "musteri" | "operator" })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    >
                      <option value="operator">Operator</option>
                      <option value="musteri">Müşteri</option>
                    </select>
                  </div>
                  {userFormData.role === "operator" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Atölye *</label>
                      <select
                        value={userFormData.station_id}
                        onChange={(e) => setUserFormData({ ...userFormData, station_id: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                        required
                        disabled={yoneticiLoading || stations.length === 0}
                      >
                        <option value="">Atölye Seçiniz</option>
                        {stations.map((station) => (
                          <option key={station.id} value={station.id}>{station.name}</option>
                        ))}
                      </select>
                      {stations.length === 0 && (
                        <p className="mt-1 text-xs text-gray-500">Henüz atölye bulunmamaktadır</p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Şirket</label>
                    <input
                      type="text"
                      value={userCompany || ""}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                      readOnly
                      disabled
                    />
                    <p className="mt-1 text-xs text-gray-500">Kullanıcı otomatik olarak şirketinize atanacaktır</p>
                  </div>
                  <button
                    type="submit"
                    disabled={yoneticiLoading || stations.length === 0}
                    className="w-full px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {yoneticiLoading ? "Oluşturuluyor..." : "Kullanıcı Oluştur"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Musteri UI
  if (isMusteri) {
    return (
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Barkod Oluştur
          </h1>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-2">Hata</h3>
                  <div className="text-sm text-red-700 whitespace-pre-line">{error}</div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              İş Emri Bilgileri
            </h2>
            <form onSubmit={handleGenerateBarcode}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ana Müşteri *</label>
                  <select
                    value={barcodeFormData.main_customer}
                    onChange={(e) => {
                      const newCustomer = e.target.value;
                      setBarcodeFormData({
                        ...barcodeFormData,
                        main_customer: newCustomer,
                        sector: newCustomer === "ASELSAN" ? "" : "-",
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  >
                    <option value="ASELSAN">ASELSAN</option>
                    <option value="ROKETSAN">ROKETSAN</option>
                    <option value="TUSAŞ">TUSAŞ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sektör *</label>
                  <select
                    value={barcodeFormData.sector}
                    onChange={(e) => setBarcodeFormData({ ...barcodeFormData, sector: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  >
                    {barcodeFormData.main_customer === "ASELSAN" ? (
                      <>
                        <option value="" disabled>Sektör seçiniz</option>
                        <option value="AGS">AGS</option>
                        <option value="HBT">HBT</option>
                        <option value="MEOS">MEOS</option>
                        <option value="REHİS">REHİS</option>
                        <option value="SST">SST</option>
                        <option value="UGES">UGES</option>
                      </>
                    ) : (
                      <option value="-">-</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gönderen Firma *</label>
                  <input
                    type="text"
                    value={barcodeFormData.company_from}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                    readOnly
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ASELSAN Sipariş Numarası *</label>
                  <input
                    type="text"
                    value={barcodeFormData.aselsan_order_number}
                    onChange={(e) => setBarcodeFormData({ ...barcodeFormData, aselsan_order_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sipariş Kalem Numarası *</label>
                  <input
                    type="text"
                    value={barcodeFormData.order_item_number}
                    onChange={(e) => setBarcodeFormData({ ...barcodeFormData, order_item_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Parça Numarası *</label>
                  <input
                    type="text"
                    value={barcodeFormData.part_number}
                    onChange={(e) => setBarcodeFormData({ ...barcodeFormData, part_number: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Toplam Sipariş Miktarı *</label>
                  <input
                    type="number"
                    min="1"
                    value={barcodeFormData.quantity || ""}
                    onChange={(e) => setBarcodeFormData({ ...barcodeFormData, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Parti Sayısı</label>
                  <input
                    type="number"
                    min="1"
                    value={barcodeFormData.package_quantity || ""}
                    onChange={(e) => setBarcodeFormData({ ...barcodeFormData, package_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    placeholder="Bölmek istediğiniz parti sayısı"
                  />
                  {barcodeFormData.quantity > 0 && barcodeFormData.package_quantity > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {barcodeFormData.package_quantity} adet QR kod oluşturulacak
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hedef Bitirme Tarihi *</label>
                  <input
                    type="date"
                    value={barcodeFormData.target_date}
                    onChange={(e) => setBarcodeFormData({ ...barcodeFormData, target_date: e.target.value })}
                    min={(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; })()}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 px-4 py-2 bg-[#fe9526] hover:bg-[#e5861f] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Oluşturuluyor..." : "Barkod Oluştur"}
              </button>
            </form>
          </div>

          {/* Generated QR Codes Display */}
          {generatedBatch && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Oluşturulan QR Kodlar
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    İş Emri: {generatedBatch.work_order_group_id} - {generatedBatch.total_packages} paket, toplam {generatedBatch.total_quantity} parça
                  </p>
                </div>
                <button
                  onClick={handlePrintAllBarcodes}
                  className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Tümünü Yazdır
                </button>
              </div>

              {/* Package tabs */}
              <div className="flex flex-wrap gap-2 mb-6">
                {generatedBatch.packages.map((pkg, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedPackageIndex(index)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedPackageIndex === index
                        ? 'bg-[#008080] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Paket {pkg.package_index} ({pkg.quantity} adet)
                  </button>
                ))}
              </div>

              {/* Selected package QR code */}
              {generatedBatch.packages.map((pkg, index) => (
                <div
                  key={index}
                  className={index === selectedPackageIndex ? "block" : "hidden"}
                >
                  <div className="border-2 border-gray-300 p-6 rounded-lg bg-gray-50 mb-4">
                    <div className="flex flex-col items-center justify-center overflow-hidden">
                      {/* QR Code */}
                      <div className="text-center mb-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#008080] text-white">
                          Paket {pkg.package_index} / {generatedBatch.total_packages}
                        </span>
                      </div>
                      <div
                        id={`qr-package-${index}`}
                        ref={index === selectedPackageIndex ? qrCodeRef : null}
                        className="w-full max-w-md flex items-center justify-center bg-white p-4 rounded-lg"
                      >
                        <QRCodeSVG
                          value={pkg.code}
                          size={300}
                          level="H"
                        />
                      </div>

                      {/* Info table under QR code */}
                      <div className="w-full max-w-md mt-4">
                        <table className="w-full border-collapse text-sm">
                          <tbody>
                            <tr className="border-b border-gray-200">
                              <td className="py-2 px-3 font-semibold text-gray-700 w-[45%]">Ana Müşteri</td>
                              <td className="py-2 px-3 text-gray-900">{barcodeFormData.main_customer}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="py-2 px-3 font-semibold text-gray-700">Sektör</td>
                              <td className="py-2 px-3 text-gray-900">{barcodeFormData.sector}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="py-2 px-3 font-semibold text-gray-700">Gönderen Firma</td>
                              <td className="py-2 px-3 text-gray-900">{barcodeFormData.company_from}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="py-2 px-3 font-semibold text-gray-700">ASELSAN Sipariş Numarası</td>
                              <td className="py-2 px-3 text-gray-900">
                                {generatedBatch && generatedBatch.total_packages > 1
                                  ? `${barcodeFormData.aselsan_order_number}_${pkg.package_index}`
                                  : barcodeFormData.aselsan_order_number}
                              </td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="py-2 px-3 font-semibold text-gray-700">Sipariş Kalem Numarası</td>
                              <td className="py-2 px-3 text-gray-900">{barcodeFormData.order_item_number}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="py-2 px-3 font-semibold text-gray-700">Parça Numarası</td>
                              <td className="py-2 px-3 text-gray-900">{barcodeFormData.part_number}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="py-2 px-3 font-semibold text-gray-700">Toplam Sipariş Miktarı</td>
                              <td className="py-2 px-3 text-gray-900">{pkg.quantity}/{generatedBatch?.total_quantity ?? barcodeFormData.quantity}</td>
                            </tr>
                            {barcodeFormData.target_date && (
                              <tr className="border-b border-gray-200">
                                <td className="py-2 px-3 font-semibold text-gray-700">Hedef Bitirme Tarihi</td>
                                <td className="py-2 px-3 text-gray-900">{new Date(barcodeFormData.target_date).toLocaleDateString("tr-TR")}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Print this QR button */}
                      <button
                        onClick={() => handlePrintSingleBarcode(index)}
                        className="mt-4 px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Bu QR Kodu Yazdır
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Helper to group work orders by work_order_group_id for display
  const groupWorkOrders = (orders: WorkOrder[]) => {
    const groups = new Map<string, WorkOrder[]>();
    orders.forEach(order => {
      const key = order.work_order_group_id;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(order);
    });
    return Array.from(groups.entries());
  };

  const renderTable = (workOrders: WorkOrder[]) => {
    const grouped = groupWorkOrders(workOrders);
    
    if (grouped.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          Henüz kayıt bulunmamaktadır.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {grouped.map(([groupId, orders]) => {
          const firstOrder = orders[0];
          const scannedCount = orders.length;
          const totalPkgs = firstOrder.total_packages;
          const allScanned = scannedCount >= totalPkgs;

          return (
            <div key={groupId} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-gray-900">{firstOrder.aselsan_order_number}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      allScanned ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {scannedCount}/{totalPkgs} paket
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{firstOrder.main_customer} - {firstOrder.sector}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
                  <div><span className="font-medium">Gönderen:</span> {firstOrder.company_from}</div>
                  <div><span className="font-medium">Sipariş Kalem No:</span> {firstOrder.order_item_number}</div>
                  <div><span className="font-medium">Toplam:</span> {firstOrder.total_quantity} parça</div>
                  {firstOrder.target_date && (
                    <div><span className="font-medium">Hedef:</span> {new Date(firstOrder.target_date).toLocaleDateString("tr-TR")}</div>
                  )}
                </div>
              </div>
              {/* Package progress bar */}
              <div className="px-4 py-2 bg-gray-50">
                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPkgs }, (_, i) => {
                    const pkg = orders.find(o => o.package_index === i + 1);
                    return (
                      <div
                        key={i}
                        className={`h-2 flex-1 rounded-full ${
                          pkg ? (mode === "exit" ? 'bg-red-500' : 'bg-[#008080]') : 'bg-gray-300'
                        }`}
                        title={pkg ? `Paket ${i + 1}: ${pkg.quantity}/${firstOrder.total_quantity} parça` : `Paket ${i + 1}: Bekleniyor`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-500">{scannedCount} paket okundu</span>
                  <span className="text-xs text-gray-500">{orders.reduce((sum, o) => sum + o.quantity, 0)} / {firstOrder.total_quantity} parça</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Atölye İşlemleri
          </h1>
        </div>

        {/* Mode Selection Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <button
            onClick={() => { setMode(mode === "entrance" ? null : "entrance"); setScanProgress(null); setSuccessMessage(null); }}
            className={`flex flex-col items-center justify-center p-4 rounded-lg shadow-lg transition-all h-28 text-white ${
              mode === "entrance" ? "hover:opacity-90" : "hover:opacity-80"
            }`}
            style={{ backgroundColor: mode === "entrance" ? "#008080" : "#94A3B8" }}
          >
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span className="text-lg font-bold">İş Emri Giriş</span>
          </button>

          <button
            onClick={() => { setMode(mode === "exit" ? null : "exit"); setScanProgress(null); setSuccessMessage(null); }}
            className={`flex flex-col items-center justify-center p-4 rounded-lg shadow-lg transition-all h-28 text-white ${
              mode === "exit" ? "hover:opacity-90" : "hover:opacity-80"
            }`}
            style={{ backgroundColor: mode === "exit" ? "#C53030" : "#94A3B8" }}
          >
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
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
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
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
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
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
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
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
                <svg className="w-12 h-12 text-green-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-900 mb-2">QR Kod İşleniyor...</h3>
                <p className="text-green-800 text-sm leading-relaxed">Lütfen bekleyin, QR kod verisi işleniyor ve kaydediliyor.</p>
              </div>
            </div>
          </div>
        )}

        {/* Tables */}
        <div className="space-y-8">
          {(mode === "entrance" || mode === null) && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Giriş Yapılmış İş Emirleri
              </h2>
              {renderTable(entranceWorkOrders)}
            </div>
          )}

          {(mode === "exit" || mode === null) && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Çıkış Yapılmış İş Emirleri
              </h2>
              {renderTable(exitWorkOrders)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
