"use client";

import { useEffect, useState } from "react";
import { accessToken, ingelogdeNaam, startLogin, uitloggen } from "@/lib/oidc";
import { DEV_AUTH } from "@/lib/api";

export default function InlogKnop() {
  const [naam, setNaam] = useState<string | null>(null);
  const [ingelogd, setIngelogd] = useState(false);

  useEffect(() => {
    const token = accessToken();
    setIngelogd(Boolean(token));
    setNaam(ingelogdeNaam());

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

  if (DEV_AUTH) return <span style={{ opacity: 0.7 }}>dev-login</span>;
  if (ingelogd) {
    return (
      <span style={{ display: "inline-flex", gap: ".6rem", alignItems: "center" }}>
        {naam && <span style={{ opacity: 0.85 }}>{naam}</span>}
        <a href="#" onClick={(e) => { e.preventDefault(); uitloggen(); }}>Uitloggen</a>
      </span>
    );
  }
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); void startLogin(); }}>
      Inloggen
    </a>
  );
}
