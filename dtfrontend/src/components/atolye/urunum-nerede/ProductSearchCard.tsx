"use client";

import { useState } from "react";

export type TrackQuery =
  | { method: "order"; order_number: string; order_item_number: string }
  | { method: "part"; part_number: string };

export function ProductSearchCard({
  loading,
  onSearch,
}: {
  loading: boolean;
  onSearch: (q: TrackQuery) => void;
}) {
  const [method, setMethod] = useState<"order" | "part">("order");
  const [orderNo, setOrderNo] = useState("");
  const [itemNo, setItemNo] = useState("");
  const [partNo, setPartNo] = useState("");
  const [valError, setValError] = useState<string | null>(null);

  const submit = () => {
    setValError(null);
    if (method === "order") {
      if (!orderNo.trim() || !itemNo.trim()) {
        setValError("Lütfen hem sipariş numarasını hem de kalem numarasını girin.");
        return;
      }
      onSearch({ method: "order", order_number: orderNo.trim(), order_item_number: itemNo.trim() });
    } else {
      if (!partNo.trim()) {
        setValError("Lütfen parça numarasını girin.");
        return;
      }
      onSearch({ method: "part", part_number: partNo.trim() });
    }
  };

  const clear = () => {
    setOrderNo(""); setItemNo(""); setPartNo(""); setValError(null);
  };

  const tabBase = "flex-1 flex flex-col items-center gap-1 py-3 px-3 rounded-lg border-2 text-xs font-semibold transition-colors cursor-pointer";
  const tabActive = "border-[#0f4c3a] bg-[#0f4c3a] text-white";
  const tabIdle = "border-gray-200 bg-gray-50 text-gray-500 hover:border-[#fe9526] hover:text-[#fe9526]";
  const inputCls = "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0f4c3a] focus:border-[#0f4c3a] text-gray-900 bg-white text-sm font-mono";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-md p-5">
      <div className="flex gap-2 mb-4">
        <button type="button" className={`${tabBase} ${method === "order" ? tabActive : tabIdle}`} onClick={() => { setMethod("order"); setValError(null); }}>
          <span>Sipariş + Kalem ile Sorgula</span>
        </button>
        <button type="button" className={`${tabBase} ${method === "part" ? tabActive : tabIdle}`} onClick={() => { setMethod("part"); setValError(null); }}>
          <span>Parça No ile Sorgula</span>
        </button>
      </div>

      {method === "order" ? (
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">ASELSAN Sipariş No</label>
            <input className={inputCls} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="SIP-2025-01-4812"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </div>
          <div className="flex-1">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Sipariş Kalem No</label>
            <input className={inputCls} value={itemNo} onChange={(e) => setItemNo(e.target.value)} placeholder="KLM-004"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Parça Numarası</label>
          <input className={inputCls} value={partNo} onChange={(e) => setPartNo(e.target.value)} placeholder="ASL-09-2244"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={loading}
          className="flex-1 px-4 py-2.5 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {loading ? "Sorgulanıyor..." : "Sorgula"}
        </button>
        <button type="button" onClick={clear} className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:border-red-400 hover:text-red-600 transition-colors">
          Temizle
        </button>
      </div>

      {valError && (
        <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs font-medium text-amber-700">
          {valError}
        </div>
      )}
    </div>
  );
}
