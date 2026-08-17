"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";

type Organisatie = {
  organisatieId: number;
  naam: string;
  slug: string;
  website: string | null;
  kleurPrimair: string | null;
  logoUrl: string | null;
};
type Lid = { gebruikersId: number; naam: string; email: string; rol: string; gekoppeld: boolean };

// Platformbeheer: overzicht-eerst. De tabel toont alle organisaties; toevoegen,
// bewerken en verwijderen gebeuren op eigen subpagina's.
export default function BeheerPagina() {
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [magBeheren, setMagBeheren] = useState<boolean | null>(null);
  const [organisaties, setOrganisaties] = useState<Organisatie[]>([]);
  const [beheerders, setBeheerders] = useState<Record<string, Lid[]>>({});
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-piet", "Piet Platformbeheerder") };

  const laden = useCallback(() => {
    fetch(`${API_PUBLIEK}/organisatie`, { headers })
      .then(async (r) => {
        if (r.status === 403) { setMagBeheren(false); return []; }
        if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
        setMagBeheren(true);
        return r.json();
      })
      .then((lijst: Organisatie[]) => {
        setOrganisaties(lijst);
        lijst.forEach((organisatie) => {
          fetch(`${API_PUBLIEK}/organisatie/${organisatie.slug}/gebruikers?rol=organisatiebeheerder`, { headers })
            .then((r) => (r.ok ? r.json() : []))
            .then((leden) => setBeheerders((oud) => ({ ...oud, [organisatie.slug]: leden })));
        });
      })
      .catch((f) => setMelding(`Laden mislukt: ${f.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIngelogd(isIngelogd());
    const mParam = new URLSearchParams(window.location.search).get("melding");
    if (mParam) setMelding(mParam);
    if (isIngelogd()) laden();
  }, [laden]);

  if (ingelogd === null) return <main><h1>Platformbeheer</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Platformbeheer</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin("/beheer")}>
            Log in als platformbeheerder
          </button>
        </p>
      </main>
    );
  }
  if (magBeheren === false) {
    return (
      <main>
        <h1>Platformbeheer</h1>
        <p className="memo" style={{ marginTop: "1.2rem" }}>
          Je account heeft de rol platformbeheerder niet (of je sterke factor ontbreekt).
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Platformbeheer</h1>
      <p style={{ marginTop: ".5rem", maxWidth: "42rem" }}>
        Alle organisatiejottems op het platform. Beheer per organisatie de huisstijl en
        de organisatiebeheerders via Bewerken.
      </p>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}

      <p style={{ marginTop: "1.5rem" }}>
        <a className="knop knop-primair" href="/beheer/nieuw">Nieuwe organisatie</a>
      </p>

      <table className="lijst stapel">
        <thead>
          <tr>
            <th>Organisatie</th>
            <th>Slug</th>
            <th>Beheerders</th>
            <th>Acties</th>
          </tr>
        </thead>
        <tbody>
          {organisaties.map((organisatie) => (
            <tr key={organisatie.slug}>
              <td data-label="Organisatie">
                {organisatie.logoUrl && (
                  <img src={organisatie.logoUrl} alt="" style={{ maxHeight: "1.4rem", marginRight: ".5rem", verticalAlign: "-0.25rem" }} />
                )}
                {organisatie.kleurPrimair && (
                  <span style={{
                    display: "inline-block", width: ".8rem", height: ".8rem", borderRadius: "50%",
                    background: organisatie.kleurPrimair, marginRight: ".45rem",
                  }} />
                )}
                <a href={`/organisatie/${organisatie.slug}`}>{organisatie.naam}</a>
              </td>
              <td data-label="Slug">{organisatie.slug}</td>
              <td data-label="Beheerders">
                {(beheerders[organisatie.slug] ?? []).length === 0
                  ? <em style={{ color: "var(--grijs)" }}>nog geen</em>
                  : (beheerders[organisatie.slug] ?? []).map((lid) => lid.naam).join(", ")}
              </td>
              <td>
                <span style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                  <a className="knop knop-secundair" href={`/beheer/${organisatie.slug}`}>Bewerken</a>
                  <a className="knop knop-secundair" href={`/beheer/${organisatie.slug}/verwijderen`}>Verwijderen</a>
                </span>
              </td>
            </tr>
          ))}
          {organisaties.length === 0 && (
            <tr><td colSpan={4}>Nog geen organisaties.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
