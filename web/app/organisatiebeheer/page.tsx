"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import BeheerInlog from "../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie, StatusPil, Veld } from "../beheer-ui";

type Project = {
  projectId: string; organisatieSlug: string; naam: string; slug: string;
  status: string; zichtbaarheid?: string; datasetAangemeld: string | null; aantalJottems: number;
};
type Lid = { gebruikersId: number; naam: string; email: string; rol: string; gekoppeld: boolean };
type Organisatie = { slug: string; naam: string };

// Organisatiebeheer: overzicht-eerst. Per beheerde organisatie een kaart met de
// projecten en een kaart met de moderatoren; toevoegen, bewerken en verwijderen
// gebeuren op eigen subpagina's.
export default function OrganisatiebeheerPagina() {
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [organisaties, setOrganisaties] = useState<Organisatie[] | null>(null);
  const [projecten, setProjecten] = useState<Record<string, Project[]>>({});
  const [moderatoren, setModeratoren] = useState<Record<string, Lid[]>>({});
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders() };

  const laden = useCallback(async () => {
    const publiek: Organisatie[] = await fetch(`${API_PUBLIEK}/organisaties`).then((r) => r.json());
    const mijne: Organisatie[] = [];
    for (const organisatie of publiek) {
      const r = await fetch(`${API_PUBLIEK}/organisatie/${organisatie.slug}/projecten`, { headers });
      if (r.ok) {
        mijne.push({ slug: organisatie.slug, naam: organisatie.naam });
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
    const formulier = e.currentTarget;
    const data = new FormData(formulier);
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruikers`, {
      method: "POST", headers,
      body: JSON.stringify({ naam: data.get("naam"), email: data.get("email"), rol: "moderator" }),
    });
    setMelding(r.ok
      ? "Moderator uitgenodigd; de rol staat klaar voor de eerste login."
      : `Uitnodigen mislukt: ${(await r.json()).detail ?? r.statusText}`);
    if (r.ok) formulier.reset();
    laden();
  }

  async function moderatorVerwijderen(slug: string, lid: Lid) {
    if (!window.confirm(`Moderatorrol intrekken voor ${lid.naam}?`)) return;
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruiker/${lid.gebruikersId}?rol=moderator`, { method: "DELETE", headers });
    setMelding(r.ok ? "Moderatorrol ingetrokken." : "Intrekken mislukt.");
    laden();
  }

  if (!ingelogd) {
    return <BeheerInlog titel="Organisatiebeheer" terugNaar="/organisatiebeheer" rol="organisatiebeheerder" bekend={ingelogd === false} />;
  }

  const aantalProjecten = Object.values(projecten).reduce((n, lijst) => n + lijst.length, 0);
  const aantalJottems = Object.values(projecten).flat().reduce((n, p) => n + p.aantalJottems, 0);

  return (
    <BeheerPagina
      titel="Organisatiebeheer"
      intro="Beheer de projecten en moderatoren van je organisatie. Instellingen, leden en de datasetbeschrijving van een project vind je onder Bewerken."
      zijbalk={
        <Actiebalk samenvatting={[
          { label: "Organisaties", waarde: organisaties?.length ?? "..." },
          { label: "Projecten", waarde: aantalProjecten },
          { label: "Jottems", waarde: aantalJottems },
        ]}>
          {organisaties?.length === 1 && (
            <a className="knop knop-primair" href={`/organisatiebeheer/${organisaties[0].slug}/nieuw`}>Nieuw project</a>
          )}
          <a className="knop knop-secundair" href="/moderatie">Naar de moderatie</a>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}
      {organisaties !== null && organisaties.length === 0 && (
        <p className="memo memo-blok">Je bent van geen enkele organisatie beheerder.</p>
      )}

      {(organisaties ?? []).map(({ slug, naam }) => (
        <div key={slug} className="beheer-inhoud">
          <KaartSectie
            titel={naam}
            intro={<><a href={`/organisatie/${slug}`} target="_blank" rel="noopener noreferrer">Publieke organisatiepagina</a></>}
            acties={<a className="knop knop-primair" href={`/organisatiebeheer/${slug}/nieuw`}>Nieuw project</a>}
          >
            <table className="lijst stapel">
              <thead>
                <tr>
                  <th>Project</th>
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
                      <div className="hint">
                        {project.slug}
                        {project.zichtbaarheid === "besloten" && " · besloten"}
                        {project.datasetAangemeld && " · in Datasetregister"}
                      </div>
                    </td>
                    <td data-label="Status"><StatusPil soort={project.status}>{project.status}</StatusPil></td>
                    <td data-label="Jottems">{project.aantalJottems}</td>
                    <td>
                      <span className="knoppenrij">
                        <a className="knop knop-secundair" href={`/organisatiebeheer/${slug}/${project.slug}`}>Bewerken</a>
                        <a className="knop knop-secundair" href={`/organisatiebeheer/${slug}/${project.slug}/verwijderen`}>Verwijderen</a>
                      </span>
                    </td>
                  </tr>
                ))}
                {(projecten[slug] ?? []).length === 0 && (
                  <tr><td colSpan={4} className="beheer-leeg">Nog geen projecten.</td></tr>
                )}
              </tbody>
            </table>
          </KaartSectie>

          <KaartSectie
            titel={`Moderatoren van ${naam}`}
            intro="Moderatoren beoordelen bijdragen vóór publicatie. Een uitgenodigde moderator ontvangt een mail; de rol staat klaar voor de eerste login."
          >
            <div className="lijst-leden">
              {(moderatoren[slug] ?? []).map((lid) => (
                <div key={lid.gebruikersId}>
                  <span className="naam">{lid.naam}</span>
                  <span className="email">{lid.email}</span>
                  {!lid.gekoppeld && <span className="etiket">wacht op eerste login</span>}
                  <a className="actie" href="#" onClick={(e) => { e.preventDefault(); moderatorVerwijderen(slug, lid); }}>intrekken</a>
                </div>
              ))}
              {(moderatoren[slug] ?? []).length === 0 && <p className="beheer-leeg">Nog geen moderatoren.</p>}
            </div>
            <form className="rij-invoer" onSubmit={(e) => nodigModeratorUit(slug, e)}>
              <Veld label="Naam" htmlFor={`mod-naam-${slug}`}><input id={`mod-naam-${slug}`} name="naam" type="text" required /></Veld>
              <Veld label="E-mailadres" htmlFor={`mod-email-${slug}`}><input id={`mod-email-${slug}`} name="email" type="email" required /></Veld>
              <button className="knop knop-primair" type="submit">Nodig moderator uit</button>
            </form>
          </KaartSectie>
        </div>
      ))}
    </BeheerPagina>
  );
}
