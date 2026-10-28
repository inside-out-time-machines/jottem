"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import BeheerInlog from "../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie } from "../beheer-ui";

type Organisatie = {
  organisatieId: number;
  naam: string;
  slug: string;
  website: string | null;
  kleurPrimair: string | null;
  logoUrl: string | null;
};
type Lid = { gebruikersId: number; naam: string; email: string; rol: string; gekoppeld: boolean };

// Platformbeheer: overzicht-eerst. Per organisatie een kaart; toevoegen, bewerken en
// verwijderen gebeuren op eigen subpagina's.
export default function BeheerPaginaOverzicht() {
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [magBeheren, setMagBeheren] = useState<boolean | null>(null);
  const [organisaties, setOrganisaties] = useState<Organisatie[]>([]);
  const [beheerders, setBeheerders] = useState<Record<string, Lid[]>>({});
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders() };

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

  if (!ingelogd) {
    return <BeheerInlog titel="Platformbeheer" terugNaar="/beheer" rol="platformbeheerder" bekend={ingelogd === false} />;
  }
  if (magBeheren === false) {
    return (
      <BeheerPagina titel="Platformbeheer">
        <p className="memo memo-blok">
          Je account heeft de rol platformbeheerder niet (of je sterke factor ontbreekt).
        </p>
      </BeheerPagina>
    );
  }

  return (
    <BeheerPagina
      titel="Platformbeheer"
      intro="Alle organisatiejottems op het platform. Beheer per organisatie de huisstijl en de organisatiebeheerders via Bewerken."
      zijbalk={
        <Actiebalk samenvatting={[{ label: "Organisaties", waarde: organisaties.length }]}>
          <a className="knop knop-primair" href="/beheer/nieuw">Nieuwe organisatie</a>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}

      <KaartSectie titel="Organisaties">
        <table className="lijst stapel" style={{ marginTop: 0 }}>
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
                    ? <em className="beheer-leeg">nog geen</em>
                    : (beheerders[organisatie.slug] ?? []).map((lid) => lid.naam).join(", ")}
                </td>
                <td>
                  <span className="knoppenrij">
                    <a className="knop knop-secundair" href={`/beheer/${organisatie.slug}`}>Bewerken</a>
                    <a className="knop knop-secundair" href={`/beheer/${organisatie.slug}/verwijderen`}>Verwijderen</a>
                  </span>
                </td>
              </tr>
            ))}
            {organisaties.length === 0 && (
              <tr><td colSpan={4} className="beheer-leeg">Nog geen organisaties.</td></tr>
            )}
          </tbody>
        </table>
      </KaartSectie>
    </BeheerPagina>
  );
}
