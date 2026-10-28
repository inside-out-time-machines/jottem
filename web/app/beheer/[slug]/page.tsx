"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_PUBLIEK, SITE_URL, authHeaders, isIngelogd } from "@/lib/api";
import BeheerInlog from "../../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie, Veld } from "../../beheer-ui";
import OrganisatieFormulier, { ORGANISATIE_FORMULIER_ID, OrganisatieVorm } from "../organisatie-formulier";

type Lid = { gebruikersId: number; naam: string; email: string; rol: string; gekoppeld: boolean };
type OrganisatieUit = {
  naam: string; slug: string; beschrijving: string | null; website: string | null;
  email: string | null; identifier: string | null; spatialUri: string | null; spatialNaam: string | null;
  kleurPrimair: string | null; kleurSecundair: string | null; kleurAchtergrond: string | null;
  logo: string | null; favicon: string | null; logoUrl: string | null; faviconUrl: string | null;
};

// Bewerkpagina van een organisatie: het formulier in kaarten (Basis, Publisher,
// Huisstijl) plus de organisatiebeheerders; rechts de actiebalk.
export default function OrganisatieBewerkPagina() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [organisatie, setOrganisatie] = useState<OrganisatieUit | null>(null);
  const [begin, setBegin] = useState<OrganisatieVorm | null>(null);
  const [leden, setLeden] = useState<Lid[]>([]);
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders() };

  const laden = useCallback(async () => {
    const r = await fetch(`${API_PUBLIEK}/organisatie`, { headers });
    if (!r.ok) { setMelding("Laden mislukt (heb je de rol platformbeheerder?)"); return; }
    const lijst: OrganisatieUit[] = await r.json();
    const gevonden = lijst.find((o) => o.slug === slug);
    if (!gevonden) { setMelding("Organisatie niet gevonden."); return; }
    setOrganisatie(gevonden);
    setBegin({
      naam: gevonden.naam, slug: gevonden.slug,
      beschrijving: gevonden.beschrijving ?? "", website: gevonden.website ?? "",
      email: gevonden.email ?? "",
      identifier: gevonden.identifier ?? "",
      spatialUri: gevonden.spatialUri ?? "",
      spatialNaam: gevonden.spatialNaam ?? "",
      kleurPrimair: gevonden.kleurPrimair ?? "#d85a30",
      kleurSecundair: gevonden.kleurSecundair ?? "#a2401f",
      kleurAchtergrond: gevonden.kleurAchtergrond ?? "#faf6f1",
      logo: gevonden.logo, favicon: gevonden.favicon,
    });
    ledenLaden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function ledenLaden() {
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruikers?rol=organisatiebeheerder`, { headers });
    if (r.ok) setLeden(await r.json());
  }

  useEffect(() => {
    setIngelogd(isIngelogd());
    if (isIngelogd()) laden();
  }, [laden]);

  async function nodigUit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulier = e.currentTarget;
    const data = new FormData(formulier);
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruikers`, {
      method: "POST", headers,
      body: JSON.stringify({ naam: data.get("naam"), email: data.get("email"), rol: "organisatiebeheerder" }),
    });
    setMelding(r.ok
      ? "Uitnodiging verstuurd; de rol staat klaar voor de eerste login."
      : `Uitnodigen mislukt: ${(await r.json()).detail ?? r.statusText}`);
    if (r.ok) formulier.reset();
    ledenLaden();
  }

  async function trekIn(lid: Lid) {
    if (!window.confirm(`Rol organisatiebeheerder intrekken voor ${lid.naam}?`)) return;
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruiker/${lid.gebruikersId}?rol=organisatiebeheerder`, {
      method: "DELETE", headers,
    });
    setMelding(r.ok ? "Rol ingetrokken." : "Intrekken mislukt.");
    ledenLaden();
  }

  if (!ingelogd) {
    return <BeheerInlog titel="Organisatie bewerken" terugNaar={`/beheer/${slug}`}
                        rol="platformbeheerder" bekend={ingelogd === false} />;
  }

  const publiekeUrl = `/organisatie/${slug}`;

  return (
    <BeheerPagina
      kruimels={<a href="/beheer">Platformbeheer</a>}
      titel={<>Bewerk: {organisatie?.naam ?? slug}</>}
      zijbalk={
        <Actiebalk
          samenvatting={[
            { label: "Slug", waarde: slug },
            { label: "Beheerders", waarde: leden.length },
            { label: "Huisstijl", waarde: organisatie?.logo ? "logo geüpload" : "nog geen logo" },
          ]}
          voet={<>Publiekspagina: <a href={publiekeUrl} target="_blank" rel="noopener noreferrer">{SITE_URL.replace(/^https?:\/\//, "")}{publiekeUrl}</a></>}
        >
          <button className="knop knop-primair" type="submit" form={ORGANISATIE_FORMULIER_ID}>Opslaan</button>
          <a className="knop knop-secundair" href="/beheer">Annuleren</a>
          <a className="knop knop-secundair" href={`/beheer/${slug}/verwijderen`}>Verwijderen...</a>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}

      {begin && (
        <OrganisatieFormulier
          begin={begin}
          bewerkSlug={slug}
          headers={headers}
          logoUrl={organisatie?.logoUrl}
          faviconUrl={organisatie?.faviconUrl}
          onMelding={setMelding}
          onKlaar={(m) => router.push(`/beheer?melding=${encodeURIComponent(m)}`)}
        />
      )}

      <KaartSectie
        titel="Organisatiebeheerders"
        intro="Beheerders richten projecten in en nodigen moderatoren uit. Een benoemde beheerder ontvangt een uitnodigingsmail; de rol staat klaar voor de eerste login."
      >
        <div className="lijst-leden">
          {leden.map((lid) => (
            <div key={lid.gebruikersId}>
              <span className="naam">{lid.naam}</span>
              <span className="email">{lid.email}</span>
              {!lid.gekoppeld && <span className="etiket">wacht op eerste login</span>}
              <a className="actie" href="#" onClick={(e) => { e.preventDefault(); trekIn(lid); }}>intrekken</a>
            </div>
          ))}
          {leden.length === 0 && <p className="beheer-leeg">Nog geen organisatiebeheerders benoemd.</p>}
        </div>
        <form className="rij-invoer" onSubmit={nodigUit}>
          <Veld label="Naam" htmlFor="beheerder-naam"><input id="beheerder-naam" name="naam" type="text" required /></Veld>
          <Veld label="E-mailadres" htmlFor="beheerder-email"><input id="beheerder-email" name="email" type="email" required /></Veld>
          <button className="knop knop-primair" type="submit">Benoem beheerder</button>
        </form>
      </KaartSectie>
    </BeheerPagina>
  );
}
