// API-toegang. Server-side gebruikt het interne compose-adres, de browser het publieke.
export const API_INTERN = process.env.JOTTEM_API_INTERN ?? "http://api:8000";
export const API_PUBLIEK = process.env.NEXT_PUBLIC_API_URL ?? "https://api.dev.iotm.nl";

// Dev-bypass (alleen actief als de API met JOTTEM_DEV_AUTH=1 draait): identiteit voor
// browser-calls tijdens het fundament, totdat de Authentik-loginflow is aangesloten.
export const DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "1";

export function devHeaders(sub: string, naam?: string): Record<string, string> {
  if (!DEV_AUTH) return {};
  return { "X-Dev-Sub": sub, ...(naam ? { "X-Dev-Naam": naam } : {}) };
}

export async function apiServer<T>(pad: string, init?: RequestInit): Promise<T> {
  const antwoord = await fetch(`${API_INTERN}${pad}`, { cache: "no-store", ...init });
  if (!antwoord.ok) throw new Error(`API ${pad}: ${antwoord.status}`);
  return antwoord.json() as Promise<T>;
}
