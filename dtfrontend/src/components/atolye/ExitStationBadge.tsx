interface ExitStationBadgeProps {
  isExit: boolean | undefined;
  size?: "sm" | "md";
}

export function ExitStationBadge({ isExit, size = "sm" }: ExitStationBadgeProps) {
  if (!isExit) return null;

  const sizeClasses =
    size === "md"
      ? "text-sm px-2.5 py-1 gap-1.5"
      : "text-xs px-2 py-0.5 gap-1";

  const iconClasses = size === "md" ? "h-4 w-4" : "h-3 w-3";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border bg-amber-100 text-amber-800 border-amber-300 ${sizeClasses}`}
      title="Çıkış Atölyesi — bu atölyeden çıkan iş emirleri teslim edilmiş sayılır"
    >
      <svg
        className={iconClasses}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        />
      </svg>
      Çıkış Atölyesi
    </span>
  );
}
