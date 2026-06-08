import type { TrackStatus, StepStatus } from "@/app/[platform]/atolye/urunum-nerede/types";

// Tailwind classes per group/package status. Palette: green done, orange active, red delayed, gray idle.
export const STATUS_STYLES: Record<TrackStatus, { badge: string; dot: string; label: string }> = {
  "Tamamlandı":      { badge: "bg-green-100 text-green-800 border-green-300",   dot: "bg-green-600",  label: "Tamamlandı" },
  "Sevke Hazır":     { badge: "bg-green-100 text-green-800 border-green-300",   dot: "bg-green-600",  label: "Sevke Hazır" },
  "İşlemde":         { badge: "bg-orange-100 text-orange-800 border-orange-300", dot: "bg-[#fe9526]", label: "İşlemde" },
  "Gecikmiş":        { badge: "bg-red-100 text-red-800 border-red-300",         dot: "bg-red-600",    label: "Gecikmiş" },
  "Bekliyor":        { badge: "bg-gray-100 text-gray-700 border-gray-300",      dot: "bg-gray-400",   label: "Bekliyor" },
  "Henüz okutulmadı":{ badge: "bg-gray-100 text-gray-600 border-gray-300",      dot: "bg-gray-400",   label: "Henüz okutulmadı" },
};

// Timeline node colors per step status.
export const STEP_STYLES: Record<StepStatus, { node: string; line: string; text: string }> = {
  done:    { node: "bg-[#0f4c3a] border-[#0f4c3a] text-white", line: "bg-[#0f4c3a]", text: "text-[#0f4c3a]" },
  active:  { node: "bg-[#fe9526] border-[#fe9526] text-white", line: "bg-gray-300",  text: "text-[#fe9526]" },
  delayed: { node: "bg-red-600 border-red-600 text-white",     line: "bg-gray-300",  text: "text-red-600" },
  waiting: { node: "bg-white border-gray-300 text-gray-400",   line: "bg-gray-300",  text: "text-gray-400" },
};
