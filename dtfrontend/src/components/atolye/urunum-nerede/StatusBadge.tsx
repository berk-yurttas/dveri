import type { TrackStatus } from "@/app/[platform]/atolye/urunum-nerede/types";
import { STATUS_STYLES } from "./status";

export function StatusBadge({ status }: { status: TrackStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES["Bekliyor"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
