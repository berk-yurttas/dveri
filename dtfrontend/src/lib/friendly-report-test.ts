import type { ReportTestCase } from "@/types/report-tests"

export function isErrorStatus(status: string | null | undefined) {
  return status === "failed" || status === "error"
}

export function friendlyCaseName(item: ReportTestCase) {
  const id = item.case_id || ""
  const name = item.name || ""

  if (id === "ui_crash" || /drive report ui/i.test(name)) return "Rapor ekranı"
  if (id === "ui_load" || /report page loads/i.test(name)) return "Raporun açılması"
  if (id === "ui_auth") return "Giriş"
  if (id === "ui_network") return "Rapor verisi"
  if (id === "ui_pageerror" || id === "ui_console" || id === "ui_browser") return "Rapor ekranı"
  if (id === "ui_global_filters" || id === "ui_filter_apply") return "Filtreler"
  if (id === "ui_skipped") return "Rapor ekranı"
  if (id === "report_timeout" || id === "runner_error") return "Rapor kontrolü"
  if (id.startsWith("ui_filter_date_")) return name.replace(/^Fill date filter\s*/i, "Tarih filtresi: ").replace(/^Tarih filtresi: /, "Tarih filtresi: ")
  if (id.startsWith("ui_filter_dropdown_")) {
    return name
      .replace(/^Open dropdown\s*/i, "Liste filtresi: ")
      .replace(/^Select option in\s*/i, "Liste filtresi: ")
      .replace(/'/g, "")
  }
  if (id.startsWith("ui_tab_")) return name.replace(/^Open tab\s*/i, "Sekme: ").replace(/'/g, "")
  if (id.includes("_execute")) return name.replace(/^Execute query:\s*/i, "Tablo: ").replace(/^Execute nested query of\s*/i, "Detay tablo: ")
  if (id.includes("_filtered_execute")) return name.replace(/^Execute\s+/i, "Filtrelenmiş tablo: ")
  if (name.startsWith("Query widget") || name.startsWith("Query shows") || name.startsWith("Query renders") || name.startsWith("Query finishes") || name.startsWith("Query visualization")) {
    return name.replace(/^Query (widget visible|shows data|renders without error|finishes loading|visualization):\s*/i, "Tablo: ")
  }
  if (name.startsWith("Table rows:")) return name.replace(/^Table rows:\s*/i, "Tablo kayıtları: ")
  if (name.startsWith("Click column header:")) return name.replace(/^Click column header:\s*/i, "Sıralama: ")
  if (name.startsWith("Click Apply")) return name.replace(/^Click Apply on (global filters|query filters):\s*/i, "Filtre uygulama: ")
  if (name.startsWith("Card visualization:")) return name.replace(/^Card visualization:\s*/i, "Özet kutu: ")
  if (name.startsWith("Chart visualization:")) return name.replace(/^Chart visualization:\s*/i, "Grafik: ")
  if (name.startsWith("Global filter options:")) return name.replace(/^Global filter options:\s*/i, "Filtre listesi: ")
  if (name.startsWith("Filter options")) return name.replace(/^Filter options\s*/i, "Filtre listesi ")
  if (name.startsWith("Execute query:")) return name.replace(/^Execute query:\s*/i, "Tablo: ")
  return name
}

export function friendlyCaseMessage(item: ReportTestCase) {
  const message = item.message || ""
  const lower = message.toLowerCase()

  if (
    lower.includes("execution context was destroyed") ||
    lower.includes("locator.count") ||
    lower.includes("because of a navigation")
  ) {
    return "Rapor sayfası açılırken yenilendi, ekran kontrolü tamamlanamadı."
  }
  if (lower.includes("could not start chromium") || lower.includes("notimplementederror")) {
    return "Rapor ekranı tarayıcıda açılamadı."
  }
  if (lower.includes("playwright is not installed")) {
    return "Rapor ekranı kontrolü için gerekli tarayıcı kurulu değil."
  }
  if (lower.includes("no browser login cookies")) {
    return "Oturum bilgisi alınamadı. Lütfen yönetici sayfasından tekrar başlatın."
  }
  if (lower.includes("timed out after") || lower.includes("timeout")) {
    return "Bu rapor çok uzun sürdüğü için kontrol durduruldu."
  }
  if (lower.includes("dropdown toggle was not found")) return "Filtre listesi bulunamadı."
  if (lower.includes("dropdown opened but no options")) return "Liste açıldı ama içinde seçenek çıkmadı."
  if (lower.includes("tab button was not found")) return "Sekme bulunamadı."
  if (lower.includes("query card did not render")) return "Tablo ekranda görünmedi."
  if (lower.includes("still loading after")) return "Tablo çok uzun süre yüklendi."
  if (lower.includes("empty state")) return "Tablo açıldı ama içinde kayıt yok."
  if (lower.includes("redirected to login")) {
    return "Raporu açmak için oturum açılamadı. Lütfen yönetici sayfasından tekrar deneyin."
  }
  if (lower.includes("report title did not appear")) {
    return "Rapor başlığı görünmedi, sayfa tam yüklenememiş olabilir."
  }
  if (/^\d+ failed:/i.test(message)) {
    return message.replace(/^(\d+) failed:\s*/i, "$1 hata: ").replace(/\(\+(\d+) more\)/i, "(+$1 tane daha)")
  }
  if (/^\d+ warning/i.test(message)) {
    return message.replace(/^(\d+) warning\(s\):\s*/i, "$1 uyarı: ").replace(/\(\+(\d+) more\)/i, "(+$1 tane daha)")
  }
  if (/checks passed/i.test(message)) return "Sorun bulunmadı."
  return message
}

export function friendlySummary(text: string | null | undefined) {
  if (!text) return ""
  return friendlyCaseMessage({
    case_id: "summary",
    category: "error",
    name: "",
    status: "failed",
    message: text,
    duration_ms: 0,
  })
}
