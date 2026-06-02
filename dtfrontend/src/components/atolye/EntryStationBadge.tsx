"use client";

import { LogIn } from "lucide-react";

interface EntryStationBadgeProps {
  isEntry: boolean | undefined;
  size?: "sm" | "md";
}

export function EntryStationBadge({ isEntry, size = "sm" }: EntryStationBadgeProps) {
  if (!isEntry) return null;
  const sizing =
    size === "md"
      ? "text-sm px-2.5 py-1"
      : "text-xs px-2 py-0.5";
  const iconClass = size === "md" ? "h-4 w-4" : "h-3 w-3";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 text-emerald-800 font-medium ${sizing}`}
    >
      <LogIn className={iconClass} aria-hidden="true" />
      Giriş Atölyesi
    </span>
  );
}
