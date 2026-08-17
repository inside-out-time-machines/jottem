"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";

// Bevestigingspagina: consequenties uitleggen en de slug laten natypen voordat de
// verwijderknop actief wordt.
export default function OrganisatieVerwijderPagina() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [bevestiging, setBevestiging] = useState("");
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-piet", "Piet Platformbeheerder") };

  useEffect(() => setIngelogd(isIngelogd()), []);

  async function verwijder() {
    setBezig(true);
    setMelding(null);
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}`, { method: "DELETE", headers });
    setBezig(false);
    if (!r.ok) {
      setMelding((await r.json()).detail ?? "Verwijderen is niet gelukt");
      return;
    }
    router.push(`/beheer?melding=${encodeURIComponent(`Organisatie "${slug}" is verwijderd.`)}`);
  }

  if (ingelogd === null) return <main><h1>Organisatie verwijderen</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Organisatie verwijderen</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin(`/beheer/${slug}/verwijderen`)}>
            Log in als platformbeheerder
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p style={{ fontSize: ".95rem" }}><a href="/beheer">Platformbeheer</a></p>
      <h1 style={{ marginTop: ".3rem" }}>Organisatie &ldquo;{slug}&rdquo; verwijderen</h1>

      <section className="memo" style={{ marginTop: "1.5rem", maxWidth: "42rem" }}>
        <p><strong>Weet je het zeker? Dit kan niet ongedaan worden gemaakt.</strong></p>
        <ul style={{ marginTop: ".6rem", paddingLeft: "1.2rem", lineHeight: 1.7 }}>
          <li>De organisatie verdwijnt van de homepage en de publieke organisatiepagina vervalt.</li>
          <li>Alle (lege) projecten van de organisatie worden verwijderd, inclusief hun instellingen en datasetbeschrijvingen.</li>
          <li>De rollen van organisatiebeheerders en moderatoren bij deze organisatie worden ingetrokken; de accounts zelf blijven bestaan.</li>
          <li>Het gebeurtenislog blijft bewaard (zonder koppeling), voor statistiek en verantwoording.</li>
        </ul>
        <p style={{ marginTop: ".6rem" }}>
          Verwijderen kan alleen zolang de organisatie <strong>geen jottems</strong> heeft;
          zijn die er wel, dan moeten ze eerst gedepubliceerd en verwijderd worden.
        </p>
      </section>

      {melding && <p className="memo" style={{ marginTop: "1rem", maxWidth: "42rem" }}>{melding}</p>}

      <div className="formulier" style={{ marginTop: "1.5rem" }}>
        <div className="veld">
          <label htmlFor="bevestiging">Typ de slug <strong>{slug}</strong> om te bevestigen</label>
          <input
            id="bevestiging"
            type="text"
            value={bevestiging}
            onChange={(e) => setBevestiging(e.target.value)}
            placeholder={slug}
            autoComplete="off"
          />
        </div>
        <div style={{ display: "flex", gap: ".7rem" }}>
          <button
            className="knop knop-gevaar"
            disabled={bevestiging !== slug || bezig}
            onClick={verwijder}
          >
            Verwijder deze organisatie definitief
          </button>
          <a className="knop knop-secundair" href="/beheer">Annuleren</a>
        </div>
      </div>
    </main>
  );
}
