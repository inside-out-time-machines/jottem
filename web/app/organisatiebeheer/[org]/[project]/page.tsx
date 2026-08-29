"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_PUBLIEK, SITE_URL, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";
import ProjectFormulier, { LEEG_PROJECT, ProjectVorm } from "../../project-formulier";

type ProjectUit = ProjectVorm & { projectId: string; datasetAangemeld: string | null };

// Bewerkpagina van een project: velden + afbeelding + de datasetbeschrijving
// (tonen, valideren/aanmelden bij en afmelden van het NDE Datasetregister).
export default function ProjectBewerkPagina() {
  const router = useRouter();
  const { org, project: projectSlug } = useParams<{ org: string; project: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [project, setProject] = useState<ProjectUit | null>(null);
  const [dataset, setDataset] = useState<unknown | null>(null);
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

  async function toonDataset() {
    if (!project) return;
    const r = await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving`, { headers });
    if (r.ok) setDataset((await r.json() as { dataset: unknown }).dataset);
  }


  async function meldAan() {
    if (!project) return;
    setMelding("Valideren en aanmelden bij het NDE Datasetregister...");
    const r = await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving/aanmelden`, {
      method: "POST", headers,
    });
    const inhoud = await r.json().catch(() => ({}));
    if (r.ok) setMelding("Gevalideerd en aangemeld bij het Datasetregister.");
    else setMelding(`${inhoud.detail?.melding ?? inhoud.detail ?? "Aanmelden mislukt"} ${JSON.stringify(inhoud.detail?.details ?? "").slice(0, 300)}`);
    laden();
  }

  async function meldAf() {
    if (!project) return;
    await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving/aanmelden`, { method: "DELETE", headers });
    setMelding("Afgemeld bij het Datasetregister.");
    laden();
  }

  if (ingelogd === null) return <main><h1>Project bewerken</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Project bewerken</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin(`/organisatiebeheer/${org}/${projectSlug}`)}>
            Log in als organisatiebeheerder
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p style={{ fontSize: ".95rem" }}><a href="/organisatiebeheer">Organisatiebeheer</a> · {org}</p>
      <h1 style={{ marginTop: ".3rem" }}>Bewerk: {project?.naam ?? projectSlug}</h1>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}

      {project && (
        <section style={{ marginTop: "1.5rem" }}>
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
            }}
            organisatieSlug={org}
            bewerkProjectId={project.projectId}
            headers={headers}
            opslaanTekst="Opslaan"
            onKlaar={(m) => router.push(`/organisatiebeheer?melding=${encodeURIComponent(m)}`)}
          />
        </section>
      )}

      {project && (
        <section style={{ marginTop: "2.5rem", maxWidth: "42rem" }}>
          <h2>Datasetbeschrijving</h2>
          <p style={{ marginTop: ".4rem", fontSize: ".95rem", color: "var(--grijs)" }}>
            De beschrijving wordt gegenereerd uit de projectvelden hierboven en is
            {project.datasetAangemeld ? " aangemeld bij" : " nog niet aangemeld bij"} het NDE Datasetregister.
          </p>
          <p style={{ marginTop: ".8rem", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <button className="knop knop-secundair" onClick={toonDataset}>Toon de beschrijving</button>
            <button className="knop knop-primair" onClick={meldAan}>Valideer en meld aan</button>
            {project.datasetAangemeld && (
              <button className="knop knop-secundair" onClick={meldAf}>Afmelden</button>
            )}
          </p>
          {dataset !== null && (
            <pre style={{ background: "var(--papier)", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", padding: ".6rem", overflowX: "auto", maxHeight: "16rem", fontSize: ".82rem", marginTop: ".8rem" }}>
              {JSON.stringify(dataset, null, 2)}
            </pre>
          )}
        </section>
      )}

      {project && <WidgetSectie org={org} projectSlug={projectSlug} />}
    </main>
  );
}

const CODEBLOK_STIJL = {
  background: "var(--papier)", border: "1px solid var(--kartonrand)",
  borderRadius: ".3rem", padding: ".6rem", overflowX: "auto" as const,
  fontSize: ".82rem", marginTop: ".4rem",
};

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
    <section style={{ marginTop: "2.5rem", maxWidth: "42rem" }}>
      <h2>Widgets</h2>
      <p style={{ marginTop: ".4rem", fontSize: ".95rem", color: "var(--grijs)" }}>
        Toon dit project op je eigen website. Er zijn drie widgets; plak de code
        hieronder in je site (in WordPress: een &quot;Aangepaste HTML&quot;-blok).
        Voeg <code>?stijl=neutraal</code> toe voor een variant zonder kleuraccent.
      </p>
      <ul style={{ marginTop: ".6rem", fontSize: ".95rem" }}>
        <li><a href={basis} target="_blank" rel="noopener noreferrer">{basis}</a> - projectinfo</li>
        <li><a href={`${basis}/recent/3`} target="_blank" rel="noopener noreferrer">{`${basis}/recent/3`}</a> - recentste jottems (1 t/m 12)</li>
        <li><a href={`${basis}/willekeurig/4`} target="_blank" rel="noopener noreferrer">{`${basis}/willekeurig/4`}</a> - willekeurige jottems (1 t/m 12)</li>
      </ul>
      <h3 style={{ marginTop: "1.2rem" }}>Inbedden met een iframe</h3>
      <pre style={CODEBLOK_STIJL}>{iframeVoorbeeld}</pre>
      <h3 style={{ marginTop: "1.2rem" }}>Inbedden met een script</h3>
      <p style={{ marginTop: ".2rem", fontSize: ".9rem", color: "var(--grijs)" }}>
        De widget neemt dan het lettertype en de kleuren van je eigen site over.
      </p>
      <pre style={CODEBLOK_STIJL}>{scriptVoorbeeld}</pre>
      <h3 style={{ marginTop: "1.2rem" }}>Zo zien ze eruit</h3>
      <iframe src={basis} title="Voorbeeld: projectinfo-widget"
              style={{ width: "100%", height: "180px", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", marginTop: ".4rem" }} />
      <iframe src={`${basis}/recent/3`} title="Voorbeeld: recente jottems-widget"
              style={{ width: "100%", height: "220px", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", marginTop: ".8rem" }} />
    </section>
  );
}
