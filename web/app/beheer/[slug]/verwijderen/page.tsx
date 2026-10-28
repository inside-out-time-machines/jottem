"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import BeheerInlog from "../../../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie, Veld } from "../../../beheer-ui";

// Bevestigingspagina: consequenties uitleggen en de slug laten natypen voordat de
// verwijderknop actief wordt.
export default function OrganisatieVerwijderPagina() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [bevestiging, setBevestiging] = useState("");
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const headers = { "Content-Type": "application/json", ...authHeaders() };

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

  if (!ingelogd) {
    return <BeheerInlog titel="Organisatie verwijderen" terugNaar={`/beheer/${slug}/verwijderen`}
                        rol="platformbeheerder" bekend={ingelogd === false} />;
  }

  return (
    <BeheerPagina
      kruimels={<><a href="/beheer">Platformbeheer</a> · <a href={`/beheer/${slug}`}>{slug}</a></>}
      titel={<>Organisatie &ldquo;{slug}&rdquo; verwijderen</>}
      zijbalk={
        <Actiebalk samenvatting={[{ label: "Slug", waarde: slug }]} voet="Verwijderen kan niet ongedaan worden gemaakt.">
          <button className="knop knop-gevaar" disabled={bevestiging !== slug || bezig} onClick={verwijder}>
            Verwijder definitief
          </button>
          <a className="knop knop-secundair" href={`/beheer/${slug}`}>Annuleren</a>
        </Actiebalk>
      }
    >
      <div className="memo memo-blok">
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
      </div>

      {melding && <p className="memo memo-blok">{melding}</p>}

      <KaartSectie titel="Bevestiging">
        <Veld label={<>Typ de slug <strong>{slug}</strong> om te bevestigen</>} htmlFor="bevestiging">
          <input
            id="bevestiging"
            type="text"
            value={bevestiging}
            onChange={(e) => setBevestiging(e.target.value)}
            placeholder={slug}
            autoComplete="off"
          />
        </Veld>
      </KaartSectie>
    </BeheerPagina>
  );
}
