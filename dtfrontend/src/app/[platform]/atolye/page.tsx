"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import QRCodeSVG from "react-qr-code";

type Mode = "entrance" | "exit" | null;

interface QRCodeData {
  AselsanSiparisNo: string;
  SiparisKalemi: string;
  AselsanIsEmriNo: string;
  IsEmriAdedi: number;
  UreticiFirmaNo: string;
}

interface WorkOrder {
  id: number;
  station_id: number;
  user_id: number;
  manufacturer_number: string;
  aselsan_order_number: string;
  aselsan_work_order_number: string;
  order_item_number: string;
  quantity: number;
  entrance_date: string | null;
  exit_date: string | null;
}

// Map JSON field names from QR code to API field names
// Note: user_id is automatically resolved by the backend from the authenticated user
const mapQRCodeToApi = (qrCodeData: any, stationId: number): any => {
  // Validate qrCodeData exists
  if (!qrCodeData || typeof qrCodeData !== 'object') {
    throw new Error("QR kod verisi geçersiz veya boş");
  }
  
  // Validate all required fields
  const errors: string[] = [];
  
  // Extract values - handle both direct access and case-insensitive matching
  const ureticiFirmaNo = qrCodeData.UreticiFirmaNo ?? qrCodeData.ureticiFirmaNo ?? qrCodeData.UreticiFirmaNo;
  const aselsanSiparisNo = qrCodeData.AselsanSiparisNo ?? qrCodeData.aselsanSiparisNo;
  const siparisKalemi = qrCodeData.SiparisKalemi ?? qrCodeData.siparisKalemi;
  const aselsanIsEmriNo = qrCodeData.AselsanIsEmriNo ?? qrCodeData.aselsanIsEmriNo;
  const isEmriAdedi = qrCodeData.IsEmriAdedi ?? qrCodeData.isEmriAdedi;
  
  // Check UreticiFirmaNo - must be a non-empty string
  if (ureticiFirmaNo === undefined || ureticiFirmaNo === null || 
      (typeof ureticiFirmaNo === 'string' && ureticiFirmaNo.trim() === '') ||
      ureticiFirmaNo === '') {
    errors.push("Üretici Firma Numarası eksik");
  }
  
  // Check AselsanSiparisNo - must be a non-empty string
  if (aselsanSiparisNo === undefined || aselsanSiparisNo === null || 
      (typeof aselsanSiparisNo === 'string' && aselsanSiparisNo.trim() === '') ||
      aselsanSiparisNo === '') {
    errors.push("ASELSAN Sipariş Numarası eksik");
  }
  
  // Check SiparisKalemi - must be a non-empty string
  if (siparisKalemi === undefined || siparisKalemi === null || 
      (typeof siparisKalemi === 'string' && siparisKalemi.trim() === '') ||
      siparisKalemi === '') {
    errors.push("Sipariş Kalemi eksik");
  }
  
  // Check AselsanIsEmriNo - must be a non-empty string
  if (aselsanIsEmriNo === undefined || aselsanIsEmriNo === null || 
      (typeof aselsanIsEmriNo === 'string' && aselsanIsEmriNo.trim() === '') ||
      aselsanIsEmriNo === '') {
    errors.push("ASELSAN İş Emri Numarası eksik");
  }
  
  // Check IsEmriAdedi - must be a positive number
  const isEmriAdediNum = typeof isEmriAdedi === 'number' ? isEmriAdedi : Number(isEmriAdedi);
  if (isEmriAdedi === undefined || isEmriAdedi === null || 
      isNaN(isEmriAdediNum) || isEmriAdediNum <= 0) {
    errors.push("İş Emri Adedi eksik veya geçersiz (0'dan büyük olmalıdır)");
  }
  
  if (errors.length > 0) {
    console.error("QR code validation errors:", errors);
    console.error("QR code data received:", qrCodeData);
    console.error("QR code data keys:", Object.keys(qrCodeData));
    console.error("Extracted values:", {
      ureticiFirmaNo,
      aselsanSiparisNo,
      siparisKalemi,
      aselsanIsEmriNo,
      isEmriAdedi
    });
    throw new Error(errors.join(", "));
  }
  
  // Convert all string values to trimmed strings
  const ureticiFirmaNoStr = String(ureticiFirmaNo).trim();
  const aselsanSiparisNoStr = String(aselsanSiparisNo).trim();
  const siparisKalemiStr = String(siparisKalemi).trim();
  const aselsanIsEmriNoStr = String(aselsanIsEmriNo).trim();
  
  return {
    station_id: stationId,
    manufacturer_number: ureticiFirmaNoStr,
    aselsan_order_number: aselsanSiparisNoStr,
    aselsan_work_order_number: aselsanIsEmriNoStr,
    order_item_number: siparisKalemiStr,
    quantity: isEmriAdediNum,
  };
};


interface Station {
  id: number;
  name: string;
  company: string;
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
  const [stationId, setStationId] = useState<number | null>(null);
  const qrCodeInputRef = useRef<HTMLInputElement>(null);
  const qrCodeBufferRef = useRef<string>("");
  const qrCodeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check user roles and extract company
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
      // Check for operator role
      const operatorRole = user.role.find((role) => 
        typeof role === "string" && role.startsWith("atolye:") && role.endsWith(":operator")
      );
      if (operatorRole) {
        setIsOperator(true);
        // Extract company from role: "atolye:<company>:operator"
        const parts = operatorRole.split(":");
        if (parts.length === 3) {
          setUserCompany(parts[1]);
        }
        // Fetch the operator's assigned station
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
        // Extract company from role: "atolye:<company>:yonetici"
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
        // Extract company from role: "atolye:<company>:musteri"
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
      // Clear cache for this endpoint to ensure fresh data
      api.clearCachePattern(/\/romiot\/station\/work-orders\/list\//);
      
      // Fetch with cache disabled and timestamp to ensure fresh data
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
      // Clear cache for this endpoint to ensure fresh data
      api.clearCachePattern(/\/romiot\/station\/work-orders\/list\//);
      
      // Fetch with cache disabled and timestamp to ensure fresh data
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

    // Log the raw QR code data
    console.log("📱 QR Kod Okundu (Raw):", qrCodeData);
    console.log("📏 QR Kod Uzunluğu:", qrCodeData.length);

    try {
      let parsedData: QRCodeData;
      let decodedData = qrCodeData.trim();
      
      try {
        // Split into chunks of 5 digits: 00123 = ASCII char code 123
        const chunks = decodedData.match(/.{1,5}/g) || [];
        console.log("📦 Chunk sayısı:", chunks.length);
        
        decodedData = chunks
          .map(chunk => {
            const charCode = parseInt(chunk, 10);
            return String.fromCharCode(charCode);
          })
          .join('');
        
        console.log("✅ Decode Edildi:", decodedData);
        
        // Parse the decoded JSON
        const response = await api.get<{ data: QRCodeData }>(
          `/romiot/station/qr-code/retrieve/${decodedData}`
        );
        // Extract the data field from the response
        parsedData = response.data;
        console.log("✅ QR Kod Verisi Alındı:", parsedData);
      } catch (decodeError) {
        console.error("❌ Decode Hatası:", decodeError);
        setError("QR kod decode edilemedi");
        return;
      }

      if (mode === "entrance") {
        
        // Create work order (user_id is automatically resolved by backend from authenticated user)
        let payload;
        try {
          payload = mapQRCodeToApi(
            parsedData,
            stationId
          );
        } catch (mappingError: any) {
          console.error("Mapping error:", mappingError);
          setError(mappingError.message || "QR kod verisi işlenirken hata oluştu");
          return;
        }

        const response = await api.post("/romiot/station/work-orders/", payload);
        
        // Clear errors immediately
        setError(null);
        
        // Small delay to ensure database has committed the transaction
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Refresh both tables to ensure real-time updates
        // Using Promise.all to update both tables simultaneously
        await Promise.all([
          fetchEntranceWorkOrders(),
          fetchExitWorkOrders(),
        ]);
        
        // Clear input after tables are updated
        setQRCodeInput("");
      } else if (mode === "exit") {
        // Update exit date
        const payload = {
          station_id: stationId,
          aselsan_order_number: parsedData.AselsanSiparisNo,
          order_item_number: parsedData.SiparisKalemi,
        };

        const response = await api.post("/romiot/station/work-orders/update-exit-date", payload);
        
        // Clear errors immediately
        setError(null);
        
        // Small delay to ensure database has committed the transaction
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Refresh both tables to ensure real-time updates
        // Using Promise.all to update both tables simultaneously
        await Promise.all([
          fetchEntranceWorkOrders(),
          fetchExitWorkOrders(),
        ]);
        
        // Clear input after tables are updated
        setQRCodeInput("");
      }
    } catch (err: any) {
      console.error("QR code processing error:", err);
      
      // Parse Pydantic validation errors
      let errorMessage = "İşlem sırasında bir hata oluştu";
      
      try {
        // Check if it's an ApiError from the api client
        if (err.status && err.message) {
          try {
            const errorData = JSON.parse(err.message);
            if (errorData.detail) {
              // Handle Pydantic validation errors
              if (Array.isArray(errorData.detail)) {
                const fieldTranslations: Record<string, string> = {
                  "manufacturer_number": "Üretici Firma Numarası",
                  "aselsan_order_number": "ASELSAN Sipariş Numarası",
                  "aselsan_work_order_number": "ASELSAN İş Emri Numarası",
                  "order_item_number": "Sipariş Kalemi",
                  "quantity": "İş Emri Adedi",
                  "station_id": "Atölye ID",
                };
                
                const errorMessages = errorData.detail.map((error: any) => {
                  const fieldName = fieldTranslations[error.loc?.[error.loc.length - 1]] || error.loc?.join(".") || "Bilinmeyen alan";
                  if (error.type === "missing") {
                    return `• ${fieldName} zorunludur`;
                  } else if (error.type === "value_error") {
                    return `• ${fieldName}: ${error.msg || "Geçersiz değer"}`;
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
            // If it's already a string, use it
            if (typeof err.message === "string") {
              errorMessage = err.message;
            }
          }
        } else if (err.message) {
          // Try to parse as JSON if it's a string
          try {
            const errorData = JSON.parse(err.message);
            if (errorData.detail) {
              if (Array.isArray(errorData.detail)) {
                const fieldTranslations: Record<string, string> = {
                  "manufacturer_number": "Üretici Firma Numarası",
                  "aselsan_order_number": "ASELSAN Sipariş Numarası",
                  "aselsan_work_order_number": "ASELSAN İş Emri Numarası",
                  "order_item_number": "Sipariş Kalemi",
                  "quantity": "İş Emri Adedi",
                  "station_id": "Atölye ID",
                };
                
                const errorMessages = errorData.detail.map((error: any) => {
                  const fieldName = fieldTranslations[error.loc?.[error.loc.length - 1]] || error.loc?.join(".") || "Bilinmeyen alan";
                  if (error.type === "missing") {
                    return `• ${fieldName} zorunludur`;
                  } else if (error.type === "value_error") {
                    return `• ${fieldName}: ${error.msg || "Geçersiz değer"}`;
                  } else {
                    return `• ${fieldName}: ${error.msg || error.type}`;
                  }
                });
                
                errorMessage = "Form Hataları:\n" + errorMessages.join("\n");
              } else {
                errorMessage = errorData.detail;
              }
            }
          } catch {
            // If parsing fails, use the original error message
            errorMessage = err.message;
          }
        }
      } catch (parseError) {
        console.error("Error parsing error message:", parseError);
        errorMessage = err.message || "Bilinmeyen bir hata oluştu";
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [mode, stationId, fetchEntranceWorkOrders, fetchExitWorkOrders]);

  // Expose test function to window for console testing
  useEffect(() => {
    // Make test function available in console: window.testQRCodeScan(jsonString)
    (window as any).testQRCodeScan = (qrCodeData: string | object) => {
      if (typeof qrCodeData === "object") {
        qrCodeData = JSON.stringify(qrCodeData);
      }
      if (mode === null) {
        console.warn("⚠️ Please select a mode first (entrance or exit)");
        return;
      }
      handleQRCodeScan(qrCodeData);
    };

    // Make helper function for sample data
    (window as any).getSampleQRCode = () => {
      return JSON.stringify({
        UreticiFirmaNo: "TEST-MFG-001",
        AselsanSiparisNo: "ORD-12345",
        SiparisKalemi: "ITEM-001",
        AselsanIsEmriNo: "ASEL-2024-001",
        IsEmriAdedi: 10,
      });
    };

    return () => {
      delete (window as any).testQRCodeScan;
      delete (window as any).getSampleQRCode;
    };
  }, [mode, handleQRCodeScan]);

  // QR code scanner handler - listens for rapid keyboard input
  // This only works when focus is not on an input field (to avoid interfering with manual typing)
  useEffect(() => {
    if (mode === null) return; // Don't process if no mode selected

    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't process if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Clear previous timeout
      if (qrCodeTimeoutRef.current) {
        clearTimeout(qrCodeTimeoutRef.current);
      }

      // Append character to buffer
      if (e.key.length === 1) {
        // Set loading on first character
        if (qrCodeBufferRef.current.length === 0) {
          setLoading(true);
        }
        qrCodeBufferRef.current += e.key;
      }

      // If Enter key is pressed, process QR code
      if (e.key === "Enter" && qrCodeBufferRef.current.length > 0) {
        e.preventDefault();
        setLoading(false);
        handleQRCodeScan(qrCodeBufferRef.current);
        qrCodeBufferRef.current = "";
        return;
      }

      // Reset buffer after 200ms of no input (typical QR code scanner sends all characters quickly)
      qrCodeTimeoutRef.current = setTimeout(() => {
        if (qrCodeBufferRef.current.length > 5) {
          // Likely a QR code (more than 5 characters, ends with Enter usually)
          setLoading(false);
          handleQRCodeScan(qrCodeBufferRef.current);
        } else {
          // Not a QR code, just clear loading
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
    }, 5000); // Poll every 5 seconds

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch stations for yonetici
  const fetchStations = useCallback(async () => {
    if (!isYonetici) return;
    try {
      // Clear cache to ensure fresh data
      api.clearCachePattern(/\/romiot\/station\/stations\//);
      
      // Add timestamp to bypass cache
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

  // Fetch stations when yonetici role is detected
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
    setSuccessMessage(null);

    try {
      await api.post("/romiot/station/stations/", stationFormData);
      setSuccessMessage("Atölye başarıyla oluşturuldu");
      setStationFormData({ name: "", company: userCompany || "" });
      
      // Refresh stations list without overwriting success message
      // Wait a bit to ensure the database has committed
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchStations();
    } catch (err: any) {
      let errorMessage = "Atölye oluşturulurken hata oluştu";
      
      // Translate common error messages to Turkish
      const translateError = (msg: string): string => {
        const translations: Record<string, string> = {
          "Station with name": "'{name}' adında bir atölye",
          "already exists in company": "şirketinde zaten mevcut",
          "Station company must match": "Atölye şirketi sizin şirketinizle eşleşmeli",
        };
        
        // Check if it's a duplicate station error
        if (msg.includes("already exists in company")) {
          const nameMatch = msg.match(/'([^']+)'/);
          const companyMatch = msg.match(/company '([^']+)'/);
          if (nameMatch && companyMatch) {
            return `'${companyMatch[1]}' şirketinde '${nameMatch[1]}' adında bir atölye zaten mevcut`;
          }
        }
        
        let translated = msg;
        for (const [key, value] of Object.entries(translations)) {
          if (msg.toLowerCase().includes(key.toLowerCase())) {
            translated = value;
            break;
          }
        }
        return translated;
      };
      
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          const detail = errorObj.detail || errorMessage;
          errorMessage = translateError(detail);
        } catch {
          errorMessage = translateError(err.message);
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
    setSuccessMessage(null);

    try {
      // Validate password confirmation
      if (userFormData.password !== userFormData.password_confirm) {
        setYoneticiError("Şifreler eşleşmiyor");
        setYoneticiLoading(false);
        return;
      }

      // Prepare payload - only include station_id for operator role
      const payload: any = {
        username: userFormData.username,
        name: userFormData.name,
        email: userFormData.email,
        password: userFormData.password,
        password_confirm: userFormData.password_confirm,
        role: userFormData.role,
      };
      
      // Only validate and add station_id if role is operator
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

      setSuccessMessage("Kullanıcı başarıyla oluşturuldu");
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
      
      // Translate common error messages to Turkish
      const translateError = (msg: string): string => {
        const translations: Record<string, string> = {
          "User with username": "'{username}' kullanıcı adı zaten kullanılıyor",
          "already exists": "zaten kullanılıyor",
          "already in use": "zaten kullanılıyor",
          "email": "e-posta",
          "Station ID is required": "Atölye seçilmesi zorunludur",
          "Station with id": "Atölye bulunamadı",
          "not found": "bulunamadı",
          "Station does not belong": "Bu atölye sizin şirketinize ait değil",
          "Passwords do not match": "Şifreler eşleşmiyor",
          "Station ID should not be provided": "Müşteri rolü için atölye seçilmemelidir",
          "Failed to create user in PocketBase": "Kullanıcı oluşturulurken hata oluştu",
          "Error creating user in PocketBase": "Kullanıcı oluşturulurken hata oluştu",
          "invalid email": "Geçersiz e-posta adresi",
          "email format": "Geçersiz e-posta adresi formatı",
        };
        
        let translated = msg;
        for (const [key, value] of Object.entries(translations)) {
          if (msg.toLowerCase().includes(key.toLowerCase())) {
            // Extract username or email from error message if present
            const usernameMatch = msg.match(/'([^']+)'/);
            if (usernameMatch && key.includes("username")) {
              translated = `'${usernameMatch[1]}' kullanıcı adı zaten kullanılıyor`;
              break;
            }
            const emailMatch = msg.match(/'([^']+)'/);
            if (emailMatch && key.includes("email")) {
              translated = `'${emailMatch[1]}' e-posta adresi zaten kullanılıyor`;
              break;
            }
            translated = value;
            break;
          }
        }
        return translated;
      };
      
      if (err.message) {
        try {
          const errorObj = JSON.parse(err.message);
          const detail = errorObj.detail || errorMessage;
          errorMessage = translateError(detail);
        } catch {
          errorMessage = translateError(err.message);
        }
      }
      setYoneticiError(errorMessage);
    } finally {
      setYoneticiLoading(false);
    }
  };

  // Musteri UI state
  const [barcodeFormData, setBarcodeFormData] = useState<QRCodeData>({
    AselsanSiparisNo: "",
    SiparisKalemi: "",
    AselsanIsEmriNo: "",
    IsEmriAdedi: 0,
    UreticiFirmaNo: "",
  });
  const [generatedQRCode, setGeneratedQRCode] = useState<string | null>(null);
  const qrCodeRef = useRef<HTMLDivElement | null>(null);

  const handleGenerateBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate that adet is a positive number
    if (barcodeFormData.IsEmriAdedi <= 0) {
      setError("Adet değeri 0'dan büyük olmalıdır");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Generate compressed QR code via API
      // Send data wrapped in a "data" field for future flexibility
      const response = await api.post<{ code: string; expires_at: string | null }>(
        "/romiot/station/qr-code/generate",
        { data: barcodeFormData }
      );

      // Store the short code instead of full JSON
      setGeneratedQRCode(response.code);
    } catch (err: any) {
      console.error("QR generation error:", err);
      setError("QR kod oluşturulurken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handlePrintBarcode = () => {
    if (!generatedQRCode) return;

    // Get QR code SVG element
    const qrCodeElement = qrCodeRef.current;
    if (!qrCodeElement) return;
    
    // Get the SVG element from the ref
    const svgElement = qrCodeElement.querySelector('svg');
    if (!svgElement) return;
    
    // Clone the SVG to avoid modifying the original
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;
    
    // Parse JSON data for table display (for musteri role)
    let jsonData = null;
    try {
      jsonData = JSON.parse(generatedQRCode);
    } catch (e) {
      console.error("Error parsing QR code JSON:", e);
    }
    
    // Determine QR code size based on role
    const qrSize = isMusteri ? 200 : 400;
    
    // Set size attributes for printing
    clonedSvg.setAttribute('width', qrSize.toString());
    clonedSvg.setAttribute('height', qrSize.toString());
    
    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    // Create a canvas to convert SVG to PNG for better printing compatibility
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Set canvas size
      canvas.width = qrSize;
      canvas.height = qrSize;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, qrSize, qrSize);
        const qrCodeImageData = canvas.toDataURL("image/png");

        // Create a new window for printing
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          URL.revokeObjectURL(svgUrl);
          return;
        }

        // Field translations for table display
        const fieldTranslations: Record<string, string> = {
          "UreticiFirmaNo": "Üretici Firma Numarası",
          "AselsanSiparisNo": "ASELSAN Sipariş Numarası",
          "SiparisKalemi": "Sipariş Kalemi",
          "AselsanIsEmriNo": "ASELSAN İş Emri Numarası",
          "IsEmriAdedi": "İş Emri Adedi",
        };

        // Generate table rows for musteri role
        let tableContent = '';
        if (isMusteri && jsonData) {
          tableContent = `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-weight: bold;">Alan</th>
                  <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left; font-weight: bold;">Değer</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(jsonData).map(([key, value]) => `
                  <tr>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: 600; width: 40%;">${fieldTranslations[key] || key}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px;">${value}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }

        // Create print content
        const printContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>QR Kod Yazdır</title>
              <style>
                @page {
                  margin: 10mm;
                  size: A4;
                }
                * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
                }
                body {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: ${isMusteri ? 'flex-start' : 'center'};
                  min-height: 100vh;
                  padding: 20px;
                  font-family: Arial, sans-serif;
                }
                ${isMusteri ? `
                  .qr-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                    max-width: 600px;
                  }
                  .info-table {
                    width: 100%;
                    margin-bottom: 20px;
                  }
                  .qr-code-image {
                    width: ${qrSize}px;
                    height: ${qrSize}px;
                  }
                ` : `
                  .qr-code-image {
                    max-width: 100%;
                    height: auto;
                    width: 400px;
                    height: 400px;
                  }
                `}
                @media print {
                  body {
                    padding: 0;
                  }
                  ${isMusteri ? `
                    .qr-code-image {
                      width: ${qrSize}px;
                      height: ${qrSize}px;
                    }
                  ` : `
                    .qr-code-image {
                      width: 100%;
                      height: auto;
                    }
                  `}
                }
              </style>
            </head>
            <body>
              ${isMusteri ? `
                <div class="qr-container">
                  ${tableContent}
                  <img src="${qrCodeImageData}" alt="QR Code" class="qr-code-image" />
                </div>
              ` : `
                <img src="${qrCodeImageData}" alt="QR Code" class="qr-code-image" />
              `}
            </body>
          </html>
        `;

        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
          URL.revokeObjectURL(svgUrl);
        }, 250);
      }
    };
    
    img.onerror = () => {
      console.error("Error loading SVG for printing");
      URL.revokeObjectURL(svgUrl);
    };
    
    img.src = svgUrl;
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

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
              {successMessage}
            </div>
          )}

          {/* Error Message */}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      İsim *
                    </label>
                    <input
                      type="text"
                      value={stationFormData.name}
                      onChange={(e) =>
                        setStationFormData({ ...stationFormData, name: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Şirket *
                    </label>
                    <input
                      type="text"
                      value={stationFormData.company}
                      onChange={(e) =>
                        setStationFormData({ ...stationFormData, company: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                      readOnly
                      disabled
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Şirket bilgisi otomatik olarak doldurulmuştur
                    </p>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kullanıcı Adı *
                    </label>
                    <input
                      type="text"
                      value={userFormData.username}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, username: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      İsim *
                    </label>
                    <input
                      type="text"
                      value={userFormData.name}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, name: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      E-posta *
                    </label>
                    <input
                      type="email"
                      value={userFormData.email}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, email: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Şifre *
                    </label>
                    <input
                      type="password"
                      value={userFormData.password}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, password: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Şifre Tekrar *
                    </label>
                    <input
                      type="password"
                      value={userFormData.password_confirm}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, password_confirm: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                      required
                      disabled={yoneticiLoading}
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rol *
                    </label>
                    <select
                      value={userFormData.role}
                      onChange={(e) =>
                        setUserFormData({ ...userFormData, role: e.target.value as "musteri" | "operator" })
                      }
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Atölye *
                      </label>
                      <select
                        value={userFormData.station_id}
                        onChange={(e) =>
                          setUserFormData({ ...userFormData, station_id: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                        required
                        disabled={yoneticiLoading || stations.length === 0}
                      >
                        <option value="">Atölye Seçiniz</option>
                        {stations.map((station) => (
                          <option key={station.id} value={station.id}>
                            {station.name}
                          </option>
                        ))}
                      </select>
                      {stations.length === 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          Henüz atölye bulunmamaktadır
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Şirket
                    </label>
                    <input
                      type="text"
                      value={userCompany || ""}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-gray-900"
                      readOnly
                      disabled
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Kullanıcı otomatik olarak şirketinize atanacaktır
                    </p>
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

          {/* Error Message */}
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
                  <div className="text-sm text-red-700 whitespace-pre-line">
                    {error}
                  </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Üretici Firma Numarası *
                  </label>
                  <input
                    type="text"
                    value={barcodeFormData.UreticiFirmaNo}
                    onChange={(e) =>
                      setBarcodeFormData({ ...barcodeFormData, UreticiFirmaNo: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ASELSAN Sipariş Numarası *
                  </label>
                  <input
                    type="text"
                    value={barcodeFormData.AselsanSiparisNo}
                    onChange={(e) =>
                      setBarcodeFormData({ ...barcodeFormData, AselsanSiparisNo: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sipariş Kalemi *
                  </label>
                  <input
                    type="text"
                    value={barcodeFormData.SiparisKalemi}
                    onChange={(e) =>
                      setBarcodeFormData({ ...barcodeFormData, SiparisKalemi: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ASELSAN İş Emri Numarası *
                  </label>
                  <input
                    type="text"
                    value={barcodeFormData.AselsanIsEmriNo}
                    onChange={(e) =>
                      setBarcodeFormData({ ...barcodeFormData, AselsanIsEmriNo: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    İş Emri Adedi *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={barcodeFormData.IsEmriAdedi || ""}
                    onChange={(e) =>
                      setBarcodeFormData({ ...barcodeFormData, IsEmriAdedi: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full mt-6 px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-lg font-medium transition-colors"
              >
                Barkod Oluştur
              </button>
            </form>
          </div>

          {/* Generated QR Code Display */}
          {generatedQRCode && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Oluşturulan QR Kod
              </h2>
              <div className="border-2 border-gray-300 p-6 rounded-lg bg-gray-50 mb-4">
                <div className="flex flex-col items-center justify-center overflow-hidden">
                  <div 
                    ref={qrCodeRef}
                    className="w-full max-w-md flex items-center justify-center bg-white p-4 rounded-lg"
                  >
                    <QRCodeSVG
                      value={generatedQRCode}
                      size={300}
                      level="H"
                    />
                  </div>
                  <div className="mt-4 font-mono text-xs text-gray-600 break-all max-w-full text-center px-2">
                    {generatedQRCode}
                  </div>
                </div>
              </div>
              <button
                onClick={handlePrintBarcode}
                className="w-full px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                Yazdır
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const renderTable = (workOrders: WorkOrder[]) => {
    if (workOrders.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          Henüz kayıt bulunmamaktadır.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-lg shadow">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Üretici Firma Numarası
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                ASELSAN Sipariş Numarası
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Sipariş Kalemi
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                ASELSAN İş Emri Numarası
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                İş Emri Adedi
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Giriş Tarihi
              </th>
              {mode === "exit" && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Çıkış Tarihi
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {workOrders.map((order) => (
              <tr
                key={order.id}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 text-sm text-gray-900">
                  {order.manufacturer_number}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {order.aselsan_order_number}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {order.order_item_number}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {order.aselsan_work_order_number}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {order.quantity}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {order.entrance_date
                    ? new Date(order.entrance_date).toLocaleString("tr-TR")
                    : "-"}
                </td>
                {mode === "exit" && (
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {order.exit_date
                      ? new Date(order.exit_date).toLocaleString("tr-TR")
                      : "-"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
          <a
            href={`${window.location.pathname}/work-orders`}
            className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            İş Emri Detayları
          </a>
        </div>

        {/* Mode Selection Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Is Emri Giris Button */}
          <button
            onClick={() => setMode(mode === "entrance" ? null : "entrance")}
            className={`flex flex-col items-center justify-center p-8 rounded-lg shadow-lg transition-all h-48 text-white ${
              mode === "entrance"
                ? "hover:opacity-90"
                : "hover:opacity-80"
            }`}
            style={{
              backgroundColor:
                mode === "entrance" ? "#008080" : "#94A3B8",
            }}
          >
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-2xl font-bold">İş Emri Giriş</span>
          </button>

          {/* Is Emri Cikis Button */}
          <button
            onClick={() => setMode(mode === "exit" ? null : "exit")}
            className={`flex flex-col items-center justify-center p-8 rounded-lg shadow-lg transition-all h-48 text-white ${
              mode === "exit"
                ? "hover:opacity-90"
                : "hover:opacity-80"
            }`}
            style={{
              backgroundColor:
                mode === "exit" ? "#C53030" : "#94A3B8",
            }}
          >
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-2xl font-bold">İş Emri Çıkış</span>
          </button>
        </div>

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
                <div className="text-sm text-red-700 whitespace-pre-line">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Barcode Scanner Instructions or Loading */}
        {mode && (
          <>
            {loading ? (
              <div className="mb-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg className="w-12 h-12 text-green-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-green-900 mb-2">
                      QR Kod İşleniyor...
                    </h3>
                    <p className="text-green-800 text-sm leading-relaxed">
                      Lütfen bekleyin, QR kod verisi işleniyor ve kaydediliyor.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-blue-900 mb-2">
                      Barkod Okuyucu Hazır
                    </h3>
                    <p className="text-blue-800 text-sm leading-relaxed">
                      Lütfen barkod okuyucu ile QR kodu taratın. Sistem otomatik olarak kodu algılayacak ve işleme alacaktır.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Mode Indicator */}
        {mode && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 font-semibold">
              {mode === "entrance"
                ? "İş Emri Giriş Modu Aktif - Barkod okuyucuyu hazırlayın"
                : "İş Emri Çıkış Modu Aktif - Barkod okuyucuyu hazırlayın"}
            </p>
          </div>
        )}

        {/* Tables */}
        <div className="space-y-8">
          {/* Entrance Table */}
          {(mode === "entrance" || mode === null) && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Giriş Yapılmış İş Emirleri
              </h2>
              {renderTable(entranceWorkOrders)}
            </div>
          )}

          {/* Exit Table */}
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
