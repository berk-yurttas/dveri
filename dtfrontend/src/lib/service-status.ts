import { api } from "@/lib/api";

export type ServiceCheckerEndpoint = {
  id: number;
  name: string;
  url: string;
  is_up: boolean | null;
  last_check_at: string | null;
  is_active?: boolean;
};

export type ServiceStatusResponse = {
  enabled: boolean;
  endpoints: ServiceCheckerEndpoint[];
  error?: string;
};

/** Match ServiceChecker URLs to platform feature URLs (trailing slash, case, etc.). */
export function normalizeServiceUrl(raw: string): string {
  const s = raw.trim();
  try {
    const u = new URL(s);
    u.hash = "";
    u.search = "";
    const path = u.pathname.replace(/\/$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
  } catch {
    return s.toLowerCase();
  }
}

export async function fetchServiceStatus(): Promise<ServiceStatusResponse> {
  return api.get<ServiceStatusResponse>("/service-status", undefined, {
    useCache: false,
  });
}

/** unknown = checker off, fetch failed, URL not registered, or check not run yet (is_up null) */
export type ExternalHealth = "up" | "down" | "unknown";

/** Normalize API booleans (some proxies / JSON edge cases use strings). */
function coalesceIsUp(v: unknown): boolean | null {
  if (v === true || v === "true" || v === "True" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === "False" || v === 0 || v === "0") return false;
  return null;
}

export function buildExternalHealthLookup(
  enabled: boolean,
  endpoints: ServiceCheckerEndpoint[],
  fetchHadError: boolean
): (url: string) => ExternalHealth {
  const map = new Map<string, ServiceCheckerEndpoint>();
  for (const ep of endpoints) {
    if (!ep?.url) continue;
    const key = normalizeServiceUrl(ep.url);
    map.set(key, ep);
    // Also index without trailing slash on path (extra match attempts)
    const alt = key.replace(/\/$/, "");
    if (alt !== key && alt.length > 0) {
      map.set(alt, ep);
    }
  }
  return (url: string) => {
    console.log("HEALTH_LOOKUP requested for URL:", url, "enabled:", enabled, "endpoints.length:", endpoints.length, "fetchHadError:", fetchHadError);
    if (!enabled) {
      return "unknown";
    }
    // If we have endpoint data, use it even when the proxy attached a non-fatal warning
    if (fetchHadError && (!endpoints || endpoints.length === 0)) {
      return "unknown";
    }
    const want = normalizeServiceUrl(url);
    let ep = map.get(want) ?? map.get(want.replace(/\/$/, ""));
    if (!ep) {
      for (const e of endpoints) {
        if (!e?.url) continue;
        if (normalizeServiceUrl(e.url) === want) {
          ep = e;
          break;
        }
      }
    }
    if (!ep) {
      console.log("HEALTH_LOOKUP failed to find endpoint for URL:", url, "want:", want);
      return "unknown";
    }
    const up = coalesceIsUp(ep.is_up);
    console.log("HEALTH_LOOKUP found ep!", "ep.url:", ep.url, "ep.is_up:", ep.is_up, "coalesced up:", up);
    if (up === null) {
      return "unknown";
    }
    return up ? "up" : "down";
  };
}
