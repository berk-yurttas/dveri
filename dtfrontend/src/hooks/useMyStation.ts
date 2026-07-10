"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface MyStation {
  station_id: number;
  name: string;
  company: string;
  is_entry_station: boolean;
  is_exit_station: boolean;
  can_view_work_orders: boolean;
}

/** Fetches the caller's own station from the operator-only endpoint.
 *  Returns null until loaded or when the caller has no operator station (403/404).
 *  Only fetch when `enabled` (i.e. the caller is an operator). */
export function useMyStation(enabled: boolean): MyStation | null {
  const [station, setStation] = useState<MyStation | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.get<MyStation>("/romiot/station/stations/my-station")
      .then((data) => { if (!cancelled) setStation(data); })
      .catch(() => { if (!cancelled) setStation(null); });
    return () => { cancelled = true; };
  }, [enabled]);
  return station;
}
