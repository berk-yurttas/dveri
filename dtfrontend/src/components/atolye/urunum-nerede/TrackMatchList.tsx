import type { TrackMatch } from "@/app/[platform]/atolye/urunum-nerede/types";
import { StatusBadge } from "./StatusBadge";

export function TrackMatchList({
  matches,
  onSelect,
}: {
  matches: TrackMatch[];
  onSelect: (m: TrackMatch) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-900">{matches.length} kayıt bulundu</span>
        <span className="text-xs text-gray-500 ml-2">Detay için bir ürün seçin</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {matches.map((m) => (
          <li key={m.work_order_group_id}>
            <button
              type="button"
              onClick={() => onSelect(m)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {m.part_number}{m.revision_number ? `/${m.revision_number}` : ""}
                </div>
                <div className="text-xs text-gray-500 font-mono truncate">
                  {m.pairs[0] ? `${m.pairs[0].aselsan_order_number} / ${m.pairs[0].order_item_number}` : "—"}
                  {" · "}{m.current_station_name ?? "Girişi yapılmadı"}
                </div>
              </div>
              <StatusBadge status={m.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
