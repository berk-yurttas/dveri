"use client";

import { useUser } from "@/contexts/user-context";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { TrackMatch, TrackResponse } from "./types";
import { ProductSearchCard, type TrackQuery } from "@/components/atolye/urunum-nerede/ProductSearchCard";
import { TrackMatchList } from "@/components/atolye/urunum-nerede/TrackMatchList";
import { TrackResultCard } from "@/components/atolye/urunum-nerede/TrackResultCard";
import { RouteTimeline } from "@/components/atolye/urunum-nerede/RouteTimeline";
import { PackageStrip } from "@/components/atolye/urunum-nerede/PackageStrip";
import { HedefFirmaSelect } from "@/components/atolye/urunum-nerede/HedefFirmaSelect";

type View = "idle" | "loading" | "notfound" | "list" | "result";

const RECENT_KEY = "urunum_nerede_recent";

interface RecentItem { label: string; sub: string; query: TrackQuery; hedefFirma: string; }

export default function UrunumNeredePage() {
  const { user, loading } = useUser();
  const [view, setView] = useState<View>("idle");
  const [matches, setMatches] = useState<TrackMatch[]>([]);
  const [selected, setSelected] = useState<TrackMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [hedefFirma, setHedefFirma] = useState("");

  const isMusteri =
    Array.isArray(user?.role) && user.role.some((r) => typeof r === "string" && r === "atolye:musteri");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    api
      .get<string[]>("/romiot/station/company-integration/companies", undefined, { useCache: true })
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => setCompanies([]));
  }, []);

  const pushRecent = (item: RecentItem) => {
    setRecent((prev) => {
      const next = [item, ...prev.filter((p) => p.label !== item.label)].slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const runSearch = async (q: TrackQuery, firma: string = hedefFirma) => {
    if (!firma) {
      setError("Lütfen önce bir Hedef Firma seçin.");
      return;
    }
    setError(null);
    setView("loading");
    setSelected(null);
    try {
      const params = new URLSearchParams();
      params.set("hedef_firma", firma);
      if (q.method === "order") {
        params.set("order_number", q.order_number);
        params.set("order_item_number", q.order_item_number);
      } else {
        params.set("part_number", q.part_number);
      }
      const res = await api.get<TrackResponse>(
        `/romiot/station/work-orders/track-mes?${params.toString()}`,
        undefined,
        { useCache: false }
      );
      const found = res.matches ?? [];
      setMatches(found);
      if (found.length === 0) {
        setView("notfound");
      } else if (found.length === 1) {
        setSelected(found[0]);
        setView("result");
      } else {
        setView("list");
      }
      if (found.length > 0) {
        const label = q.method === "order" ? `${q.order_number} / ${q.order_item_number}` : q.part_number;
        pushRecent({ label, sub: found[0].part_number, query: q, hedefFirma: firma });
      }
    } catch {
      setError("Sorgu sırasında bir hata oluştu. Lütfen tekrar deneyin.");
      setView("idle");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-gray-200 border-t-[#0f4c3a]" />
      </div>
    );
  }

  if (!isMusteri) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Erişim Yetkisi Yok</h1>
          <p className="text-gray-600">Bu sayfayı görüntüleme yetkisine sahip değilsiniz.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Ürünüm Nerede?</h1>
          <p className="text-sm text-gray-500">Gönderdiğiniz ürünlerin atölye sürecindeki anlık konumunu sorgulayın.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="mb-5">
          <HedefFirmaSelect companies={companies} value={hedefFirma} onChange={setHedefFirma} disabled={view === "loading"} />
          <ProductSearchCard loading={view === "loading"} onSearch={(q) => runSearch(q)} />
        </div>

        {recent.length > 0 && view === "idle" && (
          <div className="mb-5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Son Sorgular</div>
            <div className="flex flex-wrap gap-2">
              {recent.map((r, i) => (
                <button key={i} type="button" onClick={() => { setHedefFirma(r.hedefFirma); runSearch(r.query, r.hedefFirma); }}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs hover:border-[#fe9526] hover:text-[#0f4c3a] transition-colors cursor-pointer">
                  <span className="font-mono font-semibold">{r.label}</span>
                  <span className="text-gray-400">{r.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {view === "loading" && (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="animate-spin rounded-full h-9 w-9 border-2 border-gray-200 border-t-[#0f4c3a]" />
            <p className="text-sm text-gray-500">Sorgu yapılıyor...</p>
          </div>
        )}

        {view === "notfound" && (
          <div className="flex flex-col items-center py-10 gap-2 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-700">Kayıt Bulunamadı</h3>
            <p className="text-sm text-gray-500 max-w-xs">Girdiğiniz bilgilere ait kayıt bulunamadı. Lütfen bilgileri kontrol edip tekrar deneyin.</p>
          </div>
        )}

        {view === "list" && (
          <TrackMatchList matches={matches} onSelect={(m) => { setSelected(m); setView("result"); }} />
        )}

        {view === "result" && selected && (
          <div className="space-y-4">
            {matches.length > 1 && (
              <button type="button" onClick={() => setView("list")}
                className="text-sm text-[#0f4c3a] font-medium hover:underline cursor-pointer">
                ← Tüm sonuçlara dön
              </button>
            )}
            <TrackResultCard match={selected} />
            <PackageStrip packages={selected.packages} />
            <RouteTimeline steps={selected.timeline} />
          </div>
        )}
      </div>
    </div>
  );
}
