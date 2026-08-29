"use client";

import { useEffect, useState } from "react";
import { accessToken, ingelogdeNaam, startLogin, uitloggen } from "@/lib/oidc";
import { API_PUBLIEK, DEV_AUTH } from "@/lib/api";

export default function InlogKnop() {
  const [naam, setNaam] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [ingelogd, setIngelogd] = useState(false);

  useEffect(() => {
    const token = accessToken();
    setIngelogd(Boolean(token));
    setNaam(ingelogdeNaam());
    if (token) {
      // profiel ophalen voor de actuele naam en de profielfoto in de balk
      fetch(`${API_PUBLIEK}/mijn/profiel`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((profiel) => {
          if (profiel) {
            setNaam(profiel.naam);
            setFoto(profiel.afbeeldingUrl);
          }
        })
        .catch(() => {});
    }

    // SSO-handoff: wie vanaf Authentik binnenkomt (app-tegel met ?sso=1, of via de
    // referrer) heeft daar al een sessie maar hier nog geen token; start dan direct
    // de OIDC-flow, die zonder interactie meteen terugkeert. Eén poging per tab.
    if (DEV_AUTH || token) return;
    const params = new URLSearchParams(window.location.search);
    const vanAuthentik =
      params.get("sso") === "1" || document.referrer.startsWith("https://auth.");
    if (vanAuthentik && !sessionStorage.getItem("oidc_auto_geprobeerd")) {
      sessionStorage.setItem("oidc_auto_geprobeerd", "1");
      params.delete("sso");
      const terug = window.location.pathname + (params.size ? `?${params}` : "");
      void startLogin(terug);
    }
  }, []);

  if (DEV_AUTH) return <a href="/profiel" style={{ opacity: 0.7 }}>dev-login</a>;
  if (ingelogd) {
    return (
      <span style={{ display: "inline-flex", gap: ".6rem", alignItems: "center" }}>
        <a href="/profiel" style={{ display: "inline-flex", gap: ".45rem", alignItems: "center" }}>
          {foto && <img src={foto} alt="" className="avatar" />}
          {naam ?? "Mijn profiel"}
        </a>
        <a href="#" onClick={(e) => { e.preventDefault(); void uitloggen(); }}>Uitloggen</a>
      </span>
    );
  }
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); void startLogin(); }}>
      Inloggen
    </a>
  );
}
