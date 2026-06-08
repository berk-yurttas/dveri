import type { TrackMatch } from "@/app/[platform]/atolye/urunum-nerede/types";
import { StatusBadge } from "./StatusBadge";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("tr-TR"); } catch { return "—"; }
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("tr-TR"); } catch { return "—"; }
}

export function TrackResultCard({ match }: { match: TrackMatch }) {
  const orderLabel = match.pairs[0]
    ? `${match.pairs[0].aselsan_order_number} / ${match.pairs[0].order_item_number}`
    : "—";
  const details: { label: string; value: string }[] = [
    { label: "Parça No", value: match.part_number + (match.revision_number ? `/${match.revision_number}` : "") },
    { label: "Adet", value: `${match.total_quantity} adet` },
    { label: "Toplam Paket", value: `${match.total_packages}` },
    { label: "ASELSAN Sipariş / Kalem", value: orderLabel },
    { label: "Kaplamacı Firma", value: match.coating_company ?? "—" },
    { label: "Gönderen Firma", value: match.company_from },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-br from-[#0f4c3a] to-[#16654d] flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1">Mevcut Konum</div>
          <div className="flex items-center gap-2 text-white text-lg sm:text-xl font-bold">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{match.current_station_name ?? "Henüz okutulmadı"}</span>
          </div>
          {match.current_entry_date && (
            <div className="text-white/60 text-xs font-mono mt-1">Giriş: {fmtDateTime(match.current_entry_date)}</div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <StatusBadge status={match.status} />
          {match.target_date && (
            <div className="text-white/60 text-[11px] font-mono mt-1.5">
              Hedef: <strong className="text-white/90">{fmtDate(match.target_date)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3">
        {details.map((d) => (
          <div key={d.label} className="px-4 py-3 border-b border-r border-gray-100 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">{d.label}</div>
            <div className="text-xs font-semibold text-gray-900 break-words">{d.value}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-1.5 text-[11px] text-gray-500">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Son güncelleme: <strong className="text-gray-700">{fmtDateTime(match.last_updated)}</strong>
      </div>
    </div>
  );
}
