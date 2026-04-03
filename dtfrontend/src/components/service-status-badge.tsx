"use client";

import type { ExternalHealth } from "@/lib/service-status";

type Props = {
  health: ExternalHealth;
  className?: string;
  /** Dot diameter scale */
  size?: "sm" | "md" | "lg";
  /** Brighter rings/glow for dark headers (e.g. blue gradient bar) */
  variant?: "default" | "onDark";
};

const sizeMap = {
  sm: "h-2.5 w-2.5 min-h-2.5 min-w-2.5",
  md: "h-3 w-3 min-h-3 min-w-3",
  lg: "h-3.5 w-3.5 min-h-3.5 min-w-3.5",
};

/**
 * Status indicator: green / red / gray circle (ServiceChecker). Always renders for external URLs.
 */
export function ServiceStatusBadge({
  health,
  className = "",
  size = "md",
  variant = "default",
}: Props) {
  const dim = sizeMap[size];
  const onDark = variant === "onDark";

  if (health === "up") {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        title="Servis çevrimiçi"
        role="img"
        aria-label="Servis çevrimiçi"
      >
        <span
          className={`relative inline-block rounded-full ${dim} bg-gradient-to-br from-emerald-300 via-emerald-500 to-emerald-700 ${
            onDark
              ? "shadow-[0_0_12px_rgba(52,211,153,0.95),inset_0_1px_0_rgba(255,255,255,0.45)] ring-2 ring-white/35"
              : "shadow-[0_0_10px_rgba(16,185,129,0.55),inset_0_1px_0_rgba(255,255,255,0.4)] ring-2 ring-emerald-400/50"
          }`}
        >
          <span
            className="absolute inset-[15%] rounded-full bg-white/35 blur-[0.5px]"
            aria-hidden
          />
        </span>
      </span>
    );
  }

  if (health === "down") {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        title="Servis çevrimdışı veya yanıt vermiyor"
        role="img"
        aria-label="Servis çevrimdışı"
      >
        <span
          className={`relative inline-block rounded-full ${dim} bg-gradient-to-br from-rose-400 via-rose-600 to-red-800 ${
            onDark
              ? "shadow-[0_0_12px_rgba(251,113,133,0.85),inset_0_1px_0_rgba(255,255,255,0.25)] ring-2 ring-white/30"
              : "shadow-[0_0_10px_rgba(244,63,94,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] ring-2 ring-rose-400/45"
          }`}
        >
          <span
            className="absolute inset-[18%] rounded-full bg-white/20 blur-[0.5px]"
            aria-hidden
          />
        </span>
      </span>
    );
  }

  /* unknown — always show so the slot is never empty */
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      title="Durum bilinmiyor (ServiceChecker eşleşmesi yok veya henüz kontrol edilmedi)"
      role="img"
      aria-label="Durum bilinmiyor"
    >
      <span
        className={`relative inline-block rounded-full ${dim} bg-gradient-to-br ${
          onDark
            ? "from-zinc-200 via-zinc-400 to-zinc-600 ring-2 ring-white/40 shadow-[0_0_10px_rgba(255,255,255,0.25),inset_0_1px_0_rgba(255,255,255,0.4)]"
            : "from-slate-300 via-slate-400 to-slate-600 shadow-[0_0_6px_rgba(100,116,139,0.35),inset_0_1px_0_rgba(255,255,255,0.45)] ring-2 ring-slate-400/40"
        }`}
      >
        <span
          className="absolute inset-[20%] rounded-full bg-white/30 blur-[0.5px]"
          aria-hidden
        />
      </span>
    </span>
  );
}
