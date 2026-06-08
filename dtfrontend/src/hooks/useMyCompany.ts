"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface MyCompany {
  id: number;
  name: string;
  code: string;
}

/** Fetches the caller's own company from the pairing-backed endpoint.
 *  Returns null until loaded or when the user is unpaired (404). */
export function useMyCompany(enabled: boolean): MyCompany | null {
  const [company, setCompany] = useState<MyCompany | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.get<MyCompany>("/romiot/station/companies/my-company")
      .then((data) => { if (!cancelled) setCompany(data); })
      .catch(() => { if (!cancelled) setCompany(null); });
    return () => { cancelled = true; };
  }, [enabled]);
  return company;
}
