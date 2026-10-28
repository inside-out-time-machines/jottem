"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_PUBLIEK, SITE_URL, authHeaders, isIngelogd } from "@/lib/api";
import BeheerInlog from "../../../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie, StatusPil, Veld } from "../../../beheer-ui";
import ProjectFormulier, { LEEG_PROJECT, PROJECT_FORMULIER_ID, ProjectVorm } from "../../project-formulier";

type ProjectUit = ProjectVorm & { projectId: string; datasetAangemeld: string | null; aantalJottems: number };

// Bewerkpagina van een project: het formulier in kaarten (Basis, Openbaarheid,
// Instellingen), daaronder Leden, Datasetbeschrijving en Widgets; rechts de actiebalk
// met de opgeslagen samenvatting en de knoppen.
export default function ProjectBewerkPagina() {
  const router = useRouter();
  const { org, project: projectSlug } = useParams<{ org: string; project: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [project, setProject] = useState<ProjectUit | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders() };

  const laden = useCallback(async () => {
    const r = await fetch(`${API_PUBLIEK}/organisatie/${org}/projecten`, { headers });
    if (!r.ok) { setMelding("Laden mislukt (ben je beheerder van deze organisatie?)"); return; }
    const lijst: ProjectUit[] = await r.json();
    const gevonden = lijst.find((p) => p.slug === projectSlug);
    if (!gevonden) { setMelding("Project niet gevonden."); return; }
    setProject(gevonden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, projectSlug]);

  useEffect(() => {
    setIngelogd(isIngelogd());
    if (isIngelogd()) laden();
  }, [laden]);

  if (!ingelogd) {
    return <BeheerInlog titel="Project bewerken" terugNaar={`/organisatiebeheer/${org}/${projectSlug}`}
                        rol="organisatiebeheerder" bekend={ingelogd === false} />;
  }

  const besloten = project?.zichtbaarheid === "besloten";
  const publiekeUrl = `/organisatie/${org}/${projectSlug}`;

  return (
    <BeheerPagina
      kruimels={<><a href="/organisatiebeheer">Organisatiebeheer</a> · {org}</>}
      titel={<>Bewerk: {project?.naam ?? projectSlug}</>}
      etiket={besloten ? "op uitnodiging" : undefined}
      zijbalk={
        <Actiebalk
          samenvatting={project ? [
            { label: "Status", waarde: <StatusPil soort={project.status}>{project.status}</StatusPil> },
            { label: "Openbaarheid", waarde: <StatusPil soort={project.zichtbaarheid}>{project.zichtbaarheid}</StatusPil> },
            { label: "Jottems", waarde: project.aantalJottems },
            { label: "Datasetregister", waarde: project.datasetAangemeld ? "aangemeld" : "niet aangemeld" },
          ] : undefined}
          voet={<>Publiekspagina: <a href={publiekeUrl} target="_blank" rel="noopener noreferrer">{SITE_URL.replace(/^https?:\/\//, "")}{publiekeUrl}</a></>}
        >
          <button className="knop knop-primair" type="submit" form={PROJECT_FORMULIER_ID}>Opslaan</button>
          <a className="knop knop-secundair" href="/organisatiebeheer">Annuleren</a>
          <a className="knop knop-secundair" href={`/organisatiebeheer/${org}/${projectSlug}/verwijderen`}>Verwijderen...</a>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}

      {project && (
        <ProjectFormulier
          begin={{
            ...LEEG_PROJECT,
            naam: project.naam, slug: project.slug,
            beschrijving: project.beschrijving ?? "", oproep: project.oproep ?? "",
            periode: project.periode ?? "",
            datasetLicentie: project.datasetLicentie ?? LEEG_PROJECT.datasetLicentie,
            status: project.status, terminologiebronnen: project.terminologiebronnen,
            afbeelding: project.afbeelding, verrijkingen: project.verrijkingen,
            uploadWijzen: project.uploadWijzen,
            zichtbaarheid: project.zichtbaarheid ?? "openbaar",
          }}
          organisatieSlug={org}
          bewerkProjectId={project.projectId}
          headers={headers}
          onMelding={setMelding}
          onKlaar={(m) => router.push(`/organisatiebeheer?melding=${encodeURIComponent(m)}`)}
        />
      )}

      {project && <LedenSectie projectId={project.projectId} besloten={besloten} headers={headers} />}
      {project && <DatasetSectie project={project} headers={headers} onMelding={setMelding} herlaad={laden} />}
      {project && !besloten && <WidgetSectie org={org} projectSlug={projectSlug} />}
    </BeheerPagina>
  );
}

// Datasetbeschrijving: tonen, valideren/aanmelden bij en afmelden van het NDE
// Datasetregister (OB-4).
function DatasetSectie({ project, headers, onMelding, herlaad }: {
  project: ProjectUit; headers: Record<string, string>;
  onMelding: (m: string | null) => void; herlaad: () => Promise<void>;
}) {
  const [dataset, setDataset] = useState<unknown | null>(null);

  async function toonDataset() {
    const r = await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving`, { headers });
    if (r.ok) setDataset((await r.json() as { dataset: unknown }).dataset);
  }

  async function meldAan() {
    onMelding("Valideren en aanmelden bij het NDE Datasetregister...");
    const r = await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving/aanmelden`, {
      method: "POST", headers,
    });
    const inhoud = await r.json().catch(() => ({}));
    if (r.ok) onMelding("Gevalideerd en aangemeld bij het Datasetregister.");
    else onMelding(`${inhoud.detail?.melding ?? inhoud.detail ?? "Aanmelden mislukt"} ${JSON.stringify(inhoud.detail?.details ?? "").slice(0, 300)}`);
    herlaad();
  }

  async function meldAf() {
    await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving/aanmelden`, { method: "DELETE", headers });
    onMelding("Afgemeld bij het Datasetregister.");
    herlaad();
  }

  return (
    <KaartSectie
      titel="Datasetbeschrijving"
      intro={<>De beschrijving wordt gegenereerd uit de projectvelden en is
        {project.datasetAangemeld ? " aangemeld bij" : " nog niet aangemeld bij"} het NDE Datasetregister.</>}
    >
      <div className="knoppenrij">
        <button className="knop knop-secundair" onClick={toonDataset}>Toon de beschrijving</button>
        <button className="knop knop-primair" onClick={meldAan}>Valideer en meld aan</button>
        {project.datasetAangemeld && (
          <button className="knop knop-secundair" onClick={meldAf}>Afmelden</button>
        )}
      </div>
      {dataset !== null && (
        <pre className="codeblok" style={{ maxHeight: "16rem" }}>{JSON.stringify(dataset, null, 2)}</pre>
      )}
    </KaartSectie>
  );
}

type ProjectLid = { gebruikersId: number; naam: string; email: string; gekoppeld: boolean; creatieDatum: string | null };

// Ledenadministratie van een besloten project (OB-8): uitnodigen (naam, e-mail) en
// intrekken; het patroon volgt het moderatorenbeheer in organisatiebeheer/page.tsx.
function LedenSectie({ projectId, besloten, headers }: { projectId: string; besloten: boolean; headers: Record<string, string> }) {
  const [leden, setLeden] = useState<ProjectLid[] | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch(`${API_PUBLIEK}/project/${projectId}/leden`, { headers });
    setLeden(r.ok ? await r.json() : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { laden(); }, [laden]);

  async function uitnodigen(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulier = e.currentTarget;
    const data = new FormData(formulier);
    const r = await fetch(`${API_PUBLIEK}/project/${projectId}/leden`, {
      method: "POST", headers,
      body: JSON.stringify({ naam: data.get("naam"), email: data.get("email") }),
    });
    if (r.ok) {
      setMelding("Lid uitgenodigd; de uitnodigingsmail is onderweg.");
      formulier.reset();
    } else {
      setMelding(`Uitnodigen mislukt: ${(await r.json().catch(() => ({}))).detail ?? r.statusText}`);
    }
    laden();
  }

  async function intrekken(lid: ProjectLid) {
    if (!window.confirm(`Lidmaatschap intrekken voor ${lid.naam}? Het account blijft bestaan.`)) return;
    const r = await fetch(`${API_PUBLIEK}/project/${projectId}/lid/${lid.gebruikersId}`, { method: "DELETE", headers });
    setMelding(r.ok ? "Lidmaatschap ingetrokken." : "Intrekken mislukt.");
    laden();
  }

  return (
    <KaartSectie
      titel="Leden"
      intro={besloten
        ? "Alleen deze leden, en de beheerders en moderatoren van je organisatie, zien de jottems. Een uitgenodigd lid ontvangt een e-mail met uitleg en een link om een wachtwoord in te stellen."
        : "Dit project is openbaar; de ledenlijst doet pas iets zodra je de openbaarheid op besloten zet. Je kunt alvast leden uitnodigen."}
    >
      {melding && <p className="memo memo-blok">{melding}</p>}
      <div className="lijst-leden">
        {(leden ?? []).map((lid) => (
          <div key={lid.gebruikersId}>
            <span className="naam">{lid.naam}</span>
            <span className="email">{lid.email}</span>
            {!lid.gekoppeld && <span className="etiket">wacht op eerste login</span>}
            <a className="actie" href="#" onClick={(e) => { e.preventDefault(); intrekken(lid); }}>intrekken</a>
          </div>
        ))}
        {leden !== null && leden.length === 0 && <p className="beheer-leeg">Nog geen leden.</p>}
      </div>
      <form className="rij-invoer" onSubmit={uitnodigen}>
        <Veld label="Naam" htmlFor="lid-naam"><input id="lid-naam" type="text" name="naam" required /></Veld>
        <Veld label="E-mailadres" htmlFor="lid-email"><input id="lid-email" type="email" name="email" required /></Veld>
        <button className="knop knop-primair" type="submit">Nodig lid uit</button>
      </form>
    </KaartSectie>
  );
}

// Widgetlinks en voorbeeldcode voor de organisatiebeheerder (D-6): drie routes,
// beide inbedvormen en een levend voorbeeld. Zie het hoofdstuk Deelbaarheid.
function WidgetSectie({ org, projectSlug }: { org: string; projectSlug: string }) {
  const basis = `${SITE_URL}/widget/${org}/${projectSlug}`;
  const iframeVoorbeeld =
    `<iframe src="${basis}/recent/3"\n`
    + `        style="width:100%; height:220px; border:0" title="Jottem"></iframe>`;
  const scriptVoorbeeld =
    `<div id="jottem-widget"></div>\n`
    + `<script async src="${SITE_URL}/widget.js"\n`
    + `        data-doel="#jottem-widget"\n`
    + `        data-src="${basis}/recent/3"></script>`;
  return (
    <KaartSectie
      titel="Widgets"
      intro={<>Toon dit project op je eigen website. Er zijn drie widgets; plak de code in je site
        (in WordPress: een &quot;Aangepaste HTML&quot;-blok). Voeg <code>?stijl=neutraal</code> toe
        voor een variant zonder kleuraccent.</>}
    >
      <ul style={{ paddingLeft: "1.2rem", fontSize: ".95rem" }}>
        <li><a href={basis} target="_blank" rel="noopener noreferrer">{basis}</a> - projectinfo</li>
        <li><a href={`${basis}/recent/3`} target="_blank" rel="noopener noreferrer">{`${basis}/recent/3`}</a> - recentste jottems (1 t/m 12)</li>
        <li><a href={`${basis}/willekeurig/4`} target="_blank" rel="noopener noreferrer">{`${basis}/willekeurig/4`}</a> - willekeurige jottems (1 t/m 12)</li>
      </ul>
      <details>
        <summary>Inbedden met een iframe</summary>
        <pre className="codeblok">{iframeVoorbeeld}</pre>
      </details>
      <details>
        <summary>Inbedden met een script</summary>
        <p className="hint">De widget neemt dan het lettertype en de kleuren van je eigen site over.</p>
        <pre className="codeblok">{scriptVoorbeeld}</pre>
      </details>
      <details>
        <summary>Zo zien ze eruit</summary>
        <iframe src={basis} title="Voorbeeld: projectinfo-widget"
                style={{ width: "100%", height: "180px", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", marginTop: ".4rem" }} />
        <iframe src={`${basis}/recent/3`} title="Voorbeeld: recente jottems-widget"
                style={{ width: "100%", height: "220px", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", marginTop: ".8rem" }} />
      </details>
    </KaartSectie>
  );
}
