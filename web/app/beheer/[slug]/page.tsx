"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";
import OrganisatieFormulier, { OrganisatieVorm } from "../organisatie-formulier";

type Lid = { gebruikersId: number; naam: string; email: string; rol: string; gekoppeld: boolean };

// Bewerkpagina van een organisatie: velden + huisstijl-uploads + organisatiebeheerders.
export default function OrganisatieBewerkPagina() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [begin, setBegin] = useState<OrganisatieVorm | null>(null);
  const [leden, setLeden] = useState<Lid[]>([]);
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-piet", "Piet Platformbeheerder") };

  const laden = useCallback(async () => {
    const r = await fetch(`${API_PUBLIEK}/organisatie`, { headers });
    if (!r.ok) { setMelding("Laden mislukt (heb je de rol platformbeheerder?)"); return; }
    const lijst = await r.json();
    const organisatie = lijst.find((o: { slug: string }) => o.slug === slug);
    if (!organisatie) { setMelding("Organisatie niet gevonden."); return; }
    setBegin({
      naam: organisatie.naam, slug: organisatie.slug,
      beschrijving: organisatie.beschrijving ?? "", website: organisatie.website ?? "",
      kleurPrimair: organisatie.kleurPrimair ?? "#d85a30",
      kleurSecundair: organisatie.kleurSecundair ?? "#a2401f",
      kleurAchtergrond: organisatie.kleurAchtergrond ?? "#faf6f1",
      logo: organisatie.logo, favicon: organisatie.favicon,
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
    const data = new FormData(e.currentTarget);
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruikers`, {
      method: "POST", headers,
      body: JSON.stringify({ naam: data.get("naam"), email: data.get("email"), rol: "organisatiebeheerder" }),
    });
    setMelding(r.ok
      ? "Uitnodiging verstuurd; de rol staat klaar voor de eerste login."
      : `Uitnodigen mislukt: ${(await r.json()).detail ?? r.statusText}`);
    if (r.ok) (e.target as HTMLFormElement).reset();
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

  if (ingelogd === null) return <main><h1>Organisatie bewerken</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Organisatie bewerken</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin(`/beheer/${slug}`)}>
            Log in als platformbeheerder
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p style={{ fontSize: ".95rem" }}><a href="/beheer">Platformbeheer</a></p>
      <h1 style={{ marginTop: ".3rem" }}>Bewerk: {begin?.naam ?? slug}</h1>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}

      {begin && (
        <section style={{ marginTop: "1.5rem" }}>
          <OrganisatieFormulier
            begin={begin}
            bewerkSlug={slug}
            headers={headers}
            opslaanTekst="Opslaan"
            onKlaar={(m) => router.push(`/beheer?melding=${encodeURIComponent(m)}`)}
          />
        </section>
      )}

      <section style={{ marginTop: "2.5rem", maxWidth: "34rem" }}>
        <h2>Organisatiebeheerders</h2>
        {leden.map((lid) => (
          <p key={lid.gebruikersId} style={{ display: "flex", gap: ".6rem", alignItems: "center", fontSize: ".95rem" }}>
            <span>
              {lid.naam} ({lid.email})
              {!lid.gekoppeld && <em style={{ color: "var(--grijs)" }}> · wacht op eerste login</em>}
            </span>
            <a href="#" onClick={(e) => { e.preventDefault(); trekIn(lid); }}>intrekken</a>
          </p>
        ))}
        {leden.length === 0 && <p style={{ color: "var(--grijs)" }}>Nog geen organisatiebeheerders benoemd.</p>}
        <form onSubmit={nodigUit} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".8rem" }}>
          <input name="naam" type="text" placeholder="Naam" required style={{ font: "inherit", padding: ".45rem .6rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", flex: "1 1 8rem" }} />
          <input name="email" type="email" placeholder="E-mailadres" required style={{ font: "inherit", padding: ".45rem .6rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", flex: "2 1 12rem" }} />
          <button className="knop knop-primair" type="submit">Benoem organisatiebeheerder</button>
        </form>
      </section>
    </main>
  );
}
