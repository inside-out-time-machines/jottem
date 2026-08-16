"use client";

import { useEffect, useState } from "react";
import { accessToken, ingelogdeNaam, startLogin, uitloggen } from "@/lib/oidc";
import { DEV_AUTH } from "@/lib/api";

export default function InlogKnop() {
  const [naam, setNaam] = useState<string | null>(null);
  const [ingelogd, setIngelogd] = useState(false);

  useEffect(() => {
    setIngelogd(Boolean(accessToken()));
    setNaam(ingelogdeNaam());
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
