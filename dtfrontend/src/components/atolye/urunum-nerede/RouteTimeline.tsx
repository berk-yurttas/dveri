import type { TrackTimelineStep } from "@/app/[platform]/atolye/urunum-nerede/types";
import { STEP_STYLES } from "./status";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("tr-TR");
  } catch {
    return "";
  }
}

const STEP_TAG: Record<string, string> = {
  done: "Tamamlandı", active: "İşlemde", delayed: "Gecikmiş", waiting: "Bekliyor",
};

export function RouteTimeline({ steps }: { steps: TrackTimelineStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-gray-500 px-5 py-6">
        Bu ürün henüz hiçbir atölyede okutulmadı.
      </p>
    );
  }
  const doneN = steps.filter((s) => s.status === "done").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <svg className="w-4 h-4 text-[#0f4c3a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <span className="text-sm font-bold text-gray-900">Süreç Takip Çizelgesi</span>
        <span className="ml-auto text-xs text-gray-500 font-mono">{doneN}/{steps.length} adım tamamlandı</span>
      </div>

      {/* Horizontal (sm+) */}
      <div className="hidden sm:block overflow-x-auto px-5 py-6">
        <div className="flex items-start min-w-max">
          {steps.map((step, i) => {
            const st = STEP_STYLES[step.status];
            return (
              <div key={`${step.station_id}-${i}`} className="flex flex-col items-center relative min-w-[120px] max-w-[150px] flex-1">
                {i < steps.length - 1 && (
                  <div className={`absolute top-5 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-0.5 ${step.status === "done" ? "bg-[#0f4c3a]" : step.status === "delayed" ? "bg-red-500" : "bg-gray-300"}`} />
                )}
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold z-10 ${st.node}`}>
                  {step.status === "done" ? "✓" : step.status === "delayed" ? "!" : i + 1}
                </div>
                <div className={`mt-2 text-xs font-bold text-center px-1 ${st.text}`}>{step.station_name}</div>
                <div className="mt-1 text-[10px] text-gray-500 font-mono text-center leading-tight">
                  {step.entry_date ? <div>Giriş: {fmtDate(step.entry_date)}</div> : <div className="text-gray-400">Başlamadı</div>}
                  {step.exit_date && <div>Çıkış: {fmtDate(step.exit_date)}</div>}
                </div>
                <span className={`mt-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${st.text} bg-gray-50`}>
                  {STEP_TAG[step.status]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vertical (mobile) */}
      <div className="sm:hidden px-4 py-4">
        {steps.map((step, i) => {
          const st = STEP_STYLES[step.status];
          return (
            <div key={`${step.station_id}-${i}`} className="flex gap-3 relative">
              {i < steps.length - 1 && (
                <div className={`absolute left-[14px] top-8 bottom-0 w-0.5 ${step.status === "done" ? "bg-[#0f4c3a]" : "bg-gray-300"}`} />
              )}
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 flex-shrink-0 mt-0.5 ${st.node}`}>
                {step.status === "done" ? "✓" : step.status === "delayed" ? "!" : i + 1}
              </div>
              <div className="flex-1 pb-5 min-w-0">
                <div className={`text-sm font-bold ${st.text}`}>{step.station_name}</div>
                <div className="text-xs text-gray-500 font-mono leading-relaxed">
                  {step.entry_date ? `Giriş: ${fmtDate(step.entry_date)}` : <span className="text-gray-400">Henüz başlamadı</span>}
                  {step.exit_date && <><br />Çıkış: {fmtDate(step.exit_date)}</>}
                </div>
                <span className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${st.text} bg-gray-50`}>
                  {STEP_TAG[step.status]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
