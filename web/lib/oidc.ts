// OIDC Authorization Code + PKCE tegen Authentik (public client, geen secret).
// Tokens leven in sessionStorage; de API valideert het access-token via JWKS.
"use client";

const ISSUER =
  process.env.NEXT_PUBLIC_OIDC_ISSUER ?? "https://auth.dev.iotm.nl/application/o/jottem/";
const CLIENT_ID = process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "jottem-web";

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function discovery(): Promise<{ authorization_endpoint: string; token_endpoint: string; end_session_endpoint?: string }> {
  const antwoord = await fetch(`${ISSUER}.well-known/openid-configuration`);
  if (!antwoord.ok) throw new Error("OIDC-discovery mislukt");
  return antwoord.json();
}

export async function startLogin(terugNaar: string = window.location.pathname): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem("oidc_verifier", verifier);
  sessionStorage.setItem("oidc_state", state);
  sessionStorage.setItem("oidc_terug", terugNaar);

  const disco = await discovery();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.href = `${disco.authorization_endpoint}?${params}`;
}

export async function verwerkCallback(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code) throw new Error(params.get("error_description") ?? "Geen code ontvangen");
  if (state !== sessionStorage.getItem("oidc_state")) throw new Error("State klopt niet");

  const disco = await discovery();
  const antwoord = await fetch(disco.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: `${window.location.origin}/auth/callback`,
      code_verifier: sessionStorage.getItem("oidc_verifier") ?? "",
    }),
  });
  if (!antwoord.ok) throw new Error(`Token ophalen mislukt (${antwoord.status})`);
  const tokens = await antwoord.json();
  sessionStorage.setItem("oidc_access_token", tokens.access_token);
  if (tokens.id_token) {
    sessionStorage.setItem("oidc_id_token", tokens.id_token);
    try {
      const claims = JSON.parse(atob(tokens.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      sessionStorage.setItem("oidc_naam", claims.name ?? claims.preferred_username ?? "");
    } catch {
      // naam is cosmetisch; token blijft leidend
    }
  }
  sessionStorage.removeItem("oidc_verifier");
  sessionStorage.removeItem("oidc_state");
  const terug = sessionStorage.getItem("oidc_terug") ?? "/";
  sessionStorage.removeItem("oidc_terug");
  return terug;
}

export function accessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("oidc_access_token");
}

export function ingelogdeNaam(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("oidc_naam");
}

export function uitloggen(): void {
  sessionStorage.removeItem("oidc_access_token");
  sessionStorage.removeItem("oidc_id_token");
  sessionStorage.removeItem("oidc_naam");
  window.location.href = "/";
}
