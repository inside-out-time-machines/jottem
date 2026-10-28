"use client";

import { useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { uitloggen } from "@/lib/oidc";
import BeheerInlog from "../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie, Veld } from "../beheer-ui";

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

  const headers = { "Content-Type": "application/json", ...authHeaders() };

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

  if (!ingelogd) {
    return <BeheerInlog titel="Mijn profiel" terugNaar="/profiel" rol="gebruiker" bekend={ingelogd === false} />;
  }

  return (
    <BeheerPagina
      titel="Mijn profiel"
      zijbalk={
        <Actiebalk
          samenvatting={profiel ? [
            { label: "Ingelogd als", waarde: profiel.email },
            { label: "Rollen", waarde: profiel.rollen.length > 0 ? profiel.rollen.map((r) => r.rol).join(", ") : "gebruiker" },
          ] : undefined}
          voet="Wachtwoord, tweestapsverificatie en passkeys beheer je bij de inlogdienst."
        >
          <a className="knop knop-secundair" href={AUTH_INSTELLINGEN}>Wachtwoord en 2FA</a>
          <button className="knop knop-secundair" onClick={() => uitloggen()}>Uitloggen</button>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}
      {profiel && (
        <>
          <KaartSectie titel="Wie ben je" intro="Je naam en foto staan bij je jottems, annotaties en reacties, als je dat hieronder toestaat.">
            <div className="kleurstaal" style={{ gap: "1rem" }}>
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
            <Veld label="Naam" htmlFor="naam" hint="Zoals anderen die zien.">
              <input id="naam" type="text" value={naam} onChange={(e) => setNaam(e.target.value)} />
            </Veld>
            <div className="knoppenrij">
              <button className="knop knop-primair" onClick={() => bijwerken({ naam }, "Je naam is bijgewerkt.")}>
                Naam opslaan
              </button>
            </div>
          </KaartSectie>

          <KaartSectie titel="Privacy en berichten" intro="Deze keuzes worden direct opgeslagen.">
            <div className="keuzes-kader">
              <div className="keuzes keuzes-een">
                <label>
                  <input
                    type="checkbox"
                    checked={profiel.naamPubliek}
                    onChange={(e) => bijwerken({ naamPubliek: e.target.checked }, "Privacy-instelling opgeslagen.")}
                  />
                  <span>Toon mijn naam bij mijn bijdragen en annotaties <span className="keuze-uitleg">(uit = anoniem getoond)</span></span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={profiel.attenderingen}
                    onChange={(e) => bijwerken({ attenderingen: e.target.checked }, "Attenderingen opgeslagen.")}
                  />
                  <span>Stuur mij een berichtje bij nieuwe annotaties of reacties op mijn jottems <span className="keuze-uitleg">(maximaal één mail per dag)</span></span>
                </label>
              </div>
            </div>
          </KaartSectie>
        </>
      )}
    </BeheerPagina>
  );
}
