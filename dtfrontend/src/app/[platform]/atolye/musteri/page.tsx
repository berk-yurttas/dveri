"use client"

import { useUser } from "@/contexts/user-context";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import QRCodeSVG from "react-qr-code";

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

export default function MusteriPage() {
  const { user } = useUser();
  const [isMusteri, setIsMusteri] = useState(false);
  const [userCompany, setUserCompany] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check user roles and extract company
  useEffect(() => {
    if (user?.role && Array.isArray(user.role)) {
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

  // Barcode form state
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
  const [selectedPackageIndex, setSelectedPackageIndex] = useState<number>(0);
  const qrCodeRef = useRef<HTMLDivElement | null>(null);

  // Prefill company_from with user's company
  useEffect(() => {
    if (userCompany && isMusteri) {
      setBarcodeFormData((prev) => ({ ...prev, company_from: userCompany }));
    }
  }, [userCompany, isMusteri]);

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

      const effectivePackageQuantity =
        barcodeFormData.package_quantity > 0 ? barcodeFormData.package_quantity : 1;

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

  // Build the print HTML for one package card
  const buildPackageCardHtml = (
    imageData: string,
    pkg: PackageInfo,
    qrSize: number,
    totalQuantity: number,
    totalPackages: number
  ) => `
    <div class="package-card">
      <div style="text-align: center; margin-bottom: 16px;">
        <img src="${imageData}" alt="QR Code" style="width: ${qrSize}px; height: ${qrSize}px;" />
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <tbody>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600; width: 45%;">Ana Müşteri</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.main_customer}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Sektör</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.sector}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Gönderen Firma</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.company_from}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">${barcodeFormData.main_customer} Sipariş Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${totalPackages > 1 ? barcodeFormData.aselsan_order_number + "_" + pkg.package_index : barcodeFormData.aselsan_order_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Sipariş Kalem Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.order_item_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">${barcodeFormData.main_customer} Parça Numarası</td><td style="border: 1px solid #d1d5db; padding: 6px;">${barcodeFormData.part_number}</td></tr>
          <tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Toplam Sipariş Miktarı</td><td style="border: 1px solid #d1d5db; padding: 6px;">${pkg.quantity}/${totalQuantity}</td></tr>
          ${barcodeFormData.target_date ? `<tr><td style="border: 1px solid #d1d5db; padding: 6px; font-weight: 600;">Hedef Bitirme Tarihi</td><td style="border: 1px solid #d1d5db; padding: 6px;">${new Date(barcodeFormData.target_date).toLocaleDateString("tr-TR")}</td></tr>` : ""}
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

  const handlePrintSingleBarcode = (packageIndex: number) => {
    if (!generatedBatch) return;
    const pkg = generatedBatch.packages[packageIndex];
    if (!pkg) return;

    const qrSize = 200;

    renderQRToPng(`qr-package-${packageIndex}`, qrSize)
      .then((imageData) => {
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
      })
      .catch((err) => console.error("Error printing QR code:", err));
  };

  const handlePrintAllBarcodes = () => {
    if (!generatedBatch) return;

    const qrSize = 200;

    const renderPromises = generatedBatch.packages.map((pkg, index) =>
      renderQRToPng(`qr-package-${index}`, qrSize).then((imageData) => ({ imageData, pkg }))
    );

    Promise.all(renderPromises)
      .then((results) => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const packagesHtml = results
          .map(({ imageData, pkg }) =>
            buildPackageCardHtml(imageData, pkg, qrSize, generatedBatch.total_quantity, generatedBatch.total_packages)
          )
          .join("");

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
      })
      .catch((err) => console.error("Error rendering QR codes for print:", err));
  };

  if (!isMusteri) {
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
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Barkod Oluştur</h1>

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
          <h2 className="text-2xl font-bold text-gray-900 mb-6">İş Emri Bilgileri</h2>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{barcodeFormData.main_customer} Sipariş Numarası *</label>
                <input
                  type="text"
                  value={barcodeFormData.aselsan_order_number}
                  onChange={(e) => setBarcodeFormData({ ...barcodeFormData, aselsan_order_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  placeholder="26Y0021A53"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{barcodeFormData.main_customer} Parça Numarası *</label>
                <input
                  type="text"
                  value={barcodeFormData.part_number}
                  onChange={(e) => setBarcodeFormData({ ...barcodeFormData, part_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  placeholder={`${barcodeFormData.main_customer} "Stok Numarası"`}
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
                  min={(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })()}
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
                <h2 className="text-2xl font-bold text-gray-900">Oluşturulan QR Kodlar</h2>
                <p className="text-sm text-gray-600 mt-1">
                  İş Emri: {generatedBatch.work_order_group_id} - {generatedBatch.total_packages} paket, toplam{" "}
                  {generatedBatch.total_quantity} parça
                </p>
              </div>
              <button
                onClick={handlePrintAllBarcodes}
                className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
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
                      ? "bg-[#0f4c3a] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Paket {pkg.package_index} ({pkg.quantity} adet)
                </button>
              ))}
            </div>

            {/* Selected package QR code */}
            {generatedBatch.packages.map((pkg, index) => (
              <div key={index} className={index === selectedPackageIndex ? "block" : "hidden"}>
                <div className="border-2 border-gray-300 p-6 rounded-lg bg-gray-50 mb-4">
                  <div className="flex flex-col items-center justify-center overflow-hidden">
                    <div className="text-center mb-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#0f4c3a] text-white">
                        Paket {pkg.package_index} / {generatedBatch.total_packages}
                      </span>
                    </div>
                    <div
                      id={`qr-package-${index}`}
                      ref={index === selectedPackageIndex ? qrCodeRef : null}
                      className="w-full max-w-md flex items-center justify-center bg-white p-4 rounded-lg"
                    >
                      <QRCodeSVG value={pkg.code} size={300} level="H" />
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
                            <td className="py-2 px-3 font-semibold text-gray-700">{barcodeFormData.main_customer} Sipariş Numarası</td>
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
                            <td className="py-2 px-3 font-semibold text-gray-700">{barcodeFormData.main_customer} Parça Numarası</td>
                            <td className="py-2 px-3 text-gray-900">{barcodeFormData.part_number}</td>
                          </tr>
                          <tr className="border-b border-gray-200">
                            <td className="py-2 px-3 font-semibold text-gray-700">Toplam Sipariş Miktarı</td>
                            <td className="py-2 px-3 text-gray-900">
                              {pkg.quantity}/{generatedBatch?.total_quantity ?? barcodeFormData.quantity}
                            </td>
                          </tr>
                          {barcodeFormData.target_date && (
                            <tr className="border-b border-gray-200">
                              <td className="py-2 px-3 font-semibold text-gray-700">Hedef Bitirme Tarihi</td>
                              <td className="py-2 px-3 text-gray-900">
                                {new Date(barcodeFormData.target_date).toLocaleDateString("tr-TR")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <button
                      onClick={() => handlePrintSingleBarcode(index)}
                      className="mt-4 px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-medium transition-colors flex items-center gap-2"
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
