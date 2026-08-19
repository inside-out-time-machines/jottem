// API-toegang. Server-side gebruikt het interne compose-adres, de browser het publieke.
export const API_INTERN = process.env.JOTTEM_API_INTERN ?? "http://api:8000";
export const API_PUBLIEK = process.env.NEXT_PUBLIC_API_URL ?? "https://api.dev.iotm.nl";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dev.iotm.nl";

// Dev-bypass (alleen actief als de API met JOTTEM_DEV_AUTH=1 draait): identiteit voor
// browser-calls tijdens het fundament, totdat de Authentik-loginflow is aangesloten.
export const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "1";

// Welke dev-identiteit de bypass gebruikt, staat in één omgevingsvariabele in plaats van
// per pagina in de code: zo staat er nergens meer een testaccount hardgecodeerd.
export const DEV_SUB = process.env.NEXT_PUBLIC_DEV_SUB ?? "dev-piet";

export function devHeaders(sub: string = DEV_SUB, naam?: string): Record<string, string> {
  if (!DEV_AUTH) return {};
  return { "X-Dev-Sub": sub, ...(naam ? { "X-Dev-Naam": naam } : {}) };
}

// Auth-headers voor browser-calls: dev-bypass in dev, anders het OIDC-access-token.
export function authHeaders(devSub: string = DEV_SUB, devNaam?: string): Record<string, string> {
  if (DEV_AUTH) return devHeaders(devSub, devNaam);
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem("oidc_access_token");
    if (token) return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export function isIngelogd(): boolean {
  if (DEV_AUTH) return true;
  return typeof window !== "undefined" && Boolean(sessionStorage.getItem("oidc_access_token"));
}

export async function apiServer<T>(pad: string, init?: RequestInit): Promise<T> {
  const antwoord = await fetch(`${API_INTERN}${pad}`, { cache: "no-store", ...init });
  if (!antwoord.ok) throw new Error(`API ${pad}: ${antwoord.status}`);
  return antwoord.json() as Promise<T>;
}
