"use client";

import { useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin, uitloggen } from "@/lib/oidc";

const AUTH_INSTELLINGEN =
  (process.env.NEXT_PUBLIC_OIDC_ISSUER ?? "https://auth.dev.iotm.nl/application/o/jottem/")
    .split("/application/")[0] + "/if/user/#/settings";

type Profiel = {
  naam: string;
  email: string;
  naamPubliek: boolean;
  attenderingen: boolean;
  afbeeldingUrl: string | null;
  rollen: { rol: string }[];
};

export default function ProfielPagina() {
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [profiel, setProfiel] = useState<Profiel | null>(null);
  const [naam, setNaam] = useState("");
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-anna", "Anna Uploader") };

  useEffect(() => {
    setIngelogd(isIngelogd());
    if (!isIngelogd()) return;
    fetch(`${API_PUBLIEK}/mijn/profiel`, { headers })
      .then((r) => r.json())
      .then((gegevens: Profiel) => {
        setProfiel(gegevens);
        setNaam(gegevens.naam);
      })
      .catch(() => setMelding("Profiel laden mislukt."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bijwerken(wijziging: Record<string, unknown>, boodschap: string) {
    const r = await fetch(`${API_PUBLIEK}/mijn/profiel`, {
      method: "PUT", headers, body: JSON.stringify(wijziging),
    });
    if (r.ok) {
      const gegevens = await r.json();
      setProfiel(gegevens);
      sessionStorage.setItem("oidc_naam", gegevens.naam);
      setMelding(boodschap);
    } else {
      setMelding("Opslaan mislukt.");
    }
  }

  async function fotoKiezen(bestand: File) {
    const vraag = await fetch(`${API_PUBLIEK}/mijn/profiel-afbeelding-upload`, {
      method: "POST", headers,
      body: JSON.stringify({ bestandsnaam: bestand.name, contentType: bestand.type }),
    });
    if (!vraag.ok) { setMelding("Upload-URL aanvragen mislukt."); return; }
    const { objectKey, uploadUrl } = await vraag.json();
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": bestand.type }, body: bestand });
    if (!put.ok) { setMelding("Upload mislukt."); return; }
    await bijwerken({ afbeelding: objectKey }, "Je foto is bijgewerkt.");
  }

  if (ingelogd === null) return <main><h1>Mijn profiel</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Mijn profiel</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin("/profiel")}>
            Inloggen
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Mijn profiel</h1>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}
      {profiel && (
        <div className="formulier" style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {profiel.afbeeldingUrl ? (
              <img src={profiel.afbeeldingUrl} alt="" className="avatar avatar-groot" />
            ) : (
              <span className="avatar avatar-groot avatar-leeg" aria-hidden="true">
                {profiel.naam.slice(0, 1).toUpperCase()}
              </span>
            )}
            <label className="knop knop-secundair" style={{ cursor: "pointer" }}>
              Foto kiezen
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => { const b = e.target.files?.[0]; if (b) fotoKiezen(b); }}
              />
            </label>
            {profiel.afbeeldingUrl && (
              <button className="knop knop-secundair" onClick={() => bijwerken({ afbeelding: "" }, "Je foto is verwijderd.")}>
                Foto verwijderen
              </button>
            )}
          </div>
          <div className="veld">
            <label htmlFor="naam">Naam (zoals anderen die zien)</label>
            <input id="naam" type="text" value={naam} onChange={(e) => setNaam(e.target.value)} />
          </div>
          <p>
            <button className="knop knop-primair" onClick={() => bijwerken({ naam }, "Je naam is bijgewerkt.")}>
              Naam opslaan
            </button>
          </p>
          <label style={{ fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={profiel.naamPubliek}
              onChange={(e) => bijwerken({ naamPubliek: e.target.checked }, "Privacy-instelling opgeslagen.")}
            />{" "}
            Toon mijn naam bij mijn bijdragen en annotaties (uit = anoniem getoond)
          </label>
          <label style={{ fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={profiel.attenderingen}
              onChange={(e) => bijwerken({ attenderingen: e.target.checked }, "Attenderingen opgeslagen.")}
            />{" "}
            Stuur mij een berichtje bij nieuwe annotaties of reacties op mijn jottems (max. één mail per dag)
          </label>
          <p style={{ fontSize: ".95rem", color: "var(--grijs)" }}>
            Ingelogd als {profiel.email}
            {profiel.rollen.length > 0 && ` · rollen: ${profiel.rollen.map((r) => r.rol).join(", ")}`}
          </p>
          <p style={{ display: "flex", gap: ".7rem", flexWrap: "wrap" }}>
            <a className="knop knop-secundair" href={AUTH_INSTELLINGEN}>
              Wachtwoord, 2FA en passkeys beheren
            </a>
            <button className="knop knop-secundair" onClick={() => uitloggen()}>Uitloggen</button>
          </p>
        </div>
      )}
    </main>
  );
}
