"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";

type Project = {
  projectId: string; organisatieSlug: string; naam: string; slug: string;
  beschrijving: string | null; oproep: string | null; periode: string | null;
  afbeelding: string | null; afbeeldingUrl: string | null;
  datasetLicentie: string | null; status: string; terminologiebronnen: string[];
  datasetAangemeld: string | null; aantalJottems: number;
};
type Lid = { gebruikersId: number; naam: string; email: string; rol: string; gekoppeld: boolean };
type Bron = { uri: string; naam: string; alternatief: string | null };

const LEEG_PROJECT = {
  naam: "", slug: "", beschrijving: "", oproep: "", periode: "",
  datasetLicentie: "https://creativecommons.org/licenses/by/4.0/",
  status: "actief", terminologiebronnen: [] as string[], afbeelding: null as string | null,
};

export default function OrganisatiebeheerPagina() {
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [organisaties, setOrganisaties] = useState<string[]>([]);
  const [projecten, setProjecten] = useState<Record<string, Project[]>>({});
  const [moderatoren, setModeratoren] = useState<Record<string, Lid[]>>({});
  const [bronnen, setBronnen] = useState<Bron[]>([]);
  const [vorm, setVorm] = useState({ ...LEEG_PROJECT });
  const [bewerkProject, setBewerkProject] = useState<Project | null>(null);
  const [vormOrganisatie, setVormOrganisatie] = useState<string | null>(null);
  const [dataset, setDataset] = useState<{ projectId: string; inhoud: unknown } | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-otto", "Otto Organisatiebeheerder") };

  const laden = useCallback(async () => {
    const publiek = await fetch(`${API_PUBLIEK}/organisaties`).then((r) => r.json());
    const mijne: string[] = [];
    for (const organisatie of publiek) {
      const r = await fetch(`${API_PUBLIEK}/organisatie/${organisatie.slug}/projecten`, { headers });
      if (r.ok) {
        mijne.push(organisatie.slug);
        setProjecten((oud) => ({ ...oud, [organisatie.slug]: [] }));
        const lijst = await r.json();
        setProjecten((oud) => ({ ...oud, [organisatie.slug]: lijst }));
        fetch(`${API_PUBLIEK}/organisatie/${organisatie.slug}/gebruikers?rol=moderator`, { headers })
          .then((mr) => (mr.ok ? mr.json() : []))
          .then((leden) => setModeratoren((oud) => ({ ...oud, [organisatie.slug]: leden })));
      }
    }
    setOrganisaties(mijne);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIngelogd(isIngelogd());
    if (isIngelogd()) {
      laden();
      fetch(`${API_PUBLIEK}/termennetwerk/bronnen`).then((r) => r.json()).then(setBronnen).catch(() => {});
    }
  }, [laden]);

  async function projectOpslaan(e: React.FormEvent) {
    e.preventDefault();
    if (!vormOrganisatie) return;
    setMelding(null);
    const pad = bewerkProject ? `/project/${bewerkProject.projectId}` : `/organisatie/${vormOrganisatie}/projecten`;
    const r = await fetch(`${API_PUBLIEK}${pad}`, {
      method: bewerkProject ? "PUT" : "POST",
      headers,
      body: JSON.stringify({
        ...vorm,
        beschrijving: vorm.beschrijving || null,
        oproep: vorm.oproep || null,
        periode: vorm.periode || null,
      }),
    });
    if (!r.ok) {
      setMelding(`Opslaan mislukt: ${(await r.json()).detail ?? r.statusText}`);
      return;
    }
    setMelding(bewerkProject ? "Project bijgewerkt." : "Project aangemaakt.");
    setBewerkProject(null);
    setVormOrganisatie(null);
    setVorm({ ...LEEG_PROJECT });
    laden();
  }

  async function projectVerwijderen(project: Project) {
    if (!window.confirm(`Project "${project.naam}" verwijderen?`)) return;
    const r = await fetch(`${API_PUBLIEK}/project/${project.projectId}`, { method: "DELETE", headers });
    setMelding(r.ok ? "Project verwijderd." : `Verwijderen kan niet: ${(await r.json()).detail}`);
    laden();
  }

  async function afbeeldingKiezen(project: Project, bestand: File) {
    const vraag = await fetch(`${API_PUBLIEK}/project/${project.projectId}/afbeelding-upload`, {
      method: "POST", headers,
      body: JSON.stringify({ bestandsnaam: bestand.name, contentType: bestand.type }),
    });
    if (!vraag.ok) { setMelding("Upload-URL aanvragen mislukt"); return; }
    const { objectKey, uploadUrl } = await vraag.json();
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": bestand.type }, body: bestand });
    if (!put.ok) { setMelding("Upload mislukt"); return; }
    setVorm((oud) => ({ ...oud, afbeelding: objectKey }));
    setMelding("Afbeelding geupload; klik op Opslaan om vast te leggen.");
  }

  async function nodigModeratorUit(slug: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruikers`, {
      method: "POST", headers,
      body: JSON.stringify({ naam: data.get("naam"), email: data.get("email"), rol: "moderator" }),
    });
    setMelding(r.ok ? "Moderator uitgenodigd; de rol staat klaar voor de eerste login." : `Uitnodigen mislukt: ${(await r.json()).detail ?? r.statusText}`);
    if (r.ok) (e.target as HTMLFormElement).reset();
    laden();
  }

  async function moderatorVerwijderen(slug: string, lid: Lid) {
    if (!window.confirm(`Moderatorrol intrekken voor ${lid.naam}?`)) return;
    await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruiker/${lid.gebruikersId}?rol=moderator`, { method: "DELETE", headers });
    laden();
  }

  async function toonDataset(project: Project) {
    const r = await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving`, { headers });
    if (r.ok) setDataset({ projectId: project.projectId, inhoud: await r.json() });
  }

  async function meldAan(project: Project) {
    setMelding("Valideren en aanmelden bij het NDE Datasetregister...");
    const r = await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving/aanmelden`, {
      method: "POST", headers,
    });
    const inhoud = await r.json().catch(() => ({}));
    if (r.ok) setMelding("Gevalideerd en aangemeld bij het Datasetregister.");
    else setMelding(`${inhoud.detail?.melding ?? inhoud.detail ?? "Aanmelden mislukt"} ${JSON.stringify(inhoud.detail?.details ?? "").slice(0, 300)}`);
    laden();
  }

  async function meldAf(project: Project) {
    await fetch(`${API_PUBLIEK}/project/${project.projectId}/datasetbeschrijving/aanmelden`, { method: "DELETE", headers });
    setMelding("Afgemeld bij het Datasetregister.");
    laden();
  }

  if (ingelogd === null) return <main><h1>Organisatiebeheer</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Organisatiebeheer</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin("/organisatiebeheer")}>
            Log in als organisatiebeheerder
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Organisatiebeheer</h1>
      <p style={{ marginTop: ".5rem", maxWidth: "42rem" }}>
        Beheer de projecten, moderatoren en datasetbeschrijvingen van je organisatie.
      </p>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}
      {organisaties.length === 0 && (
        <p style={{ marginTop: "1.5rem" }}>Je bent van geen enkele organisatie beheerder.</p>
      )}

      {organisaties.map((slug) => (
        <section key={slug} style={{ marginTop: "2.5rem" }}>
          <h2>{slug}</h2>

          <h3 style={{ marginTop: "1.2rem" }}>Projecten</h3>
          <div className="kaarten">
            {(projecten[slug] ?? []).map((project) => (
              <article className="kaart" key={project.projectId}>
                {project.afbeeldingUrl && (
                  <img src={project.afbeeldingUrl} alt="" style={{ maxHeight: "5rem", borderRadius: ".3rem", marginBottom: ".5rem" }} />
                )}
                <h3>{project.naam}</h3>
                <p style={{ fontSize: ".9rem", color: "var(--grijs)" }}>
                  {project.slug} · {project.status} · {project.aantalJottems} jottems
                  {project.datasetAangemeld && " · in Datasetregister"}
                </p>
                <p style={{ marginTop: ".7rem", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                  <button className="knop knop-secundair" onClick={() => {
                    setBewerkProject(project);
                    setVormOrganisatie(slug);
                    setVorm({
                      naam: project.naam, slug: project.slug,
                      beschrijving: project.beschrijving ?? "", oproep: project.oproep ?? "",
                      periode: project.periode ?? "",
                      datasetLicentie: project.datasetLicentie ?? LEEG_PROJECT.datasetLicentie,
                      status: project.status, terminologiebronnen: project.terminologiebronnen,
                      afbeelding: project.afbeelding,
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}>Bewerken</button>
                  <button className="knop knop-secundair" onClick={() => toonDataset(project)}>Dataset</button>
                  <button className="knop knop-secundair" onClick={() => projectVerwijderen(project)}>Verwijderen</button>
                </p>
                {dataset?.projectId === project.projectId && (
                  <div style={{ marginTop: ".8rem", fontSize: ".85rem" }}>
                    <pre style={{ background: "var(--papier)", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", padding: ".6rem", overflowX: "auto", maxHeight: "14rem" }}>
                      {JSON.stringify((dataset.inhoud as { dataset: unknown }).dataset, null, 2)}
                    </pre>
                    <p style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".5rem" }}>
                      <button className="knop knop-primair" onClick={() => meldAan(project)}>
                        Valideer en meld aan bij het Datasetregister
                      </button>
                      {project.datasetAangemeld && (
                        <button className="knop knop-secundair" onClick={() => meldAf(project)}>Afmelden</button>
                      )}
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
          <p style={{ marginTop: ".8rem" }}>
            <button className="knop knop-primair" onClick={() => { setVormOrganisatie(slug); setBewerkProject(null); setVorm({ ...LEEG_PROJECT }); }}>
              Nieuw project
            </button>
          </p>

          {vormOrganisatie === slug && (
            <form className="formulier" onSubmit={projectOpslaan} style={{ marginTop: "1rem" }}>
              <h3>{bewerkProject ? `Bewerk: ${bewerkProject.naam}` : "Nieuw project"}</h3>
              <div className="veld"><label>Naam</label>
                <input type="text" value={vorm.naam} onChange={(e) => setVorm({ ...vorm, naam: e.target.value })} /></div>
              <div className="veld"><label>Slug</label>
                <input type="text" value={vorm.slug} onChange={(e) => setVorm({ ...vorm, slug: e.target.value })} /></div>
              <div className="veld"><label>Beschrijving (mag)</label>
                <textarea rows={2} value={vorm.beschrijving} onChange={(e) => setVorm({ ...vorm, beschrijving: e.target.value })} /></div>
              <div className="veld"><label>Oproep (mag)</label>
                <textarea rows={2} value={vorm.oproep} onChange={(e) => setVorm({ ...vorm, oproep: e.target.value })} /></div>
              <div className="veld"><label>Periode (mag, bijv. 1950-2000)</label>
                <input type="text" value={vorm.periode} onChange={(e) => setVorm({ ...vorm, periode: e.target.value })} /></div>
              <div className="veld"><label>Datasetlicentie (URL)</label>
                <input type="text" value={vorm.datasetLicentie ?? ""} onChange={(e) => setVorm({ ...vorm, datasetLicentie: e.target.value })} /></div>
              <div className="veld"><label>Status</label>
                <select value={vorm.status} onChange={(e) => setVorm({ ...vorm, status: e.target.value })}>
                  <option value="actief">actief</option>
                  <option value="afgerond">afgerond</option>
                </select></div>
              {bewerkProject && (
                <div className="veld"><label>Projectafbeelding uploaden (mag)</label>
                  <input type="file" accept="image/*" onChange={(e) => {
                    const bestand = e.target.files?.[0];
                    if (bestand && bewerkProject) afbeeldingKiezen(bewerkProject, bestand);
                  }} /></div>
              )}
              <div className="veld">
                <label>Terminologiebronnen (NDE Termennetwerk; leeg = nog geen selectie)</label>
                <div style={{ maxHeight: "12rem", overflowY: "auto", border: "1px solid var(--kartonrand)", borderRadius: ".35rem", padding: ".6rem", background: "var(--wit)", fontSize: ".92rem" }}>
                  {bronnen.map((bron) => (
                    <label key={bron.uri} style={{ display: "block", fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={vorm.terminologiebronnen.includes(bron.uri)}
                        onChange={(e) => setVorm((oud) => ({
                          ...oud,
                          terminologiebronnen: e.target.checked
                            ? [...oud.terminologiebronnen, bron.uri]
                            : oud.terminologiebronnen.filter((u) => u !== bron.uri),
                        }))}
                      />{" "}
                      {bron.naam}{bron.alternatief ? ` (${bron.alternatief})` : ""}
                    </label>
                  ))}
                  {bronnen.length === 0 && <em>Bronnenlijst wordt geladen...</em>}
                </div>
              </div>
              <div style={{ display: "flex", gap: ".7rem" }}>
                <button className="knop knop-primair" type="submit">{bewerkProject ? "Opslaan" : "Project aanmaken"}</button>
                <button type="button" className="knop knop-secundair" onClick={() => { setVormOrganisatie(null); setBewerkProject(null); }}>Annuleren</button>
              </div>
            </form>
          )}

          <h3 style={{ marginTop: "2rem" }}>Moderatoren</h3>
          {(moderatoren[slug] ?? []).map((lid) => (
            <p key={lid.gebruikersId} style={{ display: "flex", gap: ".6rem", alignItems: "center", fontSize: ".95rem" }}>
              <span>
                {lid.naam} ({lid.email})
                {!lid.gekoppeld && <em style={{ color: "var(--grijs)" }}> · wacht op eerste login</em>}
              </span>
              <a href="#" onClick={(e) => { e.preventDefault(); moderatorVerwijderen(slug, lid); }}>intrekken</a>
            </p>
          ))}
          <form onSubmit={(e) => nodigModeratorUit(slug, e)} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".6rem", maxWidth: "34rem" }}>
            <input name="naam" type="text" placeholder="Naam" required style={{ font: "inherit", padding: ".45rem .6rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", flex: "1 1 8rem" }} />
            <input name="email" type="email" placeholder="E-mailadres" required style={{ font: "inherit", padding: ".45rem .6rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", flex: "2 1 12rem" }} />
            <button className="knop knop-primair" type="submit">Nodig moderator uit</button>
          </form>
        </section>
      ))}
    </main>
  );
}
