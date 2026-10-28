// API-toegang vanuit server-components en route handlers (interne compose-URL).
// Stuurt het access-token uit de cookie (gezet door lib/oidc.ts na de OIDC-callback) als
// Bearer mee, zodat de API bij een besloten project weet of de bezoeker lid is.
import { cookies } from "next/headers";
import { API_INTERN, TOKEN_COOKIE } from "./api";

export class ApiFout extends Error {
  status: number;
  constructor(pad: string, status: number) {
    super(`API ${pad}: ${status}`);
    this.status = status;
  }
}

async function tokenUitCookie(): Promise<string | null> {
  try {
    return (await cookies()).get(TOKEN_COOKIE)?.value ?? null;
  } catch {
    // buiten een request-context (bijv. tijdens de build) is er geen cookie
    return null;
  }
}

export async function apiServer<T>(pad: string, init?: RequestInit): Promise<T> {
  const token = await tokenUitCookie();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  const antwoord = await fetch(`${API_INTERN}${pad}`, { cache: "no-store", ...init, headers });
  if (!antwoord.ok) throw new ApiFout(pad, antwoord.status);
  return antwoord.json() as Promise<T>;
}
