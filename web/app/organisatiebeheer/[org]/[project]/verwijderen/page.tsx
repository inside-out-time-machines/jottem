"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import BeheerInlog from "../../../../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie, Veld } from "../../../../beheer-ui";

// Bevestigingspagina voor projectverwijdering: consequenties + slug natypen.
export default function ProjectVerwijderPagina() {
  const router = useRouter();
  const { org, project: projectSlug } = useParams<{ org: string; project: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [naam, setNaam] = useState<string>("");
  const [aantalJottems, setAantalJottems] = useState<number | null>(null);
  const [bevestiging, setBevestiging] = useState("");
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const headers = { "Content-Type": "application/json", ...authHeaders() };

  const laden = useCallback(async () => {
    const r = await fetch(`${API_PUBLIEK}/organisatie/${org}/projecten`, { headers });
    if (!r.ok) { setMelding("Laden mislukt (ben je beheerder van deze organisatie?)"); return; }
    const lijst = await r.json();
    const gevonden = lijst.find((p: { slug: string }) => p.slug === projectSlug);
    if (!gevonden) { setMelding("Project niet gevonden."); return; }
    setProjectId(gevonden.projectId);
    setNaam(gevonden.naam);
    setAantalJottems(gevonden.aantalJottems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, projectSlug]);

  useEffect(() => {
    setIngelogd(isIngelogd());
    if (isIngelogd()) laden();
  }, [laden]);

  async function verwijder() {
    if (!projectId) return;
    setBezig(true);
    setMelding(null);
    const r = await fetch(`${API_PUBLIEK}/project/${projectId}`, { method: "DELETE", headers });
    setBezig(false);
    if (!r.ok) {
      setMelding((await r.json()).detail ?? "Verwijderen is niet gelukt");
      return;
    }
    router.push(`/organisatiebeheer?melding=${encodeURIComponent(`Project "${naam}" is verwijderd.`)}`);
  }

  if (!ingelogd) {
    return <BeheerInlog titel="Project verwijderen" terugNaar={`/organisatiebeheer/${org}/${projectSlug}/verwijderen`}
                        rol="organisatiebeheerder" bekend={ingelogd === false} />;
  }

  const magVerwijderen = bevestiging === projectSlug && !bezig && !!projectId;

  return (
    <BeheerPagina
      kruimels={<><a href="/organisatiebeheer">Organisatiebeheer</a> · {org} · <a href={`/organisatiebeheer/${org}/${projectSlug}`}>{naam || projectSlug}</a></>}
      titel={<>Project &ldquo;{naam || projectSlug}&rdquo; verwijderen</>}
      zijbalk={
        <Actiebalk
          samenvatting={[
            { label: "Slug", waarde: projectSlug },
            { label: "Jottems", waarde: aantalJottems ?? "..." },
          ]}
          voet="Verwijderen kan niet ongedaan worden gemaakt."
        >
          <button className="knop knop-gevaar" disabled={!magVerwijderen} onClick={verwijder}>
            Verwijder definitief
          </button>
          <a className="knop knop-secundair" href={`/organisatiebeheer/${org}/${projectSlug}`}>Annuleren</a>
        </Actiebalk>
      }
    >
      <div className="memo memo-blok">
        <p><strong>Weet je het zeker? Dit kan niet ongedaan worden gemaakt.</strong></p>
        <ul style={{ marginTop: ".6rem", paddingLeft: "1.2rem", lineHeight: 1.7 }}>
          <li>Het project verdwijnt van de publieke projectpagina en van de homepage.</li>
          <li>De projectinstellingen (oproep, terminologiebronnen, verrijkingen) en de datasetbeschrijving vervallen.</li>
          <li>Het gebeurtenislog blijft bewaard (zonder koppeling), voor statistiek en verantwoording.</li>
        </ul>
        <p style={{ marginTop: ".6rem" }}>
          Verwijderen kan alleen als het project <strong>geen jottems</strong> heeft
          {aantalJottems !== null && aantalJottems > 0 && (
            <> (dit project heeft er nu <strong>{aantalJottems}</strong>)</>
          )}
          , en niet als het het laatste project van de organisatie is: elke organisatie
          houdt er minstens één.
        </p>
      </div>

      {melding && <p className="memo memo-blok">{melding}</p>}

      <KaartSectie titel="Bevestiging">
        <Veld label={<>Typ de slug <strong>{projectSlug}</strong> om te bevestigen</>} htmlFor="bevestiging">
          <input
            id="bevestiging"
            type="text"
            value={bevestiging}
            onChange={(e) => setBevestiging(e.target.value)}
            placeholder={projectSlug}
            autoComplete="off"
          />
        </Veld>
      </KaartSectie>
    </BeheerPagina>
  );
}
