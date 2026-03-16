"use client";

import { useCallback, useState } from "react";

type PersistedKey = "ordersRootDirectory";
const DB_NAME = "orders-files-db";
const STORE_NAME = "handles";

export interface OrderFileItem {
  name: string;
  file: File;
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putHandle(key: PersistedKey, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getHandle(key: PersistedKey): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  const result = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  // @ts-expect-error queryPermission/requestPermission are available in supported browsers.
  const current = await handle.queryPermission?.({ mode: "read" });
  if (current === "granted") return true;
  // @ts-expect-error queryPermission/requestPermission are available in supported browsers.
  const requested = await handle.requestPermission?.({ mode: "read" });
  return requested === "granted";
}

export function useOrderFiles() {
  const [selectedHandle, setSelectedHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const selectOrdersFolder = useCallback(async () => {
    if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") {
      throw new Error("Tarayıcı bu özelliği desteklemiyor.");
    }
    const handle = await window.showDirectoryPicker();
    const granted = await ensureReadPermission(handle);
    if (!granted) {
      throw new Error("Klasör erişim izni verilmedi.");
    }
    await putHandle("ordersRootDirectory", handle);
    setSelectedHandle(handle);
  }, []);

  const getStoredDirectoryHandle = useCallback(async (): Promise<FileSystemDirectoryHandle> => {
    let handle = selectedHandle || (await getHandle("ordersRootDirectory"));
    if (!handle) {
      if (typeof window === "undefined" || typeof window.showDirectoryPicker !== "function") {
        throw new Error("Tarayıcı bu özelliği desteklemiyor.");
      }
      try {
        handle = await window.showDirectoryPicker();
      } catch {
        throw new Error("Önce merkez dizin seçilmelidir.");
      }
      const pickedGranted = await ensureReadPermission(handle);
      if (!pickedGranted) {
        throw new Error("Önce merkez dizin seçilmelidir.");
      }
      await putHandle("ordersRootDirectory", handle);
      setSelectedHandle(handle);
    }

    const granted = await ensureReadPermission(handle);
    if (!granted) {
      throw new Error("Klasör izni iptal edilmiş. Lütfen tekrar seçin.");
    }
    if (!selectedHandle) setSelectedHandle(handle);
    return handle;
  }, [selectedHandle]);

  const getOrderFiles = useCallback(
    async (orderId: string, stationName?: string, allStationNames?: string[]): Promise<OrderFileItem[]> => {
      const folderName = orderId.trim();
      if (!folderName) {
        throw new Error("Geçersiz orderId.");
      }

      const readFilesFromDir = async (dirHandle: FileSystemDirectoryHandle): Promise<OrderFileItem[]> => {
        const files: OrderFileItem[] = [];
        const dirWithEntries = dirHandle as FileSystemDirectoryHandle & {
          entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
        };
        for await (const [, entry] of dirWithEntries.entries()) {
          if (entry.kind === "file") {
            const file = await (entry as FileSystemFileHandle).getFile();
            files.push({ name: file.name, file });
          }
        }
        return files;
      };

      const readOrderFolder = async (rootHandle: FileSystemDirectoryHandle) => {
        const orderDir = await rootHandle.getDirectoryHandle(folderName, { create: false });
        const files: OrderFileItem[] = [];
        const orderDirWithEntries = orderDir as FileSystemDirectoryHandle & {
          entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
        };
        const currentStation = stationName?.trim() ?? "";
        const knownStations = allStationNames?.map((s) => s.trim()) ?? [];

        for await (const [name, entry] of orderDirWithEntries.entries()) {
          if (entry.kind !== "directory") continue;
          const subDir = entry as FileSystemDirectoryHandle;
          if (knownStations.length > 0) {
            const isAtolyeFolder = knownStations.includes(name);
            if (isAtolyeFolder) {
              // Only include if it matches the current station
              if (currentStation && name === currentStation) {
                files.push(...(await readFilesFromDir(subDir)));
              }
            } else {
              // Generic folder — always include
              files.push(...(await readFilesFromDir(subDir)));
            }
          } else {
            // No station context — include everything
            files.push(...(await readFilesFromDir(subDir)));
          }
        }
        return files;
      };

      const rootHandle = await getStoredDirectoryHandle();
      try {
        return await readOrderFolder(rootHandle);
      } catch {
        throw new Error("Parça klasörü bulunamadı.");
      }
    },
    [getStoredDirectoryHandle]
  );

  const openFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, []);

  return {
    selectOrdersFolder,
    getOrderFiles,
    openFile,
  };
}

