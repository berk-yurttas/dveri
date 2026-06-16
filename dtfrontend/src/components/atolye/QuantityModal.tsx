"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface QuantityModalProps {
  open: boolean;
  mode: "entrance" | "exit";
  partNumber: string;
  packageIndex: number;
  totalPackages: number;
  quantity: number;          // package full piece count (cap)
  enteredQuantity: number;   // pieces already entered at this station
  exitedQuantity: number;    // pieces already exited at this station
  loading?: boolean;
  onConfirm: (scanQuantity: number) => void;
  onCancel: () => void;
}

export function QuantityModal({
  open,
  mode,
  partNumber,
  packageIndex,
  totalPackages,
  quantity,
  enteredQuantity,
  exitedQuantity,
  loading,
  onConfirm,
  onCancel,
}: QuantityModalProps) {
  const isEntrance = mode === "entrance";
  const remaining = isEntrance
    ? Math.max(0, quantity - enteredQuantity)
    : Math.max(0, enteredQuantity - exitedQuantity);

  const [value, setValue] = useState<number>(remaining);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Reset to the remaining default each time the modal opens or the cap changes,
  // and focus Confirm so the whole-package case is one Enter/click.
  useEffect(() => {
    if (open) {
      setValue(remaining);
      const id = window.setTimeout(() => confirmRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open, remaining]);

  if (!open || typeof document === "undefined") return null;

  const accent = isEntrance ? "#0f4c3a" : "#C53030";
  const clamp = (n: number) => Math.max(1, Math.min(remaining, Math.floor(n) || 1));
  const valid = value >= 1 && value <= remaining && remaining > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200" style={{ borderTop: `4px solid ${accent}` }}>
          <h3 className="text-lg font-bold text-gray-900">
            {isEntrance ? "Giriş Adedi" : "Çıkış Adedi"}
          </h3>
          <p className="text-sm text-gray-600 mt-0.5">
            {partNumber} — Paket {packageIndex}/{totalPackages}
          </p>
        </div>

        <div className="p-6">
          <div className="mb-4 text-sm text-gray-700">
            {isEntrance ? (
              <span>Girilen: <span className="font-semibold">{enteredQuantity}</span> / {quantity}</span>
            ) : (
              <span>
                Girilen: <span className="font-semibold">{enteredQuantity}</span> · Çıkan:{" "}
                <span className="font-semibold">{exitedQuantity}</span>
              </span>
            )}
            <span className="ml-2 text-gray-500">(Kalan: {remaining})</span>
          </div>

          <label htmlFor="qty-input" className="block text-sm font-medium text-gray-700 mb-2">
            {isEntrance ? "Bu taramada girilecek adet" : "Bu taramada çıkış yapılacak adet"}
          </label>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              aria-label="Azalt"
              onClick={() => setValue((v) => clamp(v - 1))}
              disabled={loading || remaining === 0 || value <= 1}
              className="w-12 h-12 flex items-center justify-center rounded-lg border border-gray-300 text-2xl font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
            >
              −
            </button>
            <input
              id="qty-input"
              type="number"
              min={1}
              max={remaining}
              value={value}
              disabled={loading || remaining === 0}
              onChange={(e) => setValue(clamp(Number(e.target.value)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !loading) onConfirm(value);
              }}
              className="flex-1 h-12 text-center text-2xl font-bold border border-gray-300 rounded-lg"
            />
            <button
              type="button"
              aria-label="Artır"
              onClick={() => setValue((v) => clamp(v + 1))}
              disabled={loading || remaining === 0 || value >= remaining}
              className="w-12 h-12 flex items-center justify-center rounded-lg border border-gray-300 text-2xl font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setValue(remaining)}
              disabled={loading || remaining === 0}
              className="px-3 h-12 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
            >
              Tümü
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            İptal
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onConfirm(value)}
            disabled={loading || !valid}
            className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 cursor-pointer"
            style={{ backgroundColor: accent }}
          >
            {loading ? "İşleniyor..." : "Onayla"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
