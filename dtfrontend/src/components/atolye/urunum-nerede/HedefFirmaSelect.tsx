"use client";

export function HedefFirmaSelect({
  companies,
  value,
  onChange,
  disabled,
}: {
  companies: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">
        Hedef Firma
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white text-sm disabled:opacity-50"
      >
        <option value="">Hedef firma seçin…</option>
        {companies.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
