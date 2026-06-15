import type { TrackPackage } from "@/app/[platform]/atolye/urunum-nerede/types";
import { STATUS_STYLES } from "./status";

export function PackageStrip({ packages }: { packages: TrackPackage[] }) {
  if (packages.length <= 1) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <span className="text-sm font-bold text-gray-900">Paketler ({packages.length})</span>
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        {packages.map((p) => {
          const s = STATUS_STYLES[p.status] ?? STATUS_STYLES["Bekliyor"];
          return (
            <div key={p.package_index} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${s.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <span className="font-semibold">Paket {p.package_index}</span>
              <span className="opacity-70">·</span>
              <span>{p.current_station_name ?? "Girişi yapılmadı"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
