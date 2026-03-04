"use client";

import { useState } from "react";
import { useOrderFiles } from "@/hooks/useOrderFiles";

interface SelectOrdersFolderProps {
  className?: string;
}

export function SelectOrdersFolder({ className }: SelectOrdersFolderProps) {
  const { selectOrdersFolder } = useOrderFiles();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await selectOrdersFolder();
      setMessage("Sipariş klasörü seçildi.");
    } catch (err: any) {
      setError(err?.message || "Klasör seçilirken hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handlePick}
        disabled={saving}
        className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {saving ? "Seçiliyor..." : "Select Orders Folder"}
      </button>
      {message && <p className="mt-2 text-xs text-green-700">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

