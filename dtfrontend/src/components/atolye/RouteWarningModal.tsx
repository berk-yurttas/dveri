"use client";

import { createPortal } from "react-dom";

interface RouteWarningModalProps {
  open: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function RouteWarningModal({ open, message, onCancel, onConfirm, loading }: RouteWarningModalProps) {
  if (!open || typeof document === "undefined") return null;
  // Portal to document.body so `fixed` positions relative to the viewport. The
  // app shell wraps page content in a `backdrop-blur` container, which would
  // otherwise become the containing block and center the modal on the whole page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Rota Uyarısı</h3>
        </div>
        <div className="p-6">
          <div className="p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm text-yellow-800 whitespace-pre-line">
            ⚠ {message}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? "İşleniyor..." : "Yine de Devam Et"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
