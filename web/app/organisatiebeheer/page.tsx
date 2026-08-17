"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";

type Project = {
  projectId: string; organisatieSlug: string; naam: string; slug: string;
  status: string; datasetAangemeld: string | null; aantalJottems: number;
};
type Lid = { gebruikersId: number; naam: string; email: string; rol: string; gekoppeld: boolean };

// Organisatiebeheer: overzicht-eerst. Per beheerde organisatie een projecttabel;
// toevoegen, bewerken en verwijderen gebeuren op eigen subpagina's. Daaronder het
// moderatorenbeheer van de organisatie.
export default function OrganisatiebeheerPagina() {
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [organisaties, setOrganisaties] = useState<string[]>([]);
  const [projecten, setProjecten] = useState<Record<string, Project[]>>({});
  const [moderatoren, setModeratoren] = useState<Record<string, Lid[]>>({});
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-otto", "Otto Organisatiebeheerder") };

  const laden = useCallback(async () => {
    const publiek = await fetch(`${API_PUBLIEK}/organisaties`).then((r) => r.json());
    const mijne: string[] = [];
    for (const organisatie of publiek) {
      const r = await fetch(`${API_PUBLIEK}/organisatie/${organisatie.slug}/projecten`, { headers });
      if (r.ok) {
        mijne.push(organisatie.slug);
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
    const mParam = new URLSearchParams(window.location.search).get("melding");
    if (mParam) setMelding(mParam);
    if (isIngelogd()) laden();
  }, [laden]);

  async function nodigModeratorUit(slug: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruikers`, {
      method: "POST", headers,
      body: JSON.stringify({ naam: data.get("naam"), email: data.get("email"), rol: "moderator" }),
    });
    setMelding(r.ok
      ? "Moderator uitgenodigd; de rol staat klaar voor de eerste login."
      : `Uitnodigen mislukt: ${(await r.json()).detail ?? r.statusText}`);
    if (r.ok) (e.target as HTMLFormElement).reset();
    laden();
  }

  async function moderatorVerwijderen(slug: string, lid: Lid) {
    if (!window.confirm(`Moderatorrol intrekken voor ${lid.naam}?`)) return;
    await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruiker/${lid.gebruikersId}?rol=moderator`, { method: "DELETE", headers });
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
        Beheer de projecten en moderatoren van je organisatie. Instellingen en de
        datasetbeschrijving van een project vind je onder Bewerken.
      </p>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}
      {organisaties.length === 0 && (
        <p style={{ marginTop: "1.5rem" }}>Je bent van geen enkele organisatie beheerder.</p>
      )}

      {organisaties.map((slug) => (
        <section key={slug} style={{ marginTop: "2.5rem" }}>
          <h2>{slug}</h2>

          <p style={{ marginTop: "1rem" }}>
            <a className="knop knop-primair" href={`/organisatiebeheer/${slug}/nieuw`}>Nieuw project</a>
          </p>
          <table className="lijst stapel">
            <thead>
              <tr>
                <th>Project</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Jottems</th>
                <th>Acties</th>
              </tr>
            </thead>
            <tbody>
              {(projecten[slug] ?? []).map((project) => (
                <tr key={project.projectId}>
                  <td data-label="Project">
                    <a href={`/organisatie/${slug}/${project.slug}`}>{project.naam}</a>
                    {project.datasetAangemeld && (
                      <div style={{ fontSize: ".82rem", color: "var(--grijs)" }}>in Datasetregister</div>
                    )}
                  </td>
                  <td data-label="Slug">{project.slug}</td>
                  <td data-label="Status"><span className={`status-pil ${project.status === "actief" ? "status-goedgekeurd" : "status-gedepubliceerd"}`}>{project.status}</span></td>
                  <td data-label="Jottems">{project.aantalJottems}</td>
                  <td>
                    <span style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                      <a className="knop knop-secundair" href={`/organisatiebeheer/${slug}/${project.slug}`}>Bewerken</a>
                      <a className="knop knop-secundair" href={`/organisatiebeheer/${slug}/${project.slug}/verwijderen`}>Verwijderen</a>
                    </span>
                  </td>
                </tr>
              ))}
              {(projecten[slug] ?? []).length === 0 && (
                <tr><td colSpan={5}>Nog geen projecten.</td></tr>
              )}
            </tbody>
          </table>

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
          {(moderatoren[slug] ?? []).length === 0 && (
            <p style={{ color: "var(--grijs)" }}>Nog geen moderatoren.</p>
          )}
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
