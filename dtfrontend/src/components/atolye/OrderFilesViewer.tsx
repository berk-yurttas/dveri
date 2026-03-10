"use client";

import { useState } from "react";
import { useOrderFiles } from "@/hooks/useOrderFiles";

interface OrderFilesViewerProps {
  orderId: string;
  stationName?: string;
  className?: string;
}

export function OrderFilesViewer({ orderId, stationName, className }: OrderFilesViewerProps) {
  const { getOrderFiles, openFile } = useOrderFiles();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<{ name: string; file: File }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextFiles = await getOrderFiles(orderId, stationName);
      setFiles(nextFiles);
      setOpened(true);
    } catch (err: any) {
      setFiles([]);
      setError(err?.message || "Dosyalar alınamadı.");
      setOpened(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={loadFiles}
        disabled={loading}
        className="text-sm text-[#0f4c3a] underline hover:text-[#0a3a2c] disabled:opacity-50"
      >
        {loading ? "Yükleniyor..." : "Parça Dökümanları"}
      </button>

      {opened && (
        <div className="mt-2">
          {error ? (
            <p className="text-xs text-red-700">{error}</p>
          ) : files.length === 0 ? (
            <p className="text-xs text-gray-500">Dosya bulunamadı.</p>
          ) : (
            <ul className="space-y-1">
              {files.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => openFile(item.file)}
                    className="text-xs text-blue-700 underline hover:text-blue-900"
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

